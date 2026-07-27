"""Dùng model đã train (app/training/train.py, lưu qua shared_common.registry) để CHỈ dự đoán
— không bao giờ tự fit lại. Đây là điểm khác biệt cốt lõi so với `rfm.py` cũ (fit lại mỗi lần
gọi, gây tâm cụm dịch chuyển liên tục giữa các lần scan — xem Context trong
docs/canvas/churn-risk-implementation-plan.md).
"""
from __future__ import annotations

import pandas as pd

from shared_common.config import shared_settings
from shared_common.features import build_feature_matrix
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine
from shared_common.registry import has_model, load_model

from app.training.train import MODEL_NAME_CLASSIFIER, MODEL_NAME_KMEANS

logger = get_logger(__name__)


class ModelNotTrainedError(RuntimeError):
    pass


class RiskScoringService:
    def predict(self, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
        """Trả DataFrame index user_id gồm toàn bộ feature gốc + 2 cột suy luận:
        `segment` (KMeans, chọn loại campaign) và `churn_probability` (Logistic Regression, quyết
        định có đáng trigger hay không). Raise `ModelNotTrainedError` rõ ràng nếu chưa train lần
        nào — KHÔNG âm thầm trả kết quả giả như code cũ.
        """
        if not has_model(MODEL_NAME_KMEANS) or not has_model(MODEL_NAME_CLASSIFIER):
            raise ModelNotTrainedError(
                "Chưa có model nào được train. Gọi POST /api/v1/models/train trước khi dùng endpoint này."
            )

        engine = get_engine(shared_settings.DB_NAME)
        X = build_feature_matrix(engine, as_of=as_of)
        if X.empty:
            return X.assign(segment=[], churn_probability=[])

        kmeans_bundle = load_model(MODEL_NAME_KMEANS)
        clf_bundle = load_model(MODEL_NAME_CLASSIFIER)

        X_scaled_km = kmeans_bundle["scaler"].transform(X[FEATURE_COLUMNS])
        cluster_ids = kmeans_bundle["kmeans"].predict(X_scaled_km)
        cluster_labels = kmeans_bundle["cluster_labels"]

        X_scaled_clf = clf_bundle["scaler"].transform(X[FEATURE_COLUMNS])
        churn_proba = clf_bundle["model"].predict_proba(X_scaled_clf)[:, 1]

        result = X.copy()
        result["segment"] = [cluster_labels[int(c)] for c in cluster_ids]
        result["churn_probability"] = churn_proba
        return result


risk_scoring_service = RiskScoringService()
