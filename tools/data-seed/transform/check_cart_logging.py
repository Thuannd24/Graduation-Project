"""Đo CHẤT LƯỢNG GHI GIỎ HÀNG của một file REES46 (csv hoặc csv.gz) — quyết định file đó có dùng được cho phần giỏ
hàng / cảnh báo sớm không. Cùng định nghĩa với phép đo 2026-10-02 trên 10–11/2019 (đa ngành) và mỹ phẩm:
  - lượt thêm giỏ / lượt mua                     (hệ thống thật: luôn ≥ 1; mỹ phẩm 5,04; đa ngành 10/2019 1,00)
  - % phiên có mua mà không có lượt thêm giỏ nào (mỹ phẩm 17,4%; đa ngành 10/2019 61,5%)
  - % lượt mua có thêm giỏ đúng SP trong phiên   (mỹ phẩm 50,5%; đa ngành 10/2019 36,5%)
  - có ghi remove_from_cart không
Dùng: python check_cart_logging.py <file> [--rows 4000000]
"""
from __future__ import annotations

import argparse
import json

import pandas as pd


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--rows", type=int, default=4_000_000)
    ap.add_argument("--skip", type=int, default=0, help="bỏ qua N dòng đầu (để đo giữa tháng)")
    a = ap.parse_args()
    d = pd.read_csv(a.file, nrows=a.rows, skiprows=range(1, a.skip + 1) if a.skip else None,
                    usecols=["event_time", "event_type", "product_id", "category_code", "user_id", "user_session"],
                    dtype={"event_type": "string", "user_session": "string", "category_code": "string"})
    d = d.dropna(subset=["user_session"])
    vc = d["event_type"].value_counts()
    has = d.groupby("user_session")["event_type"].agg(lambda s: frozenset(s))
    buy = has[has.apply(lambda s: "purchase" in s)]
    key = ["user_session", "product_id"]
    pur = d[d.event_type == "purchase"][key].drop_duplicates()
    crt = d[d.event_type == "cart"][key].drop_duplicates()
    m = pur.merge(crt, on=key, how="left", indicator=True)
    res = {
        "file": a.file, "rows": int(len(d)), "time_range": [d["event_time"].min(), d["event_time"].max()],
        "event_counts": {k: int(v) for k, v in vc.items()},
        "cart_per_purchase": round(float(vc.get("cart", 0) / max(vc.get("purchase", 1), 1)), 3),
        "purchase_sessions_without_any_cart": round(float((~buy.apply(lambda s: "cart" in s)).mean()), 4),
        "purchases_with_same_product_cart_in_session": round(float((m["_merge"] == "both").mean()), 4),
        "has_remove_from_cart": bool(vc.get("remove_from_cart", 0) > 0),
        "uncoded_share": round(float(d["category_code"].isna().mean()), 4),
    }
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
