"""Train + đánh giá SASRec bằng ĐÚNG class `SASRecModel` mà recs-service dùng lúc phục vụ.

Khác `recsys_platform_sasrec.py` (script cũ): dừng sớm theo NDCG@10 trên tập VAL (không theo train loss),
seed điều khiển được để chạy nhiều lần đo độ dao động, và chấm điểm theo lô để đánh giá nhanh.

Các nấc ablation GĐ3 (đều là tuỳ chọn, mặc định TẮT = đúng cấu hình đang phục vụ):
- `n_negatives`: số đáp án sai trong "câu hỏi trắc nghiệm" sampled softmax.
- `logq`: trừ log xác suất lấy mẫu khỏi logit (logQ correction). Negative lấy theo độ phổ biến nên món phổ
  biến bị chọn làm "đáp án sai" nhiều hơn mức đáng có; KHÔNG hiệu chỉnh thì model bị đẩy RA XA món phổ biến.
  logQ gỡ méo này, nên gợi ý dịch VỀ PHÍA món phổ biến (ARP tăng — đo được trên platform: 0,0008 -> 0,0025).
- `maxlen`: số món gần nhất model đọc.
- `use_action`: cộng thêm embedding LOẠI HÀNH VI (xem/giỏ/xoá giỏ/mua…) vào từng vị trí — mắt xích nối
  Behavior Tracking với model. `shuffle_actions`: ĐỐI CHỨNG ÂM — xáo loại hành vi trong mỗi chuỗi (giữ phân
  phối, phá liên kết với item/thời điểm). Hơn đối chứng mới chứng tỏ model dùng được loại hành vi, chứ không
  chỉ hưởng lợi từ việc có thêm tham số."""
from __future__ import annotations

import copy
import os
from dataclasses import asdict, dataclass

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from app.services.sasrec import SASRecModel
from evaluation.baselines import Recommender
from evaluation.metrics import case_metrics
from evaluation.protocol import Case


@dataclass
class SASRecConfig:
    # Mặc định = cấu hình checkpoint đang phục vụ (recsys_platform_sasrec.py), để đo đúng cái đang chạy.
    # Riêng batch 32 -> 128 cho nhanh trên CPU (ghi rõ khi báo cáo).
    d_model: int = 32
    n_blocks: int = 1
    n_heads: int = 2
    maxlen: int = 15
    n_negatives: int = 50
    lr: float = 1e-3
    batch_size: int = 128
    max_epochs: int = 30
    patience: int = 3
    logq: bool = False
    use_action: bool = False
    shuffle_actions: bool = False


class ActionSASRecModel(SASRecModel):
    """SASRec + embedding loại hành vi. CHỈ dùng cho nghiên cứu (GĐ3): checkpoint của class này không nạp
    được vào recs-service cho tới khi serving cũng truyền loại hành vi vào model."""

    def __init__(self, n_items: int, n_actions: int, d_model: int, n_blocks: int, n_heads: int, maxlen: int):
        super().__init__(n_items, d_model, n_blocks, n_heads, maxlen)
        self.action_emb = nn.Embedding(n_actions + 1, d_model, padding_idx=0)  # 0 = pad

    def forward(self, seqs: torch.Tensor, actions: torch.Tensor | None = None) -> torch.Tensor:
        # Giống hệt SASRecModel.forward, chỉ cộng thêm action_emb — sửa bên kia thì phải sửa ở đây.
        positions = torch.arange(seqs.size(1), device=seqs.device).unsqueeze(0)
        x = self.item_emb(seqs) + self.pos_emb(positions)
        if actions is not None:
            x = x + self.action_emb(actions)
        x = self.dropout(x)
        pad_mask = seqs == 0
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seqs.size(1)).to(seqs.device)
        h = self.encoder(x, mask=causal_mask, src_key_padding_mask=pad_mask)
        return self.ln(h)


class SASRecRecommender(Recommender):
    def __init__(self, config: SASRecConfig | None = None, seed: int = 0, label: str | None = None):
        self.config = config or SASRecConfig()
        self.seed = seed
        self.name = f"{label or 'SASRec'}(seed={seed})"
        self.training_log: list[dict] = []
        torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))

    # ---------- train ----------
    def fit(self, train_seqs: dict[str, list[int]], n_items: int, val_cases: list[Case] | None = None,
            train_actions: dict[str, list[int]] | None = None, n_actions: int = 0):
        super().fit(train_seqs, n_items)
        cfg = self.config
        if cfg.use_action and not (train_actions and n_actions):
            raise ValueError("use_action=True cần dữ liệu có cột action (train_actions/n_actions)")
        torch.manual_seed(self.seed)
        rng = np.random.default_rng(self.seed)
        self._shuffle_rng = np.random.default_rng(self.seed + 10_000)

        users = [u for u, s in train_seqs.items() if len(s) >= 2]
        seqs = [train_seqs[u] for u in users]
        acts = [self._maybe_shuffle(train_actions[u]) for u in users] if cfg.use_action else None
        # mọi tiền tố của mọi chuỗi: (chuỗi, vị trí cần đoán)
        index = np.array([(si, t) for si, s in enumerate(seqs) for t in range(1, len(s))], dtype=np.int64)
        neg_prob = torch.tensor(np.concatenate([[0.0], self.popularity]), dtype=torch.float)
        neg_prob /= neg_prob.sum()
        log_q = torch.log(neg_prob.clamp_min(1e-12))

        if cfg.use_action:
            self.model = ActionSASRecModel(n_items, n_actions, cfg.d_model, cfg.n_blocks, cfg.n_heads, cfg.maxlen)
        else:
            self.model = SASRecModel(n_items, cfg.d_model, cfg.n_blocks, cfg.n_heads, cfg.maxlen)
        opt = torch.optim.Adam(self.model.parameters(), lr=cfg.lr)
        best_score, best_state, bad_epochs = -1.0, None, 0

        for epoch in range(1, cfg.max_epochs + 1):
            self.model.train()
            order = rng.permutation(len(index))
            total, n_batches = 0.0, 0
            for start in range(0, len(order), cfg.batch_size):
                batch = index[order[start:start + cfg.batch_size]]
                h = self._encode([seqs[si][:t] for si, t in batch],
                                 [acts[si][:t] for si, t in batch] if acts is not None else None)
                y = torch.tensor([seqs[si][t] + 1 for si, t in batch])
                negs = torch.multinomial(neg_prob, len(batch) * cfg.n_negatives, replacement=True).view(len(batch), -1)
                cand = torch.cat([y[:, None], negs], dim=1)
                logits = torch.einsum("bd,bnd->bn", h, self.model.item_emb(cand))
                if cfg.logq:
                    logits = logits - log_q[cand]
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
    def _maybe_shuffle(self, actions: list[int]) -> list[int]:
        return list(self._shuffle_rng.permutation(actions)) if self.config.shuffle_actions else actions

    def _pad(self, rows: list[list[int]]) -> torch.Tensor:
        maxlen = self.config.maxlen
        x = torch.zeros((len(rows), maxlen), dtype=torch.long)
        for r, row in enumerate(rows):
            tail = row[-maxlen:]  # CŨ -> MỚI: món mới nhất ở vị trí cuối, như lúc phục vụ
            if len(tail):
                x[r, maxlen - len(tail):] = torch.tensor(tail) + 1  # 0 = pad
        return x

    def _encode(self, histories: list[list[int]], actions: list[list[int]] | None) -> torch.Tensor:
        """Trạng thái ẩn ở vị trí cuối (món mới nhất) của từng lịch sử."""
        x = self._pad(histories)
        if self.config.use_action:
            return self.model(x, self._pad(actions))[:, -1, :]
        return self.model(x)[:, -1, :]

    def recommend_many(self, cases: list[Case], k: int, exclude_seen: bool) -> list[list[int]]:
        was_training = self.model.training
        self.model.eval()
        out = []
        with torch.no_grad():
            for start in range(0, len(cases), 512):
                chunk = cases[start:start + 512]
                actions = [self._maybe_shuffle(c.history_actions) for c in chunk] if self.config.use_action else None
                h = self._encode([c.history for c in chunk], actions)
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
