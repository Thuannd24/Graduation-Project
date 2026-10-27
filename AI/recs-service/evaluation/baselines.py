"""Baseline — "đối thủ đơn giản" mà SASRec phải thắng thì mới có giá trị.

Mọi model có cùng giao diện: `fit(train_seqs, n_items)` rồi `recommend_many(cases, k, exclude_seen)`.
`exclude_seen=True` (track explore) -> loại item đã có trong lịch sử, giống tầng SASRec lúc phục vụ."""
from __future__ import annotations

import math
from collections import Counter, defaultdict

import numpy as np

from evaluation.protocol import Case


class Recommender:
    name = "base"

    def fit(self, train_seqs: dict[str, list[int]], n_items: int) -> "Recommender":
        counts = np.zeros(n_items)
        for seq in train_seqs.values():
            for i in seq:
                counts[i] += 1
        self.popularity = counts
        self._pop_rank = list(np.argsort(-counts, kind="stable"))
        return self

    def candidates(self, history: list[int]) -> list[int]:
        """Item xếp hạng theo model, chưa loại gì; phần còn thiếu sẽ được bù bằng popularity."""
        return []

    def rank(self, history: list[int], k: int, exclude_seen: bool) -> list[int]:
        seen = set(history) if exclude_seen else set()
        out, used = [], set()
        for source in (self.candidates(history), self._pop_rank):
            for i in source:
                if i in used or i in seen:
                    continue
                out.append(i)
                used.add(i)
                if len(out) == k:
                    return out
        return out

    def recommend_many(self, cases: list[Case], k: int, exclude_seen: bool) -> list[list[int]]:
        return [self.rank(c.history, k, exclude_seen) for c in cases]


class Popularity(Recommender):
    name = "Popularity"


class Recency(Recommender):
    """Đưa lại item vừa xem, mới nhất trước (tầng "recent" của recs-service). KHÔNG bù popularity — service
    thật cũng chỉ trả item đã xem. Theo định nghĩa không thể trúng ở track explore."""
    name = "Recency"

    def rank(self, history: list[int], k: int, exclude_seen: bool) -> list[int]:
        return [] if exclude_seen else list(dict.fromkeys(reversed(history)))[:k]


class Markov1(Recommender):
    """Item hay xuất hiện NGAY SAU item cuối cùng trong lịch sử."""
    name = "Markov-1"

    def fit(self, train_seqs, n_items):
        super().fit(train_seqs, n_items)
        self.next = defaultdict(Counter)
        for seq in train_seqs.values():
            for a, b in zip(seq, seq[1:]):
                if a != b:
                    self.next[a][b] += 1
        return self

    def candidates(self, history):
        return [b for b, _ in self.next[history[-1]].most_common()] if history else []


class CategoryPop(Recommender):
    """Item phổ biến nhất trong CÙNG category với item cuối cùng."""
    name = "Category-Pop"

    def __init__(self, item_category: dict[int, object]):
        self.item_category = item_category  # index nội bộ -> category

    def fit(self, train_seqs, n_items):
        super().fit(train_seqs, n_items)
        self.by_cat = defaultdict(list)
        for i in self._pop_rank:
            self.by_cat[self.item_category.get(int(i))].append(i)
        return self

    def candidates(self, history):
        return self.by_cat.get(self.item_category.get(history[-1]), []) if history else []


class ItemKNN(Recommender):
    """Item-item đồng xuất hiện: hai item cùng nằm trong một cửa sổ `window` bước của một chuỗi.
    sim(a, b) = c(a,b) / sqrt(c(a) * c(b)) (cosine). Điểm của ứng viên = tổng sim với `n_last` item gần
    nhất, item càng gần càng nặng (1/vị trí). Hai siêu tham số được tune trên tập val (xem run.py)."""

    def __init__(self, window: int = 3, n_last: int = 3, top_neighbors: int = 100):
        self.window, self.n_last, self.top_neighbors = window, n_last, top_neighbors
        self.name = f"ItemKNN(w={window},L={n_last})"

    def fit(self, train_seqs, n_items):
        super().fit(train_seqs, n_items)
        co = defaultdict(Counter)
        for seq in train_seqs.values():
            for pos, a in enumerate(seq):
                for b in seq[pos + 1: pos + 1 + self.window]:
                    if a != b:
                        co[a][b] += 1
                        co[b][a] += 1
        pop = self.popularity
        self.sim = {
            a: sorted(((b, c / math.sqrt(pop[a] * pop[b])) for b, c in nbrs.items()), key=lambda x: -x[1])[: self.top_neighbors]
            for a, nbrs in co.items()
        }
        return self

    def candidates(self, history):
        scores = defaultdict(float)
        for distance, a in enumerate(reversed(history[-self.n_last:])):
            for b, s in self.sim.get(a, ()):
                scores[b] += s / (distance + 1)
        return sorted(scores, key=lambda b: -scores[b])
