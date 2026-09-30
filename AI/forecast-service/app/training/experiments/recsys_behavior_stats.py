"""Đo quy luật hành vi THẬT từ REES46 Cosmetics — dùng để lái bộ sinh dữ liệu giả lập
(`tools/data-seed/lib/simulate.mjs`) thay vì luật tay đoán mò.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §10.

## Vì sao cần đo lại, không dùng số cũ

`simulate.mjs` hiện sinh CỨNG mọi đơn hàng theo mẫu `view(X) → cart(X)` cùng 1 item (dòng 105-109) —
phát hiện là nguyên nhân khiến recency-baseline thắng áp đảo SASRec platform_v1. Cần số liệu THẬT để
thay thế: user thật xem BAO NHIÊU sản phẩm khác nhau trước khi quyết định mua, có chuyển category hay
không, và tỉ lệ "xem nhưng không mua" (rời bỏ) là bao nhiêu.

## An toàn bộ nhớ

Xử lý TỪNG THÁNG rồi gộp — đúng pattern đã dùng an toàn ở `cosmetics_build_dataset.py` (crash RAM đã
xảy ra 1 lần khi nạp cả 5 tháng cùng lúc).
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
OUT_PATH = os.environ.get("BEHAVIOR_STATS_PATH", "/tmp/behavior_stats.json")

USECOLS = ["event_time", "event_type", "product_id", "category_id", "user_session"]

# ============ Tich luy qua tung thang (khong giu raw DataFrame giua cac thang) ============
switch_same, switch_diff = 0, 0  # category event lien tiep: giu nguyen vs doi
views_before_cart_same_cat: list[int] = []  # so SP KHAC NHAU da xem cung category truoc 1 cart
session_lengths: list[int] = []
n_view_total, n_view_then_cart_same_item, n_view_then_cart_diff_item = 0, 0, 0
n_sessions_total = 0

for fname in MONTH_FILES:
    fname = fname.strip()
    path = os.path.join(COSMETICS_DIR, fname)
    print(f"Doc {fname} ...")
    part = pd.read_csv(path, usecols=USECOLS)
    part = part[part["event_type"].isin(["view", "cart", "purchase"])].copy()
    part["event_time"] = pd.to_datetime(part["event_time"])
    part = part.sort_values(["user_session", "event_time"])
    print(f"  {len(part):,} dong hop le | {part['user_session'].nunique():,} session")

    for session_id, grp in part.groupby("user_session", sort=False):
        n_sessions_total += 1
        session_lengths.append(len(grp))

        cats = grp["category_id"].to_numpy()
        events = grp["event_type"].to_numpy()
        products = grp["product_id"].to_numpy()

        # 1) category chuyen doi giua 2 event LIEN TIEP trong session
        for i in range(len(cats) - 1):
            if pd.isna(cats[i]) or pd.isna(cats[i + 1]):
                continue
            if cats[i] == cats[i + 1]:
                switch_same += 1
            else:
                switch_diff += 1

        # 2) do sau so sanh: truoc moi cart, da xem BAO NHIEU san pham KHAC NHAU cung category
        seen_in_cat: dict = {}  # category_id -> set(product_id) da view tu dau session
        seen_products_viewed: set = set()
        for i in range(len(events)):
            et, pid, cat = events[i], products[i], cats[i]
            if et == "view":
                n_view_total += 1
                seen_products_viewed.add(pid)
                if not pd.isna(cat):
                    seen_in_cat.setdefault(cat, set()).add(pid)
            elif et == "cart":
                depth = len(seen_in_cat.get(cat, set()) - {pid}) if not pd.isna(cat) else 0
                views_before_cart_same_cat.append(depth)
                # 3) cart co dung san pham VUA xem gan nhat khong (kiem tra dung gia thuyet cu)
                if pid in seen_products_viewed:
                    n_view_then_cart_same_item += 1
                else:
                    n_view_then_cart_diff_item += 1

    del part
    gc.collect()
    print(f"  luy ke: {n_sessions_total:,} session, {len(views_before_cart_same_cat):,} lan cart da co do sau")

# ============ Tong hop ket qua ============
switch_total = switch_same + switch_diff
results = {
    "n_sessions": n_sessions_total,
    "category_switch_rate": switch_diff / switch_total if switch_total else None,
    "session_length": {
        "median": float(np.median(session_lengths)),
        "mean": float(np.mean(session_lengths)),
        "p90": float(np.percentile(session_lengths, 90)),
    },
    "views_before_cart_same_category": {
        "median": float(np.median(views_before_cart_same_cat)) if views_before_cart_same_cat else None,
        "mean": float(np.mean(views_before_cart_same_cat)) if views_before_cart_same_cat else None,
        "p90": float(np.percentile(views_before_cart_same_cat, 90)) if views_before_cart_same_cat else None,
        "pct_zero_depth": float(np.mean(np.array(views_before_cart_same_cat) == 0)) if views_before_cart_same_cat else None,
    },
    "cart_matches_a_viewed_item_rate": (
        n_view_then_cart_same_item / (n_view_then_cart_same_item + n_view_then_cart_diff_item)
        if (n_view_then_cart_same_item + n_view_then_cart_diff_item) else None
    ),
    "n_view_events": n_view_total,
    "n_cart_events_with_depth": len(views_before_cart_same_cat),
}

print(json.dumps(results, indent=2, ensure_ascii=False))
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
