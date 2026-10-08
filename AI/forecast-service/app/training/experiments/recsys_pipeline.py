"""Pipeline gợi ý — 3 tầng TÁCH BIỆT, đo riêng từng tầng, thay vì 1 bước chấm-điểm-toàn-catalog.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §6.

## Vì sao tách tầng (đúng phê bình "pipeline quá ít công đoạn")

Bản trước (`recsys_gts_baseline.py`) chấm điểm TOÀN BỘ catalog bằng ItemKNN rồi lấy top-K luôn —
đúng 1 tầng. Hệ gợi ý thật (và tài liệu recsys) luôn tách 2 tầng vì 2 lý do:

  1. **Chi phí**: model ranking mạnh (eSASRec, sẽ thay vào tầng 2 sau) quá đắt để chạy trên TOÀN
     catalog cho mỗi user — phải thu hẹp trước bằng 1 tầng RẺ (candidate generation/retrieval).
  2. **Đo được TRẦN của tầng retrieval riêng**: nếu tầng 1 không giữ được item đúng trong tập ứng
     viên, tầng 2 dù mạnh cỡ nào cũng không cứu được. Đây là chỉ số CHẤT LƯỢNG của chính tầng 1,
     tách biệt khỏi chất lượng tầng 2 — pipeline 1 tầng cũ KHÔNG đo được điều này.

## 3 tầng

  ① CANDIDATE GENERATION — hợp của 3 nguồn RẺ: ItemKNN (top-N láng giềng của item gần nhất user
     đã tương tác) ∪ Popularity (top toàn cục) ∪ Recent (item user vừa xem, trọng số cao nhất khi
     ranking). Đo Recall@N_candidates NGAY TẠI ĐÂY — đây là trần cho mọi tầng sau.
  ② RANKING — sắp xếp lại đúng tập ứng viên (không phải toàn catalog) theo điểm ItemKNN (placeholder
     cho tới khi eSASRec được huấn luyện — điểm rẽ nhánh rõ ràng để cắm model mới vào).
  ③ RE-RANKING — áp rule nghiệp vụ: giới hạn tối đa K item/category (đa dạng hoá), dùng bảng
     `item_category_map.csv`.

An toàn bộ nhớ: mọi phép tính theo BATCH user (không giữ toàn bộ ma trận điểm số cùng lúc), dùng
`top_k_indices` (partial sort) thay vì argsort toàn bộ — đúng bài học đã rút ra hôm nay.
"""
from __future__ import annotations

import gc
import json
import os

import numpy as np
import pandas as pd
from scipy import sparse

INTERACTIONS_PATH = os.environ.get("INTERACTIONS_PATH", "/tmp/interactions.csv")
MAPS_PATH = os.environ.get("INTERACTIONS_MAPS_PATH", "/tmp/interactions_maps.json")
ITEM_CATEGORY_PATH = os.environ.get("ITEM_CATEGORY_PATH", "/tmp/item_category_map.csv")
OUT_PATH = os.environ.get("PIPELINE_RESULT_PATH", "/tmp/recsys_pipeline_result.json")

CUTOFF_QUANTILE = 0.9
N_CANDIDATES = 200          # kich thuoc tap ung vien sau tang (1)
TOP_K_LIST = [10, 20]
ITEMKNN_TOPK_NEIGHBORS = 100
MAX_PER_CATEGORY = 3        # gioi han da dang hoa o tang (3)
# 2000 x n_items x 4 byte (float32) -- voi n_items ~54K thi moi batch la ~435MB dac, an toan hon
# nhieu so voi ban dau (5000 x n_items co the ~1GB neu S vo tinh la float64)
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "1000"))


def top_k_indices(scores: np.ndarray, k: int) -> np.ndarray:
    if k >= len(scores):
        return np.argsort(-scores)
    part = np.argpartition(-scores, k)[:k]
    return part[np.argsort(-scores[part])]


def recall_at_k(target_items, ranked_lists, k):
    hits = sum(1 for t, r in zip(target_items, ranked_lists) if t in r[:k])
    return hits / len(target_items)


def ndcg_at_k(target_items, ranked_lists, k):
    total = 0.0
    for t, r in zip(target_items, ranked_lists):
        pos = np.where(r[:k] == t)[0]
        if len(pos):
            total += 1.0 / np.log2(pos[0] + 2)
    return total / len(target_items)


def coverage(ranked_lists, k, n_items):
    seen_items = set()
    for r in ranked_lists:
        seen_items.update(r[:k].tolist())
    return len(seen_items) / n_items


def gini_at_k(ranked_lists, k, n_items):
    counts = np.zeros(n_items, dtype=np.int64)
    for r in ranked_lists:
        counts[r[:k]] += 1
    counts = np.sort(counts)
    n = len(counts)
    cum = np.cumsum(counts)
    if cum[-1] == 0:
        return 0.0
    return float((n + 1 - 2 * np.sum(cum) / cum[-1]) / n)


print("Doc du lieu ...")
df = pd.read_csv(INTERACTIONS_PATH)
with open(MAPS_PATH, encoding="utf-8") as f:
    maps = json.load(f)
n_users, n_items = maps["n_users"], maps["n_items"]
print(f"{len(df):,} tuong tac | {n_users:,} user | {n_items:,} item")

cutoff = df["ts_epoch"].quantile(CUTOFF_QUANTILE)
train_df = df[df["ts_epoch"] <= cutoff]
holdout_df = df[df["ts_epoch"] > cutoff].sort_values("ts_epoch")

last_idx = holdout_df.groupby("user_idx").tail(1).index
target_df = holdout_df.loc[last_idx]
context_df = holdout_df.drop(index=last_idx)

users_with_train = set(train_df["user_idx"].unique())
target_df = target_df[target_df["user_idx"].isin(users_with_train)].reset_index(drop=True)
print(f"Train: {len(train_df):,} dong | Target: {len(target_df):,} user")

# "recent item" cua moi user = tuong tac CUOI CUNG trong TRAIN (dung cho ItemKNN va uu tien ranking)
last_train = train_df.sort_values("ts_epoch").groupby("user_idx").tail(1)
recent_item_of_user = dict(zip(last_train["user_idx"], last_train["item_idx"]))

seen = train_df.groupby("user_idx")["item_idx"].apply(set).to_dict()
for uid, grp in context_df.groupby("user_idx"):
    seen.setdefault(uid, set()).update(grp["item_idx"].tolist())

rows, cols = train_df["user_idx"].to_numpy(), train_df["item_idx"].to_numpy()
R = sparse.csr_matrix((np.ones(len(train_df), dtype=np.float32), (rows, cols)), shape=(n_users, n_items))
R.sum_duplicates()
R.data[:] = 1.0
item_pop = np.asarray(R.sum(axis=0)).ravel()
popular_ranking = np.argsort(-item_pop)
print(f"Ma tran train: {R.nnz:,} phan tu khac 0")

# --- xay ma tran tuong dong item-item (dung chung cho tang 1 va tang 2) ---
print("\nXay ma tran tuong dong item-item (ItemKNN) ...")
col_norm = np.sqrt(np.asarray(R.power(2).sum(axis=0)).ravel())
col_norm[col_norm == 0] = 1.0
R_norm = R.multiply(1.0 / col_norm).tocsc()

# ⚠️ Voi 1,6M user (nhieu hon han ban bo-gio 397K user), item-item similarity truoc khi cat top-K
# gan nhu DAC (hau het cap item deu co it nhat 1 user chung trong 1,6M user) -> block_sim voi
# BLOCK=2000 tung lam list Python tich luy vuot 3GB, phai KILL o RAM<2GB. Giam BLOCK xuong 200
# (10x nho hon) de moi block_sim nho hon han, kem gc.collect() moi block (khong phai moi 10K item).
BLOCK = 200
S_blocks = []
for start in range(0, n_items, BLOCK):
    end = min(start + BLOCK, n_items)
    block_sim = (R_norm[:, start:end].T @ R_norm).tocsr()
    rows_b, cols_b, data_b = [], [], []
    for local_i in range(block_sim.shape[0]):
        row = block_sim.getrow(local_i)
        if row.nnz == 0:
            continue
        idx, val = row.indices, row.data
        if len(idx) > ITEMKNN_TOPK_NEIGHBORS:
            top = np.argpartition(-val, ITEMKNN_TOPK_NEIGHBORS)[:ITEMKNN_TOPK_NEIGHBORS]
            idx, val = idx[top], val[top]
        rows_b.extend([local_i] * len(idx))
        cols_b.extend(idx.tolist())
        data_b.extend(val.tolist())
    block_mat = sparse.csr_matrix(
        (np.array(data_b, dtype=np.float32), (rows_b, cols_b)),
        shape=(end - start, n_items),
    )
    S_blocks.append(block_mat)
    del block_sim, rows_b, cols_b, data_b
    gc.collect()  # moi block, khong phai moi 10K item — block_sim gan nhu DAC nen phai giai
                   # phong ngay, khong doi tich luy
    if end % 2000 < BLOCK:
        print(f"  {end}/{n_items} item xong")

S = sparse.vstack(S_blocks, format="csr")
del S_blocks, R_norm
gc.collect()
print(f"Ma tran tuong dong: {S.nnz:,} canh\n")

item_category = pd.read_csv(ITEM_CATEGORY_PATH).set_index("product_id")["category_id"].to_dict()

# ================= TANG (1): CANDIDATE GENERATION =================
print(f"=== Tang 1: Candidate Generation (top {N_CANDIDATES}) ===")
target_users = target_df["user_idx"].to_numpy()
target_items = target_df["item_idx"].to_numpy()

candidates_per_user: list[np.ndarray] = []
knn_scores_per_user: list[np.ndarray] = []

n_batches_done = 0
for start in range(0, len(target_users), BATCH_SIZE):
    batch_users = target_users[start:start + BATCH_SIZE]
    R_batch = R[batch_users]  # (batch, n_items)
    knn_scores_batch = (R_batch @ S).toarray().astype(np.float32, copy=False)

    for i, uid in enumerate(batch_users):
        scores = knn_scores_batch[i].copy()
        for it in seen.get(uid, ()):
            scores[it] = -np.inf
        knn_top = top_k_indices(scores, N_CANDIDATES // 2)

        pop_top = popular_ranking[:N_CANDIDATES]
        pop_top = pop_top[~np.isin(pop_top, list(seen.get(uid, ())))][: N_CANDIDATES // 2]

        cand = np.unique(np.concatenate([knn_top, pop_top]))
        candidates_per_user.append(cand)
        knn_scores_per_user.append(scores[cand])  # giu diem KNN cho tang 2 dung lai, khoi tinh lai

    del R_batch, knn_scores_batch
    n_batches_done += 1
    if n_batches_done % 20 == 0:
        gc.collect()
    print(f"  {min(start+BATCH_SIZE, len(target_users))}/{len(target_users)} user xong")

n_cand_mean = float(np.mean([len(c) for c in candidates_per_user]))
recall_candidates = recall_at_k(target_items, candidates_per_user, N_CANDIDATES)
print(f"So ung vien trung binh/user: {n_cand_mean:.0f}")
print(f"Recall@{N_CANDIDATES} CUA RIENG TANG CANDIDATE GENERATION: {recall_candidates:.4f}")
print("  (day la TRAN cho moi tang sau - tang ranking khong the vuot qua con so nay)\n")

# ================= TANG (2): RANKING =================
print("=== Tang 2: Ranking (sap xep lai dung tap ung vien, placeholder = diem KNN) ===")
ranked_stage2 = []
for cand, scores in zip(candidates_per_user, knn_scores_per_user):
    order = np.argsort(-scores)
    ranked_stage2.append(cand[order])

results = {"stage0_popularity": {}, "stage1_candidate_generation": {}, "stage2_ranking": {}, "stage3_reranking": {}}

print("=== Tang 0: Popularity thuan (moc doi chieu cong bang, CUNG target/seen) ===")
ranked_pop = []
for uid in target_users:
    seen_set = seen.get(uid)
    cand = popular_ranking[: max(TOP_K_LIST) + 2000]
    if seen_set:
        seen_arr = np.fromiter(seen_set, dtype=np.int64, count=len(seen_set))
        cand = cand[~np.isin(cand, seen_arr)]
    ranked_pop.append(cand[: max(TOP_K_LIST)])
for k in TOP_K_LIST:
    results["stage0_popularity"][f"recall@{k}"] = round(recall_at_k(target_items, ranked_pop, k), 5)
    results["stage0_popularity"][f"ndcg@{k}"] = round(ndcg_at_k(target_items, ranked_pop, k), 5)
    results["stage0_popularity"][f"coverage@{k}"] = round(coverage(ranked_pop, k, n_items), 5)
    results["stage0_popularity"][f"gini@{k}"] = round(gini_at_k(ranked_pop, k, n_items), 5)
print(json.dumps(results["stage0_popularity"], indent=2))
del ranked_pop
gc.collect()

results["stage1_candidate_generation"]["recall_at_pool"] = round(recall_candidates, 5)
results["stage1_candidate_generation"]["avg_pool_size"] = round(n_cand_mean, 1)
for k in TOP_K_LIST:
    results["stage2_ranking"][f"recall@{k}"] = round(recall_at_k(target_items, ranked_stage2, k), 5)
    results["stage2_ranking"][f"ndcg@{k}"] = round(ndcg_at_k(target_items, ranked_stage2, k), 5)
    results["stage2_ranking"][f"coverage@{k}"] = round(coverage(ranked_stage2, k, n_items), 5)
    results["stage2_ranking"][f"gini@{k}"] = round(gini_at_k(ranked_stage2, k, n_items), 5)
print(json.dumps(results["stage2_ranking"], indent=2))

# ================= TANG (3): RE-RANKING (business rule: da dang hoa category) =================
print(f"\n=== Tang 3: Re-ranking (toi da {MAX_PER_CATEGORY} item/category) ===")
ranked_stage3 = []
for ranked in ranked_stage2:
    cat_count: dict[int, int] = {}
    kept = []
    for it in ranked:
        cat = item_category.get(int(it), -1)
        if cat_count.get(cat, 0) < MAX_PER_CATEGORY:
            kept.append(it)
            cat_count[cat] = cat_count.get(cat, 0) + 1
    # neu bi loai bot qua nhieu, bu lai bang phan con lai cua ranked (giu du K)
    if len(kept) < max(TOP_K_LIST):
        remaining = [it for it in ranked if it not in kept]
        kept.extend(remaining[: max(TOP_K_LIST) - len(kept)])
    ranked_stage3.append(np.array(kept))

for k in TOP_K_LIST:
    results["stage3_reranking"][f"recall@{k}"] = round(recall_at_k(target_items, ranked_stage3, k), 5)
    results["stage3_reranking"][f"ndcg@{k}"] = round(ndcg_at_k(target_items, ranked_stage3, k), 5)
    results["stage3_reranking"][f"coverage@{k}"] = round(coverage(ranked_stage3, k, n_items), 5)
    results["stage3_reranking"][f"gini@{k}"] = round(gini_at_k(ranked_stage3, k, n_items), 5)
print(json.dumps(results["stage3_reranking"], indent=2))

print("\n=== So sanh 3 tang (Recall@20) — cai gia cua tung buoc ===")
print(f"  Tran candidate generation (pool={N_CANDIDATES}): {recall_candidates:.4f}")
print(f"  Sau ranking (top-20 tu pool)                   : {results['stage2_ranking']['recall@20']:.4f}")
print(f"  Sau re-ranking (da dang hoa category)           : {results['stage3_reranking']['recall@20']:.4f}")
print("  (chenh lech stage2 vs stage3 = CAI GIA phai tra de doi lay da dang hoa)")

out = {
    "n_users": n_users, "n_items": n_items,
    "n_target_users": int(len(target_users)),
    "n_candidates": N_CANDIDATES, "max_per_category": MAX_PER_CATEGORY,
    "results": results,
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
