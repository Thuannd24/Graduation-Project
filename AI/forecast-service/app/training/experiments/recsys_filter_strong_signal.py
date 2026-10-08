"""Lọc `interactions.csv` xuống chỉ còn `cart` + `purchase` — tín hiệu ngầm định MẠNH.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §6.

## Vì sao lọc, không chỉ để sửa lỗi bộ nhớ

Hai lý do, một kỹ thuật một mô hình hoá:

1. **Kỹ thuật**: `view` chiếm 9,66M/16,7M dòng và kéo số user lên 1,64M (đa số chỉ ghé xem 1 lần).
   Ma trận tương đồng item-item tính trên 1,6M user gần như ĐẶC (item nào cũng có chung ít nhất
   1 người xem), làm vòng lặp `.getrow()` phân mảnh bộ nhớ liên tục — đã kill 2 lần khi thử vá
   bằng cách giảm block size, không giải quyết được gốc rễ.
2. **Mô hình hoá**: `view` là tín hiệu NGẦM ĐỊNH YẾU nhất (Rendle 2021 và nhiều tài liệu implicit
   feedback: click/view lẫn nhiều nhiễu hơn add-to-cart/purchase). Dùng cart+purchase cho bước
   TÍNH TƯƠNG ĐỒNG là lựa chọn hợp lý độc lập với vấn đề bộ nhớ — không phải chỉ né tránh sự cố.

Sau lọc: quy mô quay về gần với bộ bỏ-giỏ đã chạy AN TOÀN trước đó (397K user), không phải né
tránh bằng số liệu tuỳ tiện.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

IN_PATH = os.environ.get("INTERACTIONS_PATH", "/tmp/interactions.csv")
OUT_PATH = os.environ.get("STRONG_INTERACTIONS_PATH", "/tmp/interactions_strong.csv")
MAPS_OUT_PATH = os.environ.get("STRONG_MAPS_PATH", "/tmp/interactions_strong_maps.json")
KEEP_EVENTS = {"cart", "purchase"}

df = pd.read_csv(IN_PATH)
print(f"Truoc loc: {len(df):,} dong | {df['user_idx'].nunique():,} user | {df['item_idx'].nunique():,} item")

df = df[df["event_type"].isin(KEEP_EVENTS)].copy()
print(f"Sau loc con {KEEP_EVENTS}: {len(df):,} dong")

# anh xa lai chi so LIEN TUC vi vu tru user/item da thu hep
user_ids = np.sort(df["user_idx"].unique())
item_ids = np.sort(df["item_idx"].unique())
user_map = {u: i for i, u in enumerate(user_ids)}
item_map = {it: i for i, it in enumerate(item_ids)}
df["user_idx"] = df["user_idx"].map(user_map).astype("int32")
df["item_idx"] = df["item_idx"].map(item_map).astype("int32")

print(f"Sau anh xa lai: {len(user_ids):,} user | {len(item_ids):,} item")
print(f"Mat do: {len(df) / (len(user_ids) * len(item_ids)):.6%}")

df.to_csv(OUT_PATH, index=False)
with open(MAPS_OUT_PATH, "w", encoding="utf-8") as f:
    json.dump({"n_users": int(len(user_ids)), "n_items": int(len(item_ids))}, f)
print(f"\nDa luu {OUT_PATH} + {MAPS_OUT_PATH}")
