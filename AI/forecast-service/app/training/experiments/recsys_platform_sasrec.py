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
import time

import numpy as np
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
# "default" = giu nguyen nhu recsys_sasrec.py/ket qua cu; "scaled" = xem SASRec.__init__
EMB_INIT = os.environ.get("EMB_INIT", "default")
# Chi de DO TOC DO (vd tren may GPU truoc khi chay that): dung moi epoch sau N buoc, 0 = tat
MAX_STEPS = int(os.environ.get("MAX_STEPS", "0"))
LR = 1e-3
TOP_K_LIST = [10, 20]
SEED = int(os.environ.get("SEED", "42"))

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
        if EMB_INIT == "scaled":
            # Mac dinh nn.Embedding ~ N(0,1) -> diem = <h, e> co do lech ~sqrt(d) (d=64: ~8), loss
            # khoi dau ~17 thay vi ln(51)~3,9. std = d^-0.5 dua diem ve ~N(0,1). Khong doi kien truc
            # / state_dict -> recs-service nap nhu cu.
            nn.init.normal_(self.item_emb.weight, std=d_model ** -0.5)
            nn.init.normal_(self.pos_emb.weight, std=d_model ** -0.5)
            with torch.no_grad():
                self.item_emb.weight[0].zero_()

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


def load_user_seqs_from_csv(path: str) -> tuple[dict[str, list[int]], int]:
    """Doc `user_events.csv` do `node tools/data-seed/seed.mjs --out <dir>` xuat (may GPU thue khong
    co DB). Cung bo loc + thu tu voi cau SQL o duoi (VIEW/CART, sap theo user roi thoi gian), tra
    thang chuoi item theo user — khong dung 6 trieu tuple (user, item, Timestamp) nhu nhanh DB (do
    duoc: tien trinh ~2,2GB RAM chi vi cac object do)."""
    import pandas as pd

    # Cache ban da loc + da sap canh file goc: parse 2,4GB CSV mat ~100s, lap lai o MOI seed = GPU
    # dung khong. Bo qua neu cu hon file goc; ghi qua file tam + os.replace de bi ngat giua chung
    # khong de lai cache hong.
    cache = path + ".viewcart.v2.pkl"  # doi so phien ban khi doi dinh dang cache
    if os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(path):
        print(f"  dung cache {cache}")
        df = pd.read_pickle(cache)
    else:
        parts = []
        for chunk in pd.read_csv(path, usecols=["user_id", "item_id", "action_type", "created_at"],
                                 dtype={"user_id": str, "action_type": str}, chunksize=2_000_000):
            chunk = chunk[chunk.action_type.isin(["VIEW_PRODUCT", "ADD_TO_CART"]) & chunk.item_id.notna()]
            parts.append(chunk[["user_id", "item_id", "created_at"]])
        df = pd.concat(parts, ignore_index=True)
        del parts
        df["user_id"] = df.user_id.astype("category")
        df["item_id"] = df.item_id.astype("int32")
        df["created_at"] = pd.to_datetime(df.created_at, utc=True, format="ISO8601")
        # File ghi theo phien (don -> bo gio -> xem thuan), KHONG theo thoi gian -> phai sap lai
        df = df.sort_values(["user_id", "created_at"], kind="stable")[["user_id", "item_id"]]
        df = df.reset_index(drop=True)
        try:
            df.to_pickle(cache + ".tmp")
            os.replace(cache + ".tmp", cache)
        except OSError as e:  # thu muc chi doc -> van chay, chi khong co cache
            print(f"  khong ghi duoc cache ({e})")

    codes = df.user_id.cat.codes.to_numpy()
    bounds = np.flatnonzero(np.diff(codes)) + 1
    users = df.user_id.cat.categories[codes[np.concatenate([[0], bounds])]]
    seqs = np.split(df.item_id.to_numpy().astype(np.int64), bounds)
    return {str(u): s.tolist() for u, s in zip(users, seqs)}, len(df)


def main() -> None:
    t_start = time.perf_counter()
    timing: dict[str, float] = {}
    events_csv = os.environ.get("EVENTS_CSV")
    if events_csv:
        print(f"Doc user_events tu file {events_csv} ...")
        user_seqs, n_rows = load_user_seqs_from_csv(events_csv)
    else:
        import pymysql  # chi can khi doc DB — may GPU chay EVENTS_CSV khong phai cai

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
        n_rows = len(rows)
        user_seqs = {}
        for user_id, item_id, _ts in rows:
            if user_id is None:
                continue
            user_seqs.setdefault(user_id, []).append(int(item_id))
        del rows
    print(f"{n_rows:,} dong hanh vi (VIEW_PRODUCT/ADD_TO_CART)")

    # remap product_id THAT -> index noi bo lien tuc (0..n-1), bat buoc cho nn.Embedding
    all_items = sorted({it for seq in user_seqs.values() for it in seq})
    item_id_map = {pid: idx for idx, pid in enumerate(all_items)}
    n_items = len(all_items)
    print(f"{len(user_seqs):,} user co hanh vi | {n_items:,} item phan biet")
    timing["load"] = round(time.perf_counter() - t_start, 1)

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
    max_k = max(TOP_K_LIST)
    for uid, t in targets.items():
        seen = set(train_seqs[uid])
        # Dung ngay khi du top-k — ban cu duyet het ~32K item/user (20K user ~ 640 trieu vong lap
        # Python, GPU dung khong trong luc do)
        ranked = []
        for it in pop_ranked:
            if it not in seen:
                ranked.append(it)
                if len(ranked) == max_k:
                    break
        for k in TOP_K_LIST:
            if t in ranked[:k]:
                pop_hits[k] += 1
    n_eval = len(targets)
    pop_recall = {k: pop_hits[k] / n_eval for k in TOP_K_LIST}

    # ============ Baseline Recency ("goi y lai item vua xem") tren DUNG cung user/target voi SASRec
    # — de bootstrap CI la so sanh CAP (paired) chinh xac, khong ghep so tu 2 script khac nhau.
    # Day la doi chung bat buoc theo production_reference/7_sasrec_evaluation_metrics.md. ============
    recency_per_user: dict[str, dict[str, bool]] = {}
    for uid, t in targets.items():
        ranked, seen_set = [], set()
        for it in reversed(train_seqs[uid]):
            if it not in seen_set:
                ranked.append(it)
                seen_set.add(it)
        recency_per_user[str(uid)] = {f"hit@{k}": bool(t in ranked[:k]) for k in TOP_K_LIST}
    recency_recall = {k: sum(h[f"hit@{k}"] for h in recency_per_user.values()) / n_eval for k in TOP_K_LIST}
    print(f"Recency (cung user/target): recall@10={recency_recall[10]:.4f} recall@20={recency_recall[20]:.4f}")
    timing["baselines"] = round(time.perf_counter() - t_start - timing["load"], 1)
    print(f"Popularity (tren chinh tap platform, {n_eval} user danh gia): "
          f"recall@10={pop_recall[10]:.4f} recall@20={pop_recall[20]:.4f}")

    # ============ Train SASRec ============
    # Mau (chuoi, t): input = pad_left(seq[:t]), target = seq[t], t = 1..len-1 — y het ban Dataset
    # cu, nhung dung ca batch bang numpy vector hoa thay vi __getitem__ Python tung mau (20K user ~
    # 6 trieu mau/epoch: ban cu nghen CPU, GPU dung khong). Chi giu mang phang + offset (~150MB).
    seqs_list = list(train_seqs.values())
    lens = np.array([len(s) for s in seqs_list], dtype=np.int64)
    flat = np.concatenate([np.asarray(s, dtype=np.int64) for s in seqs_list]) + 1  # 0 = padding
    offsets = np.concatenate([[0], np.cumsum(lens)[:-1]])
    n_per_seq = np.maximum(lens - 1, 0)
    sample_start = np.repeat(offsets, n_per_seq)
    sample_end = sample_start + np.concatenate([np.arange(1, l) for l in lens])  # vi tri target
    n_samples = len(sample_end)
    if n_samples == 0:
        print("Khong co mau train nao (moi user chi co dung 1 hanh dong truoc target) — dung lai.")
        return
    print(f"So mau train: {n_samples:,}")
    col = np.arange(MAXLEN) - MAXLEN

    def make_batch(b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        idx = sample_end[b][:, None] + col  # MAXLEN vi tri ngay truoc target
        x = np.where(idx >= sample_start[b][:, None], flat[np.maximum(idx, 0)], 0)
        return x, flat[sample_end[b]]

    item_pop = np.bincount(flat, minlength=n_items + 1).astype(np.float64)
    item_pop[0] = 0
    neg_prob = item_pop / item_pop.sum()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))
    model = SASRec(n_items, D_MODEL, N_BLOCKS, N_HEADS, MAXLEN).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    neg_prob_t = torch.from_numpy(neg_prob).float().to(device)  # lay mau am tren GPU

    prev_loss = None
    for epoch in range(N_EPOCHS):
        total_loss, n_batches = 0.0, 0
        t_epoch, t_data = time.perf_counter(), 0.0
        model.train()
        perm = rng.permutation(n_samples)
        for s in range(0, n_samples, BATCH_SIZE):
            t0 = time.perf_counter()
            bx, by = make_batch(perm[s:s + BATCH_SIZE])
            batch_x = torch.from_numpy(bx).to(device, non_blocking=True)
            pos = torch.from_numpy(by).to(device, non_blocking=True)
            t_data += time.perf_counter() - t0

            h = model(batch_x)
            last_h = h[:, -1, :]

            neg_items = torch.multinomial(neg_prob_t, len(pos) * N_NEGATIVES, replacement=True).view(len(pos), N_NEGATIVES)
            candidates_t = torch.cat([pos[:, None], neg_items], dim=1)
            cand_emb = model.item_emb(candidates_t)
            logits = torch.einsum("bd,bnd->bn", last_h, cand_emb)
            labels = torch.zeros(len(pos), dtype=torch.long, device=device)

            loss = F.cross_entropy(logits, labels)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
            if MAX_STEPS and n_batches >= MAX_STEPS:
                break
        avg_loss = total_loss / n_batches
        dt = time.perf_counter() - t_epoch
        if (epoch + 1) % 5 == 0 or epoch == 0 or MAX_STEPS:
            print(f"  epoch {epoch+1}/{N_EPOCHS}: loss={avg_loss:.4f} | {dt:.1f}s "
                  f"({n_batches * BATCH_SIZE / dt:,.0f} mau/s, dung batch {100 * t_data / dt:.0f}% thoi gian)")
        if MAX_STEPS:
            print(f"    MAX_STEPS={MAX_STEPS}: do toc do xong — uoc 1 epoch day du "
                  f"~{dt * n_samples / (n_batches * BATCH_SIZE):.0f}s")
        if prev_loss is not None and prev_loss - avg_loss < 0.002 * prev_loss and epoch > 5:
            print(f"    loss gan nhu khong giam nua — dung som o epoch {epoch+1}")
            break
        prev_loss = avg_loss

    timing["train"] = round(time.perf_counter() - t_start - timing["load"] - timing["baselines"], 1)
    if device.type == "cuda":
        timing["gpu_peak_mem_gb"] = round(torch.cuda.max_memory_allocated() / 1e9, 2)
    print(f"Thoi gian: {timing}")

    # ============ Danh gia SASRec tren chinh tap nay ============
    model.eval()
    eval_inputs, eval_targets, eval_users = [], [], []
    for uid, seq in train_seqs.items():
        eval_inputs.append(pad_left(seq, MAXLEN))
        eval_targets.append(targets[uid])
        eval_users.append(uid)
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
    per_user_hits = {}  # uid -> {"hit@10": bool, "hit@20": bool} -- can cho bootstrap CI sau nay
    for uid, t, r in zip(eval_users, eval_targets, ranked_lists):
        per_user_hits[str(uid)] = {f"hit@{k}": bool(t in r[:k]) for k in TOP_K_LIST}
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
            "seed": SEED,
            "n_users_total": len(user_seqs), "n_users_trainable": len(train_seqs),
            "n_items": n_items, "n_train_samples": n_samples,
            "config": {"d_model": D_MODEL, "n_blocks": N_BLOCKS, "n_heads": N_HEADS, "maxlen": MAXLEN,
                       "batch_size": BATCH_SIZE, "n_negatives": N_NEGATIVES, "max_steps": MAX_STEPS, "emb_init": EMB_INIT},
            "timing_s": timing,
            "sasrec": results, "popularity_same_protocol": {f"recall@{k}": round(pop_recall[k], 4) for k in TOP_K_LIST},
            "recency_same_protocol": {f"recall@{k}": round(recency_recall[k], 4) for k in TOP_K_LIST},
            "per_user_hits": per_user_hits,  # SASRec, de bootstrap CI
            "recency_per_user_hits": recency_per_user,  # cung user -> paired bootstrap
            "note": "So sanh CHI trong noi bo tap platform — KHONG so voi so REES46 "
                    "(khac protocol, khac catalog, khac quy mo).",
        }, f, ensure_ascii=False, indent=2)
    print(f"Da luu {OUT_PATH}")


if __name__ == "__main__":
    main()
