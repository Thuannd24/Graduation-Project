"""Dùng model đã train (app/training/train.py, lưu qua shared_common.registry) để CHỈ dự đoán
— không bao giờ tự fit lại. Đây là điểm khác biệt cốt lõi so với `rfm.py` cũ (fit lại mỗi lần
gọi, gây tâm cụm dịch chuyển liên tục giữa các lần scan — xem Context trong
docs/canvas/churn-risk-implementation-plan.md).
"""
from __future__ import annotations

import pandas as pd

from app.core.config import forecast_settings
from shared_common.config import shared_settings
from shared_common.features import build_feature_matrix
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine
from shared_common.registry import has_model, load_metadata, load_model

from app.training.train import MODEL_NAME_CLASSIFIER, MODEL_NAME_KMEANS

logger = get_logger(__name__)


class ModelNotTrainedError(RuntimeError):
    pass


def effective_threshold() -> tuple[float, bool]:
    """Trả `(ngưỡng, model_đã_hiệu_chỉnh)`.

    Thứ tự ưu tiên:
    1. Model CHƯA hiệu chỉnh -> ngưỡng legacy 0.5 kèm WARNING. Bundle train trước Tầng 0.1 trả xác
       suất THÔ (đo được: dự đoán trung bình 0.4217 vs thực tế 0.2420) — áp ngưỡng đã tune cho thang
       hiệu chỉnh lên thang thô sẽ bắn gần như MỌI user.
    2. Có override tường minh qua env -> dùng đúng giá trị đó (để vận hành can thiệp được).
    3. Còn lại: đọc `threshold_tuning.suggested_threshold` từ **metadata của chính model đang chạy**.

    Bước 3 là chủ đích: ngưỡng tối ưu đổi theo định nghĩa nhãn và theo mỗi lần train (đo được: nhãn
    v1 -> 0.24, nhãn v2 -> 0.26), nên hardcode một số trong config sẽ âm thầm lạc hậu mỗi lần model
    đổi. Gắn ngưỡng vào metadata của model giữ hai thứ luôn khớp nhau.
    """
    try:
        bundle = load_model(MODEL_NAME_CLASSIFIER)
    except FileNotFoundError:
        return forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD, False

    calibrated = bool(isinstance(bundle, dict) and bundle.get("calibrated"))
    if not calibrated:
        legacy = forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD_LEGACY
        logger.warning(
            f"Model classifier đang dùng CHƯA được hiệu chỉnh (thiếu cờ calibrated) -> lùi ngưỡng về "
            f"legacy {legacy}. Chạy POST /api/v1/models/train để train lại kèm hiệu chỉnh."
        )
        return legacy, False

    if forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE is not None:
        override = forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE
        logger.info(f"Dùng ngưỡng override từ env: {override}")
        return override, True

    try:
        suggested = load_metadata(MODEL_NAME_CLASSIFIER)["metrics"]["threshold_tuning"][
            "suggested_threshold"
        ]
        return float(suggested), True
    except (FileNotFoundError, KeyError, TypeError, ValueError) as e:
        fallback = forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD
        logger.warning(
            f"Không đọc được ngưỡng đề xuất từ metadata ({e}) -> dùng mặc định config {fallback}"
        )
        return fallback, True


class RiskScoringService:
    def predict(self, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
        """Trả DataFrame index user_id gồm toàn bộ feature gốc + 3 cột suy luận:

        - `segment` (KMeans) — chọn LOẠI campaign.
        - `churn_probability` (Logistic Regression) — có đáng trigger hay không.
        - `expected_loss` = churn_probability x monetary — TỔN THẤT KỲ VỌNG, dùng để xếp hạng khi
          ngân sách voucher có hạn. Xếp theo xác suất thuần sẽ ưu tiên người P=0.95 mua 200k hơn
          người P=0.70 mua 5tr, trong khi giữ được người thứ hai có giá trị hơn nhiều. Rule-based
          không làm được phép xếp hạng này vì không có xác suất để nhân với giá trị khách hàng.

        Raise `ModelNotTrainedError` rõ ràng nếu chưa train lần nào — KHÔNG âm thầm trả kết quả
        giả như code cũ.

        CẢNH BÁO: hàm này chấm điểm MỌI user để phục vụ phân tích, nhưng model chỉ được huấn luyện
        trên dân số `frequency >= MIN_DELIVERED_ORDERS_FOR_CHURN` (xem app/training/labels.py) —
        `churn_probability` của user dưới mức đó là NGOẠI SUY, không đáng tin. Đường production
        (`risk_scheduler`) lọc dân số này ở tầng 0 trước khi dùng.
        """
        if not has_model(MODEL_NAME_KMEANS) or not has_model(MODEL_NAME_CLASSIFIER):
            raise ModelNotTrainedError(
                "Chưa có model nào được train. Gọi POST /api/v1/models/train trước khi dùng endpoint này."
            )

        engine = get_engine(shared_settings.DB_NAME)
        X = build_feature_matrix(engine, as_of=as_of)
        if X.empty:
            return X.assign(segment=[], churn_probability=[], expected_loss=[])

        kmeans_bundle = load_model(MODEL_NAME_KMEANS)
        clf_bundle = load_model(MODEL_NAME_CLASSIFIER)

        X_scaled_km = kmeans_bundle["scaler"].transform(X[FEATURE_COLUMNS])
        cluster_ids = kmeans_bundle["kmeans"].predict(X_scaled_km)
        cluster_labels = kmeans_bundle["cluster_labels"]

        X_scaled_clf = clf_bundle["scaler"].transform(X[FEATURE_COLUMNS])
        churn_proba = clf_bundle["model"].predict_proba(X_scaled_clf)[:, 1]

        result = X.copy()
        # .get(): KMeans có thể sinh cụm rỗng ở lần fit -> cụm đó không xuất hiện trong groupby khi
        # gán nhãn nên thiếu key. Predict gặp đúng cụm đó sẽ KeyError giết cả lần scan; "Unknown"
        # thì chỉ đơn giản không khớp AT_RISK_SEGMENT và bị bỏ qua.
        result["segment"] = [cluster_labels.get(int(c), "Unknown") for c in cluster_ids]
        result["churn_probability"] = churn_proba
        result["expected_loss"] = result["churn_probability"] * result["monetary"]
        return result


risk_scoring_service = RiskScoringService()
