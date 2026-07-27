"""Huấn luyện + đánh giá 2 model cho churn-risk detection (Phase 5):
1. KMeans segmentation (unsupervised) — tái sử dụng ý tưởng RFM cũ, mở rộng thêm feature hành vi.
2. Logistic Regression churn classifier (supervised) — dự đoán xác suất churn, có thể đánh giá
   bằng precision/recall/AUC vì có nhãn (temporal split, xem labels.py).

Tách BIỆT với việc SCORING định kỳ (Phase 6, app/services/risk_scoring.py) — module này chỉ chạy
khi có lệnh train tường minh (endpoint POST /api/v1/models/train), KHÔNG chạy tự động mỗi lần có
request, để tránh bug cũ: model cũ fit lại mỗi lần gọi làm tâm cụm dịch chuyển liên tục.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score, silhouette_score
from sklearn.preprocessing import MinMaxScaler

from shared_common.config import shared_settings
from shared_common.features import FEATURE_VERSION, build_feature_matrix
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine
from shared_common.registry import save_model

from app.training.labels import compute_churn_labels

logger = get_logger(__name__)

MODEL_NAME_KMEANS = "churn_kmeans"
MODEL_NAME_CLASSIFIER = "churn_classifier"

# 6 mốc cắt cách nhau 30 ngày, xa nhất 210 ngày trước -> gần nhất 60 ngày trước hiện tại. Mốc gần
# nhất (60 ngày) vẫn còn đủ 30 ngày "quan sát nhãn" trong quá khứ (60-30=30 ngày đệm an toàn).
CUTOFF_DAYS_AGO = [210, 180, 150, 120, 90, 60]
LABEL_WINDOW_DAYS = 30
MIN_USERS_FOR_CLUSTERING = 4


def _assign_cluster_labels(panel: pd.DataFrame) -> dict:
    """Rule-based: so sánh mean từng cụm với mean toàn cục để đặt tên (giữ nguyên tinh thần code
    RFM cũ), MỞ RỘNG thêm điều kiện "At Risk" theo feature hành vi mới, không chỉ recency đơn
    hàng — đây chính là điểm khác biệt so với RFM thuần trước đây."""
    cluster_means = panel.groupby("cluster")[FEATURE_COLUMNS].mean()
    global_means = panel[FEATURE_COLUMNS].mean()

    labels = {}
    for cluster_id in cluster_means.index:
        r = cluster_means.loc[cluster_id, "recency"]
        f = cluster_means.loc[cluster_id, "frequency"]
        m = cluster_means.loc[cluster_id, "monetary"]
        days_inactive = cluster_means.loc[cluster_id, "days_since_last_activity"]
        abandon = cluster_means.loc[cluster_id, "cart_abandon_count"]

        if f > global_means["frequency"] and m > global_means["monetary"] and r < global_means["recency"]:
            labels[cluster_id] = "VIP Champions"
        elif (
            r > global_means["recency"] * 1.2
            or days_inactive > global_means["days_since_last_activity"] * 1.2
            or abandon > global_means["cart_abandon_count"] * 1.5
        ):
            labels[cluster_id] = "At Risk"
        elif f < global_means["frequency"] and r < global_means["recency"]:
            labels[cluster_id] = "New Customers"
        else:
            labels[cluster_id] = "Potential Loyalists"

    return {int(k): v for k, v in labels.items()}


def _build_training_panel(engine) -> pd.DataFrame:
    now = pd.Timestamp(datetime.now())
    cutoffs = [now - timedelta(days=d) for d in CUTOFF_DAYS_AGO]

    frames = []
    for cutoff in cutoffs:
        X = build_feature_matrix(engine, as_of=cutoff)
        if X.empty:
            logger.warning(f"Không có user nào tại cutoff={cutoff}, bỏ qua mốc này")
            continue
        labels = compute_churn_labels(engine, X.index.tolist(), cutoff, LABEL_WINDOW_DAYS)
        frame = X.copy()
        frame["churn_label"] = frame.index.map(labels)
        frame["cutoff"] = cutoff
        frames.append(frame)

    if not frames:
        raise RuntimeError("Không sinh được panel huấn luyện nào — kiểm tra dữ liệu orders/user_events.")

    return pd.concat(frames)


def train_and_evaluate() -> dict[str, Any]:
    """Chạy toàn bộ pipeline: sinh panel nhiều mốc thời gian -> train KMeans + Logistic
    Regression -> đánh giá trên tập test theo thời gian (KHÔNG random split) -> lưu artifact.
    Raise lỗi rõ ràng nếu dữ liệu không đủ, KHÔNG âm thầm trả kết quả giả (sửa bug cũ của rfm.py).
    """
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine)

    if len(panel) < MIN_USERS_FOR_CLUSTERING:
        raise RuntimeError(
            f"Không đủ dữ liệu để train (chỉ có {len(panel)} dòng, cần tối thiểu {MIN_USERS_FOR_CLUSTERING}). "
            f"Chạy tools/data-seed trước khi train."
        )

    # ---- KMeans (unsupervised) — dùng toàn bộ panel, không cần nhãn ----
    scaler_km = MinMaxScaler()
    X_km_scaled = scaler_km.fit_transform(panel[FEATURE_COLUMNS])
    kmeans = KMeans(n_clusters=4, random_state=42, n_init="auto")
    panel = panel.copy()
    panel["cluster"] = kmeans.fit_predict(X_km_scaled)
    cluster_labels = _assign_cluster_labels(panel)
    silhouette = float(silhouette_score(X_km_scaled, panel["cluster"])) if len(panel) > 4 else None

    # ---- Logistic Regression (supervised) — split theo THỜI GIAN, không random ----
    test_cutoff = panel["cutoff"].max()  # mốc gần hiện tại nhất -> giữ lại làm test
    train_df = panel[panel["cutoff"] != test_cutoff]
    test_df = panel[panel["cutoff"] == test_cutoff]

    if train_df["churn_label"].nunique() < 2:
        raise RuntimeError(
            "Tập train chỉ có 1 lớp nhãn churn duy nhất (toàn 0 hoặc toàn 1) — không thể train "
            "classifier có ý nghĩa. Kiểm tra lại dữ liệu seed (cần cả user còn hoạt động lẫn user "
            "đã rời bỏ trong lịch sử)."
        )

    scaler_clf = MinMaxScaler()
    X_train_scaled = scaler_clf.fit_transform(train_df[FEATURE_COLUMNS])
    X_test_scaled = scaler_clf.transform(test_df[FEATURE_COLUMNS])

    clf = LogisticRegression(class_weight="balanced", max_iter=1000)
    clf.fit(X_train_scaled, train_df["churn_label"])

    y_pred = clf.predict(X_test_scaled)
    y_proba = clf.predict_proba(X_test_scaled)[:, 1]
    y_true = test_df["churn_label"]

    metrics = {
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_true, y_proba)) if y_true.nunique() > 1 else None,
        "silhouette": silhouette,
        "train_size": int(len(train_df)),
        "test_size": int(len(test_df)),
        "test_churn_rate": float(y_true.mean()),
        "cluster_distribution": panel["cluster"].map(cluster_labels).value_counts().to_dict(),
    }

    version = datetime.now().strftime("%Y%m%dT%H%M%S%f")
    save_model(
        MODEL_NAME_KMEANS,
        {"scaler": scaler_km, "kmeans": kmeans, "cluster_labels": cluster_labels},
        feature_version=FEATURE_VERSION,
        metrics=metrics,
        version=version,
    )
    save_model(
        MODEL_NAME_CLASSIFIER,
        {"scaler": scaler_clf, "model": clf},
        feature_version=FEATURE_VERSION,
        metrics=metrics,
        version=version,
    )

    logger.info(f"Training xong. metrics={metrics}")
    return metrics
