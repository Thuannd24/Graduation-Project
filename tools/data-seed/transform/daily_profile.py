"""Thống kê THEO NGÀY cho các file REES46 đã tải (chỉ đọc 2 cột event_time/event_type nên rẻ): số lượt xem / thêm giỏ / mua
mỗi ngày + tỉ lệ giỏ/mua. Dùng để phát hiện ngày/khoảng bị thiếu log hoặc bất thường trước khi transform.

Phát hiện 2026-10-02: 01–02/01/2020 chỉ có 3.574 lượt mua trong 2,9 triệu dòng (12/2019: ~50.000) → cần biết đó là
nghỉ lễ thật (Nga nghỉ 01–08/01) hay mất log.
Dùng: python daily_profile.py [file...]  → in bảng + ghi data/experiment-results/rees46_daily_profile.csv
"""
from __future__ import annotations

import os
import sys
import time

import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/external/rees46-multi-full"
OUT = f"{ROOT}/data/experiment-results/rees46_daily_profile.csv"
DEFAULT = ["2019-Dec.csv.gz", "2020-Jan.csv.gz", "2020-Feb.csv.gz", "2020-Mar.csv.gz", "2020-Apr.csv.gz"]


def main() -> None:
    files = sys.argv[1:] or DEFAULT
    t0 = time.time()
    parts = []
    for f in files:
        path = f if os.path.exists(f) else f"{SRC}/{f}"
        for ch in pd.read_csv(path, usecols=["event_time", "event_type"], dtype={"event_type": "category"},
                              chunksize=4_000_000):
            ch["day"] = ch["event_time"].str.slice(0, 10)
            parts.append(ch.groupby(["day", "event_type"], observed=True).size())
        print(f"{os.path.basename(path)} xong ({time.time() - t0:.0f}s)", flush=True)
    s = pd.concat(parts).groupby(level=[0, 1]).sum().unstack(fill_value=0).sort_index()
    for c in ("view", "cart", "purchase"):
        if c not in s:
            s[c] = 0
    s["cart_per_purchase"] = (s["cart"] / s["purchase"].clip(lower=1)).round(2)
    s["purchase_per_view_pct"] = (100 * s["purchase"] / s["view"].clip(lower=1)).round(2)
    s.to_csv(OUT)
    pd.set_option("display.width", 160)
    print(s.to_string())
    print(f"\n→ {OUT} ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
