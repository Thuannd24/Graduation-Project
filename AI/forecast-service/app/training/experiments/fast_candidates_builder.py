"""Bản pandas-trong-RAM của `shared_common/features/candidates.py` — cùng lý do với fast_panel_builder.py
(SQL tổng hợp quá chậm trên MariaDB qua Docker/WSL2 với 7,3 triệu `user_events`). Tính NGUYÊN VĂN từng công
thức, chỉ đổi nơi tính. Đã xác minh khớp SQL gốc cho 11 feature production (fast_panel_builder.py); các hàm
dưới đây dùng lại ĐÚNG style tính (groupby trong khoảng [as_of-window, as_of]) nên áp dụng cùng cách kiểm.

review/voucher: đo trực tiếp trên DB 2026-10-05, `product_reviews` 0 dòng, `issued_vouchers` 1 dòng (không
liên quan REES46) -> trả thẳng CANDIDATE_DEFAULTS cho 2 block này, không query (dữ liệu REES46 không ghi
review/voucher — đúng giới hạn đã ghi trong rees46-transform-mapping.md).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ABANDON_WINDOW_DAYS = 30
ABANDON_BASELINE_DAYS = 120
ABANDON_GRACE_HOURS = 24
NO_REPEAT_PURCHASE_DAYS = 365

BLOCK_ABANDON_SHAPE = ["cart_abandon_rate", "abandon_recent_vs_baseline"]
BLOCK_GAP_DISPERSION = ["interpurchase_gap_mean", "interpurchase_gap_std", "interpurchase_gap_max", "recency_over_median_gap"]
BLOCK_NOISE_CONTROL = ["distinct_items_viewed", "repeat_view_ratio", "distinct_items_carted"]
BLOCK_SESSION = ["distinct_sessions_30d", "avg_events_per_session_30d"]
BLOCK_REVIEW = ["review_count", "avg_rating_given"]
BLOCK_VOUCHER = ["voucher_issued_count", "voucher_usage_rate"]
BLOCK_TEMPORAL_RHYTHM = ["weekend_activity_ratio", "peak_hour_block_share"]

CANDIDATE_BLOCKS = {
    "abandon_shape": BLOCK_ABANDON_SHAPE, "gap_dispersion": BLOCK_GAP_DISPERSION,
    "noise_control": BLOCK_NOISE_CONTROL, "session": BLOCK_SESSION, "review": BLOCK_REVIEW,
    "voucher": BLOCK_VOUCHER, "temporal_rhythm": BLOCK_TEMPORAL_RHYTHM,
}
CANDIDATE_COLUMNS = [c for cols in CANDIDATE_BLOCKS.values() for c in cols]
CANDIDATE_DEFAULTS = {
    "cart_abandon_rate": 0.0, "abandon_recent_vs_baseline": 0.0,
    "interpurchase_gap_mean": float(NO_REPEAT_PURCHASE_DAYS), "interpurchase_gap_std": 0.0,
    "interpurchase_gap_max": float(NO_REPEAT_PURCHASE_DAYS), "recency_over_median_gap": 0.0,
    "distinct_items_viewed": 0.0, "repeat_view_ratio": 0.0, "distinct_items_carted": 0.0,
    "distinct_sessions_30d": 0.0, "avg_events_per_session_30d": 0.0,
    "review_count": 0.0, "avg_rating_given": 0.0,
    "voucher_issued_count": 0.0, "voucher_usage_rate": 0.0,
    "weekend_activity_ratio": 2.0 / 7.0, "peak_hour_block_share": 0.25,
}


def _abandon_shape(events: pd.DataFrame, orders_by_user: dict, as_of: pd.Timestamp) -> pd.DataFrame:
    win = events[(events["created_at"] >= as_of - pd.Timedelta(days=ABANDON_BASELINE_DAYS)) & (events["created_at"] <= as_of)]
    cart = win[win["action_type"].isin(["ADD_TO_CART", "UPDATE_CART_QTY"])].copy()
    if cart.empty:
        return pd.DataFrame(columns=BLOCK_ABANDON_SHAPE)
    recent_mask = cart["created_at"] >= as_of - pd.Timedelta(days=ABANDON_WINDOW_DAYS)
    grace = pd.Timedelta(hours=ABANDON_GRACE_HOURS)
    times, users = cart["created_at"].to_numpy(), cart["user_id"].to_numpy()
    not_covered = np.zeros(len(cart), dtype=bool)
    for i in range(len(cart)):
        ot = orders_by_user.get(users[i])
        if ot is None or ot.size == 0:
            not_covered[i] = True
            continue
        lo = np.searchsorted(ot, times[i], side="left")
        hi = np.searchsorted(ot, times[i] + grace, side="right")
        not_covered[i] = lo >= hi
    cart["cart_add_recent"] = recent_mask.to_numpy()
    cart["abandon_recent"] = recent_mask.to_numpy() & not_covered
    cart["abandon_baseline"] = (~recent_mask.to_numpy()) & not_covered
    g = cart.groupby("user_id", observed=True)[["cart_add_recent", "abandon_recent", "abandon_baseline"]].sum().astype(float)
    g["cart_abandon_rate"] = g["abandon_recent"] / g["cart_add_recent"].replace(0, np.nan)
    baseline_rate = (g["abandon_baseline"] / 3.0).replace(0, np.nan)
    g["abandon_recent_vs_baseline"] = g["abandon_recent"] / baseline_rate
    return g[BLOCK_ABANDON_SHAPE]


def _gap_dispersion(orders: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    hist = orders[(orders["status"] == "DELIVERED") & (orders["created_at"] <= as_of)].sort_values(["user_id", "created_at"])
    if hist.empty:
        return pd.DataFrame(columns=BLOCK_GAP_DISPERSION)
    hist = hist.copy()
    hist["gap_days"] = hist.groupby("user_id")["created_at"].diff().dt.total_seconds() / 86400.0
    grouped = hist.groupby("user_id")
    out = pd.DataFrame(index=grouped.size().index)
    out["interpurchase_gap_mean"] = grouped["gap_days"].mean()
    out["interpurchase_gap_std"] = grouped["gap_days"].std()
    out["interpurchase_gap_max"] = grouped["gap_days"].max()
    recency_days = (as_of - grouped["created_at"].max()).dt.total_seconds() / 86400.0
    median_gap = grouped["gap_days"].median().fillna(float(NO_REPEAT_PURCHASE_DAYS)).replace(0, 1.0)
    out["recency_over_median_gap"] = recency_days / median_gap
    return out[BLOCK_GAP_DISPERSION]


def _noise_control(events: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    win = events[(events["created_at"] >= as_of - pd.Timedelta(days=ABANDON_WINDOW_DAYS)) & (events["created_at"] <= as_of)]
    if win.empty:
        return pd.DataFrame(columns=BLOCK_NOISE_CONTROL)
    view = win[win["action_type"] == "VIEW_PRODUCT"]
    cart = win[win["action_type"].isin(["ADD_TO_CART", "UPDATE_CART_QTY"])]
    distinct_viewed = view.groupby("user_id", observed=True)["item_id"].nunique().rename("distinct_items_viewed")
    view_events = view.groupby("user_id", observed=True).size().rename("view_events")
    distinct_carted = cart.groupby("user_id", observed=True)["item_id"].nunique().rename("distinct_items_carted")
    df = pd.concat([distinct_viewed, view_events, distinct_carted], axis=1).fillna(0.0)
    df["repeat_view_ratio"] = df["view_events"] / df["distinct_items_viewed"].replace(0, np.nan)
    return df[BLOCK_NOISE_CONTROL]


def _session(events: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    win = events[(events["created_at"] >= as_of - pd.Timedelta(days=30)) & (events["created_at"] <= as_of) & events["session_id"].notna()]
    if win.empty:
        return pd.DataFrame(columns=BLOCK_SESSION)
    g = win.groupby("user_id", observed=True).agg(n_sessions=("session_id", "nunique"), n_events=("session_id", "size")).astype(float)
    g["distinct_sessions_30d"] = g["n_sessions"]
    g["avg_events_per_session_30d"] = g["n_events"] / g["n_sessions"].replace(0, np.nan)
    return g[BLOCK_SESSION]


def _temporal_rhythm(events: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    hist = events[events["created_at"] <= as_of]
    if hist.empty:
        return pd.DataFrame(columns=BLOCK_TEMPORAL_RHYTHM)
    hist = hist.copy()
    dow = hist["created_at"].dt.dayofweek  # pandas: Mon=0..Sun=6
    hist["is_weekend"] = dow.isin([5, 6])
    hour = hist["created_at"].dt.hour
    hist["blk"] = pd.cut(hour, bins=[-1, 5, 11, 17, 23], labels=["night", "morning", "afternoon", "evening"])
    g = hist.groupby("user_id", observed=True)
    n_events = g.size().astype(float)
    weekend_events = hist.groupby("user_id", observed=True)["is_weekend"].sum().astype(float)
    blk_counts = hist.groupby(["user_id", "blk"], observed=True).size().unstack(fill_value=0)
    out = pd.DataFrame(index=n_events.index)
    out["weekend_activity_ratio"] = weekend_events / n_events.replace(0, np.nan)
    out["peak_hour_block_share"] = blk_counts.max(axis=1).reindex(out.index).fillna(0) / n_events.replace(0, np.nan)
    return out[BLOCK_TEMPORAL_RHYTHM]


def fetch_candidate_features(orders: pd.DataFrame, events: pd.DataFrame, orders_by_user: dict, as_of: pd.Timestamp) -> pd.DataFrame:
    frames = [
        _abandon_shape(events, orders_by_user, as_of),
        _gap_dispersion(orders, as_of),
        _noise_control(events, as_of),
        _session(events, as_of),
        _temporal_rhythm(events, as_of),
    ]
    combined = frames[0]
    for f in frames[1:]:
        combined = combined.join(f, how="outer")
    for col in ("review_count", "avg_rating_given", "voucher_issued_count", "voucher_usage_rate"):
        combined[col] = CANDIDATE_DEFAULTS[col]
    for col in CANDIDATE_COLUMNS:
        if col not in combined.columns:
            combined[col] = CANDIDATE_DEFAULTS[col]
    combined = combined.replace([np.inf, -np.inf], np.nan).fillna(CANDIDATE_DEFAULTS)
    return combined[CANDIDATE_COLUMNS].astype(float)
