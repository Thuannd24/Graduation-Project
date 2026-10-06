"""Bản pandas-trong-RAM của `rfm.py` + `behavior.py`, dùng cho PHỤC VỤ THẬT (live scoring) thay vì
chỉ cho thực nghiệm. Lý do: `build_feature_matrix()` gốc (SQL tổng hợp `GROUP BY user_id`,
`COUNT(DISTINCT category_id)`...) đo được mất 25-40+ phút trên MariaDB/Docker/WSL2 với dữ liệu thật
(7,3 triệu `user_events`) — xem docs/canvas/churn-risk-log.md mục 2026-10-06. Thêm index không cứu
được (đã thử) vì nút thắt là bảng tạm/sắp xếp (`Creating sort index`), không phải thiếu index lọc.

CÔNG THỨC NGUYÊN VĂN, chỉ đổi NƠI TÍNH (pandas thay SQL) — đã xác minh khớp 100% với SQL gốc trên
mẫu user thật (xem `AI/forecast-service/app/training/experiments/fast_panel_builder.py`, nơi logic
này được viết và kiểm chứng lần đầu cho mục đích train). File này là bản PRODUCTION hoá, dùng chung
cho cả serving (`feature_store.py`) lẫn — nếu cần sau này — training.

Giới hạn cố ý giữ GIỐNG HỆT bản gốc: `cart_abandon_count` không giới hạn đơn hàng dùng để kiểm tra
"đã mua trong vòng 24h" theo `as_of` (đơn có thể tạo sau `as_of` trong vòng grace vẫn tính là "không
bỏ giỏ") — đúng hành vi SQL gốc trong `behavior.py`.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy.engine import Engine

from shared_common.features.assembler import FEATURE_COLUMNS

RECENT_WINDOW_DAYS = 7
ABANDON_WINDOW_DAYS = 30
ABANDON_GRACE_HOURS = 24

FEATURE_DEFAULTS = {
    "recency": 9999, "frequency": 0, "monetary": 0.0, "avg_order_value": 0.0,
    "cancel_rate": 0.0, "discount_dependency": 0.0, "recent_view_count": 0,
    "days_since_last_activity": 9999, "cart_abandon_count": 0,
    "view_to_cart_conversion_rate": 0.0, "category_diversity_viewed": 0,
}


def load_raw(engine: Engine) -> tuple[pd.DataFrame, pd.DataFrame]:
    with engine.connect() as conn:
        orders = pd.read_sql(
            "SELECT user_id, status, created_at, total_amount, coupon_code FROM orders", conn,
            parse_dates=["created_at"],
        )
        events = pd.read_sql(
            "SELECT user_id, action_type, created_at, category_id, item_id, session_id FROM user_events "
            "WHERE user_id IS NOT NULL", conn,
            parse_dates=["created_at"],
        )
    orders["user_id"] = orders["user_id"].astype("string")
    events["user_id"] = events["user_id"].astype("string")
    events["action_type"] = events["action_type"].astype("category")
    orders = orders.sort_values(["user_id", "created_at"]).reset_index(drop=True)
    events = events.sort_values(["user_id", "created_at"]).reset_index(drop=True)
    return orders, events


def rfm_features(orders: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    """Nguyên văn rfm.py:fetch_order_features, tính trong pandas thay vì SQL."""
    hist = orders[orders["created_at"] <= as_of]
    delivered = hist[hist["status"] == "DELIVERED"]
    # DATEDIFF(a,b) của MySQL trừ PHẦN NGÀY, bỏ qua giờ — normalize() cả 2 vế về nửa đêm để khớp
    # đúng ngữ nghĩa gốc.
    as_of_d = as_of.normalize()
    g = delivered.groupby("user_id").agg(
        recency=("created_at", lambda s: (as_of_d - s.max().normalize()).days),
        frequency=("created_at", "count"),
        monetary=("total_amount", "sum"),
    )
    allo = hist.groupby("user_id").agg(
        total_order_count=("status", "count"),
        cancelled_count=("status", lambda s: int((s == "CANCELLED").sum())),
        coupon_used_count=("coupon_code", lambda s: int(s.notna().sum())),
    )
    df = g.join(allo, how="outer")
    df["frequency"] = df["frequency"].fillna(0)
    df["monetary"] = df["monetary"].fillna(0.0)
    df["recency"] = df["recency"].fillna(9999)
    df["total_order_count"] = df["total_order_count"].fillna(0)
    df["cancelled_count"] = df["cancelled_count"].fillna(0)
    df["coupon_used_count"] = df["coupon_used_count"].fillna(0)
    df["avg_order_value"] = (df["monetary"] / df["frequency"].replace(0, np.nan)).fillna(0.0)
    df["cancel_rate"] = (df["cancelled_count"] / df["total_order_count"].replace(0, np.nan)).fillna(0.0)
    df["discount_dependency"] = (df["coupon_used_count"] / df["total_order_count"].replace(0, np.nan)).fillna(0.0)
    return df[["recency", "frequency", "monetary", "avg_order_value", "cancel_rate", "discount_dependency"]]


def _cart_abandon_count(cart_ev: pd.DataFrame, orders_by_user: dict[str, np.ndarray]) -> pd.Series:
    """NOT EXISTS order với o.created_at BETWEEN event.created_at AND event.created_at + grace —
    per sự kiện, tra theo đúng user (không giới hạn as_of cho phía orders, giữ nguyên hành vi SQL gốc)."""
    grace = pd.Timedelta(hours=ABANDON_GRACE_HOURS)
    abandoned = np.zeros(len(cart_ev), dtype=bool)
    times = cart_ev["created_at"].to_numpy()
    users = cart_ev["user_id"].to_numpy()
    for i in range(len(cart_ev)):
        ot = orders_by_user.get(users[i])
        if ot is None or ot.size == 0:
            abandoned[i] = True
            continue
        t0 = times[i]
        t1 = t0 + grace
        lo = np.searchsorted(ot, t0, side="left")
        hi = np.searchsorted(ot, t1, side="right")
        abandoned[i] = lo >= hi
    return pd.Series(abandoned, index=cart_ev.index)


def behavior_features(orders: pd.DataFrame, events: pd.DataFrame, as_of: pd.Timestamp,
                      orders_by_user: dict[str, np.ndarray]) -> pd.DataFrame:
    """Nguyên văn behavior.py:fetch_behavior_features."""
    hist = events[events["created_at"] <= as_of]
    recent = hist[(hist["action_type"] == "VIEW_PRODUCT") & (hist["created_at"] >= as_of - pd.Timedelta(days=RECENT_WINDOW_DAYS))]
    recent_views = recent.groupby("user_id", observed=True).size().rename("recent_view_count")

    last_activity = hist.groupby("user_id", observed=True)["created_at"].max()
    last_activity = (as_of.normalize() - last_activity.dt.normalize()).dt.days.rename("days_since_last_activity")

    win = hist[hist["created_at"] >= as_of - pd.Timedelta(days=ABANDON_WINDOW_DAYS)]
    cart_mask = win["action_type"].isin(["ADD_TO_CART", "UPDATE_CART_QTY"])
    cart_win = win[cart_mask]
    cart_add = cart_win.groupby("user_id", observed=True).size().rename("cart_add_count")

    view_win = win[win["action_type"] == "VIEW_PRODUCT"]
    view_count = view_win.groupby("user_id", observed=True).size().rename("view_count")
    category_diversity = (
        view_win[view_win["category_id"].notna()].groupby("user_id", observed=True)["category_id"]
        .nunique().rename("category_diversity_viewed")
    )

    abandoned_mask = _cart_abandon_count(cart_win[["user_id", "created_at"]], orders_by_user)
    cart_abandon = cart_win[abandoned_mask].groupby("user_id", observed=True).size().rename("cart_abandon_count")

    df = last_activity.to_frame()
    for s in (recent_views, cart_abandon, cart_add, view_count, category_diversity):
        df = df.join(s, how="outer")
    df["recent_view_count"] = df["recent_view_count"].fillna(0)
    df["cart_abandon_count"] = df["cart_abandon_count"].fillna(0)
    df["cart_add_count"] = df["cart_add_count"].fillna(0)
    df["view_count"] = df["view_count"].fillna(0)
    df["category_diversity_viewed"] = df["category_diversity_viewed"].fillna(0)
    df["days_since_last_activity"] = df["days_since_last_activity"].fillna(ABANDON_WINDOW_DAYS * 12)
    df["view_to_cart_conversion_rate"] = (df["cart_add_count"] / df["view_count"].replace(0, np.nan)).fillna(0.0)
    return df[["recent_view_count", "days_since_last_activity", "cart_abandon_count",
              "view_to_cart_conversion_rate", "category_diversity_viewed"]]


def compute_live_feature_matrix(engine: Engine, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """Tương đương `assembler.build_feature_matrix(engine, as_of=as_of)` nhưng tính bằng pandas —
    nhanh (vài giây thay vì 25-40+ phút) trên cùng một dữ liệu, cùng công thức, cùng default khi
    outer-join thiếu (đúng `assembler.py`)."""
    if as_of is None:
        with engine.connect() as conn:
            as_of = pd.Timestamp(conn.exec_driver_sql("SELECT NOW()").scalar())
    orders, events = load_raw(engine)
    orders_by_user: dict[str, np.ndarray] = {
        u: g["created_at"].sort_values().to_numpy() for u, g in orders.groupby("user_id")
    }
    rfm = rfm_features(orders, as_of)
    beh = behavior_features(orders, events, as_of, orders_by_user)
    combined = rfm.join(beh, how="outer")
    for c in FEATURE_COLUMNS:
        if c not in combined:
            combined[c] = 0.0
    combined = combined.fillna(FEATURE_DEFAULTS)[FEATURE_COLUMNS]
    return combined
