"""SASRec — model chuỗi ĐẦU TIÊN của cả đồ án, huấn luyện thật trên dữ liệu thật.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §4.

## Vị trí trong pipeline

Đây là ứng viên cho TẦNG ② RANKING (thay placeholder ItemKNN-tái-dùng đã ghi trong
`recsys_pipeline.py`). So trực tiếp với 2 baseline đã đo trên ĐÚNG cùng target set:

| | Recall@20 | NDCG@20 |
|---|---|---|
| Popularity | 0,0179 | 0,0090 |
| ItemKNN | 0,0199 | 0,0082 |

## Kiến trúc — thu nhỏ so với eSASRec đầy đủ trong plan, có lý do cụ thể

Plan gốc (§4.1) đặc tả `d=256`, maxlen 50-200, cho GPU. Máy này KHÔNG có GPU rời (chỉ Intel UHD
630) — thu nhỏ `d=64`, 2 block, 2 head để huấn luyện được trên CPU trong thời gian hợp lý. Vẫn giữ
đúng 2 nguyên tắc đã đo là ĐÒN BẨY MẠNH NHẤT (xem recsys-research-and-plan.md §2):
  1. **Sampled softmax** (không BCE) — tránh overconfidence đã ghi nhận ở gSASRec
  2. **Self-attention có causal mask** — đọc TOÀN BỘ lịch sử trước vị trí hiện tại, không chỉ
     bigram liền kề như cách làm feature tay ở Bài toán 2

## An toàn bộ nhớ

Sequence dài nhất trong dữ liệu là 4076 (1 user cực kỳ tích cực) — cắt còn tối đa `MAXLEN=50`
(khớp median=6, mean=20,48, đủ phủ đại đa số). Huấn luyện theo batch nhỏ, không giữ toàn bộ tensor
đệm (pad) của mọi user cùng lúc.
"""
from __future__ import annotations

import json
import os

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

SEQUENCES_PATH = os.environ.get("SEQUENCES_PATH", "/tmp/sequences.npz")
OUT_PATH = os.environ.get("SASREC_RESULT_PATH", "/tmp/sasrec_result.json")
# ⚠️ Sua thieu sot: ban truoc CHUA LUU trong so model — chi luu metric JSON. Sau 90 phut CPU
# huan luyen ma khong luu duoc gi de dung lai la lang phi that. Gio luu ca state_dict + config
# de nap lai duoc (vd tich hop vao recsys_pipeline.py tang Ranking) ma khong phai train lai.
MODEL_OUT_PATH = os.environ.get("SASREC_MODEL_PATH", "/tmp/sasrec_model.pt")

D_MODEL = int(os.environ.get("D_MODEL", "64"))
N_BLOCKS = int(os.environ.get("N_BLOCKS", "2"))
N_HEADS = int(os.environ.get("N_HEADS", "2"))
# ⚠️ Toi uu toc do (2026-09-18): MAXLEN=50 trong khi median chuoi chi 6 -> da so cho la PAD, ma
# self-attention ton O(L^2) BAT KE co bao nhieu token that. 90 phut CPU van chua xong 1 epoch voi
# cau hinh cu. Giam con 20 (van >> median=6, gan mean=20.48) giam chi phi attention ~6x (400 vs
# 2500 cap token).
MAXLEN = int(os.environ.get("MAXLEN", "20"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "256"))  # tang batch: it lan goi Python hon/epoch
N_EPOCHS = int(os.environ.get("N_EPOCHS", "3"))
N_NEGATIVES = int(os.environ.get("N_NEGATIVES", "50"))  # giam tu 100 -> 50, giam 1 nua tra cuu embedding
# Gioi han so VI TRI huan luyen/user: median=6 nhung mean=20,48 vi vai user co toi 4076 tuong tac
# -> khong gioi han se lam ho chiem phan lon batch, khong giup gi (da chung minh gap giam tren
# RetailRocket: nhieu du lieu tu CUNG 1 nguon khong tang thong tin, chi tang thoi gian).
MAX_POSITIONS_PER_USER = int(os.environ.get("MAX_POSITIONS_PER_USER", "20"))
# ⚠️ 2 lan toi uu truoc (giam MAXLEN, tang batch, giam negatives) KHONG giai quyet duoc: 94 phut
# CPU van chua xong 1 epoch. Nguyen nhan that: MAX_POSITIONS_PER_USER=20 gan bang MEAN=20,48 nen
# gan nhu KHONG cat duoc gi — tong so mau gan nhu khong doi. Va DataLoader num_workers=0 tai du
# lieu TUAN TU bang Python thuan cho hang trieu mau — day moi la nut that, khong phai kien truc
# model. Lan dau sua DUT DIEM bang lay MAU CON 30K/307K user — cho ra ket qua THUA ca 2 baseline
# (recall@20=0.0108 vs Popularity 0.0179/ItemKNN 0.0199). Quyet dinh (2026-09-18, theo yeu cau
# nguoi dung): quay lai FULL user set + nhieu epoch hon, chap nhan thoi gian dai hon, thay vi
# tiep tuc thu nho pham vi — vi 30K la qua it so voi 307K de ket luan cong bang voi baseline
# tinh tren toan bo du lieu.
TRAIN_USER_SAMPLE = int(os.environ.get("TRAIN_USER_SAMPLE", "0"))
# num_workers>0 tren Windows can boc phan thuc thi trong `if __name__ == "__main__":` (dung
# "spawn", khac "fork" tren Linux) vi moi worker se import lai module nay tu dau — da them guard
# ben duoi (ham main()) de bat an toan. Mac dinh 4 luong tai du lieu song song (may co 12 luong,
# de danh luong cho tinh toan chinh + tranh chiem het CPU theo yeu cau an toan may).
NUM_WORKERS = int(os.environ.get("NUM_WORKERS", "4"))
RESUME = os.environ.get("RESUME", "1") == "1"
LR = 1e-3
TOP_K_LIST = [10, 20]
SEED = 42

torch.manual_seed(SEED)
rng = np.random.default_rng(SEED)


class SASRec(nn.Module):
    """Self-Attentive Sequential Recommendation (Kang & McAuley 2018), thu gon cho CPU."""

    def __init__(self, n_items: int, d_model: int, n_blocks: int, n_heads: int, maxlen: int):
        super().__init__()
        self.item_emb = nn.Embedding(n_items + 1, d_model, padding_idx=0)  # 0 = pad
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
        """seqs: (batch, maxlen) da pad-trai bang 0. Tra ve h (batch, maxlen, d_model)."""
        positions = torch.arange(seqs.size(1), device=seqs.device).unsqueeze(0)
        x = self.item_emb(seqs) + self.pos_emb(positions)
        x = self.dropout(x)
        pad_mask = seqs == 0  # True o vi tri pad -> transformer se bo qua
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seqs.size(1)).to(seqs.device)
        h = self.encoder(x, mask=causal_mask, src_key_padding_mask=pad_mask)
        return self.ln(h)


def pad_left(seq: np.ndarray, maxlen: int) -> np.ndarray:
    seq = seq[-maxlen:]
    out = np.zeros(maxlen, dtype=np.int64)
    out[maxlen - len(seq):] = seq + 1  # +1 vi 0 danh cho pad
    return out


class NextItemDataset(Dataset):
    """⚠️ THAY THẾ bản đầu (vật chất hoá 6M mẫu thành list Python rồi `np.stack` — làm RAM tụt
    xuống 1,29GB, phải KILL). Bản này chỉ lưu chỉ mục (user, vị trí) — 6M cặp int32 ~48MB, RẺ HƠN
    HẲN — rồi cắt/pad TỪNG MẪU khi `__getitem__` được gọi (đúng cách PyTorch được thiết kế để dùng:
    `DataLoader` chỉ giữ đúng 1 batch trong bộ nhớ tại một thời điểm, không phải toàn bộ dataset)."""

    def __init__(self, user_to_seq: dict[int, np.ndarray], maxlen: int, max_positions: int | None = None):
        self.maxlen = maxlen
        self.seqs = list(user_to_seq.values())
        self.index: list[tuple[int, int]] = []  # (seq_id, cat vi tri t)
        for seq_id, seq in enumerate(self.seqs):
            positions = list(range(1, len(seq)))
            if max_positions and len(positions) > max_positions:
                # giu N vi tri GAN NHAT (moi nhat) — pha hop voi muc dich du doan hanh vi hien tai
                positions = positions[-max_positions:]
            for t in positions:
                self.index.append((seq_id, t))

    def __len__(self) -> int:
        return len(self.index)

    def __getitem__(self, i: int):
        seq_id, t = self.index[i]
        seq = self.seqs[seq_id]
        x = pad_left(seq[:t], self.maxlen)
        y = int(seq[t]) + 1
        return x, y


def main() -> None:
    print("Doc du lieu chuoi ...")
    data = np.load(SEQUENCES_PATH, allow_pickle=True)
    sequences_raw = data["sequences"]
    seq_users = data["seq_users"]
    target_users = data["target_users"]
    target_items = data["target_items"]
    n_items = int(data["n_items"])
    print(f"{len(sequences_raw):,} chuoi train | {len(target_users):,} user co target | {n_items:,} item")

    user_to_seq_full = {int(u): s for u, s in zip(seq_users, sequences_raw) if len(s) >= 2}
    if TRAIN_USER_SAMPLE and len(user_to_seq_full) > TRAIN_USER_SAMPLE:
        keep_users = rng.choice(list(user_to_seq_full.keys()), size=TRAIN_USER_SAMPLE, replace=False)
        user_to_seq = {u: user_to_seq_full[u] for u in keep_users}
        print(f"Lay mau con {TRAIN_USER_SAMPLE:,}/{len(user_to_seq_full):,} user de train "
              f"(CPU khong GPU, can pham vi kha thi — xem ghi chu trong code)")
    else:
        user_to_seq = user_to_seq_full
        print(f"Dung FULL {len(user_to_seq):,} user (khong lay mau con)")

    train_dataset = NextItemDataset(user_to_seq, MAXLEN, MAX_POSITIONS_PER_USER)
    train_loader = DataLoader(
        train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS,
        drop_last=False, persistent_workers=(NUM_WORKERS > 0),
    )
    print(f"So mau huan luyen (moi vi tri trong chuoi): {len(train_dataset):,}")

    item_pop = np.zeros(n_items + 1)
    for seq in sequences_raw:
        for it in seq:
            item_pop[it + 1] += 1
    item_pop[0] = 0  # khong bao gio sample pad token lam negative
    neg_prob = item_pop / item_pop.sum()

    # ⚠️ Chuan bi cho GPU thue (2026-09-21): truoc day hardcode "cpu" — mang nguyen len may
    # thue GPU van chay CPU, phi tien thue. Tu dong dung GPU neu co, khong doi code gi them.
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))
    model = SASRec(n_items, D_MODEL, N_BLOCKS, N_HEADS, MAXLEN).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)

    # ⚠️ Resume tu checkpoint (2026-09-21): lan chay full-scale truoc bi CAT NGANG giua chung
    # (phien lam viec ket thuc, khong phai crash RAM) — chi 1/15 epoch duoc luu. Nap lai neu
    # config KHOP (n_items/d_model/n_blocks/n_heads/maxlen deu phai giong, vi anh huong shape
    # tensor) de khong mat cong da train, thay vi train lai tu dau.
    start_epoch, prev_loss = 0, None
    if RESUME and os.path.exists(MODEL_OUT_PATH):
        ckpt = torch.load(MODEL_OUT_PATH, map_location=device, weights_only=False)
        same_cfg = ckpt["config"] == {"n_items": n_items, "d_model": D_MODEL, "n_blocks": N_BLOCKS,
                                       "n_heads": N_HEADS, "maxlen": MAXLEN}
        if same_cfg:
            model.load_state_dict(ckpt["model_state_dict"])
            if "optimizer_state_dict" in ckpt:
                optimizer.load_state_dict(ckpt["optimizer_state_dict"])
            start_epoch = ckpt["epoch"]
            prev_loss = ckpt.get("loss")
            print(f"Resume tu checkpoint: da xong {start_epoch} epoch, tiep tuc tu epoch {start_epoch+1}")
        else:
            print(f"Checkpoint co config khac ({ckpt['config']}) — train lai tu dau, khong resume")

    n_train = len(train_dataset)
    print(f"\nHuan luyen toi da {N_EPOCHS} epoch, batch={BATCH_SIZE}, "
          f"sampled softmax {N_NEGATIVES} negatives, num_workers={NUM_WORKERS} ...")
    # Dung som neu loss khong giam duoc it nhat 0.5% so epoch truoc — voi full user set thoi
    # gian/epoch dai hon nhieu, chay het N_EPOCHS co dinh khi da hoi tu la lang phi CPU vo ich.
    for epoch in range(start_epoch, N_EPOCHS):
        total_loss, n_batches = 0.0, 0
        model.train()
        for batch_x, batch_y_t in train_loader:
            batch_x = batch_x.long().to(device, non_blocking=True)
            batch_y = batch_y_t.numpy()

            h = model(batch_x)
            last_h = h[:, -1, :]  # bieu dien tai vi tri CUOI (da pad-trai nen luon la vi tri du doan)

            neg_items = rng.choice(n_items + 1, size=(len(batch_x), N_NEGATIVES), p=neg_prob)
            candidates = np.concatenate([batch_y[:, None], neg_items], axis=1)  # cot 0 = positive
            candidates_t = torch.from_numpy(candidates).long().to(device, non_blocking=True)
            cand_emb = model.item_emb(candidates_t)  # (batch, 1+neg, d)
            logits = torch.einsum("bd,bnd->bn", last_h, cand_emb)
            labels = torch.zeros(len(batch_x), dtype=torch.long, device=device)  # positive luon o cot 0

            loss = F.cross_entropy(logits, labels)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
        avg_loss = total_loss / n_batches
        print(f"  epoch {epoch+1}/{N_EPOCHS}: loss={avg_loss:.4f}")
        # Luu SAU MOI EPOCH: voi full user set, 1 epoch co the mat rat lau — neu chi luu o cuoi
        # va bi ngat giua chung (kill vi RAM, mat dien, dong may...) thi mat trang het.
        torch.save(
            {"model_state_dict": model.state_dict(), "optimizer_state_dict": optimizer.state_dict(),
             "epoch": epoch + 1, "loss": avg_loss,
             "config": {"n_items": n_items, "d_model": D_MODEL, "n_blocks": N_BLOCKS,
                        "n_heads": N_HEADS, "maxlen": MAXLEN}},
            MODEL_OUT_PATH,
        )
        print(f"    da luu checkpoint sau epoch {epoch+1} -> {MODEL_OUT_PATH}")
        if prev_loss is not None and prev_loss - avg_loss < 0.005 * prev_loss:
            print(f"    loss gan nhu khong giam nua ({prev_loss:.4f} -> {avg_loss:.4f}) — dung som")
            break
        prev_loss = avg_loss

    # ================= DANH GIA — CUNG target set voi baseline de so cong bang =================
    print("\nDanh gia tren target set (xep hang TOAN BO catalog) ...")
    model.eval()
    eval_inputs, eval_targets, eval_users = [], [], []
    for u, t in zip(target_users, target_items):
        seq = user_to_seq.get(int(u))
        if seq is None:
            continue
        eval_inputs.append(pad_left(seq, MAXLEN))
        eval_targets.append(int(t))
        eval_users.append(int(u))
    eval_inputs = np.stack(eval_inputs)
    eval_targets = np.array(eval_targets)
    print(f"So user danh gia duoc (co ca chuoi + target): {len(eval_inputs):,}")

    all_item_emb = model.item_emb.weight  # (n_items+1, d) — bao gom ca pad o vi tri 0

    ranked_lists = []
    with torch.no_grad():
        for start in range(0, len(eval_inputs), BATCH_SIZE):
            batch_x = torch.from_numpy(eval_inputs[start:start + BATCH_SIZE]).long().to(device)
            h = model(batch_x)
            last_h = h[:, -1, :]
            scores = last_h @ all_item_emb.T  # (batch, n_items+1)
            scores[:, 0] = -float("inf")  # khong bao gio goi y pad token
            topk_scores, topk_idx = torch.topk(scores, k=max(TOP_K_LIST), dim=1)
            ranked_lists.extend((topk_idx - 1).tolist())  # tru lai 1 de ve dung item_idx goc

    results = {}
    for k in TOP_K_LIST:
        hits = sum(1 for t, r in zip(eval_targets, ranked_lists) if t in r[:k])
        recall = hits / len(eval_targets)
        ndcg_total = 0.0
        for t, r in zip(eval_targets, ranked_lists):
            pos = r[:k].index(t) if t in r[:k] else None
            if pos is not None:
                ndcg_total += 1.0 / np.log2(pos + 2)
        ndcg = ndcg_total / len(eval_targets)
        covered = set()
        for r in ranked_lists:
            covered.update(r[:k])
        coverage = len(covered) / n_items
        results[f"recall@{k}"] = round(recall, 5)
        results[f"ndcg@{k}"] = round(ndcg, 5)
        results[f"coverage@{k}"] = round(coverage, 5)

    print(json.dumps(results, indent=2))
    print("\n--- So sanh voi baseline (cung ~19-20K target user) ---")
    print("  Popularity : recall@20=0.0179 | ndcg@20=0.0090")
    print("  ItemKNN    : recall@20=0.0199 | ndcg@20=0.0082")
    print(f"  SASRec     : recall@20={results['recall@20']} | ndcg@20={results['ndcg@20']}")

    out = {
        "config": {"d_model": D_MODEL, "n_blocks": N_BLOCKS, "n_heads": N_HEADS,
                   "maxlen": MAXLEN, "n_epochs": N_EPOCHS, "n_negatives": N_NEGATIVES,
                   "train_user_sample": TRAIN_USER_SAMPLE or len(user_to_seq_full)},
        "n_train_samples": int(n_train), "n_eval_users": int(len(eval_inputs)),
        "results": results,
        "baseline_comparison": {
            "popularity": {"recall@20": 0.0179, "ndcg@20": 0.0090},
            "itemknn": {"recall@20": 0.0199, "ndcg@20": 0.0082},
        },
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\nDa luu {OUT_PATH}")


if __name__ == "__main__":
    main()
