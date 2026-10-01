"""Đo KHOẢNG CÁCH MUA LẠI CÙNG NGÀNH trên Amazon Reviews 2023 (McAuley-Lab, UCSD) — neo TƯƠNG ĐỐI cho chu kỳ mua
lại theo ngành hàng trong bộ sinh dataset churn (churn-risk-roadmap.md mục 1.2).

Vì sao nguồn này (2026-10-01): REES46 đa ngành không có bách hoá/tã/sữa và chỉ 2 tháng; Olist chỉ 2,2% khách mua
lại (3–132 khách/ngành) → không neo được. Amazon có 33 ngành CÓ TÊN, nhiều năm, phủ gần đủ 12 ngành Tiki.

Đầu vào: benchmark/5core/rating_only/<Ngành>.csv (user_id, parent_asin, rating, timestamp ms).
GIỚI HẠN — phải ghi khi dùng:
  - Review ≠ lần mua (chỉ 1 phần nhỏ lần mua có review) → khoảng cách TUYỆT ĐỐI bị kéo dài; chỉ dùng TỈ LỆ giữa
    các ngành (vd bách hoá dày gấp mấy lần điện tử).
  - 5-core = chỉ giữ user/SP có ≥ 5 review trong ngành → tỉ lệ mua lại bị lọc sẵn, KHÔNG dùng; chỉ dùng khoảng cách.
  - Không có bản 5-core cho Appliances (ngành Điện Gia Dụng của Tiki) → ghi là thiếu.

Chỉ số mỗi ngành (khoảng cách giữa 2 NGÀY có review liên tiếp của cùng user trong ngành):
  gap_median / p25 / p75 (ngày), share ≤30 / ≤90 / >365 ngày, và relative_to_grocery = gap_median / gap_median(Grocery).
Kết quả: data/experiment-results/behavior_patterns/amazon_category_repurchase.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/external/amazon-reviews-2023/5core"
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/amazon_category_repurchase.json"
CATEGORIES = ["Grocery_and_Gourmet_Food", "Baby_Products", "Toys_and_Games", "Health_and_Household",
              "Beauty_and_Personal_Care", "Cell_Phones_and_Accessories", "Sports_and_Outdoors", "Books",
              "Electronics", "Clothing_Shoes_and_Jewelry", "Home_and_Kitchen"]


def measure(path: str) -> dict:
    users, days = [], []
    for ch in pd.read_csv(path, usecols=["user_id", "timestamp"], chunksize=3_000_000):
        users.append(pd.util.hash_pandas_object(ch.user_id, index=False).to_numpy())  # băm → int, RAM nhỏ
        days.append((ch.timestamp.to_numpy() // 86_400_000).astype(np.int32))        # ms → ngày
    u = np.concatenate(users)
    d = np.concatenate(days)
    order = np.lexsort((d, u))
    u, d = u[order], d[order]
    same_user = u[1:] == u[:-1]
    gap = (d[1:] - d[:-1])[same_user]
    gap = gap[gap > 0]  # nhiều review cùng ngày = 1 dịp mua
    return {
        "reviews": int(len(u)), "users": int(len(np.unique(u))), "gaps": int(len(gap)),
        "gap_median_days": float(np.median(gap)), "gap_p25_days": float(np.percentile(gap, 25)),
        "gap_p75_days": float(np.percentile(gap, 75)),
        "share_le_30d": round(float((gap <= 30).mean()), 4), "share_le_90d": round(float((gap <= 90).mean()), 4),
        "share_gt_365d": round(float((gap > 365).mean()), 4),
    }


def main() -> None:
    out = {"_meta": {"source": "Amazon Reviews 2023 (McAuley-Lab) benchmark/5core/rating_only",
                     "unit": "khoảng cách giữa 2 ngày có review liên tiếp của cùng user trong cùng ngành",
                     "use": "CHỈ dùng tỉ lệ giữa các ngành (review ≠ mua; 5-core lọc sẵn tỉ lệ mua lại)"}}
    t = time.time()
    for c in CATEGORIES:
        p = f"{SRC}/{c}.csv"
        if not os.path.exists(p):
            print(f"THIẾU {c}")
            continue
        out[c] = measure(p)
        print(f"{c:30s} gaps={out[c]['gaps']:>9,} median={out[c]['gap_median_days']:>6.0f}d p25={out[c]['gap_p25_days']:>5.0f} "
              f"p75={out[c]['gap_p75_days']:>5.0f} ≤30d={out[c]['share_le_30d']:.2f} >365d={out[c]['share_gt_365d']:.2f} ({time.time()-t:.0f}s)", flush=True)
    base = out.get("Grocery_and_Gourmet_Food", {}).get("gap_median_days")
    if base:
        for c in CATEGORIES:
            if c in out:
                out[c]["relative_to_grocery"] = round(out[c]["gap_median_days"] / base, 3)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("relative_to_grocery:", {c: out[c].get("relative_to_grocery") for c in CATEGORIES if c in out})


if __name__ == "__main__":
    main()
