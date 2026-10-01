"""Nạp tương tác về MỘT dạng chung: DataFrame (user_id, item_id, ts) — để cùng harness chạy được trên dữ
liệu platform (MySQL) lẫn bộ công khai (REES46, Taobao… dạng CSV)."""
from __future__ import annotations

import pandas as pd
from sqlalchemy import bindparam, text

from shared_common.contracts import HISTORY_ACTIONS


def load_platform_events() -> tuple[pd.DataFrame, dict[int, object]]:
    """Tương tác VIEW_PRODUCT/ADD_TO_CART từ `ecommerce_order_db.user_events` — cùng tập action mà
    Redis history (đầu vào lúc phục vụ) nhận, xem `HISTORY_ACTIONS`. Trả kèm map item -> category."""
    from shared_common.pool import get_engine  # import trễ: chạy CSV không cần DB

    events_sql = text(
        "SELECT user_id, item_id, created_at AS ts FROM user_events "
        "WHERE action_type IN :actions AND item_id IS NOT NULL AND user_id IS NOT NULL "
        "ORDER BY created_at, id"
    ).bindparams(bindparam("actions", expanding=True))
    with get_engine("ecommerce_order_db").connect() as conn:
        df = pd.read_sql(events_sql, conn, params={"actions": sorted(HISTORY_ACTIONS)})
    with get_engine("ecommerce_product_db").connect() as conn:
        cats = pd.read_sql(text("SELECT id, category_id FROM products"), conn)
    return _normalise(df), dict(zip(cats["id"].astype(int), cats["category_id"]))


def load_csv(path: str, user_col: str, item_col: str, ts_col: str, category_col: str | None = None
             ) -> tuple[pd.DataFrame, dict[int, object]]:
    usecols = [user_col, item_col, ts_col] + ([category_col] if category_col else [])
    raw = pd.read_csv(path, usecols=usecols)
    df = raw.rename(columns={user_col: "user_id", item_col: "item_id", ts_col: "ts"})
    item_cat = {}
    if category_col:
        item_cat = dict(zip(raw[item_col].astype(int), raw[category_col]))
    return _normalise(df[["user_id", "item_id", "ts"]]), item_cat


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["user_id", "item_id", "ts"]).copy()
    df["user_id"] = df["user_id"].astype(str)
    df["item_id"] = df["item_id"].astype(int)
    df["ts"] = pd.to_datetime(df["ts"])
    # sort ỔN ĐỊNH theo thời gian: hai event cùng timestamp giữ thứ tự ghi (id) như lúc đọc
    return df.sort_values("ts", kind="stable").reset_index(drop=True)
