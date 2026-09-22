"""Kiểm lại giả thuyết THỨ TỰ trên REES46 Cosmetics Shop — dữ liệu thật có `remove_from_cart`.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §5.2.

## Vì sao thí nghiệm này khác RetailRocket

RetailRocket chỉ có 3 ký hiệu (view/addtocart/transaction) ⇒ bigram gần như suy được từ số đếm,
đã đo ΔAUC thứ tự = +0,0000 (null thật, không phải lỗi đo). REES46 Cosmetics có **4 ký hiệu, gồm
`remove_from_cart`** — chuỗi `cart → remove → cart` mang ý nghĩa "đổi ý" mà 3 ký hiệu không thể
biểu diễn. Đây là bộ công khai ĐẦU TIÊN đủ điều kiện kiểm lại giả thuyết.

## Khác biệt kỹ thuật so với `cart_abandon_build_dataset.py` (RetailRocket)

1. **`user_session` có sẵn thật** — KHÔNG cần suy phiên bằng heuristic khe 30 phút.
2. 4 loại hành vi ⇒ 20 tổ hợp bigram, thay vì 12 ở RetailRocket.
3. Nhãn: `cart` có `purchase` CÙNG sản phẩm trong 24h sau không?

## ⚠️ Bản đã sửa vì lý do AN TOÀN BỘ NHỚ (2026-09-18)

Bản đầu gộp cả 5 tháng (~20,7M dòng) vào MỘT DataFrame trước khi tính feature — trên máy đang chỉ
còn ~1,7GB RAM trống (VSCode+Chrome đã chiếm ~8,6GB/15,9GB), tiến trình bị **kill giữa chừng** để
tránh treo máy (đã xảy ra thật, xem log phiên 2026-09-18).

**Sửa: xử lý TỪNG THÁNG ĐỘC LẬP**, chỉ giữ lại phần dữ liệu cuối cùng (các dòng `cart`, đã trích
feature — nhỏ hơn ~4× dữ liệu thô) rồi giải phóng frame thô của tháng đó trước khi đọc tháng tiếp
theo. Đánh đổi có chủ đích: `cum_*` (số đếm luỹ tiến) giờ là **"trong tháng đang xét"**, không phải
"từ đầu lịch sử" — session vốn đã luôn độc lập theo tháng (session không bao giờ dài vài chục ngày)
nên KHÔNG bị ảnh hưởng. Đây là phép đo SẠCH HƠN cho mục đích hiện tại: 5 tháng giờ là **5 lượt lặp
lại độc lập** để kiểm tra hiệu ứng thứ tự có bền vững qua thời gian, thay vì 1 mẫu lớn dồn chung.

Bộ nhớ đỉnh mỗi lượt ≈ xử lý 1 tháng (~4M dòng) — đúng quy mô đã chạy an toàn trước đó, không phụ
thuộc vào tổng RAM trống ban đầu.

CHỐNG RÒ RỈ (giữ nguyên): mọi feature dùng cumsum theo nhóm rồi TRỪ CHÍNH event hiện tại.
"""
from __future__ import annotations

import gc
import json
import os

import numpy as np
import pandas as pd

COSMETICS_DIR = os.environ.get(
    "COSMETICS_DIR",
    "d:/JAVA/Graduation-Project/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6",
)
MONTH_FILES = os.environ.get(
    "COSMETICS_MONTHS", "2019-Oct.csv,2019-Nov.csv,2019-Dec.csv,2020-Jan.csv,2020-Feb.csv"
).split(",")
OUT_PATH = os.environ.get("COSMETICS_DATASET_PATH", "/tmp/cosmetics_dataset.csv")
GROUPS_PATH = os.environ.get("COSMETICS_GROUPS_PATH", "/tmp/cosmetics_groups.json")
LABEL_WINDOW_HOURS = 24

ACTIONS = ["view", "cart", "remove_from_cart", "purchase"]
ACTION_CODE = {a: i + 1 for i, a in enumerate(ACTIONS)}
BIGRAMS = [f"{prev}_{cur}" for prev in (0, 1, 2, 3, 4) for cur in (1, 2, 3, 4)]
VISITOR_KEYS = ["user_id"]
SESSION_KEYS = ["user_id", "user_session"]
USECOLS = ["event_time", "event_type", "product_id", "user_id", "user_session"]

FEATURES_A = [
    "cum_view", "cum_cart", "cum_remove_from_cart", "cum_purchase",
    "sess_cum_view", "sess_cum_cart", "sess_cum_remove_from_cart", "sess_cum_purchase",
    "cum_views_this_item", "event_pos", "session_pos",
    "secs_since_first", "secs_in_session", "dt_prev", "dt_prev_in_session",
    "hour", "dow",
]
FEATURES_B_SESS = [f"sess_prev_a{i}" for i in (1, 2, 3)] + [f"sess_cum_bg_{bg}" for bg in BIGRAMS]
FEATURES_B_VIS = [f"vis_prev_a{i}" for i in (1, 2, 3)] + [f"vis_cum_bg_{bg}" for bg in BIGRAMS]
ALL_FEATURES = FEATURES_A + FEATURES_B_SESS + FEATURES_B_VIS


def cum_excluding_self(frame: pd.DataFrame, indicator: pd.Series, keys: list[str]) -> pd.Series:
    tmp = "__ind__"
    frame[tmp] = indicator.astype("int32")
    result = frame.groupby(keys, sort=False)[tmp].cumsum() - frame[tmp]
    frame.drop(columns=tmp, inplace=True)
    return result.astype("int32")


def process_month(path: str, month_label: str) -> pd.DataFrame:
    """Xử lý ĐÚNG 1 tháng, trả về CHỈ các dòng `cart` đã trích feature (nhỏ). Giải phóng mọi
    frame trung gian trước khi return để không cộng dồn bộ nhớ qua các lượt gọi."""
    df = pd.read_csv(path, usecols=USECOLS)
    df["ts"] = pd.to_datetime(df["event_time"], format="mixed", utc=True).dt.tz_localize(None)
    df = df[df["event_type"].isin(ACTIONS)].copy()
    df = df.dropna(subset=["user_session"])
    df = df.sort_values(["user_id", "ts"]).reset_index(drop=True)
    print(f"  {len(df):,} event ({df['user_id'].nunique():,} user, {df['user_session'].nunique():,} session)")
    print(f"  phan bo hanh vi: {df['event_type'].value_counts().to_dict()}")

    df["a"] = df["event_type"].map(ACTION_CODE).astype("int8")
    by_visitor = df.groupby(VISITOR_KEYS, sort=False)
    by_session = df.groupby(SESSION_KEYS, sort=False)

    for lag in (1, 2, 3):
        df[f"sess_prev_a{lag}"] = by_session["a"].shift(lag).fillna(0).astype("int8")
        df[f"vis_prev_a{lag}"] = by_visitor["a"].shift(lag).fillna(0).astype("int8")

    df["dt_prev"] = by_visitor["ts"].diff().dt.total_seconds()
    df["dt_prev_in_session"] = by_session["ts"].diff().dt.total_seconds()

    for name, code in ACTION_CODE.items():
        indicator = df["a"] == code
        df[f"cum_{name}"] = cum_excluding_self(df, indicator, VISITOR_KEYS)
        df[f"sess_cum_{name}"] = cum_excluding_self(df, indicator, SESSION_KEYS)

    df["sess_bigram"] = df["sess_prev_a1"].astype(str) + "_" + df["a"].astype(str)
    df["vis_bigram"] = df["vis_prev_a1"].astype(str) + "_" + df["a"].astype(str)
    for bg in BIGRAMS:
        df[f"sess_cum_bg_{bg}"] = cum_excluding_self(df, df["sess_bigram"] == bg, SESSION_KEYS)
        df[f"vis_cum_bg_{bg}"] = cum_excluding_self(df, df["vis_bigram"] == bg, VISITOR_KEYS)
    df.drop(columns=["sess_bigram", "vis_bigram"], inplace=True)

    df["cum_views_this_item"] = cum_excluding_self(df, df["a"] == ACTION_CODE["view"], ["user_id", "product_id"])
    df["event_pos"] = by_visitor.cumcount()
    df["session_pos"] = by_session.cumcount()
    df["secs_since_first"] = (df["ts"] - by_visitor["ts"].transform("first")).dt.total_seconds()
    df["secs_in_session"] = (df["ts"] - by_session["ts"].transform("first")).dt.total_seconds()
    df["hour"] = df["ts"].dt.hour.astype("int8")
    df["dow"] = df["ts"].dt.dayofweek.astype("int8")

    carts = df[df["event_type"] == "cart"].copy()
    purchases = df.loc[df["event_type"] == "purchase", ["user_id", "product_id", "ts"]].rename(
        columns={"ts": "purchase_ts"}
    )
    m = carts[["user_id", "product_id", "ts"]].merge(purchases, on=["user_id", "product_id"], how="left")
    m["ok"] = (m["purchase_ts"] >= m["ts"]) & (
        m["purchase_ts"] <= m["ts"] + pd.Timedelta(hours=LABEL_WINDOW_HOURS)
    )
    conv = m.groupby(["user_id", "product_id", "ts"])["ok"].max().rename("converted").reset_index()
    carts = carts.merge(conv, on=["user_id", "product_id", "ts"], how="left")
    carts["converted"] = carts["converted"].fillna(False)
    carts["abandoned"] = (~carts["converted"]).astype("int8")
    carts["month"] = month_label

    keep = ["user_id", "product_id", "ts", "abandoned", "month"] + ALL_FEATURES
    out = carts[keep].copy()
    out[ALL_FEATURES] = out[ALL_FEATURES].fillna(-1)

    del df, carts, purchases, m, conv, by_visitor, by_session
    gc.collect()
    return out


if __name__ == "__main__":
    outputs = []
    for fname in MONTH_FILES:
        fname = fname.strip()
        path = os.path.join(COSMETICS_DIR, fname)
        print(f"\nDoc {fname} ...")
        month_out = process_month(path, fname.replace(".csv", ""))
        print(f"  -> {len(month_out):,} mau cart, bo gio {month_out['abandoned'].mean():.1%}")
        outputs.append(month_out)
        gc.collect()

    out = pd.concat(outputs, ignore_index=True)
    del outputs
    gc.collect()

    print(f"\nTONG: {len(out):,} mau | bo gio {out['abandoned'].mean():.1%} | user {out['user_id'].nunique():,}")
    print(f"A={len(FEATURES_A)} | B_SESS={len(FEATURES_B_SESS)} | B_VIS={len(FEATURES_B_VIS)}")
    print("Phan bo theo thang:")
    print(out.groupby("month")["abandoned"].agg(["count", "mean"]).to_string())

    out.to_csv(OUT_PATH, index=False)
    with open(GROUPS_PATH, "w", encoding="utf-8") as f:
        json.dump({"A": FEATURES_A, "B_SESS": FEATURES_B_SESS, "B_VIS": FEATURES_B_VIS}, f, ensure_ascii=False, indent=2)
    print(f"Da luu {OUT_PATH} + {GROUPS_PATH}")
