"""Harness đánh giá (GĐ2): metric tính tay, split không rò rỉ thời gian, baseline, smoke test SASRec."""
import math

import numpy as np
import pandas as pd
import pytest

from evaluation.baselines import ItemKNN, Markov1, Popularity, Recency
from evaluation.metrics import case_metrics, coverage, gini, paired_delta
from evaluation.protocol import Case, temporal_split
from evaluation.sasrec_trainer import SASRecConfig, SASRecRecommender


# ---------- metrics ----------
def test_case_metrics_by_hand():
    m = case_metrics([5, 3, 9], target=3)  # trúng ở hạng 2
    assert m["HR@10"] == 1.0
    assert m["NDCG@10"] == pytest.approx(1 / math.log2(3))
    assert m["MRR@20"] == pytest.approx(0.5)
    assert case_metrics([5, 3, 9], target=7) == {"HR@10": 0.0, "HR@20": 0.0, "NDCG@10": 0.0, "MRR@20": 0.0}


def test_coverage_and_gini():
    assert coverage([[0, 1], [1, 2]], n_items=4, k=2) == 0.75
    assert gini([[0], [1], [2], [3]], n_items=4, k=1) == pytest.approx(0.0)  # gợi ý đều
    assert gini([[0], [0], [0], [0]], n_items=4, k=1) > 0.7                 # dồn hết vào 1 item


def test_paired_delta_detects_clear_difference_only():
    assert paired_delta([1] * 50, [0] * 50)["significant"]
    assert not paired_delta([1, 0] * 25, [0, 1] * 25)["significant"]


# ---------- protocol ----------
def _toy_df():
    rows, t0 = [], pd.Timestamp("2026-01-01")
    for u in range(20):
        for step in range(10):
            rows.append((f"u{u}", (u + step) % 7, t0 + pd.Timedelta(hours=10 * step + u)))
    return pd.DataFrame(rows, columns=["user_id", "item_id", "ts"]).sort_values("ts", kind="stable").reset_index(drop=True)


def test_temporal_split_has_no_leakage():
    df = _toy_df()
    split = temporal_split(df)
    t_val, t_test = pd.Timestamp(split.stats["t_val"]), pd.Timestamp(split.stats["t_test"])
    by_user = {u: g for u, g in df.groupby("user_id")}
    train_count = sum(len(s) for s in split.train_seqs.values())
    assert train_count == (df["ts"] < t_val).sum()  # train = đúng các event trước t_val
    inv = {v: k for k, v in split.item_index.items()}
    for c in split.test:
        g = by_user[c.user]
        # lịch sử test = mọi event < t_test của user, theo đúng thứ tự thời gian
        assert [inv[i] for i in c.history] == list(g[g["ts"] < t_test]["item_id"])
        assert inv[c.target] == g[g["ts"] >= t_test]["item_id"].iloc[0]
    for c in split.val:
        g = by_user[c.user]
        assert inv[c.target] == g[(g["ts"] >= t_val) & (g["ts"] < t_test)]["item_id"].iloc[0]


def test_cold_target_is_counted_not_evaluated():
    df = _toy_df()
    late = pd.DataFrame([("u0", 999, df["ts"].max() + pd.Timedelta(hours=1))], columns=df.columns)
    df2 = pd.concat([df[~((df["user_id"] == "u0") & (df["ts"] >= df["ts"].quantile(0.9)))], late]).reset_index(drop=True)
    split = temporal_split(df2.sort_values("ts", kind="stable").reset_index(drop=True))
    assert split.stats["cold_target_dropped"]["test"] >= 1
    assert all(c.user != "u0" for c in split.test)


def test_case_track():
    assert Case("u", [1, 2], 2).is_repeat and not Case("u", [1, 2], 3).is_repeat


# ---------- baselines ----------
TRAIN = {"a": [0, 1, 2, 0, 1, 2], "b": [0, 1, 3], "c": [4, 4, 4, 4]}  # 4 phổ biến nhất (4 lần)


def test_recency_and_exclusion():
    r = Recency().fit(TRAIN, 5)
    assert r.rank([0, 1, 2, 1], 3, exclude_seen=False) == [1, 2, 0]
    assert r.rank([0, 1], 3, exclude_seen=True) == []  # không thể gợi ý món mới


def test_markov_follows_transitions_and_excludes_seen():
    m = Markov1().fit(TRAIN, 5)
    assert m.rank([0], 1, exclude_seen=False) == [1]
    assert 0 not in m.rank([0], 4, exclude_seen=True)


def test_itemknn_and_popularity_fill_to_k():
    knn = ItemKNN(window=1, n_last=1).fit(TRAIN, 5)
    recs = knn.rank([2], 5, exclude_seen=True)
    assert len(recs) == 4 and 2 not in recs
    assert Popularity().fit(TRAIN, 5).rank([], 1, exclude_seen=False) == [4]


# ---------- SASRec ----------
def test_sasrec_trainer_smoke():
    rng = np.random.default_rng(0)
    seqs = {f"u{i}": list(np.tile([0, 1, 2, 3], 4)[rng.integers(0, 4):][:12]) for i in range(30)}
    val = [Case("v", [0, 1, 2], 3)] * 5
    s = SASRecRecommender(SASRecConfig(max_epochs=3, patience=5, batch_size=32), seed=0).fit(seqs, 4, val)
    recs = s.recommend_many([Case("t", [0, 1], 2)], 2, exclude_seen=True)[0]
    assert len(recs) == 2 and not ({0, 1} & set(recs))
    assert s.training_log and "val_explore_ndcg10" in s.training_log[0]
