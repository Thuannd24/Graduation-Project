"""Dựng bảng ánh xạ item → category — cần cho bước RE-RANKING (đa dạng hoá theo category).

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §6.

Nhẹ hơn nhiều so với `recsys_build_interactions.py`: chỉ cần CẶP (product_id, category_id)
DUY NHẤT mỗi item, không cần giữ toàn bộ luồng sự kiện. Với 1 item đổi category theo thời gian
(hiếm), lấy category XUẤT HIỆN NHIỀU NHẤT — đủ dùng cho re-ranking, không cần chính xác tuyệt đối.
"""
from __future__ import annotations

import gc
import json
import os

import pandas as pd

COSMETICS_DIR = os.environ.get(
    "COSMETICS_DIR",
    "d:/JAVA/Graduation-Project/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6",
)
MONTH_FILES = os.environ.get(
    "COSMETICS_MONTHS", "2019-Oct.csv,2019-Nov.csv,2019-Dec.csv,2020-Jan.csv,2020-Feb.csv"
).split(",")
OUT_PATH = os.environ.get("ITEM_CATEGORY_PATH", "/tmp/item_category_map.csv")

if __name__ == "__main__":
    counts: dict[tuple[int, int], int] = {}
    for fname in MONTH_FILES:
        fname = fname.strip()
        path = os.path.join(COSMETICS_DIR, fname)
        print(f"Doc {fname} ...")
        part = pd.read_csv(path, usecols=["product_id", "category_id"]).dropna()
        grp = part.groupby(["product_id", "category_id"]).size()
        for (pid, cid), n in grp.items():
            key = (int(pid), int(cid))
            counts[key] = counts.get(key, 0) + int(n)
        del part, grp
        gc.collect()
        print(f"  {len(counts):,} cap (product,category) tich luy")

    best_category: dict[int, tuple[int, int]] = {}  # product_id -> (category_id, count)
    for (pid, cid), n in counts.items():
        cur = best_category.get(pid)
        if cur is None or n > cur[1]:
            best_category[pid] = (cid, n)

    out = pd.DataFrame(
        {"product_id": list(best_category.keys()),
         "category_id": [v[0] for v in best_category.values()]}
    )
    print(f"\n{len(out):,} item co category | {out['category_id'].nunique():,} category phan biet")
    out.to_csv(OUT_PATH, index=False)
    print(f"Da luu {OUT_PATH}")
