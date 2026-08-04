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

# `activity` = định nghĩa gốc: hoạt động BẤT KỲ (xem HOẶC mua).
# `orders` = chỉ tính việc ĐẶT ĐƠN, dùng cho Tầng 0.2 — xem docs/canvas/churn-risk-tier0-plan.md.
#
# Vì sao cần lựa chọn này: nhãn `activity` lấy từ `orders` ∪ `user_events`, mà feature mạnh nhất
# (`category_diversity_viewed`, permutation importance 0.2253 so với 0.0285 của hạng nhì) cũng lấy từ
# `user_events` — cùng nguồn, hai cửa sổ kề nhau, cùng nghĩa "có hoạt động". Bài toán vì thế gần như
# thành "user đang hoạt động có tiếp tục hoạt động không". Nhãn `orders` tách nguồn nhãn khỏi nguồn
# feature, buộc feature hành vi phải dự đoán thật sự (xuyên nguồn) chứ không đọc lại chính nó.
LABEL_SOURCES = ("activity", "orders")
DEFAULT_LABEL_SOURCE = "activity"

# Dân số mà nhãn churn CÓ NGHĨA: user chưa từng mua, hoặc mới mua 1 lần, thì không thể là "khách mua
# hàng đã rời bỏ" — và cũng không phải đối tượng của campaign phát voucher cứu khách. Dùng chung cho
# cả tập huấn luyện (train.py) và tập chấm điểm (risk_scheduler.py): train trên dân số này rồi chấm
# điểm dân số khác là ngoại suy.
MIN_DELIVERED_ORDERS_FOR_CHURN = 2

# Định danh định nghĩa nhãn, ghi kèm mỗi model artifact. TÁCH RIÊNG khỏi `FEATURE_VERSION`: bộ feature
# không đổi (vẫn 11 cột) mà chỉ định nghĩa nhãn đổi, nên tăng `FEATURE_VERSION` sẽ sai nghĩa. Nhưng
# model train bằng 2 nhãn khác nhau thì KHÔNG so metric trực tiếp được, nên vẫn cần một mốc phiên bản.
#   v1 = "không hoạt động (xem HOẶC mua) trong 30 ngày tới", mọi user  (bản đầu, đã thay)
#   v2 = "không ĐẶT ĐƠN trong 120 ngày tới", chỉ user >= 2 đơn DELIVERED
LABEL_VERSION = "churn_label_v2_orders_120d_min2"

_ACTIVE_USERS_SQL = {
    "activity": text(
        """
        SELECT DISTINCT user_id FROM (
            SELECT user_id, created_at FROM orders
            WHERE user_id IS NOT NULL AND created_at > :window_start AND created_at <= :window_end
            UNION
            SELECT user_id, created_at FROM user_events
            WHERE user_id IS NOT NULL AND created_at > :window_start AND created_at <= :window_end
        ) t
        """
    ),
    "orders": text(
        """
        SELECT DISTINCT user_id FROM orders
        WHERE user_id IS NOT NULL AND created_at > :window_start AND created_at <= :window_end
        """
    ),
}

# Giữ tên cũ cho tương thích (có thể còn chỗ import).
ACTIVE_USERS_SQL = _ACTIVE_USERS_SQL["activity"]


def compute_churn_labels(
    engine: Engine,
    user_ids: list,
    as_of: pd.Timestamp,
    window_days: int = 30,
    source: str = DEFAULT_LABEL_SOURCE,
) -> dict:
    """Trả về dict {user_id: 0|1}. label=1 nghĩa là KHÔNG có hoạt động (theo `source`) trong
    khoảng (as_of, as_of + window_days].

    `source='activity'` (mặc định, giữ nguyên hành vi cũ): xem HOẶC mua.
    `source='orders'`: chỉ tính đặt đơn.
    """
    if source not in _ACTIVE_USERS_SQL:
        raise ValueError(f"source phải thuộc {LABEL_SOURCES}, nhận được {source!r}")

    window_end = as_of + pd.Timedelta(days=window_days)

    with engine.connect() as conn:
        active = pd.read_sql(
            _ACTIVE_USERS_SQL[source],
            conn,
            params={"window_start": as_of.to_pydatetime(), "window_end": window_end.to_pydatetime()},
        )

    active_user_ids = set(active["user_id"].tolist())
    return {uid: (0 if uid in active_user_ids else 1) for uid in user_ids}
