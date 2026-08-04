"""Feature tính từ bảng `orders` (recency/frequency/monetary + mở rộng).

Đây là nơi DUY NHẤT định nghĩa các feature này — trước đây `forecast-service/app/services/rfm.py`
tự query trực tiếp, giờ hàm đó gọi lại module này thay vì tự viết SQL (xem Phase 5).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy.engine import Engine


def fetch_order_features(engine: Engine, *, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """Trả về DataFrame index theo user_id (String — Keycloak UUID, không phải số), các cột:
    - recency: số ngày từ đơn `DELIVERED` gần nhất
    - frequency: tổng số đơn `DELIVERED`
    - monetary: tổng `total_amount` các đơn `DELIVERED`
    - avg_order_value: monetary / frequency
    - cancel_rate: tỉ lệ đơn có status='CANCELLED' trên tổng số đơn (mọi status)
    - discount_dependency: tỉ lệ đơn có coupon_code trên tổng số đơn (mọi status)

    Chỉ tính trên dữ liệu có `created_at <= as_of` để phục vụ temporal split khi sinh nhãn train
    (Phase 5) — mặc định `as_of=None` nghĩa là tính tới hiện tại.
    """
    as_of_clause = "NOW()" if as_of is None else "%(as_of)s"
    params = {} if as_of is None else {"as_of": as_of.to_pydatetime()}

    delivered_sql = f"""
        SELECT user_id,
               DATEDIFF({as_of_clause}, MAX(created_at)) AS recency,
               COUNT(id) AS frequency,
               SUM(total_amount) AS monetary
        FROM orders
        WHERE status = 'DELIVERED'
          AND created_at <= {as_of_clause}
        GROUP BY user_id
    """

    all_orders_sql = f"""
        SELECT user_id,
               COUNT(id) AS total_order_count,
               SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
               SUM(CASE WHEN coupon_code IS NOT NULL THEN 1 ELSE 0 END) AS coupon_used_count
        FROM orders
        WHERE created_at <= {as_of_clause}
        GROUP BY user_id
    """

    with engine.connect() as conn:
        delivered = pd.read_sql(delivered_sql, conn, params=params)
        all_orders = pd.read_sql(all_orders_sql, conn, params=params)

    df = delivered.set_index("user_id").join(all_orders.set_index("user_id"), how="outer")

    # user không có đơn DELIVERED nào (chỉ có đơn huỷ/pending) -> recency/frequency/monetary rỗng
    df["frequency"] = df["frequency"].fillna(0)
    df["monetary"] = df["monetary"].fillna(0.0)
    df["recency"] = df["recency"].fillna(9999)  # chưa từng nhận hàng -> coi như "rất lâu rồi"
    df["total_order_count"] = df["total_order_count"].fillna(0)
    df["cancelled_count"] = df["cancelled_count"].fillna(0)
    df["coupon_used_count"] = df["coupon_used_count"].fillna(0)

    # np.nan (KHÔNG phải pd.NA) làm mẫu số rỗng: pd.NA sinh dtype object sau phép chia, khiến
    # .fillna() phải "downcast" ngầm về float -> FutureWarning, và sẽ đổi hành vi ở pandas tương lai.
    # np.nan vốn đã là float nên chia xong dtype không đổi, .fillna() không cần downcast gì.
    df["avg_order_value"] = (df["monetary"] / df["frequency"].replace(0, np.nan)).fillna(0.0)
    df["cancel_rate"] = (
        df["cancelled_count"] / df["total_order_count"].replace(0, np.nan)
    ).fillna(0.0)
    df["discount_dependency"] = (
        df["coupon_used_count"] / df["total_order_count"].replace(0, np.nan)
    ).fillna(0.0)

    return df[[
        "recency",
        "frequency",
        "monetary",
        "avg_order_value",
        "cancel_rate",
        "discount_dependency",
    ]]
