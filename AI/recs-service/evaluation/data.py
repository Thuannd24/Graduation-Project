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
        "SELECT user_id, item_id, created_at AS ts, action_type AS action FROM user_events "
        "WHERE action_type IN :actions AND item_id IS NOT NULL AND user_id IS NOT NULL "
        "ORDER BY created_at, id"
    ).bindparams(bindparam("actions", expanding=True))
    with get_engine("ecommerce_order_db").connect() as conn:
        df = pd.read_sql(events_sql, conn, params={"actions": sorted(HISTORY_ACTIONS)})
    with get_engine("ecommerce_product_db").connect() as conn:
        cats = pd.read_sql(text("SELECT id, category_id FROM products"), conn)
    return _normalise(df), dict(zip(cats["id"].astype(int), cats["category_id"]))


def load_csv(path: str, user_col: str, item_col: str, ts_col: str, category_col: str | None = None,
             action_col: str | None = None, names: list[str] | None = None, ts_unit: str | None = None,
             keep_actions: list[str] | None = None, user_fraction: float = 1.0
             ) -> tuple[pd.DataFrame, dict[int, object]]:
    """`action_col` (vd `event_type` của REES46: view/cart/remove_from_cart/purchase, `behavior` của Taobao:
    pv/cart/fav/buy) chỉ cần cho thí nghiệm embedding loại hành vi (GĐ3).

    Đọc thẳng file gốc của bộ công khai, không cần tiền xử lý tay:
    - `path` nhận glob (REES46 chia 5 file theo tháng: "data/2019-*.csv,data/2020-*.csv").
    - `names`: file không có dòng tiêu đề (Taobao UserBehavior.csv) -> truyền tên cột theo thứ tự.
    - `ts_unit`: "s"/"ms" khi thời gian là unix timestamp (Taobao); bỏ trống khi là chuỗi ngày giờ.
    - `keep_actions`: chỉ giữ một số loại hành vi (vd bỏ "view" để nhẹ RAM).
    - `user_fraction`: lấy mẫu ỔN ĐỊNH một phần user (theo hash user_id) — Taobao ~1 triệu user nặng cho CPU.
    Đọc theo khúc và lọc ngay trong từng khúc để không nạp cả file vào RAM."""
    import glob
    import zlib

    paths = sorted({p for pattern in path.split(",") for p in glob.glob(pattern.strip())})
    if not paths:
        raise FileNotFoundError(f"Khong tim thay file nao khop: {path}")
    usecols = [user_col, item_col, ts_col] + [c for c in (category_col, action_col) if c]
    read_kw = {"usecols": usecols, "chunksize": 2_000_000}
    if names:
        read_kw.update(header=None, names=names)

    parts = []
    for p in paths:
        for chunk in pd.read_csv(p, **read_kw):
            if keep_actions and action_col:
                chunk = chunk[chunk[action_col].astype(str).isin(keep_actions)]
            if user_fraction < 1.0:
                keep = chunk[user_col].astype(str).map(lambda u: zlib.crc32(u.encode()) % 10_000 < user_fraction * 10_000)
                chunk = chunk[keep]
            parts.append(chunk)
    raw = pd.concat(parts, ignore_index=True)
    if ts_unit:
        raw[ts_col] = pd.to_datetime(raw[ts_col], unit=ts_unit)

    df = raw.rename(columns={user_col: "user_id", item_col: "item_id", ts_col: "ts"})
    cols = ["user_id", "item_id", "ts"]
    if action_col:
        df = df.rename(columns={action_col: "action"})
        cols.append("action")
    item_cat = {}
    if category_col:
        item_cat = dict(zip(raw[item_col].astype(int), raw[category_col]))
    return _normalise(df[cols]), item_cat


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["user_id", "item_id", "ts"]).copy()
    df["user_id"] = df["user_id"].astype(str)
    df["item_id"] = df["item_id"].astype(int)
    df["ts"] = pd.to_datetime(df["ts"])
    if df["ts"].dt.tz is not None:
        # REES46 ghi "2019-10-01 00:00:00 UTC" -> có timezone; đưa về UTC không timezone cho đồng nhất
        df["ts"] = df["ts"].dt.tz_convert(None)
    if "action" in df.columns:
        df["action"] = df["action"].astype(str)
    # sort ỔN ĐỊNH theo thời gian: hai event cùng timestamp giữ thứ tự ghi (id) như lúc đọc
    return df.sort_values("ts", kind="stable").reset_index(drop=True)
