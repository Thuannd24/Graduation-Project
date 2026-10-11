"""Độ dài phiên TÁCH theo loại phiên trên REES46 Cosmetics (5 tháng) — cho bộ sinh dataset (tools/data-seed).

Lý do (2026-10-01): bộ sinh lấy độ dài phiên XEM THUẦN từ phân phối của TOÀN BỘ phiên thật (sessionLengthPcts), vốn đã gồm
cả phiên có thêm giỏ (dài hơn). Khi thêm "hành trình mua" (nhiều phiên bỏ giỏ hơn), tỉ lệ phiên dài 1 sự kiện của bộ sinh
tụt còn 49,6% trong khi thật ~60–65% → phải lấy mẫu phiên xem thuần từ phân phối của phiên KHÔNG có giỏ.
Độ dài = số sự kiện view + cart trong phiên (đúng định nghĩa fidelity.mjs). Phiên = user_session.
Kết quả: data/experiment-results/behavior_patterns/session_split.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6"
MONTHS = ["2019-Oct.csv", "2019-Nov.csv", "2019-Dec.csv", "2020-Jan.csv", "2020-Feb.csv"]
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/session_split.json"
PCT_LEVELS = list(range(0, 101, 5))


def main() -> None:
    t0 = time.time()
    parts = []
    for f in MONTHS:
        for ch in pd.read_csv(f"{SRC}/{f}", usecols=["event_type", "user_session"],
                              dtype={"event_type": "category", "user_session": "string"}, chunksize=2_000_000):
            ch = ch[ch["event_type"].isin(["view", "cart"]) & ch["user_session"].notna()]
            ch = ch.assign(c=(ch["event_type"] == "cart").astype("int32"), n=1)
            g = ch.groupby("user_session")[["n", "c"]].sum()
            parts.append(g)
        print(f"{f} ({time.time() - t0:.0f}s)", flush=True)
    s = pd.concat(parts).groupby(level=0).sum()
    res = {"n_sessions": int(len(s)), "share_with_cart": round(float((s["c"] > 0).mean()), 4)}
    for name, sub in (("all", s), ("no_cart", s[s["c"] == 0]), ("with_cart", s[s["c"] > 0])):
        n = sub["n"].to_numpy()
        res[name] = {
            "n": int(len(n)),
            "p_len1": round(float((n == 1).mean()), 4),
            "mean": round(float(n.mean()), 3),
            "pcts": [int(v) for v in np.percentile(n, PCT_LEVELS, method="lower")],
        }
    print(json.dumps(res, indent=1), flush=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(res, fh, indent=1)
    print(f"xong ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
