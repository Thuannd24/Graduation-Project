"""Feature thứ tự nào THỰC SỰ mang giá trị, và chúng liên kết với nhau thế nào.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §5.3.

`cosmetics_order_test.py` đã xác nhận NHÓM feature thứ tự (B_SESS) có giá trị tổng, BỀN VỮNG qua
cả 5 tháng (Δ=+0,00749, 5/5 fold, |Δ|/std=6,6×). Câu hỏi tiếp: giá trị đó nằm ở ĐÂU, và các cột
mạnh có LIÊN KẾT với nhau theo đúng cơ chế "đổi ý" (cart→remove→cart) hay rải rác ngẫu nhiên?
Trên tháng 12 lẻ đã xác nhận: `sess_cum_bg_2_3` (cart→remove) áp đảo (0,0171, gấp 5× thứ nhì),
20/23 feature gần độc lập. Chạy lại trên 5,76M dòng để xác nhận không phải đặc thù 1 tháng.

## ⚠️ Bản đã sửa vì lý do AN TOÀN BỘ NHỚ (2026-09-18)

Bản đầu: `df.iloc[tr_idx]` + `test.copy()` cho MỖI trong 23+21=44 lần permutation, fit model 2 LẦN
mỗi fold (1 lần cho permutation theo cột, 1 lần cho theo cụm) — trên dataset 926K dòng thì chấp
nhận được, nhưng với 5,76M dòng sẽ lặp lại đúng sự cố đã gặp ở `cosmetics_order_test.py` (RAM tăng
không kiểm soát, phải kill 2 lần). Sửa:
  1. Trích X/y ra numpy MỘT LẦN, xoá DataFrame ngay.
  2. Fit model **1 lần/fold**, dùng lại cho CẢ permutation theo cột lẫn theo cụm.
  3. Permutation: copy `X_test` **1 lần/fold** (không phải 1 lần/cột) — xáo 1 cột, đo, khôi phục
     lại giá trị gốc, rồi mới xáo cột tiếp theo. `predict()` rẻ hơn nhiều so với `fit()` nên đây là
     phần không cần tối ưu thêm.
  4. `gc.collect()` sau mỗi fold.
"""
from __future__ import annotations

import gc
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
from scipy.stats import spearmanr
from sklearn.metrics import roc_auc_score

DATASET_PATH = os.environ.get("COSMETICS_DATASET_PATH", "/tmp/cosmetics_dataset.csv")
GROUPS_PATH = os.environ.get("COSMETICS_GROUPS_PATH", "/tmp/cosmetics_groups.json")
OUT_PATH = os.environ.get("COSMETICS_IMPORTANCE_RESULT_PATH", "/tmp/cosmetics_order_importance.json")

N_SPLITS = int(os.environ.get("N_SPLITS", "5"))
CLUSTER_THRESHOLD = 0.3
RANDOM_STATE = 42

print("Doc du lieu ...")
df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    groups_def = json.load(f)
FEATURES_A, FEATURES_B = groups_def["A"], groups_def["B_SESS"]
ALL_FEATURES = FEATURES_A + FEATURES_B
n_a = len(FEATURES_A)

y = df["abandoned"].to_numpy()
groups = df["user_id"].to_numpy()
X = df[ALL_FEATURES].to_numpy(dtype=np.float32)
print(f"Mau {len(df):,} | A={n_a} | B_SESS={len(FEATURES_B)}")

# Gom cum tuong quan TRUOC khi xoa df (can DataFrame cho spearmanr theo ten cot)
print("Gom cum tuong quan (Spearman) trong nhom B_SESS ...")
rho = np.atleast_2d(spearmanr(df[FEATURES_B].fillna(-1)).statistic)
rho = np.nan_to_num(rho, nan=0.0)
dist = 1.0 - np.abs(rho)
np.fill_diagonal(dist, 0.0)
dist = (dist + dist.T) / 2.0
labels = fcluster(linkage(squareform(dist, checks=False), method="average"),
                   CLUSTER_THRESHOLD, criterion="distance")
clusters: dict[int, list[int]] = {}  # gia tri la CHI SO CQOT trong X (tuong doi so voi n_a)
for i, (col, lab) in enumerate(zip(FEATURES_B, labels)):
    clusters.setdefault(int(lab), []).append(n_a + i)
print(f"  {len(FEATURES_B)} feature -> {len(clusters)} cum")

del df
gc.collect()

rng = np.random.default_rng(RANDOM_STATE)
unique_groups = np.unique(groups)
fold_of = {g: i % N_SPLITS for i, g in enumerate(rng.permutation(unique_groups))}
assignment = np.array([fold_of[g] for g in groups])

imp_col = {i: [] for i in range(n_a, len(ALL_FEATURES))}  # chi so cot trong X
imp_clu = {lab: [] for lab in clusters}

for fold in range(N_SPLITS):
    tr_idx = np.where(assignment != fold)[0]
    te_idx = np.where(assignment == fold)[0]

    model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31,
                                random_state=RANDOM_STATE, verbose=-1)
    model.fit(X[tr_idx], y[tr_idx])
    X_te = X[te_idx].copy()  # 1 COPY DUY NHAT cho ca fold, tai su dung cho moi lan xao
    y_te = y[te_idx]
    base = roc_auc_score(y_te, model.predict_proba(X_te)[:, 1])
    print(f"  fold {fold+1}/{N_SPLITS}: base AUC={base:.4f}")

    # Permutation TUNG COT: xao, do, KHOI PHUC truoc khi sang cot tiep theo
    for col_idx in imp_col:
        original = X_te[:, col_idx].copy()
        X_te[:, col_idx] = original[rng.permutation(len(X_te))]
        drop = base - roc_auc_score(y_te, model.predict_proba(X_te)[:, 1])
        imp_col[col_idx].append(drop)
        X_te[:, col_idx] = original  # khoi phuc

    # Permutation THEO CUM: xao ca nhom cot cung luc
    for lab, col_idxs in clusters.items():
        original = X_te[:, col_idxs].copy()
        perm = rng.permutation(len(X_te))
        X_te[:, col_idxs] = original[perm]
        imp_clu[lab].append(base - roc_auc_score(y_te, model.predict_proba(X_te)[:, 1]))
        X_te[:, col_idxs] = original

    del model, X_te, y_te
    gc.collect()

idx_to_name = {n_a + i: col for i, col in enumerate(FEATURES_B)}
mean_imp = {idx_to_name[i]: float(np.mean(v)) for i, v in imp_col.items()}
ranked = sorted(mean_imp.items(), key=lambda kv: -kv[1])
print(f"\n--- Permutation importance TUNG COT, sap xep giam dan ---")
for col, imp in ranked[:15]:
    print(f"  {col:28s} {imp:+.5f}")

print(f"\n  {'tong theo COT':>14s}  {'theo CUM':>10s}   cot")
cluster_rows = []
mean_clu = {lab: float(np.mean(v)) for lab, v in imp_clu.items()}
for lab, col_idxs in sorted(clusters.items(), key=lambda kv: -mean_clu[kv[0]]):
    cols = [idx_to_name[i] for i in col_idxs]
    sum_cols = float(sum(mean_imp[c] for c in cols))
    clu = mean_clu[lab]
    hidden = bool(len(cols) > 1 and clu > sum_cols + 0.0005)
    cluster_rows.append({"columns": cols, "sum_of_column_importance": round(sum_cols, 5),
                          "cluster_importance": round(clu, 5), "hidden_by_correlation": hidden})
    print(f"  {sum_cols:14.5f}  {clu:10.5f}   {', '.join(cols)}{'  <-- BI CHE' if hidden else ''}")

out = {
    "n_samples": int(len(y)),
    "column_importance_ranked": [{"feature": c, "auc_drop": round(v, 5)} for c, v in ranked],
    "cluster_importance": cluster_rows,
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
