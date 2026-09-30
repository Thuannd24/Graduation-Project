"""Đo QUY LUẬT hành vi thật từ Taobao UserBehavior — dùng để CROSS-VALIDATE các con số đã đo từ
REES46 Cosmetics (`recsys_measure_behavior_patterns.py`) trước khi tin dùng để lái
`tools/data-seed/lib/simulate.mjs`. Xem plan đầy đủ tại thời điểm viết script này (2026-09-22):
không kết luận quy luật hành vi phổ quát chỉ từ 1 dataset thật duy nhất.

## Khác biệt quan trọng so với REES46 — đọc trước khi diễn giải số liệu

1. **Không có `session_id`** trong dữ liệu gốc (khác REES46 có sẵn) — phải SUY LUẬN phiên bằng
   ngưỡng khoảng cách thời gian (`SESSION_GAP_SECONDS` = 1800s = 30 phút không hoạt động = phiên
   mới), đúng cách đã dùng cho RetailRocket trong lịch sử đồ án. Đây là NGUỒN NHIỄU BỔ SUNG — các
   số liên quan trực tiếp tới RANH GIỚI phiên (độ dài phiên, số view trước cart) kém tin cậy hơn
   REES46 (phiên thật). Category-stickiness ít nhạy với lỗi này hơn (không phụ thuộc ranh giới
   phiên đặt đúng chỗ hay không, chỉ phụ thuộc THỨ TỰ sự kiện — vốn có thật trong dữ liệu).
2. **Không có action "đổi ý"** kiểu `remove_from_cart` — Taobao chỉ có {pv, cart, fav, buy}.
3. **`fav` (yêu thích)** không có tương đương trong tracker của platform — CHỈ ghi nhận tỉ lệ để
   tham khảo, KHÔNG dùng để hiệu chỉnh tham số nào của simulator.

## An toàn bộ nhớ cho file 3,67GB / 100.150.807 dòng

Đã XÁC MINH (không đoán) dữ liệu được nhóm sẵn theo `user_id` (mỗi user chiếm 1 khối liền mạch)
trước khi viết script này. Nhờ vậy xử lý được theo luồng (`pandas.read_csv(chunksize=...)`) mà
KHÔNG cần sort lại toàn bộ file: giữ lại phần dữ liệu DỞ DANG của user cuối cùng mỗi chunk (có thể
chưa đọc hết vì phần còn lại nằm ở chunk sau), nối vào đầu chunk kế tiếp trước khi xử lý.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

TAOBAO_PATH = os.environ.get(
    "TAOBAO_PATH",
    "d:/JAVA/Graduation-Project/data/kaggle-cache/datasets/gogokerry/taobao-user-behavior/versions/1/UserBehavior.csv",
)
OUT_PATH = os.environ.get("BEHAVIOR_PATTERNS_TAOBAO_PATH", "/tmp/behavior_patterns_taobao.json")
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "5000000"))
MAX_ROWS = int(os.environ.get("MAX_ROWS", "0"))  # 0 = doc het; dat >0 de smoke-test nhanh
SESSION_GAP_SECONDS = 1800  # 30 phut khong hoat dong = phien moi (giong quy uoc RetailRocket)

COLUMNS = ["user_id", "item_id", "category_id", "behavior_type", "ts"]

session_lengths: list[int] = []
views_before_first_cart: list[int] = []
cart_same_as_last_view = 0
cart_diff_from_last_view = 0
cart_no_prior_view = 0
same_category_as_prev = 0
diff_category_as_prev = 0
n_fav_events = 0
n_total_events = 0
# Ty le "xem ma khong them gio trong cung phien" -- CUNG dinh nghia voi REES46 (abandonment_rate),
# them 2026-09-30 de doi chieu: REES46 (my pham) co ty le cart/view cao bat thuong, can nguon thu 2.
viewed_items_total = 0
viewed_never_carted = 0
behavior_counts: dict[str, int] = {}


def process_user_group(df_user: pd.DataFrame) -> None:
    """Xu ly TOAN BO du lieu cua 1 user (da chac chan day du, khong con o ranh gioi chunk):
    suy luan phien theo ngan gap 30 phut, roi tich luy dung cac chi so nhu script REES46."""
    global cart_same_as_last_view, cart_diff_from_last_view, cart_no_prior_view
    global same_category_as_prev, diff_category_as_prev, n_fav_events, n_total_events
    global viewed_items_total, viewed_never_carted

    df_user = df_user.sort_values("ts")
    n_total_events += len(df_user)
    n_fav_events += int((df_user["behavior_type"] == "fav").sum())
    for bt, c in df_user["behavior_type"].value_counts().items():
        behavior_counts[str(bt)] = behavior_counts.get(str(bt), 0) + int(c)

    ts = df_user["ts"].to_numpy()
    gaps = np.diff(ts)
    session_break = np.concatenate([[True], gaps > SESSION_GAP_SECONDS])
    session_ids = np.cumsum(session_break)
    df_user = df_user.assign(_session=session_ids)

    for _sid, grp in df_user.groupby("_session", sort=False):
        n = len(grp)
        session_lengths.append(n)

        viewed_items_in_session: dict[int, bool] = {}
        last_view_item = None
        first_cart_seen = False
        n_distinct_before_first_cart = 0
        prev_category = None

        for row in grp.itertuples(index=False):
            etype, pid, cid = row.behavior_type, row.item_id, row.category_id
            if prev_category is not None:
                if cid == prev_category:
                    same_category_as_prev += 1
                else:
                    diff_category_as_prev += 1
            prev_category = cid

            if etype == "pv":
                if pid not in viewed_items_in_session:
                    viewed_items_in_session[pid] = False
                    if not first_cart_seen:
                        n_distinct_before_first_cart += 1
                last_view_item = pid
            elif etype in ("cart", "buy"):
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
            # 'fav' khong tinh vao cac chi so tren (khong tuong duong action nao cua platform)

        for was_carted in viewed_items_in_session.values():
            viewed_items_total += 1
            if not was_carted:
                viewed_never_carted += 1


if __name__ == "__main__":
    print(f"Doc {TAOBAO_PATH} theo chunk {CHUNK_SIZE:,} dong ...")
    reader = pd.read_csv(
        TAOBAO_PATH, header=None, names=COLUMNS,
        dtype={"user_id": "int64", "item_id": "int64", "category_id": "int64",
               "behavior_type": "category", "ts": "int64"},
        chunksize=CHUNK_SIZE,
    )

    pending = None  # DataFrame cua user CUOI CUNG chunk truoc, co the chua doc het
    rows_read = 0
    for chunk_idx, chunk in enumerate(reader):
        if pending is not None:
            chunk = pd.concat([pending, chunk], ignore_index=True)

        last_user_in_chunk = chunk["user_id"].iloc[-1]
        is_pending_mask = chunk["user_id"] == last_user_in_chunk
        complete_part = chunk[~is_pending_mask]
        pending = chunk[is_pending_mask].copy()

        for uid, df_user in complete_part.groupby("user_id", sort=False):
            process_user_group(df_user)

        rows_read += len(chunk) - len(pending)
        print(f"  chunk {chunk_idx+1}: da xu ly {rows_read:,} dong | "
              f"{len(session_lengths):,} phien suy luan duoc tich luy")

        if MAX_ROWS and rows_read >= MAX_ROWS:
            print(f"  MAX_ROWS={MAX_ROWS:,} dat toi, dung som (smoke-test)")
            pending = None
            break

    if pending is not None and len(pending) > 0:
        for uid, df_user in pending.groupby("user_id", sort=False):
            process_user_group(df_user)

    # ============ Tong hop ket qua, cung dinh dang voi ban REES46 de so sanh truc tiep ============
    PCTS = list(range(0, 101, 5))

    def percentile_curve(values: list[float]) -> list[float] | None:
        if not values:
            return None
        return [float(np.percentile(values, p)) for p in PCTS]

    total_cart_events = cart_same_as_last_view + cart_diff_from_last_view + cart_no_prior_view
    total_cat_transitions = same_category_as_prev + diff_category_as_prev

    results = {
        "source": "Taobao UserBehavior (100.150.807 dong, phien SUY LUAN tu ngan gap 30 phut)",
        "n_events_processed": n_total_events,
        "n_sessions": len(session_lengths),
        "percentile_levels": PCTS,
        "session_length": {
            "median": float(np.median(session_lengths)) if session_lengths else None,
            "mean": float(np.mean(session_lengths)) if session_lengths else None,
            "p90": float(np.percentile(session_lengths, 90)) if session_lengths else None,
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
            "total_cart_events": total_cart_events,
            "pct_same_as_last_view": cart_same_as_last_view / max(1, total_cart_events),
            "pct_different_seen": cart_diff_from_last_view / max(1, total_cart_events),
            "pct_no_prior_view": cart_no_prior_view / max(1, total_cart_events),
        },
        "category_stickiness": {
            "same_category_as_prev_event": same_category_as_prev,
            "diff_category_as_prev_event": diff_category_as_prev,
            "p_same_category": same_category_as_prev / max(1, total_cat_transitions),
        },
        "abandonment_rate": {
            "total_viewed_items": viewed_items_total,
            "never_carted": viewed_never_carted,
            "rate": viewed_never_carted / max(1, viewed_items_total),
        },
        "behavior_mix": {k: {"n": v, "share": v / max(1, n_total_events)} for k, v in sorted(behavior_counts.items())},
        "fav_rate_reference_only": {
            "n_fav_events": n_fav_events,
            "rate_of_all_events": n_fav_events / max(1, n_total_events),
            "note": "Khong dung de hieu chinh tham so nao - platform chua co action tuong duong",
        },
    }

    print(json.dumps(results, indent=2, ensure_ascii=False))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nDa luu {OUT_PATH}")
