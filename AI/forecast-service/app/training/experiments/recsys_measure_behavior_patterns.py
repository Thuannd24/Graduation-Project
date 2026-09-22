"""Đo QUY LUẬT hành vi thật từ REES46 Cosmetics (5 tháng) — dùng để lái bộ mô phỏng
`tools/data-seed/lib/simulate.mjs`, thay cho luật tay đoán mò hiện tại (xem thảo luận
2026-09-22: `view X -> cart X` cố định 100% là nguyên nhân recency-baseline thắng áp đảo).

## Nguyên tắc — CHỈ đo thống kê KHÔNG PHỤ THUỘC đơn vị phân loại cụ thể

Catalog của REES46 (mỹ phẩm) và catalog của platform (điện thoại/laptop) khác hẳn nhau — không thể
bê nguyên ma trận chuyển đổi category→category cụ thể. Chỉ đo các con số CẤU TRÚC, áp dụng được
cho MỌI catalog:
  1. Độ dài phiên (số sự kiện/session)
  2. Số sản phẩm PHÂN BIỆT được xem trước khi thêm giỏ lần đầu trong phiên (độ sâu so sánh)
  3. Item được thêm giỏ có phải ĐÚNG item vừa xem gần nhất không, hay là item KHÁC đã xem, hay
     KHÔNG xem trước (thêm thẳng từ danh sách)
  4. Tỉ lệ "dính category" — sự kiện kế tiếp trong phiên có CÙNG category với sự kiện trước không
     (bất kể category cụ thể là gì — đây là điểm mấu chốt để portable sang catalog khác)
  5. Tỉ lệ bỏ dở (item được xem nhưng KHÔNG BAO GIỜ thêm giỏ trong phiên đó)
  6. Khoảng cách quay lại (gap giữa 2 phiên liên tiếp của CÙNG 1 user, theo ngày)

## An toàn bộ nhớ

Xử lý TỪNG THÁNG, groupby theo user_session (không phải user_id — session mới là đơn vị phân
tích ở đây), tích luỹ CHỈ các số liệu tổng hợp (không giữ lại toàn bộ session objects), gc.collect()
sau mỗi tháng — theo đúng pattern đã dùng an toàn ở `cosmetics_build_dataset.py`.
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
OUT_PATH = os.environ.get("BEHAVIOR_PATTERNS_PATH", "/tmp/behavior_patterns.json")

# Tich luy qua tung thang — CHI so lieu tong hop, khong giu du lieu tho
session_lengths: list[int] = []
views_before_first_cart: list[int] = []  # so item PHAN BIET da xem truoc lan cart dau tien/phien
cart_same_as_last_view = 0
cart_diff_from_last_view = 0
cart_no_prior_view = 0
same_category_as_prev = 0
diff_category_as_prev = 0
abandoned_views = 0  # item xem nhung KHONG BAO GIO cart trong phien
total_viewed_items = 0
user_last_session_end: dict[int, pd.Timestamp] = {}
return_gap_days: list[float] = []

if __name__ == "__main__":
    for fname in MONTH_FILES:
        fname = fname.strip()
        path = os.path.join(COSMETICS_DIR, fname)
        print(f"Doc {fname} ...")
        df = pd.read_csv(
            path,
            usecols=["event_time", "event_type", "product_id", "category_id", "user_id", "user_session"],
            dtype={"product_id": "int64", "category_id": "int64", "user_id": "int64"},
        )
        df = df[df["event_type"].isin(["view", "cart", "purchase"])]
        df["event_time"] = pd.to_datetime(df["event_time"])
        df = df.sort_values(["user_session", "event_time"])
        print(f"  {len(df):,} dong view/cart/purchase")

        # --- Phan tich TUNG PHIEN ---
        for session_id, grp in df.groupby("user_session", sort=False):
            n = len(grp)
            if n < 1:
                continue
            session_lengths.append(n)

            events = list(zip(grp["event_type"], grp["product_id"], grp["category_id"]))
            viewed_items_in_session: dict[int, bool] = {}  # product_id -> da tung cart chua
            last_view_item = None
            first_cart_seen = False
            n_distinct_before_first_cart = 0
            prev_category = None

            for etype, pid, cid in events:
                if prev_category is not None:
                    if cid == prev_category:
                        same_category_as_prev += 1
                    else:
                        diff_category_as_prev += 1
                prev_category = cid

                if etype == "view":
                    if pid not in viewed_items_in_session:
                        viewed_items_in_session[pid] = False
                        if not first_cart_seen:
                            n_distinct_before_first_cart += 1
                    last_view_item = pid
                elif etype in ("cart", "purchase"):
                    if not first_cart_seen:
                        views_before_first_cart.append(n_distinct_before_first_cart)
                        first_cart_seen = True
                    if pid in viewed_items_in_session:
                        viewed_items_in_session[pid] = True
                        if pid == last_view_item:
                            cart_same_as_last_view += 1
                        else:
                            cart_diff_from_last_view += 1
                    else:
                        cart_no_prior_view += 1

            for pid, was_carted in viewed_items_in_session.items():
                total_viewed_items += 1
                if not was_carted:
                    abandoned_views += 1

            # --- Khoang cach quay lai giua 2 phien cua CUNG 1 user ---
            user_id = grp["user_id"].iloc[0]
            session_start = grp["event_time"].iloc[0]
            session_end = grp["event_time"].iloc[-1]
            if user_id in user_last_session_end:
                gap = (session_start - user_last_session_end[user_id]).total_seconds() / 86400
                if gap > 0:  # bo qua phien chong lan do sap xep khong hoan hao
                    return_gap_days.append(gap)
            user_last_session_end[user_id] = session_end

        del df
        gc.collect()
        print(f"  Tich luy: {len(session_lengths):,} phien, {len(return_gap_days):,} khoang quay lai")

    # Phan vi 0,5,10,...,100 -- de JS lay mau THEO DUNG phan phoi thuc (inverse-CDF), khong fit
    # ho phan phoi tham so tuy tien chi tu 3 con so median/mean/p90.
    PCTS = list(range(0, 101, 5))

    def percentile_curve(values: list[float]) -> list[float] | None:
        if not values:
            return None
        return [float(np.percentile(values, p)) for p in PCTS]

    # ============ Tong hop ket qua ============
    results = {
        "n_sessions": len(session_lengths),
        "percentile_levels": PCTS,
        "session_length": {
            "median": float(np.median(session_lengths)),
            "mean": float(np.mean(session_lengths)),
            "p90": float(np.percentile(session_lengths, 90)),
            "percentiles": percentile_curve(session_lengths),
        },
        "distinct_views_before_first_cart": {
            "median": float(np.median(views_before_first_cart)) if views_before_first_cart else None,
            "mean": float(np.mean(views_before_first_cart)) if views_before_first_cart else None,
            "p90": float(np.percentile(views_before_first_cart, 90)) if views_before_first_cart else None,
            "percentiles": percentile_curve(views_before_first_cart),
        },
        "cart_target_breakdown": {
            "same_as_last_view": cart_same_as_last_view,
            "different_from_last_view_but_seen": cart_diff_from_last_view,
            "no_prior_view_in_session": cart_no_prior_view,
            "total_cart_events": cart_same_as_last_view + cart_diff_from_last_view + cart_no_prior_view,
        },
        "category_stickiness": {
            "same_category_as_prev_event": same_category_as_prev,
            "diff_category_as_prev_event": diff_category_as_prev,
            "p_same_category": same_category_as_prev / max(1, same_category_as_prev + diff_category_as_prev),
        },
        "abandonment_rate": {
            "total_viewed_items": total_viewed_items,
            "never_carted": abandoned_views,
            "rate": abandoned_views / max(1, total_viewed_items),
        },
        "return_gap_days": {
            "median": float(np.median(return_gap_days)) if return_gap_days else None,
            "mean": float(np.mean(return_gap_days)) if return_gap_days else None,
            "p90": float(np.percentile(return_gap_days, 90)) if return_gap_days else None,
            "percentiles": percentile_curve(return_gap_days),
        },
    }

    print(json.dumps(results, indent=2, ensure_ascii=False))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nDa luu {OUT_PATH}")
