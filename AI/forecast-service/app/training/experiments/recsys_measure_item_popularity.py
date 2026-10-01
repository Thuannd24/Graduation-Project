"""Đo mức TẬP TRUNG độ phổ biến sản phẩm trên dữ liệu người dùng thật — mục tiêu cho bộ sinh dataset.

Vì sao: `tools/data-seed/lib/simulate.mjs` từng chọn sản phẩm ĐỀU NHAU trong mỗi danh mục, trong khi thực tế
số ít sản phẩm chiếm phần lớn lượt xem (đuôi dài) — baseline Popularity trên dữ liệu sinh vì thế chỉ đạt
recall@10 ≈ 0,0005, phi thực tế. Script này đo đuôi dài thật để hiệu chỉnh và kiểm tra bộ sinh.

Chỉ số (trên lượt XEM, và riêng lượt THÊM GIỎ): tỉ lệ lượt rơi vào top 1% / 10% / 20% sản phẩm, hệ số Gini.
Mức tập trung phụ thuộc kích thước catalog → đo thêm trên MẪU NGẪU NHIÊN `SUBSAMPLE_ITEMS` sản phẩm (cỡ
catalog web, ~7.000) — con số dùng để so với dữ liệu sinh.

Đọc theo chunk, chỉ 2 cột → RAM nhỏ. Kết quả: data/experiment-results/behavior_patterns/item_popularity.json
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
KAGGLE = f"{ROOT}/data/kaggle-cache/datasets"
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/item_popularity.json"
SUBSAMPLE_ITEMS = int(os.environ.get("SUBSAMPLE_ITEMS", "7000"))
TAOBAO_ROWS = int(os.environ.get("TAOBAO_ROWS", "20000000"))

SOURCES = {
    "rees46_multi_category_2019_10": {
        "files": [f"{KAGGLE}/mkechinov/ecommerce-behavior-data-from-multi-category-store/versions/8/2019-Oct.csv"],
        "reader": "rees46",
    },
    "rees46_cosmetics_5_months": {
        "files": [f"{KAGGLE}/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6/{m}.csv"
                  for m in ("2019-Oct", "2019-Nov", "2019-Dec", "2020-Jan", "2020-Feb")],
        "reader": "rees46",
    },
    "taobao_first_20m": {
        "files": [f"{KAGGLE}/gogokerry/taobao-user-behavior/versions/1/UserBehavior.csv"],
        "reader": "taobao",
    },
}


def gini(counts: np.ndarray) -> float:
    x = np.sort(counts.astype(np.float64))
    n = len(x)
    if n == 0 or x.sum() == 0:
        return float("nan")
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))


def concentration(counter: Counter, rng: np.random.Generator) -> dict:
    counts = np.array(sorted(counter.values(), reverse=True), dtype=np.int64)
    total = counts.sum()

    def top_share(c: np.ndarray, frac: float) -> float:
        k = max(1, int(round(len(c) * frac)))
        return float(c[:k].sum() / c.sum())

    res = {
        "n_items": int(len(counts)), "n_events": int(total),
        "top1pct_share": round(top_share(counts, 0.01), 4),
        "top10pct_share": round(top_share(counts, 0.10), 4),
        "top20pct_share": round(top_share(counts, 0.20), 4),
        "gini": round(gini(counts), 4),
    }
    if len(counts) > SUBSAMPLE_ITEMS:
        subs = []
        for _ in range(20):  # 20 mẫu ngẫu nhiên → trung bình ± độ lệch
            s = np.sort(rng.choice(counts, SUBSAMPLE_ITEMS, replace=False))[::-1]
            subs.append((top_share(s, 0.01), top_share(s, 0.10), top_share(s, 0.20), gini(s)))
        a = np.array(subs)
        res[f"subsample_{SUBSAMPLE_ITEMS}"] = {
            "top1pct_share": [round(a[:, 0].mean(), 4), round(a[:, 0].std(), 4)],
            "top10pct_share": [round(a[:, 1].mean(), 4), round(a[:, 1].std(), 4)],
            "top20pct_share": [round(a[:, 2].mean(), 4), round(a[:, 2].std(), 4)],
            "gini": [round(a[:, 3].mean(), 4), round(a[:, 3].std(), 4)],
        }
    return res


def measure(name: str, spec: dict, rng: np.random.Generator) -> dict:
    views, carts = Counter(), Counter()
    rows = 0
    t = time.time()
    for f in spec["files"]:
        if spec["reader"] == "rees46":
            it = pd.read_csv(f, usecols=["event_type", "product_id"], dtype={"event_type": "category", "product_id": "int64"},
                             chunksize=2_000_000)
            view_label, cart_label, type_col, item_col = "view", "cart", "event_type", "product_id"
        else:
            it = pd.read_csv(f, header=None, names=["u", "item", "cat", "type", "ts"], usecols=["item", "type"],
                             dtype={"type": "category", "item": "int64"}, chunksize=2_000_000, nrows=TAOBAO_ROWS)
            view_label, cart_label, type_col, item_col = "pv", "cart", "type", "item"
        for ch in it:
            rows += len(ch)
            views.update(ch.loc[ch[type_col] == view_label, item_col].value_counts().to_dict())
            carts.update(ch.loc[ch[type_col] == cart_label, item_col].value_counts().to_dict())
        print(f"  {name}: xong {os.path.basename(f)} ({rows:,} dòng, {time.time() - t:.0f}s)", flush=True)
    return {"rows": rows, "views": concentration(views, rng), "carts": concentration(carts, rng)}


def main() -> None:
    rng = np.random.default_rng(42)
    only = sys.argv[1:]  # có thể chỉ chạy một nguồn
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    for name, spec in SOURCES.items():
        if only and name not in only:
            continue
        missing = [f for f in spec["files"] if not os.path.exists(f)]
        if missing:
            print(f"BỎ QUA {name}: thiếu {missing[0]}")
            continue
        print(f"=== {name}", flush=True)
        out[name] = measure(name, spec, rng)
        out["_meta"] = {"subsample_items": SUBSAMPLE_ITEMS, "taobao_rows": TAOBAO_ROWS,
                        "note": "share = tỉ lệ lượt rơi vào top x% sản phẩm theo số lượt; gini trên số lượt/sản phẩm"}
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)  # lưu sau mỗi nguồn
        print(json.dumps(out[name], ensure_ascii=False, indent=1), flush=True)


if __name__ == "__main__":
    main()
