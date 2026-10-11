"""Đo hành vi XEM LẠI trên REES46 (phiên THẬT) — hiệu chỉnh bộ sinh dataset theo đúng cách web ghi log.

Bối cảnh (2026-10-01): recency recall@10 thật REES46 ≈ 0,49–0,51, lặp liên tiếp 19–31%; Taobao 0,169 / 0,3%.
Taobao đã LỌC TRÙNG sự kiện liền nhau, REES46 ghi nguyên mọi lượt tải trang. Web đồ án ghi giống REES46
(product-service phát product-viewed-events MỖI lần GET chi tiết SP, behavior_consumer.py ghi thẳng
user_events, không lọc) → các chỉ số chịu ảnh hưởng của lượt xem lặp phải lấy theo REES46.

Đo (sự kiện view, theo phiên user_session, sắp theo thời gian; mẫu user_id % 10 == 0):
  - p_repeat_prev     : P(view kế tiếp = ĐÚNG item của view trước) trên các cặp view→view trong phiên
  - p_revisit_session : P(view = item đã xem trước đó trong phiên nhưng KHÔNG phải ngay trước)
  - p_revisit_history : P(view đầu tiên của 1 item trong phiên = item đã xem ở PHIÊN CŨ của user)
  - stickiness_all / stickiness_distinct : P(cùng category) trên mọi cặp kề nhau / chỉ cặp KHÁC item
    (kiểm giả thuyết: bỏ cặp trùng item thì REES46 ≈ Taobao 0,471)
Kết quả: data/experiment-results/behavior_patterns/revisit_patterns.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
COS = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6"
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/revisit_patterns.json"
MOD = 10


def main() -> None:
    t = time.time()
    parts = []
    for m in ("2019-Oct", "2019-Nov", "2019-Dec", "2020-Jan", "2020-Feb"):
        for ch in pd.read_csv(f"{COS}/{m}.csv", usecols=["event_time", "event_type", "product_id", "category_id", "user_id", "user_session"],
                              dtype={"event_type": "category", "user_session": "string"}, chunksize=2_000_000):
            ch = ch[(ch.event_type == "view") & (ch.user_id % MOD == 0) & ch.user_session.notna()]
            parts.append(ch[["event_time", "product_id", "category_id", "user_id", "user_session"]])
        print(f"  xong {m} ({time.time()-t:.0f}s)", flush=True)
    df = pd.concat(parts, ignore_index=True)
    df["ts"] = pd.to_datetime(df.event_time.str.slice(0, 19))
    df = df.sort_values(["user_id", "ts"], kind="stable").reset_index(drop=True)

    pairs = same_item = revisit_sess = views_after_first = 0
    same_cat_all = same_cat_distinct = distinct_pairs = 0
    first_in_session = from_history = 0
    for uid, g in df.groupby("user_id", sort=False):
        seen_history: set = set()
        for sid, s in g.groupby("user_session", sort=False):
            items = s.product_id.to_numpy()
            cats = s.category_id.to_numpy()
            seen_sess: set = set()
            for i, it in enumerate(items):
                if i > 0:
                    pairs += 1
                    views_after_first += 1
                    if it == items[i - 1]:
                        same_item += 1
                    elif it in seen_sess:
                        revisit_sess += 1
                    if cats[i] == cats[i - 1]:
                        same_cat_all += 1
                    if it != items[i - 1]:
                        distinct_pairs += 1
                        same_cat_distinct += int(cats[i] == cats[i - 1])
                if it not in seen_sess:
                    first_in_session += 1
                    from_history += int(it in seen_history)
                seen_sess.add(it)
            seen_history |= seen_sess
    out = {
        "source": "REES46 cosmetics 5 tháng, view, mẫu user_id % 10 == 0",
        "views": int(len(df)), "users": int(df.user_id.nunique()),
        "p_repeat_prev": round(same_item / pairs, 4),
        "p_revisit_session": round(revisit_sess / views_after_first, 4),
        "p_revisit_history": round(from_history / first_in_session, 4),
        "stickiness_all": round(same_cat_all / pairs, 4),
        "stickiness_distinct": round(same_cat_distinct / distinct_pairs, 4),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps(out, ensure_ascii=False, indent=1), f"{time.time()-t:.0f}s", flush=True)


if __name__ == "__main__":
    main()
