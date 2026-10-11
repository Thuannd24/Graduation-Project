"""Huấn luyện + đánh giá 2 model cho churn-risk detection (Phase 5):
1. KMeans segmentation (unsupervised) — chọn LOẠI campaign.
2. Logistic Regression churn classifier (supervised) — xác suất churn, quyết định CÓ trigger.

Tách BIỆT với việc SCORING định kỳ (Phase 6, app/services/risk_scoring.py) — module này chỉ chạy
khi có lệnh train tường minh (endpoint POST /api/v1/models/train), KHÔNG chạy tự động mỗi lần có
request, để tránh bug cũ: model cũ fit lại mỗi lần gọi làm tâm cụm dịch chuyển liên tục.

## Vì sao giao thức đánh giá được viết lại (2026-07-28)

Bản đầu chia test bằng `panel["cutoff"].max()`: test theo thời gian nhưng KHÔNG tách theo user.
Panel là ~500 user x 6 mốc = ~3000 dòng, nên hầu hết user trong test cũng nằm trong train (chỉ
khác mốc). Feature của cùng một user ở mốc 90 và 60 ngày tương quan rất cao, nhãn thường y hệt →
model có thể nhận diện *user* thay vì học *quy luật churn*. Hệ quả: AUC 0.9313 của run đầu là số
LẠC QUAN, và tệ hơn — thêm feature sẽ làm AUC tăng trong khi tổng quát hóa giảm, thước đo cũ
không phát hiện được.

Giao thức mới (`_evaluate_grouped_cv`): mỗi fold test = user ĐƯỢC GIỮ LẠI tại mốc gần nhất,
train = user KHÁC ở các mốc CŨ HƠN. Vừa tách user (không nhận diện được user đã thấy) vừa giữ
nhân quả thời gian (không train trên tương lai). Báo mean ± std qua các fold: chỉ 1 holdout thì
sai số AUC cỡ ±0.02-0.03, không phân biệt được cải thiện thật với nhiễu.

Vẫn tính lại số cũ (`_evaluate_optimistic_split`) và lưu kèm để ĐO ĐỘ LỚN của leakage, không phải
để dùng — xem `optimistic_user_overlap` trong metadata.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score, silhouette_score
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import MinMaxScaler, QuantileTransformer

from shared_common.config import shared_settings
from shared_common.features import FEATURE_VERSION, build_feature_matrix
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine
from shared_common.registry import load_metadata, save_model

from app.training.labels import (
    LABEL_VERSION,
    MIN_DELIVERED_ORDERS_FOR_CHURN,
    compute_churn_labels,
)

logger = get_logger(__name__)

MODEL_NAME_KMEANS = "churn_kmeans"
MODEL_NAME_CLASSIFIER = "churn_classifier"

# Định nghĩa nhãn v2 (Tầng 0.2 — chốt từ lưới chẩn đoán ở app/training/label_diagnostics.py).
#
# Bản đầu: nhãn = "không hoạt động (xem HOẶC mua) trong 30 ngày tới", mốc cắt 60-210 ngày. Vấn đề:
# nhãn lấy từ `orders` ∪ `user_events` trong khi feature mạnh nhất (`category_diversity_viewed`) cũng
# lấy từ `user_events` -> bài toán gần như thành "user đang hoạt động có tiếp tục hoạt động không",
# và MỌI việc mở rộng feature đều thất bại (3/3 block, đối chứng âm còn ăn điểm cao hơn block thật).
#
# Đo trên lưới 12 biến thể, phương án dưới đây là biến thể DUY NHẤT có base rate vào khoảng mục tiêu
# 15-30% (0.2624) và ổn định nhất nhóm `orders` (AUC 0.8414 +- 0.0299):
#   - cửa sổ 120 ngày, nguồn `orders` (chỉ tính đặt đơn)
#   - chỉ dân số >= 2 đơn DELIVERED
# AUC tụt 0.9315 -> 0.8414 so với nhãn cũ là ĐÚNG DỰ KIẾN: bài toán khó và thật hơn, không phải hồi quy.
#
# Cửa sổ 120 ngày buộc mốc cắt gần nhất phải >= 150 ngày trước (120 + 30 đệm) -> model học từ dữ liệu
# 5-9 tháng trước, không dùng được dữ liệu gần đây. Đây là GIỚI HẠN đã chấp nhận, phải nêu khi báo cáo.
CUTOFF_DAYS_AGO = [270, 240, 210, 180, 150]
LABEL_WINDOW_DAYS = 120
LABEL_SOURCE = "orders"
MIN_USERS_FOR_CLUSTERING = 4

N_CLUSTERS = 4
CV_SPLITS = 5
DEFAULT_THRESHOLD = 0.5

# Hiệu chỉnh xác suất (Tầng 0.1 — xem docs/canvas/churn-risk-tier0-plan.md). Đo được trên run
# 2026-07-31: model thô dự đoán churn trung bình 0.4217 trong khi thực tế 0.2420 (thổi phồng ~1,74x,
# ECE 0.1797) vì `class_weight='balanced'` ước lượng hậu nghiệm dưới tiên nghiệm 50/50. `isotonic`
# đưa ECE về 0.0391 mà AUC không đổi -> chọn isotonic.
CALIBRATION_METHOD = "isotonic"
CALIBRATION_CV = 5
# Ngân sách voucher giả định để báo precision@K / revenue-recall@K (hướng "ranking" — marketing
# chỉ cứu được K người, chọn ai?).
BUDGET_K_VALUES = [25, 50, 100, 200]

# Chiều dùng để nhận dạng "cụm này giống archetype nào". Không dùng cả 11 feature: nhiều feature
# (vd view_to_cart_conversion_rate) không phân biệt được 4 archetype, chỉ thêm nhiễu vào khoảng cách.
# `recent_view_count` BẮT BUỘC có mặt: user chưa từng mua đều có recency = days_since_last_activity
# = 9999 (default của assembler.py), nếu chỉ dựa vào 2 chiều đó thì KHÔNG phân biệt được "khách mới
# đang xem nhưng chưa mua" với "khách đã nguội hẳn" — lượt xem gần đây là thứ tách được hai nhóm này.
SEGMENT_PROFILE_DIMS = [
    "frequency",
    "monetary",
    "recency",
    "days_since_last_activity",
    "cart_abandon_count",
    "recent_view_count",
]

# Nhãn "At Risk" là HỢP ĐỒNG với risk_scheduler.AT_RISK_SEGMENT và pricing.py — đổi tên là hỏng luồng.
AT_RISK_LABEL = "At Risk"
# 3 nhãn còn lại gán theo THỨ HẠNG giá trị (monetary trung bình) giảm dần.
VALUE_TIER_LABELS = ["VIP Champions", "Loyal Regulars", "Lapsed"]

# Chênh lệch tỉ lệ churn giữa cụm cao nhất và thấp nhất. Dưới mức này thì chiều `segment` gần như
# không phân biệt được rủi ro -> cổng lọc theo segment ở risk_scheduler thêm rất ít thông tin so với
# việc chỉ dùng ngưỡng xác suất. Chỉ cảnh báo, không tự đổi hành vi.
SEGMENT_CHURN_SPREAD_WARN = 0.10


def _assign_cluster_labels(panel: pd.DataFrame) -> tuple[dict[int, str], dict[str, float]]:
    """Gán `At Risk` cho cụm có TỈ LỆ CHURN ĐO ĐƯỢC cao nhất; 3 cụm còn lại gán theo thứ hạng giá trị.

    Trả về `(labels, churn_rate_per_label)`.

    ## Vì sao bỏ cách khớp archetype (đã thử và loại)

    Bản trước gán nhãn bằng cách khớp tâm cụm với 4 "archetype" tự vẽ (VIP / At Risk / Hibernating /
    New Customers) qua `linear_sum_assignment`. Cách đó bảo đảm song ánh — sửa được bug cũ (k=4 mà chỉ
    ra 2 nhãn, 64% dân số bị gọi là VIP) — nhưng **giả định các archetype đó TỒN TẠI trong dữ liệu**.

    Khi siết dân số về user >= 2 đơn DELIVERED (nhãn v2), giả định đó sập: archetype `Hibernating`
    (freq 0 / monetary 0) và `New Customers` (mua rất ít) không còn nhóm nào tương ứng, mà phân công
    song ánh vẫn buộc gán đủ 4 nhãn. Đo thực trên run `20260801T025548300574`:
    nhóm **giá trị CAO NHẤT** (freq 6.67, monetary 239tr, recency 26.4) bị gán nhãn `New Customers`
    với khoảng cách khớp 3.105, còn `At Risk` lại rơi vào nhóm giá trị THẤP NHẤT (monetary 101tr)
    -> phát voucher sai hẳn đối tượng.

    ## Cách hiện tại

    Panel huấn luyện **CÓ `churn_label`** — nên không cần đoán: gán `At Risk` cho cụm mà tỉ lệ churn
    thực đo cao nhất. Đây là đại lượng đúng mục đích của cổng lọc, và kiểm chứng được. 3 cụm còn lại
    nhận nhãn theo `monetary` trung bình giảm dần, thuần mô tả để chọn LOẠI campaign.
    """
    stats = panel.groupby("cluster").agg(
        churn_rate=("churn_label", "mean"),
        size=("churn_label", "size"),
        monetary=("monetary", "mean"),
    )

    at_risk_cluster = int(stats["churn_rate"].idxmax())
    remaining = stats.drop(index=at_risk_cluster).sort_values("monetary", ascending=False)

    labels: dict[int, str] = {at_risk_cluster: AT_RISK_LABEL}
    for rank, cluster_id in enumerate(remaining.index):
        # Nhiều cụm hơn nhãn mô tả (k > 4) -> đặt tên theo hạng để không mất cụm nào.
        labels[int(cluster_id)] = (
            VALUE_TIER_LABELS[rank] if rank < len(VALUE_TIER_LABELS) else f"Value Tier {rank + 1}"
        )

    churn_rates = {labels[int(cid)]: round(float(stats.loc[cid, "churn_rate"]), 4) for cid in stats.index}

    spread = float(stats["churn_rate"].max() - stats["churn_rate"].min())
    if spread < SEGMENT_CHURN_SPREAD_WARN:
        logger.warning(
            f"Tỉ lệ churn giữa các cụm chênh nhau chỉ {spread:.4f} (< {SEGMENT_CHURN_SPREAD_WARN}) — "
            f"chiều `segment` gần như KHÔNG phân biệt được rủi ro. Cổng lọc theo segment ở "
            f"risk_scheduler khi đó thêm rất ít thông tin so với chỉ dùng ngưỡng xác suất; cân nhắc "
            f"bỏ cổng đó. churn_rate theo nhãn={churn_rates}"
        )
    return labels, churn_rates


def _segment_profiles(
    panel: pd.DataFrame, cluster_labels: dict[int, str], churn_rates: dict[str, float] | None = None
) -> dict:
    """Mô tả từng phân khúc bằng số thật — để trả lời "vì sao cụm này gọi là At Risk" khi bảo vệ,
    thay vì phải tin vào tên nhãn. `churn_rate` là căn cứ gán nhãn `At Risk`, nên phải xem cùng."""
    profiles = panel.groupby("cluster")[SEGMENT_PROFILE_DIMS].mean()
    out = {}
    for cluster_id in profiles.index:
        name = cluster_labels.get(int(cluster_id), f"cluster_{cluster_id}")
        entry = {dim: round(float(profiles.loc[cluster_id, dim]), 3) for dim in SEGMENT_PROFILE_DIMS}
        entry["size"] = int((panel["cluster"] == cluster_id).sum())
        if churn_rates is not None:
            entry["churn_rate"] = churn_rates.get(name)
        out[name] = entry
    return out


def _build_training_panel(
    engine,
    *,
    include_candidates: bool = False,
    cutoffs_days_ago: list[int] | None = None,
    label_window_days: int | None = None,
    label_source: str = LABEL_SOURCE,
    min_delivered_orders: int = MIN_DELIVERED_ORDERS_FOR_CHURN,
    reference_now: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """`include_candidates=True` ghép thêm các cột ứng viên (`features/candidates.py`) để
    `app/training/ablation.py` thí nghiệm. Production train luôn để False — model đang chạy chỉ
    được phép dùng `FEATURE_COLUMNS`.

    `cutoffs_days_ago` / `label_window_days` / `label_source` / `min_delivered_orders` để
    `label_diagnostics.py` quét lưới định nghĩa nhãn (Tầng 0.2) — module đó tự lọc dân số nên truyền
    `min_delivered_orders=0` để không lọc hai lần. Mặc định giữ đúng cấu hình production.

    `reference_now`: mặc định `None` -> dùng đồng hồ hệ thống (đúng hành vi production, dữ liệu
    seed synthetic luôn neo quanh "hiện tại"). CHỈ truyền tường minh khi train trên dữ liệu lịch sử
    đã đóng băng (vd Olist 2016-2018, xem `tools/real-data-seed`) — nếu không, mốc cắt sẽ tính lùi
    từ NGÀY HỆ THỐNG thay vì từ mốc cuối cùng có dữ liệu thật, khiến MỌI user rơi vào đúng 1 nhãn
    (toàn bộ "không có đơn trong tương lai" vì tương lai đó không hề tồn tại trong dữ liệu).
    """
    cutoff_days = cutoffs_days_ago or CUTOFF_DAYS_AGO
    window_days = label_window_days or LABEL_WINDOW_DAYS

    now = reference_now if reference_now is not None else pd.Timestamp(datetime.now())
    cutoffs = [now - timedelta(days=d) for d in cutoff_days]

    frames = []
    for cutoff in cutoffs:
        X = build_feature_matrix(engine, as_of=cutoff)
        if X.empty:
            logger.warning(f"Không có user nào tại cutoff={cutoff}, bỏ qua mốc này")
            continue
        if include_candidates:
            from shared_common.features.candidates import CANDIDATE_DEFAULTS, fetch_candidate_features

            X = X.join(fetch_candidate_features(engine, as_of=cutoff), how="left").fillna(
                CANDIDATE_DEFAULTS
            )
        labels = compute_churn_labels(engine, X.index.tolist(), cutoff, window_days, label_source)
        frame = X.copy()
        frame["churn_label"] = frame.index.map(labels)
        frame["cutoff"] = cutoff
        frames.append(frame)

    if not frames:
        raise RuntimeError("Không sinh được panel huấn luyện nào — kiểm tra dữ liệu orders/user_events.")

    panel = pd.concat(frames)

    if min_delivered_orders > 0:
        before = len(panel)
        # `frequency` = số đơn DELIVERED tính tới mốc cắt, nên lọc được ngay trên panel, không cần SQL.
        panel = panel[panel["frequency"] >= min_delivered_orders]
        logger.info(
            f"Lọc dân số nhãn churn: giữ user có >= {min_delivered_orders} đơn DELIVERED "
            f"({before} -> {len(panel)} dòng)"
        )
        if panel.empty:
            raise RuntimeError(
                f"Không còn dòng nào sau khi lọc >= {min_delivered_orders} đơn DELIVERED — "
                f"kiểm tra dữ liệu seed."
            )

    _assert_panel_not_contaminated(panel, cutoffs)

    return panel


# Tỉ lệ churn vượt ngưỡng này coi như nhãn đã SỤP (gần như mọi user cùng 1 lớp) — không phải bài
# toán học được nữa. 0.90 chọn cao có chủ đích: churn rate thật của dữ liệu synthetic hiện tại là
# ~0.26, của biến thể nhãn 60 ngày từng đo là ~0.38 — còn rất xa 0.90, nên guard này KHÔNG chặn oan
# các cấu hình nhãn hợp lệ, chỉ bắt trường hợp bệnh lý.
CONTAMINATION_CHURN_RATE_MAX = 0.90
# Tỉ lệ user "chết hẳn" (đơn cuối cùng còn cũ hơn CẢ mốc cắt sớm nhất) vượt ngưỡng này -> gần như
# chắc chắn đang trộn 2 nguồn dữ liệu lệch mốc thời gian.
CONTAMINATION_STALE_RATIO_MAX = 0.50


def _assert_panel_not_contaminated(panel: pd.DataFrame, cutoffs: list) -> None:
    """Chặn train khi panel bị NHIỄM bởi dữ liệu lệch hẳn mốc thời gian (vd trộn dữ liệu lịch sử
    2016-2018 của `tools/real-data-seed` với dữ liệu synthetic 2025-2026 của `tools/data-seed` trong
    CÙNG 1 database).

    Vì sao cần guard này (đã xảy ra thật, 2026-08-04 — xem docs/canvas/churn-risk-log.md): khi trộn
    2 nguồn, mọi user của nguồn cũ có đơn cuối cùng cách mốc cắt nhiều NĂM nên luôn bị dán churn=1,
    và `recency`/`days_since_last_activity` của họ lớn bất thường -> model chỉ cần học "user thuộc
    nguồn dữ liệu nào" là đã phân loại gần như hoàn hảo. Kết quả đo được lúc đó: **AUC 0.9908** (so
    với 0.8415 trên dữ liệu sạch) — nhìn như đột phá nhưng hoàn toàn vô nghĩa.

    Đặc biệt nguy hiểm vì `_retrain_gate()` KHÔNG cứu được: gate chỉ chặn khi metric TỤT, còn đây
    metric bị THỔI PHỒNG nên gate cho qua và model rác thay luôn model production. Vậy nên phải chặn
    ngay từ lúc dựng panel, không để tới bước gate.
    """
    churn_rate = float(panel["churn_label"].mean())
    earliest_cutoff = min(cutoffs)

    # `recency` = số ngày từ đơn DELIVERED cuối cùng tới mốc cắt của chính dòng đó. User có recency
    # lớn hơn khoảng cách (mốc cắt sớm nhất -> mốc cắt muộn nhất) + toàn bộ cửa sổ nhãn thì đơn cuối
    # của họ nằm trước CẢ mốc sớm nhất -> không thể mang tín hiệu churn nào ngoài "đã chết từ lâu".
    span_days = (max(cutoffs) - earliest_cutoff).days + LABEL_WINDOW_DAYS
    stale_ratio = float((panel["recency"] > span_days).mean())

    if churn_rate > CONTAMINATION_CHURN_RATE_MAX and stale_ratio > CONTAMINATION_STALE_RATIO_MAX:
        raise RuntimeError(
            f"Panel huấn luyện có dấu hiệu NHIỄM dữ liệu lệch mốc thời gian: tỉ lệ churn "
            f"{churn_rate:.4f} (> {CONTAMINATION_CHURN_RATE_MAX}) và {stale_ratio:.1%} user có đơn "
            f"cuối cùng còn cũ hơn cả mốc cắt sớm nhất ({earliest_cutoff.date()}). Thường do trộn "
            f"2 nguồn dữ liệu lệch nhau nhiều năm trong cùng 1 DB — vd dữ liệu lịch sử của "
            f"tools/real-data-seed (Olist 2016-2018) lẫn với tools/data-seed (synthetic, quanh hiện "
            f"tại). Train tiếp sẽ ra AUC cao GIẢ (model chỉ học 'user thuộc nguồn nào'). Cách xử lý: "
            f"chỉ giữ 1 nguồn trong DB khi train (dùng cleanup.mjs của tool tương ứng), hoặc truyền "
            f"`reference_now` khớp mốc thời gian của dữ liệu lịch sử nếu CHỦ ĐÍCH train trên nguồn đó."
        )

    if churn_rate > CONTAMINATION_CHURN_RATE_MAX or stale_ratio > CONTAMINATION_STALE_RATIO_MAX:
        # Chỉ 1 trong 2 dấu hiệu -> có thể hợp lệ (vd chủ đích train trên dữ liệu lịch sử với
        # `reference_now` đúng, churn rate cao thật). Không chặn, nhưng phải log để không âm thầm.
        logger.warning(
            f"Panel có 1 dấu hiệu bất thường (churn_rate={churn_rate:.4f}, "
            f"stale_ratio={stale_ratio:.1%}) — kiểm tra lại nguồn dữ liệu trước khi tin metric."
        )


def _fit_classifier(
    train_df: pd.DataFrame, feature_columns: list[str] | None = None
) -> tuple[MinMaxScaler, LogisticRegression]:
    """Giữ nguyên MinMaxScaler + LogisticRegression(class_weight='balanced') như bản đầu.

    CỐ Ý không đổi pipeline classifier ở lần sửa này: mục tiêu là đo cho được ẢNH HƯỞNG CỦA
    LEAKAGE (grouped CV vs split cũ). Đổi thêm scaler/model cùng lúc thì hai thay đổi trộn vào
    nhau, không quy được delta AUC cho nguyên nhân nào.

    `feature_columns` để `ablation.py` truyền tập feature khác — mặc định là bộ production.
    """
    columns = feature_columns or FEATURE_COLUMNS
    scaler = MinMaxScaler()
    X = scaler.fit_transform(train_df[columns])
    clf = LogisticRegression(class_weight="balanced", max_iter=1000)
    clf.fit(X, train_df["churn_label"])
    return scaler, clf


def _retrain_gate(new_cv_metrics: dict) -> dict:
    """Quyết định model MỚI có được đưa vào production (cập nhật con trỏ `latest`) hay không.

    Quy tắc: chấp nhận nếu `AUC_mới >= AUC_cũ - std_cũ` — dùng std của CHÍNH model cũ làm sàn nhiễu
    (không dùng std của model mới, vì lúc so sánh model mới chưa được tin tưởng để làm chuẩn).

    Luôn CHẤP NHẬN (không so AUC) khi:
    - Chưa có model nào đang chạy (lần train đầu tiên) — không có gì để so.
    - Định nghĩa nhãn đã đổi (`label_version` khác cũ) — đã tự chứng minh trong phiên này rằng AUC
      giữa 2 định nghĩa nhãn KHÔNG so trực tiếp được (nhãn v1 AUC 0.93 vs v2 AUC 0.84, chênh lệch đó
      là do đổi bài toán chứ không phản ánh model tệ đi).
    """
    try:
        old_meta = load_metadata(MODEL_NAME_CLASSIFIER)
    except FileNotFoundError:
        return {"passed": True, "reason": "Chưa có model nào đang chạy — chấp nhận làm model đầu tiên."}

    old_metrics = old_meta.get("metrics", {})
    old_label = (old_metrics.get("label_definition") or {}).get("label_version")
    new_label = (new_cv_metrics.get("label_definition") or {}).get("label_version")
    if old_label != new_label:
        return {
            "passed": True,
            "reason": f"Đổi định nghĩa nhãn ({old_label} -> {new_label}) -> AUC không so trực tiếp "
            f"được, bỏ qua gate.",
        }

    old_auc, old_std = old_metrics.get("auc_mean"), old_metrics.get("auc_std")
    new_auc = new_cv_metrics.get("auc_mean")
    if old_auc is None or new_auc is None:
        return {"passed": True, "reason": "Thiếu AUC để so sánh (model cũ hoặc mới) -> bỏ qua gate."}

    threshold = round(old_auc - (old_std or 0.0), 4)
    passed = bool(new_auc >= threshold)
    return {
        "passed": passed,
        "old_auc_mean": old_auc,
        "old_auc_std": old_std,
        "new_auc_mean": new_auc,
        "threshold": threshold,
        "reason": (
            f"{'ĐẠT' if passed else 'KHÔNG ĐẠT'}: AUC mới {new_auc} "
            f"{'>=' if passed else '<'} ngưỡng {threshold} (= AUC cũ {old_auc} - std {old_std})"
        ),
    }


def _label_definition() -> dict:
    """Ghi kèm mỗi model artifact. Model train bằng 2 định nghĩa nhãn khác nhau thì KHÔNG so metric
    trực tiếp được — không có mục này thì `run_log.jsonl` sẽ trộn lẫn các run không so được với nhau."""
    return {
        "label_version": LABEL_VERSION,
        "source": LABEL_SOURCE,
        "window_days": LABEL_WINDOW_DAYS,
        "min_delivered_orders": MIN_DELIVERED_ORDERS_FOR_CHURN,
        "cutoffs_days_ago": CUTOFF_DAYS_AGO,
    }


def _fit_calibrated(
    train_df: pd.DataFrame, scaler: MinMaxScaler, feature_columns: list[str] | None = None
) -> CalibratedClassifierCV:
    """LogisticRegression bọc trong `CalibratedClassifierCV(isotonic)`, fit trên `train_df` bằng
    `scaler` ĐÃ fit sẵn (không fit lại scaler để khớp đúng đường predict).

    Dùng cho CẢ HAI việc: (1) sinh OOF đã hiệu chỉnh để chọn ngưỡng / tính bảng xếp hạng, (2) model
    XUẤT BẢN. Dùng cùng một hàm để cái đo được và cái chạy thật là cùng một cấu trúc.
    """
    columns = feature_columns or FEATURE_COLUMNS
    model = CalibratedClassifierCV(
        LogisticRegression(class_weight="balanced", max_iter=1000),
        method=CALIBRATION_METHOD,
        cv=CALIBRATION_CV,
    )
    model.fit(scaler.transform(train_df[columns]), train_df["churn_label"])
    return model


def _calibrated_oof(folds: list[dict], feature_columns: list[str] | None = None) -> pd.DataFrame | None:
    """OOF prediction ĐÃ HIỆU CHỈNH: mỗi fold refit calibrator trong tập train của fold rồi predict
    lên holdout (user chưa từng thấy). Đây là thang xác suất mà model xuất bản sẽ dùng, nên ngưỡng và
    bảng xếp hạng PHẢI tính trên thang này — tính trên OOF thô sẽ cho ngưỡng ~0.61, sai hoàn toàn khi
    áp lên model đã hiệu chỉnh.
    """
    columns = feature_columns or FEATURE_COLUMNS
    frames = []
    for index, fold in enumerate(folds, start=1):
        train_df, test_df, scaler = fold["train_df"], fold["test_df"], fold["scaler"]
        try:
            model = _fit_calibrated(train_df, scaler, columns)
            proba = model.predict_proba(scaler.transform(test_df[columns]))[:, 1]
        except Exception as e:
            logger.warning(f"Fold {index}: không hiệu chỉnh được ({e}); bỏ fold này khỏi OOF hiệu chỉnh")
            continue
        frames.append(
            pd.DataFrame(
                {
                    "y_true": test_df["churn_label"].to_numpy(),
                    "proba": proba,
                    "monetary": test_df["monetary"].to_numpy(),
                },
                index=test_df.index,
            )
        )
    return pd.concat(frames) if frames else None


def _score(y_true: np.ndarray, y_proba: np.ndarray, threshold: float = DEFAULT_THRESHOLD) -> dict:
    y_pred = (y_proba >= threshold).astype(int)
    return {
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_true, y_proba)) if len(np.unique(y_true)) > 1 else None,
    }


def _mean_std(values: list) -> tuple[float | None, float | None]:
    arr = np.asarray([v for v in values if v is not None], dtype=float)
    if arr.size == 0:
        return None, None
    return float(arr.mean()), float(arr.std(ddof=0))


def _evaluate_grouped_cv(
    panel: pd.DataFrame, test_cutoff, feature_columns: list[str] | None = None
) -> dict:
    """Đánh giá THẬT: mỗi fold train/test KHÔNG chung user, và train chỉ dùng mốc cũ hơn test.

    Trả về dict metric mean ± std + bảng out-of-fold (`_oof`) để tính tiếp threshold tối ưu và
    precision@K — pooled OOF hợp lệ vì các fold rời nhau theo user nên mỗi user xuất hiện đúng 1 lần.
    Ngoài ra `_folds` mang lại (model, scaler, test_df) từng fold để `ablation.py` tính permutation
    importance trên đúng holdout của fold đó.
    """
    columns = feature_columns or FEATURE_COLUMNS
    test_pool = panel[panel["cutoff"] == test_cutoff]
    train_pool = panel[panel["cutoff"] != test_cutoff]

    users = test_pool.index.to_numpy()
    strat = test_pool["churn_label"].to_numpy()
    minority = int(min((strat == 0).sum(), (strat == 1).sum()))
    n_splits = int(min(CV_SPLITS, minority))

    if n_splits < 2 or train_pool.empty:
        return {
            "error": (
                f"Không đủ dữ liệu cho grouped CV (lớp nhỏ nhất ở mốc test có {minority} user, "
                f"train_pool={len(train_pool)} dòng). Cần seed thêm dữ liệu."
            )
        }

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    per_fold: list[dict] = []
    oof_frames: list[pd.DataFrame] = []
    fitted_folds: list[dict] = []

    for fold_id, (_, holdout_idx) in enumerate(skf.split(users, strat), start=1):
        holdout_users = set(users[holdout_idx].tolist())
        fold_test = test_pool[test_pool.index.isin(holdout_users)]
        # train = user KHÁC (loại hẳn holdout_users) và chỉ ở các mốc CŨ HƠN test_cutoff
        fold_train = train_pool[~train_pool.index.isin(holdout_users)]

        if fold_train["churn_label"].nunique() < 2 or fold_test["churn_label"].nunique() < 2:
            logger.warning(f"Fold {fold_id} bỏ qua: train hoặc test chỉ có 1 lớp nhãn")
            continue

        scaler, clf = _fit_classifier(fold_train, columns)
        proba = clf.predict_proba(scaler.transform(fold_test[columns]))[:, 1]
        y_true = fold_test["churn_label"].to_numpy()

        fold_metrics = _score(y_true, proba)
        fold_metrics.update(
            {"fold": fold_id, "train_rows": int(len(fold_train)), "test_users": int(len(fold_test))}
        )
        per_fold.append(fold_metrics)
        # train_df đi kèm để `calibration.py` refit được calibrator TRONG đúng fold này (dùng base
        # rate/dữ liệu của fold, không dùng của toàn panel — dùng toàn panel là rò rỉ).
        fitted_folds.append(
            {"scaler": scaler, "clf": clf, "test_df": fold_test, "train_df": fold_train}
        )

        oof_frames.append(
            pd.DataFrame(
                {
                    "y_true": y_true,
                    "proba": proba,
                    "monetary": fold_test["monetary"].to_numpy(),
                },
                index=fold_test.index,
            )
        )

    if not per_fold:
        return {"error": "Mọi fold đều bị bỏ qua (nhãn 1 lớp) — kiểm tra dữ liệu seed."}

    result: dict[str, Any] = {
        "eval_protocol": "grouped_cv__user_disjoint__train_on_earlier_cutoffs",
        "n_splits": len(per_fold),
        "threshold": DEFAULT_THRESHOLD,
        "per_fold": per_fold,
    }
    for metric in ("precision", "recall", "f1", "auc"):
        mean, std = _mean_std([f[metric] for f in per_fold])
        result[f"{metric}_mean"] = None if mean is None else round(mean, 4)
        result[f"{metric}_std"] = None if std is None else round(std, 4)

    result["_oof"] = pd.concat(oof_frames)
    result["_folds"] = fitted_folds
    return result


def _evaluate_optimistic_split(panel: pd.DataFrame, test_cutoff) -> dict:
    """Tái tạo CHỦ ĐÍCH cách chia cũ (test theo thời gian nhưng CHUNG user với train) để đo xem
    leakage thổi metric lên bao nhiêu. KHÔNG dùng số này để kết luận chất lượng model."""
    train_df = panel[panel["cutoff"] != test_cutoff]
    test_df = panel[panel["cutoff"] == test_cutoff]
    if train_df["churn_label"].nunique() < 2 or test_df.empty:
        return {"error": "Không đủ dữ liệu cho split đối chiếu"}

    scaler, clf = _fit_classifier(train_df)
    proba = clf.predict_proba(scaler.transform(test_df[FEATURE_COLUMNS]))[:, 1]
    scored = _score(test_df["churn_label"].to_numpy(), proba)

    overlap = len(set(test_df.index) & set(train_df.index))
    scored.update(
        {
            "note": "CHUNG user giữa train/test — số này LẠC QUAN, chỉ để đối chiếu",
            "test_users_also_in_train": int(overlap),
            "test_users": int(test_df.index.nunique()),
        }
    )
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in scored.items()}


def _tune_threshold(oof: pd.DataFrame) -> dict:
    """Quét ngưỡng trên out-of-fold prediction, chọn theo F1 cao nhất.

    Ngưỡng mặc định 0.5 đang cho recall rất cao / precision thấp (bắt gần hết churn nhưng ~38%
    cảnh báo là sai) -> phát voucher lãng phí. Đây chỉ là ĐỀ XUẤT ghi vào metadata; ngưỡng chạy
    thật vẫn do env `RISK_CHURN_PROBABILITY_THRESHOLD` quyết định, không tự ý đổi hành vi production.
    """
    y_true = oof["y_true"].to_numpy()
    best = {"threshold": DEFAULT_THRESHOLD, "f1": -1.0}
    for threshold in np.arange(0.05, 0.96, 0.01):
        f1 = float(f1_score(y_true, (oof["proba"].to_numpy() >= threshold).astype(int), zero_division=0))
        if f1 > best["f1"]:
            best = {"threshold": round(float(threshold), 2), "f1": round(f1, 4)}

    at_default = _score(y_true, oof["proba"].to_numpy(), DEFAULT_THRESHOLD)
    at_best = _score(y_true, oof["proba"].to_numpy(), best["threshold"])
    return {
        "suggested_threshold": best["threshold"],
        "at_default_threshold": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in at_default.items()},
        "at_suggested_threshold": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in at_best.items()},
    }


def _ranking_metrics(oof: pd.DataFrame) -> dict:
    """So 2 cách xếp hạng khi ngân sách chỉ đủ cứu K người.

    - `by_probability`: xếp theo P(churn) — tối đa hóa SỐ NGƯỜI bắt đúng.
    - `by_expected_loss`: xếp theo P(churn) x monetary — tối đa hóa DOANH THU giữ được.

    `revenue_recall_at_k` = phần doanh thu-đang-rủi-ro thu được trong top K. Đây là con số cho thấy
    vì sao rule-based không làm được việc này: rule chỉ trả nhãn nhị phân, không có xác suất để
    nhân với giá trị khách hàng nên không xếp hạng được, buộc phải chọn bừa K trong số bị flag.
    """
    frame = oof.copy()
    frame["expected_loss"] = frame["proba"] * frame["monetary"]

    total_revenue_at_risk = float((frame["y_true"] * frame["monetary"]).sum())
    out: dict[str, Any] = {
        "pooled_users": int(len(frame)),
        "total_revenue_at_risk": round(total_revenue_at_risk, 2),
    }

    for k in BUDGET_K_VALUES:
        if k > len(frame):
            continue
        entry = {}
        for name, column in (("by_probability", "proba"), ("by_expected_loss", "expected_loss")):
            top = frame.nlargest(k, column)
            captured = float((top["y_true"] * top["monetary"]).sum())
            entry[name] = {
                "precision_at_k": round(float(top["y_true"].mean()), 4),
                "revenue_recall_at_k": (
                    round(captured / total_revenue_at_risk, 4) if total_revenue_at_risk > 0 else None
                ),
            }
        out[f"k={k}"] = entry

    return out


def _feature_importance(clf: LogisticRegression) -> list[dict]:
    """Hệ số Logistic Regression, sắp theo |coef| giảm dần. Feature đã qua MinMaxScaler nên các
    hệ số cùng thang [0,1] -> so sánh được độ ảnh hưởng giữa các feature. Dấu + = đẩy rủi ro churn
    lên, dấu - = kéo xuống."""
    coefs = clf.coef_[0]
    order = np.argsort(-np.abs(coefs))
    return [
        {"feature": FEATURE_COLUMNS[i], "coef": round(float(coefs[i]), 4), "direction": "+" if coefs[i] > 0 else "-"}
        for i in order
    ]


def train_and_evaluate() -> dict[str, Any]:
    """Chạy toàn bộ pipeline: sinh panel nhiều mốc thời gian -> KMeans + Logistic Regression ->
    đánh giá bằng grouped CV (tách user + nhân quả thời gian) -> lưu artifact.
    Raise lỗi rõ ràng nếu dữ liệu không đủ, KHÔNG âm thầm trả kết quả giả (sửa bug cũ của rfm.py).
    """
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine)

    if len(panel) < MIN_USERS_FOR_CLUSTERING:
        raise RuntimeError(
            f"Không đủ dữ liệu để train (chỉ có {len(panel)} dòng, cần tối thiểu {MIN_USERS_FOR_CLUSTERING}). "
            f"Chạy tools/data-seed trước khi train."
        )

    panel = panel.copy()

    # ---- KMeans (unsupervised) ----
    # QuantileTransformer thay MinMaxScaler: `recency`/`days_since_last_activity` có default 9999
    # cho user chưa từng mua/chưa từng hoạt động (xem assembler.py), MinMax bị outlier đó kéo giãn
    # làm 99% user còn lại dồn về gần 0 -> các cụm gần như không tách được (silhouette run đầu chỉ
    # 0.286). Rank-transform miễn nhiễm với outlier. Vẫn lưu vào key "scaler" nên
    # risk_scoring.py không phải sửa gì.
    scaler_km = QuantileTransformer(
        n_quantiles=min(1000, len(panel)), output_distribution="normal", random_state=42
    )
    X_km_scaled = scaler_km.fit_transform(panel[FEATURE_COLUMNS])
    kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init="auto")
    panel["cluster"] = kmeans.fit_predict(X_km_scaled)
    silhouette = float(silhouette_score(X_km_scaled, panel["cluster"])) if len(panel) > N_CLUSTERS else None

    # Gán nhãn cụm CẦN `churn_label` (gán `At Risk` theo tỉ lệ churn đo được), nên phải làm sau khi
    # panel đã có nhãn — panel luôn có sẵn từ `_build_training_panel`.
    cluster_labels, segment_churn_rates = _assign_cluster_labels(panel)
    churn_spread = round(
        float(max(segment_churn_rates.values()) - min(segment_churn_rates.values())), 4
    )

    segmentation_metrics: dict[str, Any] = {
        "n_clusters": N_CLUSTERS,
        "silhouette": None if silhouette is None else round(silhouette, 4),
        "scaler": "QuantileTransformer(normal)",
        "distribution": panel["cluster"].map(cluster_labels).value_counts().to_dict(),
        "labels_assigned": sorted(set(cluster_labels.values())),
        "labeling_rule": "At Risk = cụm có churn_rate đo được cao nhất; còn lại theo hạng monetary",
        "churn_rate_by_segment": segment_churn_rates,
        "churn_rate_spread": churn_spread,
        "segment_gate_informative": bool(churn_spread >= SEGMENT_CHURN_SPREAD_WARN),
    }

    # ---- Logistic Regression (supervised) ----
    test_cutoff = panel["cutoff"].max()
    if panel[panel["cutoff"] != test_cutoff]["churn_label"].nunique() < 2:
        raise RuntimeError(
            "Tập train chỉ có 1 lớp nhãn churn duy nhất (toàn 0 hoặc toàn 1) — không thể train "
            "classifier có ý nghĩa. Kiểm tra lại dữ liệu seed (cần cả user còn hoạt động lẫn user "
            "đã rời bỏ trong lịch sử)."
        )

    cv = _evaluate_grouped_cv(panel, test_cutoff)
    oof = cv.pop("_oof", None)
    # BẮT BUỘC pop: `_folds` chứa object sklearn (scaler/model) + DataFrame, không JSON-serializable
    # -> để lại là save_model() chết ở json.dump. Cần cho ablation.py + OOF hiệu chỉnh bên dưới.
    folds = cv.pop("_folds", [])
    if oof is not None:
        cv["threshold_tuning_uncalibrated"] = _tune_threshold(oof)
        cv["ranking_uncalibrated"] = _ranking_metrics(oof)
    cv["optimistic_user_overlap"] = _evaluate_optimistic_split(panel, test_cutoff)
    cv["panel_rows"] = int(len(panel))
    cv["panel_users"] = int(panel.index.nunique())
    cv["cutoffs"] = len(CUTOFF_DAYS_AGO)
    cv["churn_rate_overall"] = round(float(panel["churn_label"].mean()), 4)
    cv["label_definition"] = _label_definition()

    # Model XUẤT BẢN fit trên TOÀN BỘ panel (nhiều dữ liệu nhất cho production). Metric báo ở trên
    # đến từ grouped CV, KHÔNG phải từ dữ liệu mà model này đã thấy — đúng quy ước "CV để đo,
    # full-fit để dùng".
    scaler_clf, clf = _fit_classifier(panel)

    # Ngưỡng + bảng xếp hạng phải tính trên thang xác suất ĐÃ HIỆU CHỈNH, vì đó là thang model xuất
    # bản dùng. Tính trên OOF thô sẽ cho ngưỡng ~0.61 — áp lên model đã hiệu chỉnh là sai nặng.
    calibrated_oof = _calibrated_oof(folds)
    if calibrated_oof is not None:
        cv["threshold_tuning"] = _tune_threshold(calibrated_oof)
        cv["ranking"] = _ranking_metrics(calibrated_oof)

    # `calibrated=True` là HỢP ĐỒNG với risk_scoring.effective_threshold(): ngưỡng production đã
    # được tune cho thang đã hiệu chỉnh, nên bundle nào thiếu cờ này phải bị từ chối dùng ngưỡng đó
    # (ngưỡng 0.23 trên xác suất thô sẽ bắn gần như mọi user).
    calibrated_model = None
    try:
        calibrated_model = _fit_calibrated(panel, scaler_clf)
    except Exception as e:
        logger.error(
            f"KHÔNG hiệu chỉnh được model xuất bản ({e}). Lưu model THÔ kèm calibrated=False — "
            f"risk_scoring sẽ tự lùi về ngưỡng legacy để không bắn quá rộng."
        )

    classifier_bundle = {
        "scaler": scaler_clf,
        "model": calibrated_model or clf,
        "uncalibrated_model": clf,  # giữ để đọc coef_ (CalibratedClassifierCV không có coef_)
        "calibrated": calibrated_model is not None,
        "calibration_method": CALIBRATION_METHOD if calibrated_model is not None else None,
    }
    cv["calibrated"] = classifier_bundle["calibrated"]
    cv["calibration_method"] = classifier_bundle["calibration_method"]

    # ---- Retrain gate (Tầng 5) ----
    # "Train xong là dùng ngay" có thể làm production TỆ ĐI nếu lần train này gặp panel xấu (seed
    # dữ liệu ít hơn, fold rủi ro...). Gate so AUC mới với AUC CŨ (model 'latest' hiện tại) - std của
    # model cũ; chỉ cập nhật con trỏ `latest` nếu vượt qua. KHÔNG mất version vừa train dù rớt gate —
    # `save_model(update_latest=False)` vẫn ghi đủ artifact + metadata + run_log, chỉ không trỏ vào.
    #
    # Áp dụng ĐỒNG THỜI cho cả KMeans lẫn Classifier (cùng version, cùng panel): nếu chỉ gate riêng
    # classifier thì production có thể chạy cặp model lệch nhau (segmentation mới + classifier cũ),
    # dù feature tương thích nhưng gây khó hiểu khi soát lại.
    gate = _retrain_gate(cv)
    cv["retrain_gate"] = gate

    metrics = {"classifier": cv, "segmentation": segmentation_metrics}
    version = datetime.now().strftime("%Y%m%dT%H%M%S%f")

    save_model(
        MODEL_NAME_KMEANS,
        {"scaler": scaler_km, "kmeans": kmeans, "cluster_labels": cluster_labels},
        feature_version=FEATURE_VERSION,
        metrics=segmentation_metrics,
        version=version,
        extra={
            "segment_profiles": _segment_profiles(panel, cluster_labels, segment_churn_rates),
            "label_definition": _label_definition(),
        },
        update_latest=gate["passed"],
    )
    save_model(
        MODEL_NAME_CLASSIFIER,
        classifier_bundle,
        feature_version=FEATURE_VERSION,
        metrics=cv,
        version=version,
        extra={
            "feature_importance": _feature_importance(clf),
            "label_definition": _label_definition(),
        },
        update_latest=gate["passed"],
    )

    logger.info(
        f"Training xong. AUC(grouped CV)={cv.get('auc_mean')}±{cv.get('auc_std')} "
        f"vs AUC(split cũ, chung user)={cv.get('optimistic_user_overlap', {}).get('auc')} "
        f"| calibrated={classifier_bundle['calibrated']} ({classifier_bundle['calibration_method']}) "
        f"| ngưỡng đề xuất(thang đã hiệu chỉnh)={cv.get('threshold_tuning', {}).get('suggested_threshold')} "
        f"| silhouette={segmentation_metrics['silhouette']} "
        f"| segments={segmentation_metrics['distribution']} "
        f"| RETRAIN GATE: {gate['reason']} "
        f"| churn_rate theo segment={segmentation_metrics['churn_rate_by_segment']} "
        f"(spread={churn_spread}, cổng segment có ích={segmentation_metrics['segment_gate_informative']})"
    )
    return metrics
