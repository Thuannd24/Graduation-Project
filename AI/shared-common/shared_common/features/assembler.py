"""Ghép feature từ `rfm.py` + `behavior.py` thành 1 ma trận chuẩn để KMeans/classifier dùng.

FEATURE_VERSION phải tăng bất cứ khi nào danh sách/công thức feature đổi — `registry.py` ghi
version này kèm mỗi model artifact để trả lời "model đang chạy được train bằng bộ feature nào".

Phạm vi hiện tại (11 feature): recency/frequency/monetary/avg_order_value/cancel_rate/
discount_dependency (từ `orders`, cùng DB với service) + recent_view_count/
days_since_last_activity/cart_abandon_count/view_to_cart_conversion_rate/
category_diversity_viewed (từ `user_events`, cũng cùng DB).

Mở rộng đã cân nhắc nhưng CHƯA làm ở bản này (cần thêm DB connection tới product-service/
promotion-service qua `pool.get_engine(db_name, user=..., password=...)` với 1 MySQL user
chỉ-đọc riêng — xem ghi chú production trong `pool.py`): review_count/avg_rating_given
(product-service), voucher_usage_rate (promotion-service).
"""
from __future__ import annotations

import pandas as pd
from sqlalchemy.engine import Engine

from shared_common.features.behavior import fetch_behavior_features
from shared_common.features.rfm import fetch_order_features

FEATURE_VERSION = "churn_v1"

FEATURE_COLUMNS = [
    "recency",
    "frequency",
    "monetary",
    "avg_order_value",
    "cancel_rate",
    "discount_dependency",
    "recent_view_count",
    "days_since_last_activity",
    "cart_abandon_count",
    "view_to_cart_conversion_rate",
    "category_diversity_viewed",
]


def build_feature_matrix(engine: Engine, *, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """Trả về DataFrame index theo user_id, đúng `FEATURE_COLUMNS`, không NaN (mỗi hàm con đã
    tự fillna theo ngữ nghĩa riêng — vd user chưa từng mua thì recency=9999, không phải NaN)."""
    order_features = fetch_order_features(engine, as_of=as_of)
    behavior_features = fetch_behavior_features(engine, as_of=as_of)

    # outer join: user có đơn nhưng chưa từng "xem" (seed cũ) hoặc ngược lại vẫn phải xuất hiện
    combined = order_features.join(behavior_features, how="outer")

    # Nếu 1 trong 2 nguồn hoàn toàn thiếu user đó (outer join sinh NaN), áp lại default hợp lý
    # thay vì để pandas tự đưa NaN vào tận constructor model.
    defaults = {
        "recency": 9999,
        "frequency": 0,
        "monetary": 0.0,
        "avg_order_value": 0.0,
        "cancel_rate": 0.0,
        "discount_dependency": 0.0,
        "recent_view_count": 0,
        "days_since_last_activity": 9999,
        "cart_abandon_count": 0,
        "view_to_cart_conversion_rate": 0.0,
        "category_diversity_viewed": 0,
    }
    combined = combined.fillna(defaults)

    return combined[FEATURE_COLUMNS]
