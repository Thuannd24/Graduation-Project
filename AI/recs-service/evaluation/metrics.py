"""Metric xếp hạng trên TOÀN catalog (không lấy mẫu negative khi đánh giá) + độ tin cậy.

Một case có đúng 1 target nên HR@K = Recall@K. Mọi hàm nhận `recs` là list index item đã xếp hạng."""
from __future__ import annotations

import numpy as np


def case_metrics(recs: list[int], target: int) -> dict[str, float]:
    rank = recs.index(target) + 1 if target in recs else None
    return {
        "HR@10": float(rank is not None and rank <= 10),
        "HR@20": float(rank is not None and rank <= 20),
        "NDCG@10": 1.0 / np.log2(rank + 1) if rank is not None and rank <= 10 else 0.0,
        "MRR@20": 1.0 / rank if rank is not None and rank <= 20 else 0.0,
    }


def coverage(rec_lists: list[list[int]], n_items: int, k: int = 10) -> float:
    """Tỉ lệ catalog từng xuất hiện trong top-k của ít nhất 1 user."""
    return len({i for recs in rec_lists for i in recs[:k]}) / n_items if n_items else 0.0


def gini(rec_lists: list[list[int]], n_items: int, k: int = 10) -> float:
    """Độ bất bình đẳng số lần được gợi ý giữa các item: 0 = đều, 1 = dồn hết vào 1 item."""
    counts = np.zeros(n_items)
    for recs in rec_lists:
        for i in recs[:k]:
            counts[i] += 1
    if counts.sum() == 0:
        return 0.0
    counts = np.sort(counts)
    n = len(counts)
    return float((2 * np.arange(1, n + 1) - n - 1).dot(counts) / (n * counts.sum()))


def arp(rec_lists: list[list[int]], popularity: np.ndarray, k: int = 10) -> float:
    """Average Recommendation Popularity: độ phổ biến (tỉ lệ tương tác trong train) trung bình của item
    được gợi ý — cao nghĩa là model thiên về món phổ biến (popularity bias)."""
    share = popularity / popularity.sum() if popularity.sum() else popularity
    vals = [share[i] for recs in rec_lists for i in recs[:k]]
    return float(np.mean(vals)) if vals else 0.0


def bootstrap_ci(values, n_boot: int = 2000, seed: int = 0) -> tuple[float, float]:
    values = np.asarray(values, dtype=float)
    if len(values) == 0:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    means = values[rng.integers(0, len(values), size=(n_boot, len(values)))].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def paired_delta(a, b, n_boot: int = 5000, seed: int = 0) -> dict[str, float]:
    """Chênh lệch ghép cặp a - b trên CÙNG các case (bootstrap theo case). CI không chứa 0 thì mới nói
    được một bên hơn bên kia."""
    d = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    lo, hi = bootstrap_ci(d, n_boot=n_boot, seed=seed)
    return {"delta": float(d.mean()), "ci95": (lo, hi), "significant": bool(lo > 0 or hi < 0)}
