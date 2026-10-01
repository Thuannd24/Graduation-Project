"""Train + đánh giá SASRec bằng ĐÚNG class `SASRecModel` mà recs-service dùng lúc phục vụ.

Khác `recsys_platform_sasrec.py` (script cũ): dừng sớm theo NDCG@10 trên tập VAL (không theo train loss),
seed điều khiển được để chạy nhiều lần đo độ dao động, và chấm điểm theo lô để đánh giá nhanh."""
from __future__ import annotations

import copy
import os
from dataclasses import asdict, dataclass

import numpy as np
import torch
import torch.nn.functional as F

from app.services.sasrec import SASRecModel
from evaluation.baselines import Recommender
from evaluation.metrics import case_metrics
from evaluation.protocol import Case


@dataclass
class SASRecConfig:
    # Mặc định = cấu hình checkpoint đang phục vụ (recsys_platform_sasrec.py), để đo đúng cái đang chạy.
    # Riêng batch 32 -> 128 cho nhanh trên CPU (ghi rõ khi báo cáo). Ablation để dành cho GĐ3.
    d_model: int = 32
    n_blocks: int = 1
    n_heads: int = 2
    maxlen: int = 15
    n_negatives: int = 50
    lr: float = 1e-3
    batch_size: int = 128
    max_epochs: int = 30
    patience: int = 3


class SASRecRecommender(Recommender):
    def __init__(self, config: SASRecConfig | None = None, seed: int = 0):
        self.config = config or SASRecConfig()
        self.seed = seed
        self.name = f"SASRec(seed={seed})"
        self.training_log: list[dict] = []
        torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))

    # ---------- train ----------
    def fit(self, train_seqs: dict[str, list[int]], n_items: int, val_cases: list[Case] | None = None):
        super().fit(train_seqs, n_items)
        cfg = self.config
        torch.manual_seed(self.seed)
        rng = np.random.default_rng(self.seed)

        seqs = [s for s in train_seqs.values() if len(s) >= 2]
        # mọi tiền tố của mọi chuỗi: (chuỗi, vị trí cần đoán)
        index = np.array([(si, t) for si, s in enumerate(seqs) for t in range(1, len(s))], dtype=np.int64)
        neg_prob = torch.tensor(np.concatenate([[0.0], self.popularity]), dtype=torch.float)
        neg_prob /= neg_prob.sum()

        self.model = SASRecModel(n_items, cfg.d_model, cfg.n_blocks, cfg.n_heads, cfg.maxlen)
        opt = torch.optim.Adam(self.model.parameters(), lr=cfg.lr)
        best_score, best_state, bad_epochs = -1.0, None, 0

        for epoch in range(1, cfg.max_epochs + 1):
            self.model.train()
            order = rng.permutation(len(index))
            total, n_batches = 0.0, 0
            for start in range(0, len(order), cfg.batch_size):
                batch = index[order[start:start + cfg.batch_size]]
                x = self._pad([seqs[si][:t] for si, t in batch])
                y = torch.tensor([seqs[si][t] + 1 for si, t in batch])
                h = self.model(x)[:, -1, :]
                negs = torch.multinomial(neg_prob, len(batch) * cfg.n_negatives, replacement=True).view(len(batch), -1)
                cand = torch.cat([y[:, None], negs], dim=1)
                logits = torch.einsum("bd,bnd->bn", h, self.model.item_emb(cand))
                loss = F.cross_entropy(logits, torch.zeros(len(batch), dtype=torch.long))
                opt.zero_grad()
                loss.backward()
                opt.step()
                total += loss.item()
                n_batches += 1

            entry = {"epoch": epoch, "loss": round(total / max(n_batches, 1), 4)}
            if val_cases:
                explore = [c for c in val_cases if not c.is_repeat]
                recs = self.recommend_many(explore, 10, exclude_seen=True)
                entry["val_explore_ndcg10"] = round(float(np.mean([case_metrics(r, c.target)["NDCG@10"]
                                                                   for r, c in zip(recs, explore)])), 5)
                if entry["val_explore_ndcg10"] > best_score:
                    best_score, best_state, bad_epochs = entry["val_explore_ndcg10"], copy.deepcopy(self.model.state_dict()), 0
                else:
                    bad_epochs += 1
            self.training_log.append(entry)
            if val_cases and bad_epochs >= cfg.patience:
                break

        if best_state is not None:
            self.model.load_state_dict(best_state)
        self.model.eval()
        self.best_epoch = max(self.training_log, key=lambda e: e.get("val_explore_ndcg10", -1))["epoch"]
        return self

    # ---------- inference ----------
    def _pad(self, histories: list[list[int]]) -> torch.Tensor:
        maxlen = self.config.maxlen
        x = torch.zeros((len(histories), maxlen), dtype=torch.long)
        for row, hist in enumerate(histories):
            tail = hist[-maxlen:]  # lịch sử CŨ -> MỚI: món mới nhất ở vị trí cuối, như lúc phục vụ
            if tail:
                x[row, maxlen - len(tail):] = torch.tensor(tail) + 1
        return x

    def recommend_many(self, cases: list[Case], k: int, exclude_seen: bool) -> list[list[int]]:
        was_training = self.model.training
        self.model.eval()
        out = []
        with torch.no_grad():
            for start in range(0, len(cases), 512):
                chunk = cases[start:start + 512]
                h = self.model(self._pad([c.history for c in chunk]))[:, -1, :]
                scores = (h @ self.model.item_emb.weight.T)[:, 1:]  # bỏ cột pad -> index nội bộ
                if exclude_seen:
                    for row, c in enumerate(chunk):
                        scores[row, list(set(c.history))] = -float("inf")
                out.extend(torch.topk(scores, min(k, scores.shape[1]), dim=1).indices.tolist())
        if was_training:
            self.model.train()
        return out

    def describe(self) -> dict:
        return {"config": asdict(self.config), "seed": self.seed, "best_epoch": self.best_epoch,
                "training_log": self.training_log}
