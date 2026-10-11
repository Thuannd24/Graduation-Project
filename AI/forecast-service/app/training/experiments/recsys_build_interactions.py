"""Tuần 1 — dựng tập tương tác (user, item, ts) từ REES46 Cosmetics cho bài toán gợi ý.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §6.

Khác với `cosmetics_build_dataset.py` (dựng feature bỏ-giỏ, nhãn nhị phân): script này chỉ cần
CẶP (user, item, thời điểm) làm tín hiệu ngầm định (implicit feedback) cho bài toán xếp hạng.

## Quyết định tín hiệu

Dùng `view` + `cart` + `purchase` làm tín hiệu ngầm định DƯƠNG. **Loại `remove_from_cart`** — đó
là tín hiệu "từ chối", không phải "quan tâm", đưa vào ma trận tương tác sẽ làm nhiễu tín hiệu sở
thích thay vì làm giàu nó (khác vai trò của nó ở bài toán bỏ-giỏ, nơi nó là feature chuỗi).

## An toàn bộ nhớ

Xử lý TỪNG THÁNG (bài học từ `cosmetics_build_dataset.py`), chỉ giữ 4 cột gọn nhẹ
(user_id, product_id, ts, event_type) — KHÔNG cần dựng feature cumsum/bigram như bài toán bỏ-giỏ,
nên nhẹ hơn nhiều. Ánh xạ user_id/product_id sang chỉ số nguyên liên tục SAU KHI đã gộp đủ 5 tháng,
để 1 user/item chỉ có đúng 1 chỉ số dù xuất hiện ở nhiều tháng.
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
OUT_PATH = os.environ.get("INTERACTIONS_PATH", "/tmp/interactions.csv")
MAPS_PATH = os.environ.get("INTERACTIONS_MAPS_PATH", "/tmp/interactions_maps.json")

POSITIVE_EVENTS = {"view", "cart", "purchase"}
USECOLS = ["event_time", "event_type", "product_id", "user_id"]


def load_month(path: str) -> pd.DataFrame:
    part = pd.read_csv(path, usecols=USECOLS)
    part = part[part["event_type"].isin(POSITIVE_EVENTS)]
    part["ts"] = pd.to_datetime(part["event_time"], format="mixed", utc=True).dt.tz_localize(None)
    return part[["user_id", "product_id", "ts", "event_type"]]


if __name__ == "__main__":
    frames = []
    for fname in MONTH_FILES:
        fname = fname.strip()
        path = os.path.join(COSMETICS_DIR, fname)
        print(f"Doc {fname} ...")
        part = load_month(path)
        print(f"  {len(part):,} tuong tac duong (view/cart/purchase)")
        frames.append(part)
        gc.collect()

    df = pd.concat(frames, ignore_index=True)
    del frames
    gc.collect()
    print(f"\nTong: {len(df):,} tuong tac, {df['user_id'].nunique():,} user, {df['product_id'].nunique():,} item")

    # anh xa sang chi so nguyen lien tuc — bat buoc cho ma tran thua
    user_ids = np.sort(df["user_id"].unique())
    item_ids = np.sort(df["product_id"].unique())
    user_to_idx = {u: i for i, u in enumerate(user_ids)}
    item_to_idx = {it: i for i, it in enumerate(item_ids)}

    df["user_idx"] = df["user_id"].map(user_to_idx).astype("int32")
    df["item_idx"] = df["product_id"].map(item_to_idx).astype("int32")
    df = df.sort_values("ts").reset_index(drop=True)

    out = df[["user_idx", "item_idx", "ts", "event_type"]].copy()
    out["ts_epoch"] = out["ts"].astype("int64") // 10**9  # giay, gon hon chuoi ISO khi luu CSV
    out = out.drop(columns=["ts"])

    print(f"\nPhan bo hanh vi: {out['event_type'].value_counts().to_dict()}")
    print(f"So user: {len(user_ids):,} | So item: {len(item_ids):,}")
    print(f"Mat do ma tran: {len(out) / (len(user_ids) * len(item_ids)):.6%}")

    out.to_csv(OUT_PATH, index=False)
    with open(MAPS_PATH, "w", encoding="utf-8") as f:
        json.dump({"n_users": len(user_ids), "n_items": len(item_ids)}, f)
    print(f"\nDa luu {OUT_PATH} + {MAPS_PATH}")
