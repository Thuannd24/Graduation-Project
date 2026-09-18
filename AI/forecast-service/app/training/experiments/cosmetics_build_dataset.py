"""Kiểm lại giả thuyết THỨ TỰ trên REES46 Cosmetics Shop — dữ liệu thật có `remove_from_cart`.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §5.2.

## Vì sao thí nghiệm này khác RetailRocket

RetailRocket chỉ có 3 ký hiệu (view/addtocart/transaction) ⇒ bigram gần như suy được từ số đếm,
đã đo ΔAUC thứ tự = +0,0000 (null thật, không phải lỗi đo). REES46 Cosmetics có **4 ký hiệu, gồm
`remove_from_cart`** — chuỗi `cart → remove → cart` mang ý nghĩa "đổi ý" mà 3 ký hiệu không thể
biểu diễn. Đây là bộ công khai ĐẦU TIÊN đủ điều kiện kiểm lại giả thuyết.

## Khác biệt kỹ thuật so với `cart_abandon_build_dataset.py` (RetailRocket)

1. **`user_session` có sẵn thật** — KHÔNG cần suy phiên bằng heuristic khe 30 phút. Đây là nguồn
   rò rỉ/lỗi đã tìm thấy ở RetailRocket (thứ tự tính xuyên ranh giới phiên) — ở đây không tồn tại.
2. 4 loại hành vi ⇒ bigram `(prev ∈ {0,view,cart,remove,purchase}) × (cur ∈ {view,cart,remove,purchase})`
   = 20 tổ hợp, thay vì 12 ở RetailRocket.
3. Nhãn: `cart` có `purchase` CÙNG sản phẩm trong 24h sau không? (giữ đúng định nghĩa RetailRocket
   để so sánh được).
4. **Phạm vi: MẶC ĐỊNH cả 5 tháng** (Oct 2019 – Feb 2020, tổng ~20,7M event). Lượt đầu chỉ chạy
   tháng 12 để có kết quả nhanh (dương, xem `recsys-execution-plan.md` §5.3) — lượt này mở rộng để
   kiểm tra hiệu ứng có BỀN VỮNG qua nhiều tháng hay chỉ là đặc thù tháng 12 (Black Friday/Giáng
   sinh, hành vi mua sắm có thể khác thường). Gộp TRƯỚC KHI tính cumsum để lịch sử mỗi user không
   bị "reset" ở ranh giới tháng — đúng hơn về mặt nhân quả so với xử lý từng tháng độc lập.

CHỐNG RÒ RỈ (giữ nguyên nguyên tắc): mọi feature dùng cumsum theo nhóm rồi TRỪ CHÍNH event hiện tại.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

COSMETICS_DIR = os.environ.get(
    "COSMETICS_DIR",
    "d:/JAVA/Graduation-Project/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6",
)
# Mac dinh CA 5 THANG; dat COSMETICS_MONTHS="2019-Dec.csv" de chi chay 1 thang (lan dau, nhanh)
MONTH_FILES = os.environ.get(
    "COSMETICS_MONTHS", "2019-Oct.csv,2019-Nov.csv,2019-Dec.csv,2020-Jan.csv,2020-Feb.csv"
).split(",")
OUT_PATH = os.environ.get("COSMETICS_DATASET_PATH", "/tmp/cosmetics_dataset.csv")
GROUPS_PATH = os.environ.get("COSMETICS_GROUPS_PATH", "/tmp/cosmetics_groups.json")
LABEL_WINDOW_HOURS = 24

ACTIONS = ["view", "cart", "remove_from_cart", "purchase"]
ACTION_CODE = {a: i + 1 for i, a in enumerate(ACTIONS)}  # 1..4, 0 = khong co tien de
BIGRAMS = [f"{prev}_{cur}" for prev in (0, 1, 2, 3, 4) for cur in (1, 2, 3, 4)]

VISITOR_KEYS = ["user_id"]
SESSION_KEYS = ["user_id", "user_session"]


def cum_excluding_self(frame: pd.DataFrame, indicator: pd.Series, keys: list[str]) -> pd.Series:
    tmp = "__ind__"
    frame[tmp] = indicator.astype("int32")
    result = frame.groupby(keys, sort=False)[tmp].cumsum() - frame[tmp]
    frame.drop(columns=tmp, inplace=True)
    return result.astype("int32")


usecols = ["event_time", "event_type", "product_id", "user_id", "user_session"]
frames = []
for fname in MONTH_FILES:
    path = os.path.join(COSMETICS_DIR, fname.strip())
    print(f"Doc {fname} ...")
    part = pd.read_csv(path, usecols=usecols)
    part["ts"] = pd.to_datetime(part["event_time"], format="mixed", utc=True).dt.tz_localize(None)
    frames.append(part)
    print(f"  {len(part):,} dong")

df = pd.concat(frames, ignore_index=True)
del frames
df = df[df["event_type"].isin(ACTIONS)].copy()
df = df.dropna(subset=["user_session"])  # can session that de nhom, bo cac dong thieu
# sap xep theo (user, thoi gian) TREN TOAN BO cac thang gop lai -> cumsum khong bi "reset" o
# ranh gioi thang, dung hon ve nhan qua so voi xu ly tung thang doc lap
df = df.sort_values(["user_id", "ts"]).reset_index(drop=True)
print(f"\nTong: {len(df):,} event ({df['user_id'].nunique():,} user, {df['user_session'].nunique():,} session)")
print(f"phan bo hanh vi: {df['event_type'].value_counts().to_dict()}")

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

# --- NHAN: cart co purchase CUNG san pham trong 24h sau khong? ---
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

keep = ["user_id", "product_id", "ts", "abandoned"] + ALL_FEATURES
out = carts[keep].copy()
out[ALL_FEATURES] = out[ALL_FEATURES].fillna(-1)

print(f"\nMau: {len(out):,} | bo gio {out.abandoned.mean():.1%} | user {out.user_id.nunique():,}")
print(f"A={len(FEATURES_A)} | B_SESS={len(FEATURES_B_SESS)} | B_VIS={len(FEATURES_B_VIS)}")

out.to_csv(OUT_PATH, index=False)
with open(GROUPS_PATH, "w", encoding="utf-8") as f:
    json.dump({"A": FEATURES_A, "B_SESS": FEATURES_B_SESS, "B_VIS": FEATURES_B_VIS}, f, ensure_ascii=False, indent=2)
print(f"Da luu {OUT_PATH} + {GROUPS_PATH}")
