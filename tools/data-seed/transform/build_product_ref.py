"""Bảng THAM CHIẾU sản phẩm từ REES46 đa ngành 10–11/2019 (mã ngành ĐÚNG) để sửa mã ngành cho 12/2019–4/2020.

Vì sao (đo 2026-10-02): từ 12/2019 REES46 đổi category_id cho phần lớn SP (chỉ 19,7% SP giữ id cũ) và category_code gắn
với id mới bị SAI — vd iPhone/Samsung/Xiaomi (tháng 10: electronics.smartphone) mang "construction.tools.light".
Brand ổn định (98,3%); các category_id giữ id cũ thì mã vẫn đúng 100%. Còn 10–11/2019 có mã đúng nhưng log GIỎ lỗi.
→ Lấy 10–11 làm tham chiếu ngành, 12–4 làm nguồn hành vi.

Đầu ra (data/transformed/_ref/):
  product_ref.csv : product_id → category_id, category_code (của 10–11), brand
  brand_root.csv  : brand → category_code gốc phổ biến nhất (đếm sự kiện có mã ở 10–11)
  category_ref.csv: category_id (cũ) → category_code
"""
from __future__ import annotations

import os
import time
from collections import Counter, defaultdict

import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-behavior-data-from-multi-category-store/versions/8"
OUT = f"{ROOT}/data/transformed/_ref"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    prod_cat, cat_code = {}, {}
    prod_brand = {}
    brand_l1 = defaultdict(Counter)
    for f in ("2019-Oct.csv", "2019-Nov.csv"):
        for ch in pd.read_csv(f"{SRC}/{f}", chunksize=4_000_000, usecols=["product_id", "category_id", "category_code", "brand"],
                              dtype={"category_code": "string", "brand": "string"}):
            u = ch.drop_duplicates("product_id")
            for pid, cid in zip(u["product_id"], u["category_id"]):
                prod_cat.setdefault(pid, cid)
            ub = u.dropna(subset=["brand"])
            for pid, b in zip(ub["product_id"], ub["brand"]):
                prod_brand.setdefault(pid, b)
            c = ch.dropna(subset=["category_code"])
            for cid, code in c.drop_duplicates("category_id")[["category_id", "category_code"]].itertuples(index=False):
                cat_code.setdefault(cid, code)
            cb = c.dropna(subset=["brand"]).groupby(["brand", "category_code"]).size()
            for (b, code), n in cb.items():
                brand_l1[b][code] += int(n)
        print(f"{f}: {len(prod_cat):,} SP ({time.time() - t0:.0f}s)", flush=True)
    pr = pd.DataFrame({"product_id": list(prod_cat), "category_id": list(prod_cat.values())})
    pr["category_code"] = pr["category_id"].map(cat_code)
    pr["brand"] = pr["product_id"].map(prod_brand)
    pr.to_csv(f"{OUT}/product_ref.csv", index=False)
    pd.DataFrame({"category_id": list(cat_code), "category_code": list(cat_code.values())}).to_csv(f"{OUT}/category_ref.csv", index=False)
    pd.DataFrame([{"brand": b, "category_code": c.most_common(1)[0][0], "events": sum(c.values())} for b, c in brand_l1.items()]
                 ).to_csv(f"{OUT}/brand_root.csv", index=False)
    print(f"xong: {len(pr):,} SP, {len(cat_code)} danh mục có mã, {len(brand_l1):,} brand ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
