"""SASRec train trên dữ liệu THẬT của platform (`ecommerce_order_db.user_events`) — sinh checkpoint
`item_space="platform_v1"` mà `AI/recs-service/app/services/sasrec.py` chấp nhận nạp.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md).

## Khác gì với `recsys_sasrec.py` (bản nghiên cứu trên REES46 Cosmetics)

Bản đó dùng index nội bộ của bộ dữ liệu công khai — không tương ứng với `Product.id` thật của
platform (xem thảo luận 2026-09-21). Script này:
  1. Đọc trực tiếp `user_events` (product_id THẬT) thay vì CSV nghiên cứu.
  2. Lưu `item_id_map` (product_id thật -> index nội bộ) VÀO checkpoint — bắt buộc để
     `recs-service` dịch ngược index model ra product_id thật.
  3. Đánh dấu `item_space="platform_v1"` — điều kiện DUY NHẤT để `recs-service` chịu nạp.

## ⚠️ Kỳ vọng trung thực

Quy mô platform hiện tại (~500 user, ~65K sự kiện — xem `tools/data-seed`) nhỏ hơn REES46 khoảng
600 lần. Đây là dữ liệu ĐỦ để chứng minh pipeline chạy đúng đầu-cuối, KHÔNG đủ để kỳ vọng model
học được tín hiệu chuỗi thật — lặp lại đúng bài học đã đo trên RetailRocket (dữ liệu quá nghèo/ít
thì chuỗi không có thông tin hơn ngẫu nhiên). Baseline so sánh: Popularity trên chính tập user
này (tính riêng ở dưới, KHÔNG lấy số so sánh REES46 vì khác protocol/khác catalog).
"""
from __future__ import annotations

import json
import os

import numpy as np
import pymysql
import torch
import torch.nn as nn
import torch.nn.functional as F

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "root")

OUT_PATH = os.environ.get("PLATFORM_SASREC_RESULT_PATH", "/tmp/platform_sasrec_result.json")
MODEL_OUT_PATH = os.environ.get("PLATFORM_SASREC_MODEL_PATH", "/tmp/platform_sasrec.pt")

# Quy mo nho (~500 user) -> model nho tuong xung, tranh overfit vo nghia voi model lon
D_MODEL = int(os.environ.get("D_MODEL", "32"))
N_BLOCKS = int(os.environ.get("N_BLOCKS", "1"))
N_HEADS = int(os.environ.get("N_HEADS", "2"))
MAXLEN = int(os.environ.get("MAXLEN", "15"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "32"))
N_EPOCHS = int(os.environ.get("N_EPOCHS", "30"))
N_NEGATIVES = int(os.environ.get("N_NEGATIVES", "50"))
LR = 1e-3
TOP_K_LIST = [10, 20]
SEED = 42

torch.manual_seed(SEED)
rng = np.random.default_rng(SEED)


class SASRec(nn.Module):
    """Giong het kien truc trong recsys_sasrec.py (khong sua o day de tranh lech 2 noi)."""

    def __init__(self, n_items: int, d_model: int, n_blocks: int, n_heads: int, maxlen: int):
        super().__init__()
        self.item_emb = nn.Embedding(n_items + 1, d_model, padding_idx=0)
        self.pos_emb = nn.Embedding(maxlen, d_model)
        self.dropout = nn.Dropout(0.2)
        layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_model * 4,
            dropout=0.2, batch_first=True, activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_blocks)
        self.ln = nn.LayerNorm(d_model)
        self.maxlen = maxlen

    def forward(self, seqs: torch.Tensor) -> torch.Tensor:
        positions = torch.arange(seqs.size(1), device=seqs.device).unsqueeze(0)
        x = self.item_emb(seqs) + self.pos_emb(positions)
        x = self.dropout(x)
        pad_mask = seqs == 0
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seqs.size(1)).to(seqs.device)
        h = self.encoder(x, mask=causal_mask, src_key_padding_mask=pad_mask)
        return self.ln(h)


def pad_left(seq: list[int], maxlen: int) -> np.ndarray:
    seq = seq[-maxlen:]
    out = np.zeros(maxlen, dtype=np.int64)
    out[maxlen - len(seq):] = np.array(seq, dtype=np.int64) + 1
    return out


def main() -> None:
    print("Doc user_events THAT tu ecommerce_order_db ...")
    conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
                            database="ecommerce_order_db")
    cur = conn.cursor()
    # Chi lay hanh dong THAT gan voi san pham (view/cart) - dung logic loc giong het
    # behavior_consumer.py._write_to_redis (bo qua vi-hanh-vi FE khong phai chon san pham)
    cur.execute(
        "SELECT user_id, item_id, created_at FROM user_events "
        "WHERE action_type IN ('VIEW_PRODUCT','ADD_TO_CART') AND item_id IS NOT NULL "
        "ORDER BY user_id, created_at"
    )
    rows = cur.fetchall()
    conn.close()
    print(f"{len(rows):,} dong hanh vi that (VIEW_PRODUCT/ADD_TO_CART)")

    user_seqs: dict[str, list[int]] = {}
    for user_id, item_id, _ts in rows:
        if user_id is None:
            continue
        user_seqs.setdefault(user_id, []).append(int(item_id))

    # remap product_id THAT -> index noi bo lien tuc (0..n-1), bat buoc cho nn.Embedding
    all_items = sorted({it for seq in user_seqs.values() for it in seq})
    item_id_map = {pid: idx for idx, pid in enumerate(all_items)}
    n_items = len(all_items)
    print(f"{len(user_seqs):,} user co hanh vi | {n_items:,} item phan biet")

    # leave-last-out: item cuoi lam target, phan con lai lam train (chuan cho quy mo nho,
    # KHONG dung GTS vi khong co gi de so sanh cong bang o quy mo nay)
    train_seqs, targets = {}, {}
    for uid, seq in user_seqs.items():
        idx_seq = [item_id_map[it] for it in seq]
        if len(idx_seq) >= 2:
            train_seqs[uid] = idx_seq[:-1]
            targets[uid] = idx_seq[-1]
    print(f"{len(train_seqs):,} user co du chuoi train (>=2 hanh vi)")

    if len(train_seqs) < 20:
        print("QUA IT USER co chuoi hop le (<20) — dung lai, khong train model vo nghia.")
        return

    # ============ Baseline Popularity tren CHINH tap nay (de so sanh cong bang, khac protocol
    # voi REES46 nen KHONG duoc lay so REES46 ra so o day) ============
    item_count = np.zeros(n_items)
    for seq in train_seqs.values():
        for it in seq:
            item_count[it] += 1
    pop_ranked = np.argsort(-item_count)
    pop_hits = {k: 0 for k in TOP_K_LIST}
    for uid, t in targets.items():
        seen = set(train_seqs[uid])
        ranked = [it for it in pop_ranked if it not in seen]
        for k in TOP_K_LIST:
            if t in ranked[:k]:
                pop_hits[k] += 1
    n_eval = len(targets)
    pop_recall = {k: pop_hits[k] / n_eval for k in TOP_K_LIST}
    print(f"Popularity (tren chinh tap platform, {n_eval} user danh gia): "
          f"recall@10={pop_recall[10]:.4f} recall@20={pop_recall[20]:.4f}")

    # ============ Train SASRec ============
    class NextItemDataset(torch.utils.data.Dataset):
        def __init__(self, seqs: list[list[int]], maxlen: int):
            self.seqs = seqs
            self.maxlen = maxlen
            self.index = [(i, t) for i, s in enumerate(seqs) for t in range(1, len(s))]

        def __len__(self):
            return len(self.index)

        def __getitem__(self, i):
            seq_id, t = self.index[i]
            seq = self.seqs[seq_id]
            x = pad_left(seq[:t], self.maxlen)
            y = seq[t] + 1
            return x, y

    seqs_list = list(train_seqs.values())
    dataset = NextItemDataset(seqs_list, MAXLEN)
    if len(dataset) == 0:
        print("Khong co mau train nao (moi user chi co dung 1 hanh dong truoc target) — dung lai.")
        return
    loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    print(f"So mau train: {len(dataset):,}")

    item_pop = np.zeros(n_items + 1)
    for seq in seqs_list:
        for it in seq:
            item_pop[it + 1] += 1
    item_pop[0] = 0
    neg_prob = item_pop / item_pop.sum()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    model = SASRec(n_items, D_MODEL, N_BLOCKS, N_HEADS, MAXLEN).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)

    prev_loss = None
    for epoch in range(N_EPOCHS):
        total_loss, n_batches = 0.0, 0
        model.train()
        for batch_x, batch_y_t in loader:
            batch_x = batch_x.long().to(device)
            batch_y = batch_y_t.numpy()

            h = model(batch_x)
            last_h = h[:, -1, :]

            neg_items = rng.choice(n_items + 1, size=(len(batch_x), N_NEGATIVES), p=neg_prob)
            candidates = np.concatenate([batch_y[:, None], neg_items], axis=1)
            candidates_t = torch.from_numpy(candidates).long().to(device)
            cand_emb = model.item_emb(candidates_t)
            logits = torch.einsum("bd,bnd->bn", last_h, cand_emb)
            labels = torch.zeros(len(batch_x), dtype=torch.long, device=device)

            loss = F.cross_entropy(logits, labels)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
        avg_loss = total_loss / n_batches
        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"  epoch {epoch+1}/{N_EPOCHS}: loss={avg_loss:.4f}")
        if prev_loss is not None and prev_loss - avg_loss < 0.002 * prev_loss and epoch > 5:
            print(f"    loss gan nhu khong giam nua — dung som o epoch {epoch+1}")
            break
        prev_loss = avg_loss

    # ============ Danh gia SASRec tren chinh tap nay ============
    model.eval()
    eval_inputs, eval_targets = [], []
    for uid, seq in train_seqs.items():
        eval_inputs.append(pad_left(seq, MAXLEN))
        eval_targets.append(targets[uid])
    eval_inputs = np.stack(eval_inputs)

    all_item_emb = model.item_emb.weight
    ranked_lists = []
    with torch.no_grad():
        for start in range(0, len(eval_inputs), BATCH_SIZE):
            batch_x = torch.from_numpy(eval_inputs[start:start + BATCH_SIZE]).long().to(device)
            h = model(batch_x)
            last_h = h[:, -1, :]
            scores = last_h @ all_item_emb.T
            scores[:, 0] = -float("inf")
            topk_scores, topk_idx = torch.topk(scores, k=min(max(TOP_K_LIST), n_items), dim=1)
            ranked_lists.extend((topk_idx - 1).tolist())

    results = {}
    for k in TOP_K_LIST:
        hits = sum(1 for t, r in zip(eval_targets, ranked_lists) if t in r[:k])
        results[f"recall@{k}"] = round(hits / len(eval_targets), 4)
    print(f"SASRec (platform_v1, {len(eval_targets)} user): recall@10={results['recall@10']} "
          f"recall@20={results['recall@20']}")
    print(f"So sanh: Popularity recall@10={pop_recall[10]:.4f} recall@20={pop_recall[20]:.4f}")

    # ============ Luu checkpoint dung dinh dang recs-service can ============
    idx_to_pid = {v: k for k, v in item_id_map.items()}
    torch.save({
        "model_state_dict": model.state_dict(),
        "epoch": N_EPOCHS,
        "config": {"n_items": n_items, "d_model": D_MODEL, "n_blocks": N_BLOCKS,
                   "n_heads": N_HEADS, "maxlen": MAXLEN},
        "item_space": "platform_v1",
        "item_id_map": item_id_map,  # product_id THAT -> index noi bo
    }, MODEL_OUT_PATH)
    print(f"\nDa luu checkpoint platform_v1 -> {MODEL_OUT_PATH}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "n_users_total": len(user_seqs), "n_users_trainable": len(train_seqs),
            "n_items": n_items, "n_train_samples": len(dataset),
            "sasrec": results, "popularity_same_protocol": {f"recall@{k}": round(pop_recall[k], 4) for k in TOP_K_LIST},
            "note": "So sanh CHI trong noi bo tap platform (~500 user) — KHONG so voi so REES46 "
                    "(khac protocol, khac catalog, khac quy mo 600 lan).",
        }, f, ensure_ascii=False, indent=2)
    print(f"Da luu {OUT_PATH}")


if __name__ == "__main__":
    main()
