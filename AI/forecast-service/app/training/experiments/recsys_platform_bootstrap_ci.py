"""Khoảng tin cậy (bootstrap, so sánh CẶP) cho chênh lệch SASRec − Recency trên platform_v1.

Thay cho cách cũ (§5.7/§5.8): nhìn 1 điểm số từ 1 lần train rồi kết luận "trong khoảng nhiễu" bằng
cảm tính. Ở đây:
  - Nhiều seed (mỗi seed = 1 lần train độc lập, file JSON do `recsys_platform_sasrec.py` sinh ra,
    có `per_user_hits` của SASRec VÀ `recency_per_user_hits` trên ĐÚNG cùng user/target).
  - Mỗi seed: paired bootstrap trên user (resample user có hoàn lại, B lần), tính CI 95% của
    hiệu recall@K(SASRec) − recall@K(Recency). CI không chứa 0 ⇒ khác biệt có ý nghĩa thống kê.
  - Tổng hợp qua seed: trung bình ± độ lệch chuẩn của hiệu (biến thiên do khởi tạo model).

Đọc mọi file `*.json` trong `RESULTS_DIR`.
"""
from __future__ import annotations

import glob
import json
import os

import numpy as np

RESULTS_DIR = os.environ.get(
    "RESULTS_DIR", "d:/JAVA/Graduation-Project/data/experiment-results/platform_sasrec"
)
N_BOOT = int(os.environ.get("N_BOOT", "1000"))
KS = [10, 20]

files = sorted(glob.glob(os.path.join(RESULTS_DIR, "seed*.json")))
if not files:
    raise SystemExit(f"Khong co file seed*.json trong {RESULTS_DIR}")

rng = np.random.default_rng(0)
summary = {"n_boot": N_BOOT, "per_seed": [], "across_seeds": {}}
diffs_by_k: dict[int, list[float]] = {k: [] for k in KS}

for path in files:
    with open(path, encoding="utf-8") as f:
        res = json.load(f)
    sas, rec = res["per_user_hits"], res["recency_per_user_hits"]
    users = sorted(set(sas) & set(rec))
    seed_row = {"file": os.path.basename(path), "seed": res.get("seed"), "n_users": len(users)}
    for k in KS:
        s = np.array([sas[u][f"hit@{k}"] for u in users], dtype=float)
        r = np.array([rec[u][f"hit@{k}"] for u in users], dtype=float)
        d = s - r
        boot = np.empty(N_BOOT)
        n = len(d)
        for b in range(N_BOOT):
            idx = rng.integers(0, n, n)
            boot[b] = d[idx].mean()
        lo, hi = np.percentile(boot, [2.5, 97.5])
        seed_row[f"@{k}"] = {
            "sasrec": round(s.mean(), 4), "recency": round(r.mean(), 4),
            "diff": round(d.mean(), 4), "ci95": [round(lo, 4), round(hi, 4)],
            "significant": bool(lo > 0 or hi < 0),
        }
        diffs_by_k[k].append(d.mean())
    summary["per_seed"].append(seed_row)

for k in KS:
    arr = np.array(diffs_by_k[k])
    summary["across_seeds"][f"@{k}"] = {
        "n_seeds": len(arr), "diff_mean": round(arr.mean(), 4),
        "diff_std": round(arr.std(ddof=1), 4) if len(arr) > 1 else None,
    }

print(json.dumps(summary, indent=2, ensure_ascii=False))
out = os.path.join(RESULTS_DIR, "bootstrap_ci_summary.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)
print(f"\nDa luu {out}")
