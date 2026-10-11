"""Điều tra lượt THÊM GIỎ bất thường trong một file REES46 (vd 01/2020: giỏ/mua = 34 so với 2,9 ở 12/2019).

Đo trên N dòng ở vài vị trí trong file:
  - lượt giỏ / cặp (phiên, SP) duy nhất; khoảng cách giây giữa 2 lượt giỏ lặp liền nhau cùng cặp
  - mức tập trung: top 10 / top 100 user chiếm bao nhiêu % lượt giỏ; user nhiều nhất
  - sau khi GỘP lượt giỏ lặp cùng (phiên, SP) thành 1: giỏ/mua còn bao nhiêu
Dùng: python inspect_cart_burst.py <file.csv.gz> [--rows 3000000] [--skips 0 30000000]
"""
from __future__ import annotations

import argparse
import json

import pandas as pd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--rows", type=int, default=3_000_000)
    ap.add_argument("--skips", type=int, nargs="*", default=[0, 30_000_000])
    a = ap.parse_args()
    for skip in a.skips:
        d = pd.read_csv(a.file, nrows=a.rows, skiprows=range(1, skip + 1) if skip else None,
                        usecols=["event_time", "event_type", "product_id", "user_id", "user_session"],
                        dtype={"event_type": "string", "user_session": "string"})
        vc = d["event_type"].value_counts()
        c = d[d["event_type"] == "cart"].copy()
        c["t"] = pd.to_datetime(c["event_time"].str.slice(0, 19), format="%Y-%m-%d %H:%M:%S")
        c = c.sort_values(["user_session", "product_id", "t"])
        same = c["user_session"].eq(c["user_session"].shift()) & c["product_id"].eq(c["product_id"].shift())
        gap = (c["t"] - c["t"].shift()).dt.total_seconds()[same]
        n_pairs = int((~same).sum())
        per_user = c.groupby("user_id").size().sort_values(ascending=False)
        n_pur = int(vc.get("purchase", 0))
        res = {
            "skip": skip, "range": [d["event_time"].min(), d["event_time"].max()],
            "events": {k: int(v) for k, v in vc.items()},
            "cart_per_purchase_raw": round(len(c) / max(n_pur, 1), 2),
            "cart_events_per_unique_session_product": round(len(c) / max(n_pairs, 1), 2),
            "cart_per_purchase_after_dedup_session_product": round(n_pairs / max(n_pur, 1), 2),
            "repeat_gap_seconds": {"median": float(gap.median()) if len(gap) else None,
                                   "share_le_2s": round(float((gap <= 2).mean()), 3) if len(gap) else None,
                                   "share_le_60s": round(float((gap <= 60).mean()), 3) if len(gap) else None},
            "top10_users_share": round(float(per_user.head(10).sum() / max(len(c), 1)), 4),
            "top100_users_share": round(float(per_user.head(100).sum() / max(len(c), 1)), 4),
            "max_cart_events_one_user": int(per_user.iloc[0]) if len(per_user) else 0,
        }
        print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
