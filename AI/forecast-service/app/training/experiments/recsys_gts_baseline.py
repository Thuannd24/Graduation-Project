"""Tuần 1 — Global Temporal Split (GTS) + baseline Popularity/ItemKNN cho bài toán gợi ý.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §6
và [`recsys-research-and-plan.md`](../../../../docs/canvas/recsys-research-and-plan.md) §3.1 cho
lý do chọn GTS thay vì leave-one-out (giao thức cũ RÒ RỈ THỜI GIAN, đã đo tụt 21,7-73,4% khi sửa).

## Giao thức (đúng công thức đã chốt trong plan)

  - cutoff = phân vị 0,9 theo THỜI GIAN của toàn bộ tương tác (không phải theo user)
  - train = mọi tương tác truoc cutoff
  - target = "Last" — với mỗi user có hoạt động SAU cutoff, lấy item CUỐI CÙNG họ tương tác làm
    target; các tương tác sau cutoff nhưng TRƯỚC target (nếu có) được thêm vào lịch sử "đã biết"
    của user đó (không phải target, không phải rò rỉ — đây là ngữ cảnh đã quan sát được tại thời
    điểm dự đoán)
  - Xếp hạng TOÀN BỘ catalog, filter-seen (loại item đã tương tác trong TRAIN + phần lịch sử sau
    cutoff của user đó)
  - KHÔNG sampled metric — đúng nguyên tắc đã chốt

## An toàn bộ nhớ

Ma trận tương tác dùng `scipy.sparse.csr_matrix` — với ~400K user x ~100-200K item nhưng chỉ ~15M
tương tác dương, mật độ ~0,0002%, ma trận thưa chỉ tốn vài chục MB thay vì hàng chục GB nếu dùng
ma trận đặc (dense). Đây là lý do bắt buộc dùng sparse ngay từ đầu cho bài toán gợi ý, khác hẳn
cách tiếp cận DataFrame đã dùng cho bài toán bỏ-giỏ hàng (số dòng nhỏ hơn nhiều, ~1 hàng/mẫu).
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
from scipy import sparse

INTERACTIONS_PATH = os.environ.get("INTERACTIONS_PATH", "/tmp/interactions.csv")
MAPS_PATH = os.environ.get("INTERACTIONS_MAPS_PATH", "/tmp/interactions_maps.json")
OUT_PATH = os.environ.get("GTS_RESULT_PATH", "/tmp/gts_baseline_result.json")

CUTOFF_QUANTILE = 0.9
TOP_K_LIST = [10, 20]
ITEMKNN_TOPK_NEIGHBORS = 100  # so item lang gieng giu lai moi item (chan bung no O(n_item^2))


def top_k_indices(scores: np.ndarray, k: int) -> np.ndarray:
    """Lấy top-K chỉ số theo điểm giảm dần, KHÔNG argsort toàn bộ mảng — bắt buộc khi n_items lớn
    và phải lặp lại cho hàng chục nghìn user (argsort đầy đủ mỗi user sẽ tốn hàng chục GB tích luỹ)."""
    if k >= len(scores):
        return np.argsort(-scores)
    part = np.argpartition(-scores, k)[:k]
    return part[np.argsort(-scores[part])]


def recall_at_k(target_items: np.ndarray, ranked_lists: list[np.ndarray], k: int) -> float:
    hits = sum(1 for t, ranked in zip(target_items, ranked_lists) if t in ranked[:k])
    return hits / len(target_items)


def ndcg_at_k(target_items: np.ndarray, ranked_lists: list[np.ndarray], k: int) -> float:
    total = 0.0
    for t, ranked in zip(target_items, ranked_lists):
        topk = ranked[:k]
        pos = np.where(topk == t)[0]
        if len(pos):
            total += 1.0 / np.log2(pos[0] + 2)
    return total / len(target_items)


def coverage(ranked_lists: list[np.ndarray], k: int, n_items: int) -> float:
    recommended = set()
    for ranked in ranked_lists:
        recommended.update(ranked[:k].tolist())
    return len(recommended) / n_items


def gini_at_k(ranked_lists: list[np.ndarray], k: int, n_items: int) -> float:
    counts = np.zeros(n_items, dtype=np.int64)
    for ranked in ranked_lists:
        counts[ranked[:k]] += 1
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
cutoff_dt_days = (df["ts_epoch"].max() - cutoff) / 86400
print(f"Cutoff (phan vi {CUTOFF_QUANTILE}): {cutoff_dt_days:.1f} ngay cuoi cua du lieu")

train_df = df[df["ts_epoch"] <= cutoff]
holdout_df = df[df["ts_epoch"] > cutoff].sort_values("ts_epoch")

# target = tuong tac CUOI CUNG cua moi user trong holdout; phan con lai la "ngu canh da biet"
last_idx = holdout_df.groupby("user_idx").tail(1).index
target_df = holdout_df.loc[last_idx]
context_df = holdout_df.drop(index=last_idx)

# chi giu user CO tuong tac trong TRAIN (khong the goi y cho user chua tung xuat hien)
users_with_train = set(train_df["user_idx"].unique())
target_df = target_df[target_df["user_idx"].isin(users_with_train)]

print(f"Train: {len(train_df):,} dong | Target (test): {len(target_df):,} user")

# seen items (train + context sau cutoff) de FILTER SEEN khi xep hang
seen = train_df.groupby("user_idx")["item_idx"].apply(set).to_dict()
for uid, grp in context_df.groupby("user_idx"):
    seen.setdefault(uid, set()).update(grp["item_idx"].tolist())

# ma tran tuong tac TRAIN dang thua (nhi phan: co tuong tac hay khong)
rows = train_df["user_idx"].to_numpy()
cols = train_df["item_idx"].to_numpy()
data = np.ones(len(train_df), dtype=np.float32)
R = sparse.csr_matrix((data, (rows, cols)), shape=(n_users, n_items))
R.sum_duplicates()
R.data[:] = 1.0  # nhi phan hoa lai sau khi gop trung
print(f"Ma tran train: {R.shape}, {R.nnz:,} phan tu khac 0 (mat do {R.nnz/(n_users*n_items):.6%})")

item_pop = np.asarray(R.sum(axis=0)).ravel()  # tan suat item trong TRAIN
popular_ranking = np.argsort(-item_pop)  # toan catalog, giam dan theo do pho bien

target_users = target_df["user_idx"].to_numpy()
target_items = target_df["item_idx"].to_numpy()
print(f"\nSo user co target hop le: {len(target_users):,}\n")


MAX_K = max(TOP_K_LIST)
# Quet tu dau danh sach da sap theo do pho bien, bo qua item seen, dung lai o MAX_K — KHONG giu
# toan bo n_items cho moi user (ly do: xem top_k_indices() o tren).
_POP_SCAN_BUFFER = MAX_K + 2000  # du de bu lai so item bi loai vi da seen


def rank_for_user_popularity(uid: int) -> np.ndarray:
    """Popularity: BỎ item đã seen khỏi thứ hạng chung (KHÔNG cá nhân hoá gì thêm). Vector hoá
    bằng `np.isin` thay vì lặp Python — nhanh hơn nhiều khi số user cần dự đoán lớn."""
    seen_set = seen.get(uid)
    limit = min(len(popular_ranking), _POP_SCAN_BUFFER)
    candidates = popular_ranking[:limit]
    if seen_set:
        seen_arr = np.fromiter(seen_set, dtype=np.int64, count=len(seen_set))
        candidates = candidates[~np.isin(candidates, seen_arr)]
    return candidates[:MAX_K]


print("=== Baseline 1: Popularity ===")
ranked_pop = [rank_for_user_popularity(u) for u in target_users]
results = {"popularity": {}, "itemknn": {}}
for k in TOP_K_LIST:
    results["popularity"][f"recall@{k}"] = round(recall_at_k(target_items, ranked_pop, k), 5)
    results["popularity"][f"ndcg@{k}"] = round(ndcg_at_k(target_items, ranked_pop, k), 5)
    results["popularity"][f"coverage@{k}"] = round(coverage(ranked_pop, k, n_items), 5)
    results["popularity"][f"gini@{k}"] = round(gini_at_k(ranked_pop, k, n_items), 5)
print(json.dumps(results["popularity"], indent=2))
del ranked_pop

print("\n=== Baseline 2: ItemKNN (cosine similarity, top-K lang gieng) ===")
# chuan hoa cot (item) ve do dai 1 -> tich vo huong = cosine similarity
col_norm = np.sqrt(np.asarray(R.power(2).sum(axis=0)).ravel())
col_norm[col_norm == 0] = 1.0
R_norm = R.multiply(1.0 / col_norm)  # broadcast theo cot
R_norm = R_norm.tocsr()

# S = R_norm^T @ R_norm cho ma tran tuong dong item-item (n_items x n_items) -- co the LON neu
# n_items ~ hang tram nghin; TINH THEO KHOI (block) de tranh dung mot luc toan bo O(n_items^2)
BLOCK = 2000
S_rows, S_cols, S_data = [], [], []
R_norm_csc = R_norm.tocsc()
for start in range(0, n_items, BLOCK):
    end = min(start + BLOCK, n_items)
    block_sim = (R_norm_csc[:, start:end].T @ R_norm).tocsr()  # (block, n_items), thua
    for local_i in range(block_sim.shape[0]):
        row = block_sim.getrow(local_i)
        if row.nnz == 0:
            continue
        idx = row.indices
        val = row.data
        if len(idx) > ITEMKNN_TOPK_NEIGHBORS:
            top = np.argpartition(-val, ITEMKNN_TOPK_NEIGHBORS)[:ITEMKNN_TOPK_NEIGHBORS]
            idx, val = idx[top], val[top]
        global_i = start + local_i
        S_rows.extend([global_i] * len(idx))
        S_cols.extend(idx.tolist())
        S_data.extend(val.tolist())
    print(f"  ItemKNN: {end}/{n_items} item xong")

S = sparse.csr_matrix((S_data, (S_rows, S_cols)), shape=(n_items, n_items))
del S_rows, S_cols, S_data, R_norm_csc
print(f"Ma tran tuong dong item-item: {S.nnz:,} canh (da cat con {ITEMKNN_TOPK_NEIGHBORS} lang gieng/item)")

# diem goi y = R[user] @ S — CHI tinh cho target_users (khong phai toan bo n_users), tranh lang
# phi tinh toan/bo nho cho ~90% user khong can du doan trong luot nay
R_target = R[target_users]  # (len(target_users), n_items), thua
scores_target = (R_target @ S).tocsr()  # (len(target_users), n_items)

ranked_knn = []
for row_i, uid in enumerate(target_users):
    row = scores_target.getrow(row_i).toarray().ravel()
    for it in seen.get(uid, ()):
        row[it] = -np.inf
    ranked_knn.append(top_k_indices(row, MAX_K))

for k in TOP_K_LIST:
    results["itemknn"][f"recall@{k}"] = round(recall_at_k(target_items, ranked_knn, k), 5)
    results["itemknn"][f"ndcg@{k}"] = round(ndcg_at_k(target_items, ranked_knn, k), 5)
    results["itemknn"][f"coverage@{k}"] = round(coverage(ranked_knn, k, n_items), 5)
    results["itemknn"][f"gini@{k}"] = round(gini_at_k(ranked_knn, k, n_items), 5)
print(json.dumps(results["itemknn"], indent=2))

out = {
    "n_users": n_users, "n_items": n_items,
    "n_train_interactions": int(len(train_df)),
    "n_target_users": int(len(target_users)),
    "cutoff_quantile": CUTOFF_QUANTILE,
    "results": results,
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
