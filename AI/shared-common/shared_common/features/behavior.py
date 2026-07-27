"""Feature tính từ bảng `user_events` (ghi bởi forecast-service/behavior_consumer.py, Phase 4).

Bảng sống trong DB của order-service (`ecommerce_order_db`) — xem lý do ở
`docs/canvas/churn-risk-implementation-plan.md` Phase 2 (cùng DB với `orders` để RFM/behavior
join được bằng pandas mà không cần cross-service SQL JOIN).
"""
from __future__ import annotations

import pandas as pd
from sqlalchemy.engine import Engine

from shared_common.logger import get_logger

logger = get_logger(__name__)

DEFAULT_RECENT_WINDOW_DAYS = 7
DEFAULT_ABANDON_WINDOW_DAYS = 30
DEFAULT_ABANDON_GRACE_HOURS = 24  # bao lâu sau khi thêm giỏ mà chưa có đơn thì tính là "bỏ giỏ"


def fetch_behavior_features(
    engine: Engine,
    *,
    as_of: pd.Timestamp | None = None,
    recent_window_days: int = DEFAULT_RECENT_WINDOW_DAYS,
    abandon_window_days: int = DEFAULT_ABANDON_WINDOW_DAYS,
    abandon_grace_hours: int = DEFAULT_ABANDON_GRACE_HOURS,
) -> pd.DataFrame:
    """Trả về DataFrame index theo user_id (String — Keycloak UUID, xem
    BE/api-gateway/.../UserHeaderFilter.java, KHÔNG phải users.id nội bộ dạng số), các cột:
    - recent_view_count: số lượt VIEW_PRODUCT trong `recent_window_days` ngày gần nhất
    - days_since_last_activity: số ngày từ hành động (bất kỳ loại) gần nhất
    - cart_abandon_count: số lần thêm giỏ trong `abandon_window_days` ngày mà KHÔNG có đơn hàng
      nào được tạo trong `abandon_grace_hours` giờ sau đó
    - view_to_cart_conversion_rate: (số lần thêm giỏ) / (số lượt xem) trong `abandon_window_days` ngày
    - category_diversity_viewed: số category riêng biệt đã xem trong `abandon_window_days` ngày

    `as_of` cho phép tính feature "tại một thời điểm trong quá khứ" (dùng khi sinh nhãn train ở
    Phase 5 theo temporal split) — mặc định None nghĩa là tính tới hiện tại (NOW()).
    """
    as_of_clause = "NOW()" if as_of is None else "%(as_of)s"
    params = {} if as_of is None else {"as_of": as_of.to_pydatetime()}

    recent_views_sql = f"""
        SELECT user_id, COUNT(*) AS recent_view_count
        FROM user_events
        WHERE action_type = 'VIEW_PRODUCT'
          AND user_id IS NOT NULL
          AND created_at >= {as_of_clause} - INTERVAL {int(recent_window_days)} DAY
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """

    last_activity_sql = f"""
        SELECT user_id, DATEDIFF({as_of_clause}, MAX(created_at)) AS days_since_last_activity
        FROM user_events
        WHERE user_id IS NOT NULL
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """

    # Correlated subquery: đếm sự kiện thêm-giỏ mà không có đơn hàng nào theo sau trong khung
    # grace period -> coi là "bỏ giỏ". Chấp nhận chi phí correlated subquery vì quy mô đồ án nhỏ.
    cart_abandon_sql = f"""
        SELECT ue.user_id, COUNT(*) AS cart_abandon_count
        FROM user_events ue
        WHERE ue.action_type IN ('ADD_TO_CART', 'UPDATE_CART_QTY')
          AND ue.user_id IS NOT NULL
          AND ue.created_at >= {as_of_clause} - INTERVAL {int(abandon_window_days)} DAY
          AND ue.created_at <= {as_of_clause}
          AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.user_id = ue.user_id
                AND o.created_at BETWEEN ue.created_at
                    AND DATE_ADD(ue.created_at, INTERVAL {int(abandon_grace_hours)} HOUR)
          )
        GROUP BY ue.user_id
    """

    cart_add_count_sql = f"""
        SELECT user_id, COUNT(*) AS cart_add_count
        FROM user_events
        WHERE action_type IN ('ADD_TO_CART', 'UPDATE_CART_QTY')
          AND user_id IS NOT NULL
          AND created_at >= {as_of_clause} - INTERVAL {int(abandon_window_days)} DAY
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """

    view_count_window_sql = f"""
        SELECT user_id, COUNT(*) AS view_count
        FROM user_events
        WHERE action_type = 'VIEW_PRODUCT'
          AND user_id IS NOT NULL
          AND created_at >= {as_of_clause} - INTERVAL {int(abandon_window_days)} DAY
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """

    category_diversity_sql = f"""
        SELECT user_id, COUNT(DISTINCT category_id) AS category_diversity_viewed
        FROM user_events
        WHERE action_type = 'VIEW_PRODUCT'
          AND user_id IS NOT NULL
          AND category_id IS NOT NULL
          AND created_at >= {as_of_clause} - INTERVAL {int(abandon_window_days)} DAY
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """

    with engine.connect() as conn:
        recent_views = pd.read_sql(recent_views_sql, conn, params=params)
        last_activity = pd.read_sql(last_activity_sql, conn, params=params)
        cart_abandon = pd.read_sql(cart_abandon_sql, conn, params=params)
        cart_add = pd.read_sql(cart_add_count_sql, conn, params=params)
        view_count = pd.read_sql(view_count_window_sql, conn, params=params)
        category_diversity = pd.read_sql(category_diversity_sql, conn, params=params)

    df = last_activity.set_index("user_id")
    for other in (recent_views, cart_abandon, cart_add, view_count, category_diversity):
        df = df.join(other.set_index("user_id"), how="outer")

    df["recent_view_count"] = df["recent_view_count"].fillna(0)
    df["cart_abandon_count"] = df["cart_abandon_count"].fillna(0)
    df["cart_add_count"] = df["cart_add_count"].fillna(0)
    df["view_count"] = df["view_count"].fillna(0)
    df["category_diversity_viewed"] = df["category_diversity_viewed"].fillna(0)
    # user chưa từng có hành vi nào (join outer sinh NaN) -> coi như "im lặng rất lâu"
    df["days_since_last_activity"] = df["days_since_last_activity"].fillna(abandon_window_days * 12)

    df["view_to_cart_conversion_rate"] = (
        df["cart_add_count"] / df["view_count"].replace(0, pd.NA)
    ).fillna(0.0)

    return df[[
        "recent_view_count",
        "days_since_last_activity",
        "cart_abandon_count",
        "view_to_cart_conversion_rate",
        "category_diversity_viewed",
    ]]


def has_recent_abandoned_cart(
    engine: Engine,
    user_id: str,
    *,
    within_hours: int = DEFAULT_ABANDON_GRACE_HOURS,
) -> bool:
    """Rule đơn giản dùng ở Phase 6 để quyết định THỜI ĐIỂM trigger (khác với feature ML ở trên,
    dùng để đo mức độ rủi ro nói chung): user có vừa thêm giỏ trong `within_hours` giờ gần đây mà
    chưa thanh toán không."""
    sql = """
        SELECT 1
        FROM user_events ue
        WHERE ue.user_id = %(user_id)s
          AND ue.action_type IN ('ADD_TO_CART', 'UPDATE_CART_QTY')
          AND ue.created_at >= NOW() - INTERVAL %(hours)s HOUR
          AND NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.user_id = ue.user_id
                AND o.created_at >= ue.created_at
          )
        LIMIT 1
    """
    with engine.connect() as conn:
        result = pd.read_sql(sql, conn, params={"user_id": user_id, "hours": within_hours})
    return len(result) > 0
