"""Sinh nhãn churn theo temporal split — dùng để huấn luyện classifier có giám sát (Phase 5).

Nhãn = 1 (churn) nếu user KHÔNG có bất kỳ hoạt động nào (đơn hàng HOẶC xem/thêm giỏ) trong
khoảng (as_of, as_of + window_days] — tức "im lặng hoàn toàn" trong 30 ngày sau thời điểm cắt.
Chỉ dùng được với `as_of` mà `as_of + window_days` đã ở QUÁ KHỨ so với hiện tại (nếu không, nhãn
chưa thể biết được — đây chính là nguyên tắc temporal split, tránh rò rỉ thông tin tương lai).
"""
from __future__ import annotations

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

ACTIVE_USERS_SQL = text(
    """
    SELECT DISTINCT user_id FROM (
        SELECT user_id, created_at FROM orders
        WHERE user_id IS NOT NULL AND created_at > :window_start AND created_at <= :window_end
        UNION
        SELECT user_id, created_at FROM user_events
        WHERE user_id IS NOT NULL AND created_at > :window_start AND created_at <= :window_end
    ) t
    """
)


def compute_churn_labels(
    engine: Engine, user_ids: list, as_of: pd.Timestamp, window_days: int = 30
) -> dict:
    """Trả về dict {user_id: 0|1}. label=1 nghĩa là KHÔNG hoạt động gì trong (as_of, as_of+window]."""
    window_end = as_of + pd.Timedelta(days=window_days)

    with engine.connect() as conn:
        active = pd.read_sql(
            ACTIVE_USERS_SQL,
            conn,
            params={"window_start": as_of.to_pydatetime(), "window_end": window_end.to_pydatetime()},
        )

    active_user_ids = set(active["user_id"].tolist())
    return {uid: (0 if uid in active_user_ids else 1) for uid in user_ids}
