"""Chia dữ liệu theo THỜI GIAN TOÀN CỤC (global temporal split) — thay leave-last-out của script cũ.

Leave-last-out lấy món cuối của MỖI user làm test, nên model được train trên hành vi của user khác xảy ra
SAU thời điểm cần đoán (rò rỉ tương lai). Ở đây mọi thứ train phải xảy ra trước một mốc thời gian chung:

    |--------------- train ---------------|---- val ----|---- test ----|
                                        t_val          t_test

- Mọi model (cả baseline) chỉ FIT trên event < t_val.
- Val (dừng sớm / tune): lịch sử = event < t_val, target = event ĐẦU TIÊN trong [t_val, t_test).
- Test: lịch sử = event < t_test (có cả giai đoạn val — giống lúc phục vụ thật, Redis có mọi thứ
  đã xảy ra), target = event ĐẦU TIÊN >= t_test. Trọng số model KHÔNG train lại trên giai đoạn val.
- Target là item chưa từng xuất hiện trong train (item lạnh) thì không model nào đoán được -> loại khỏi
  đánh giá, nhưng ĐẾM và báo cáo riêng.

Mỗi case thuộc một trong hai track (quyết định D1 trong plan):
- explore: target CHƯA có trong lịch sử của user — mọi model loại item đã xem (như tab "Gợi ý cho bạn").
- repeat:  target ĐÃ có trong lịch sử — không loại gì (như tab "Xem gần đây").
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class Case:
    user: str
    history: list[int]  # index nội bộ, CŨ -> MỚI
    target: int

    @property
    def is_repeat(self) -> bool:
        return self.target in set(self.history)


@dataclass
class Split:
    train_seqs: dict[str, list[int]]
    val: list[Case]
    test: list[Case]
    n_items: int
    item_index: dict[int, int]  # item id thật -> index nội bộ 0..n_items-1
    stats: dict = field(default_factory=dict)

    def cases(self, which: str, track: str) -> list[Case]:
        cases = self.val if which == "val" else self.test
        return [c for c in cases if c.is_repeat == (track == "repeat")]


def _quantile_time(ts: pd.Series, q: float) -> pd.Timestamp:
    return pd.Timestamp(np.quantile(ts.values.astype("int64"), q).astype("int64"))


def temporal_split(df: pd.DataFrame, q_val: float = 0.8, q_test: float = 0.9) -> Split:
    """`df` có cột (user_id, item_id, ts), đã sort theo ts (xem data._normalise)."""
    t_val, t_test = _quantile_time(df["ts"], q_val), _quantile_time(df["ts"], q_test)
    train_df = df[df["ts"] < t_val]

    item_index = {item: i for i, item in enumerate(sorted(train_df["item_id"].unique()))}
    train_seqs = {u: [item_index[i] for i in g["item_id"]] for u, g in train_df.groupby("user_id", sort=False)}

    def build_cases(history_df: pd.DataFrame, target_df: pd.DataFrame) -> tuple[list[Case], int]:
        histories = {u: [item_index[i] for i in g["item_id"] if i in item_index]
                     for u, g in history_df.groupby("user_id", sort=False)}
        firsts = target_df.groupby("user_id", sort=False).head(1)
        cases, cold = [], 0
        for user, item in zip(firsts["user_id"], firsts["item_id"]):
            history = histories.get(user)
            if not history:
                continue  # user chưa có lịch sử trước mốc: bài toán cold-start user, không thuộc protocol này
            if item not in item_index:
                cold += 1
                continue
            cases.append(Case(user, history, item_index[item]))
        return cases, cold

    val, cold_val = build_cases(train_df, df[(df["ts"] >= t_val) & (df["ts"] < t_test)])
    test, cold_test = build_cases(df[df["ts"] < t_test], df[df["ts"] >= t_test])

    stats = {
        "events": len(df), "users": df["user_id"].nunique(), "items_train": len(item_index),
        "train_events": len(train_df), "t_val": str(t_val), "t_test": str(t_test),
        "val_cases": len(val), "test_cases": len(test),
        "cold_target_dropped": {"val": cold_val, "test": cold_test},
        "test_repeat_rate": round(float(np.mean([c.is_repeat for c in test])), 4) if test else None,
    }
    return Split(train_seqs, val, test, len(item_index), item_index, stats)
