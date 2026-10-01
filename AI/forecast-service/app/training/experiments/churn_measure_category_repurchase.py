"""Đo CHU KỲ MUA LẠI THEO NGÀNH HÀNG trên REES46 đa ngành (dữ liệu bán hàng thật) — neo số cho bộ sinh dataset
phục vụ churn (churn-risk-roadmap.md mục 1.2: tiêu dùng nhanh mua lại dày, lâu bền mua thưa) và cho nhãn churn
ĐỘNG theo chu kỳ (mục 0.2).

Dữ liệu: 2019-10 + 2019-11 (≈ 110 triệu sự kiện), chỉ lấy `purchase`; ngành = phần đầu `category_code`
(electronics, appliances, apparel, kids, ...). Một "lần mua" = 1 NGÀY có purchase của user trong ngành đó
(gộp nhiều SP cùng ngày thành 1 dịp mua).

Chỉ số theo ngành:
  - buyers, purchase_days
  - repeat_rate_61d : tỉ lệ người mua có ≥ 2 ngày mua trong ngành (cửa sổ 61 ngày)
  - gap_median / gap_p75 (ngày) giữa 2 ngày mua liên tiếp, trên người mua lặp
GIỚI HẠN (ghi rõ khi dùng): cửa sổ chỉ 61 ngày → khoảng cách ≤ 60 ngày, ngành lâu bền (chu kỳ ~năm) chỉ thấy
qua repeat_rate THẤP chứ không đo được chu kỳ thật. Không có ngành tạp hoá/sữa/tã (REES46 không bán).
Kết quả: data/experiment-results/behavior_patterns/category_repurchase.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
MC = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-behavior-data-from-multi-category-store/versions/8"
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/category_repurchase.json"


def main() -> None:
    t = time.time()
    parts = []
    for m in ("2019-Oct", "2019-Nov"):
        for ch in pd.read_csv(f"{MC}/{m}.csv", usecols=["event_time", "event_type", "category_code", "user_id"],
                              dtype={"event_type": "category", "category_code": "string", "user_id": "int64"},
                              chunksize=3_000_000):
            ch = ch[ch.event_type == "purchase"]
            parts.append(pd.DataFrame({
                "user": ch.user_id.to_numpy(),
                "day": ch.event_time.str.slice(0, 10).to_numpy(),
                "cat": ch.category_code.fillna("unknown").str.split(".").str[0].to_numpy(),
            }))
        print(f"  xong {m} ({time.time()-t:.0f}s)", flush=True)
    df = pd.concat(parts, ignore_index=True).drop_duplicates()
    df["day"] = pd.to_datetime(df.day)
    out = {"_meta": {"source": "REES46 đa ngành 2019-10..11, purchase", "window_days": 61,
                     "purchase_unit": "1 ngày có mua của user trong ngành", "rows_purchase_days": int(len(df))}}

    # cấp user (mọi ngành): tần suất mua
    per_user = df.groupby("user").day.nunique()
    out["_all_categories"] = {"buyers": int(len(per_user)), "repeat_rate_61d": round(float((per_user >= 2).mean()), 4),
                              "purchase_days_mean": round(float(per_user.mean()), 3)}
    rows = {}
    for cat, g in df.groupby("cat"):
        g = g.sort_values(["user", "day"])
        days_per_user = g.groupby("user").day.nunique()
        gaps = g.groupby("user").day.diff().dt.days.dropna()
        gaps = gaps[gaps > 0]
        rows[cat] = {
            "buyers": int(len(days_per_user)),
            "purchase_days": int(len(g)),
            "repeat_rate_61d": round(float((days_per_user >= 2).mean()), 4),
            "gap_median_days": float(np.median(gaps)) if len(gaps) else None,
            "gap_p75_days": float(np.percentile(gaps, 75)) if len(gaps) else None,
        }
    out["by_category"] = dict(sorted(rows.items(), key=lambda kv: -kv[1]["buyers"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps(out["_all_categories"], ensure_ascii=False))
    for k, v in out["by_category"].items():
        print(f"{k:14s} buyers={v['buyers']:>8,} repeat61d={v['repeat_rate_61d']:.3f} gap_med={v['gap_median_days']} p75={v['gap_p75_days']}")
    print(f"{time.time()-t:.0f}s")


if __name__ == "__main__":
    main()
