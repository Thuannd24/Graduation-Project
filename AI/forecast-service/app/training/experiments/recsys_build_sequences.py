"""Dựng chuỗi hành vi theo user từ `interactions_strong.csv` — đầu vào cho SASRec.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §6.

## Vì sao cần bước riêng này

Mọi baseline (Popularity, ItemKNN) chỉ cần TẬP tương tác (không quan tâm thứ tự). Model chuỗi
(SASRec) cần đúng NGƯỢC LẠI: với mỗi user, một DÃY item theo đúng thứ tự thời gian. Đây là lần
đầu trong Bài toán 3 dữ liệu được tổ chức theo chuỗi thay vì theo tập hợp.

## Giao thức tách theo GTS (đồng bộ với baseline đã đo)

Dùng lại ĐÚNG cutoff = phân vị 0,9 đã dùng cho Popularity/ItemKNN — để so sánh công bằng:
  - Chuỗi TRAIN = mọi item trước cutoff (dùng để dạy next-item)
  - Target = item CUỐI CÙNG mỗi user tương tác SAU cutoff (giống hệt định nghĩa target ở baseline)
  - Loại user có <2 item trong chuỗi train (không đủ để học next-item)
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

INTERACTIONS_PATH = os.environ.get("STRONG_INTERACTIONS_PATH", "/tmp/interactions_strong.csv")
MAPS_PATH = os.environ.get("STRONG_MAPS_PATH", "/tmp/interactions_strong_maps.json")
OUT_PATH = os.environ.get("SEQUENCES_PATH", "/tmp/sequences.npz")
CUTOFF_QUANTILE = 0.9
MIN_TRAIN_LEN = 2

df = pd.read_csv(INTERACTIONS_PATH)
with open(MAPS_PATH, encoding="utf-8") as f:
    maps = json.load(f)
n_users, n_items = maps["n_users"], maps["n_items"]
print(f"{len(df):,} tuong tac | {n_users:,} user | {n_items:,} item")

cutoff = df["ts_epoch"].quantile(CUTOFF_QUANTILE)
df = df.sort_values(["user_idx", "ts_epoch"])

train_df = df[df["ts_epoch"] <= cutoff]
holdout_df = df[df["ts_epoch"] > cutoff]

train_seqs = train_df.groupby("user_idx")["item_idx"].apply(list)
train_seqs = train_seqs[train_seqs.apply(len) >= MIN_TRAIN_LEN]
print(f"User co chuoi train du dai (>={MIN_TRAIN_LEN}): {len(train_seqs):,}")

last_target = holdout_df.sort_values("ts_epoch").groupby("user_idx")["item_idx"].last()
target_users = last_target.index.intersection(train_seqs.index)
print(f"User co CA chuoi train VA target sau cutoff: {len(target_users):,}")

# luu dang npz gon nhe: sequences la list-of-array do dai khac nhau -> luu rieng object array
sequences = np.array([np.array(train_seqs[u], dtype=np.int32) for u in train_seqs.index], dtype=object)
seq_users = train_seqs.index.to_numpy()
target_map = {u: int(last_target[u]) for u in target_users}

lengths = np.array([len(s) for s in sequences])
print(f"Do dai chuoi train: median={np.median(lengths):.0f} | mean={lengths.mean():.2f} | max={lengths.max()}")

np.savez_compressed(
    OUT_PATH,
    seq_users=seq_users,
    sequences=sequences,
    target_users=np.array(list(target_map.keys()), dtype=np.int64),
    target_items=np.array(list(target_map.values()), dtype=np.int64),
    n_users=n_users, n_items=n_items,
)
print(f"Da luu {OUT_PATH}")
