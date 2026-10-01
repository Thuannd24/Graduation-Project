"""Đo trên dữ liệu người dùng THẬT 2 chỉ số mà tools/data-seed/lib/fidelity.mjs dùng làm "ngưỡng chống tái
phát" (REGRESSION_GUARDS) — trước đây đặt theo lỗi cũ (recency 0,2754 / lặp liên tiếp 8,82%) chứ CHƯA từng đo
trên dữ liệu thật. Khi thêm độ phổ biến đuôi dài, recency trên dữ liệu sinh tăng tự nhiên (SP hot hay được xem
lại) → cần biết giá trị THẬT để không "sửa" dữ liệu sai hướng.

Đúng giao thức fidelity.mjs: mỗi user, chuỗi sự kiện VIEW/CART theo thời gian (bỏ user < 2 sự kiện);
  - recency recall@10: item CUỐI có nằm trong 10 item phân biệt gần nhất trước đó không;
  - % lặp liên tiếp: tỉ lệ cặp kề nhau cùng item.
REES46: view+cart; Taobao: pv+cart. Lấy mẫu user (băm id) để RAM nhỏ.
Kết quả: data/experiment-results/behavior_patterns/recency_baseline.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
KAGGLE = f"{ROOT}/data/kaggle-cache/datasets"
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/recency_baseline.json"
USER_SAMPLE_MOD = int(os.environ.get("USER_SAMPLE_MOD", "10"))  # giữ user có id % MOD == 0 (~10%)


def metrics(df: pd.DataFrame) -> dict:
    df = df.sort_values(["user", "ts"], kind="stable")
    users = df["user"].to_numpy()
    items = df["item"].to_numpy()
    bounds = np.flatnonzero(np.diff(users)) + 1
    starts = np.concatenate([[0], bounds])
    ends = np.concatenate([bounds, [len(users)]])
    pairs = repeat = 0
    n_eval = hits = 0
    for s, e in zip(starts, ends):
        if e - s < 2:
            continue
        seq = items[s:e]
        pairs += len(seq) - 1
        repeat += int((seq[1:] == seq[:-1]).sum())
        target = seq[-1]
        seen, ranked = set(), []
        for it in seq[-2::-1]:
            if it not in seen:
                seen.add(it)
                ranked.append(it)
                if len(ranked) == 10:
                    break
        n_eval += 1
        hits += int(target in seen)
    return {"users_eval": n_eval, "recency_recall_at10": round(hits / n_eval, 4),
            "consecutive_repeat_rate": round(repeat / pairs, 4), "events": int(len(df))}


def load_rees46(files: list[str]) -> pd.DataFrame:
    parts = []
    for f in files:
        for ch in pd.read_csv(f, usecols=["event_time", "event_type", "product_id", "user_id"],
                              dtype={"event_type": "category", "product_id": "int64", "user_id": "int64"},
                              chunksize=2_000_000):
            ch = ch[ch.event_type.isin(["view", "cart"]) & (ch.user_id % USER_SAMPLE_MOD == 0)]
            parts.append(pd.DataFrame({"user": ch.user_id.to_numpy(), "item": ch.product_id.to_numpy(),
                                       "ts": pd.to_datetime(ch.event_time.str.slice(0, 19)).to_numpy()}))
        print(f"  xong {os.path.basename(f)}", flush=True)
    return pd.concat(parts, ignore_index=True)


def load_taobao(path: str, nrows: int) -> pd.DataFrame:
    parts = []
    for ch in pd.read_csv(path, header=None, names=["user", "item", "cat", "type", "ts"], usecols=["user", "item", "type", "ts"],
                          dtype={"type": "category"}, chunksize=2_000_000, nrows=nrows):
        ch = ch[ch.type.isin(["pv", "cart"]) & (ch.user % USER_SAMPLE_MOD == 0)]
        parts.append(ch[["user", "item", "ts"]])
    return pd.concat(parts, ignore_index=True)


def main() -> None:
    out = {"_meta": {"user_sample": f"user_id % {USER_SAMPLE_MOD} == 0", "protocol": "giống fidelity.mjs"}}
    t = time.time()
    print("=== REES46 mỹ phẩm 5 tháng", flush=True)
    cos = [f"{KAGGLE}/mkechinov/ecommerce-events-history-in-cosmetics-shop/versions/6/{m}.csv"
           for m in ("2019-Oct", "2019-Nov", "2019-Dec", "2020-Jan", "2020-Feb")]
    out["rees46_cosmetics_5_months"] = metrics(load_rees46(cos)); print(out["rees46_cosmetics_5_months"], f"{time.time()-t:.0f}s", flush=True)
    print("=== REES46 đa ngành 10/2019", flush=True)
    mc = [f"{KAGGLE}/mkechinov/ecommerce-behavior-data-from-multi-category-store/versions/8/2019-Oct.csv"]
    out["rees46_multi_category_2019_10"] = metrics(load_rees46(mc)); print(out["rees46_multi_category_2019_10"], f"{time.time()-t:.0f}s", flush=True)
    print("=== Taobao 20 triệu dòng đầu", flush=True)
    out["taobao_first_20m"] = metrics(load_taobao(f"{KAGGLE}/gogokerry/taobao-user-behavior/versions/1/UserBehavior.csv", 20_000_000))
    print(out["taobao_first_20m"], f"{time.time()-t:.0f}s", flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
