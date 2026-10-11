"""Panel builder THAY THẾ cho `_build_training_panel` (train.py) khi dữ liệu đủ lớn để các truy vấn SQL tổng hợp
(COUNT DISTINCT, correlated subquery NOT EXISTS...) của rfm.py/behavior.py trở nên quá chậm trên MariaDB chạy qua
Docker Desktop/WSL2 (đo 2026-10-05: 1 truy vấn category_diversity_viewed mất > 25 phút trên 7,3 triệu `user_events`,
dù đã có index (action_type, created_at, user_id) — nguyên nhân là COUNT(DISTINCT category_id) vẫn cần materialize
+ sort theo từng user, và correlated subquery NOT EXISTS trong cart_abandon_sql chạy N+1 lần).

Cách làm: đọc TOÀN BỘ `orders` + `user_events` liên quan VÀO RAM một lần (7,3 triệu dòng ~ vài trăm MB), rồi tính
đúng NGUYÊN VĂN từng công thức trong rfm.py/behavior.py/labels.py bằng pandas vector hoá cho từng mốc cắt — không
đổi Ý NGHĨA feature, chỉ đổi nơi tính (Python thay vì SQL). Đối chiếu số liệu với bản SQL gốc trên panel nhỏ để xác
nhận khớp (xem `main()` cuối file, cờ --verify-against-sql).

Giới hạn cố ý giữ GIỐNG HỆT bản gốc (không "sửa luôn cho sạch"): cart_abandon_sql gốc không giới hạn đơn hàng dùng
để kiểm tra NOT EXISTS theo as_of (đơn có thể tạo sau as_of trong vòng grace 24h vẫn tính là "không bỏ giỏ") — giữ
nguyên hành vi này.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy.engine import Engine

RECENT_WINDOW_DAYS = 7
ABANDON_WINDOW_DAYS = 30
ABANDON_GRACE_HOURS = 24

FEATURE_COLUMNS = [
    "recency", "frequency", "monetary", "avg_order_value", "cancel_rate", "discount_dependency",
    "recent_view_count", "days_since_last_activity", "cart_abandon_count",
    "view_to_cart_conversion_rate", "category_diversity_viewed",
]


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
    # DATEDIFF(a,b) của MySQL trừ PHẦN NGÀY, bỏ qua giờ (khác Timedelta.days = khoảng cách thời gian thực
    # 24h) — normalize() cả 2 vế về nửa đêm để khớp đúng ngữ nghĩa gốc (đối chiếu từng user, 2026-10-05).
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
    """NOT EXISTS order với o.created_at BETWEEN event.created_at AND event.created_at + grace — per sự kiện,
    tra theo đúng user (không giới hạn as_of cho phía orders, giữ nguyên hành vi SQL gốc)."""
    # np.timedelta64 (không phải pd.Timedelta) — tránh lỗi dtype của numpy.datetime64 + pd.Timedelta
    # tuỳ phiên bản numpy (xem fast_compute.py cùng hàm, đã xác nhận lỗi thật 2026-10-06).
    grace = np.timedelta64(ABANDON_GRACE_HOURS, "h")
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

    # Cùng lưu ý DATEDIFF (xem rfm_features): normalize về nửa đêm trước khi trừ.
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


def churn_labels(orders: pd.DataFrame, user_ids: pd.Index, cutoff: pd.Timestamp, window_days: int) -> pd.Series:
    """Nguyên văn labels.py (source='orders'): active = có đơn BẤT KỲ status trong (cutoff, cutoff+window]."""
    end = cutoff + pd.Timedelta(days=window_days)
    active = set(orders.loc[(orders["created_at"] > cutoff) & (orders["created_at"] <= end), "user_id"])
    return pd.Series([0 if u in active else 1 for u in user_ids], index=user_ids, name="churn_label")


def build_panel(engine: Engine, cutoffs: list[pd.Timestamp], label_window_days: int, min_delivered_orders: int = 2) -> pd.DataFrame:
    orders, events = load_raw(engine)
    print(f"đã đọc: {len(orders):,} orders, {len(events):,} events", flush=True)
    orders_by_user: dict[str, np.ndarray] = {
        u: g["created_at"].sort_values().to_numpy() for u, g in orders.groupby("user_id")
    }
    frames = []
    for cutoff in cutoffs:
        rfm = rfm_features(orders, cutoff)
        beh = behavior_features(orders, events, cutoff, orders_by_user)
        X = rfm.join(beh, how="outer")
        for c in FEATURE_COLUMNS:
            if c not in X:
                X[c] = 0.0
        # Mặc định khi outer-join rfm/behavior để lại NaN (user có đơn nhưng 0 sự kiện, hoặc ngược lại) —
        # ĐÚNG `assembler.py` defaults (9999 cho days_since_last_activity ở TẦNG NÀY, khác 360 = fillna NỘI BỘ
        # của behavior_features cho case khác hẳn: user có hoạt động nhưng last_activity rỗng — không xảy ra
        # trong thực tế vì last_activity là tập hợp rộng nhất, giữ lại để khớp hành vi gốc).
        X = X.fillna({
            "recency": 9999, "frequency": 0, "monetary": 0.0, "avg_order_value": 0.0,
            "cancel_rate": 0.0, "discount_dependency": 0.0, "recent_view_count": 0,
            "days_since_last_activity": 9999, "cart_abandon_count": 0,
            "view_to_cart_conversion_rate": 0.0, "category_diversity_viewed": 0,
        })[FEATURE_COLUMNS]
        frame = X.copy()
        frame["churn_label"] = churn_labels(orders, X.index, cutoff, label_window_days)
        frame["cutoff"] = cutoff
        frames.append(frame)
        print(f"  mốc cắt {cutoff.date()}: {len(frame):,} user trước lọc frequency", flush=True)
    panel = pd.concat(frames)
    if min_delivered_orders > 0:
        before = len(panel)
        panel = panel[panel["frequency"] >= min_delivered_orders]
        print(f"Lọc dân số nhãn churn: giữ user có >= {min_delivered_orders} đơn DELIVERED ({before} -> {len(panel)} dòng)")
    return panel
