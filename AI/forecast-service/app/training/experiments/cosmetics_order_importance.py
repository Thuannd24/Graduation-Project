"""Feature thứ tự nào THỰC SỰ mang giá trị, và chúng liên kết với nhau thế nào.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §5.3.

`cosmetics_order_test.py` đã xác nhận NHÓM 23 feature thứ tự (B_SESS) có giá trị tổng
(Δ=+0,00666, 25/25 fold). Câu hỏi tiếp: giá trị đó nằm ở ĐÂU trong 23 cột, và các cột mạnh có
LIÊN KẾT với nhau theo đúng cơ chế "đổi ý" (cart→remove→cart) hay là rải rác ngẫu nhiên?

Hai phép đo:
1. Permutation importance TỪNG CỘT của B_SESS trên model A+B_SESS đầy đủ.
2. Permutation THEO CỤM tương quan (đúng kỹ thuật đã dùng ở feature-space-upgrade-plan Ngày 3) —
   để không lặp lại lỗi "đánh giá theo cột che mất feature trong cụm tương quan".
"""
from __future__ import annotations

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

N_SPLITS, SEED = 5, 42
CLUSTER_THRESHOLD = 0.3
RANDOM_STATE = 42

df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    groups_def = json.load(f)
FEATURES_A, FEATURES_B = groups_def["A"], groups_def["B_SESS"]
ALL_FEATURES = FEATURES_A + FEATURES_B

y = df["abandoned"].to_numpy()
groups = df["user_id"].to_numpy()
print(f"Mau {len(df):,} | A={len(FEATURES_A)} | B_SESS={len(FEATURES_B)}\n")

rng = np.random.default_rng(RANDOM_STATE)
unique_groups = np.unique(groups)
fold_of = {g: i % N_SPLITS for i, g in enumerate(rng.permutation(unique_groups))}
assignment = np.array([fold_of[g] for g in groups])

imp_col = {c: [] for c in FEATURES_B}

for fold in range(N_SPLITS):
    tr_idx, te_idx = np.where(assignment != fold)[0], np.where(assignment == fold)[0]
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31,
                                random_state=RANDOM_STATE, verbose=-1)
    model.fit(train[ALL_FEATURES], y[tr_idx])
    base = roc_auc_score(y[te_idx], model.predict_proba(test[ALL_FEATURES])[:, 1])
    for col in FEATURES_B:
        shuffled = test.copy()
        shuffled[col] = shuffled[col].to_numpy()[rng.permutation(len(shuffled))]
        drop = base - roc_auc_score(y[te_idx], model.predict_proba(shuffled[ALL_FEATURES])[:, 1])
        imp_col[col].append(drop)
    print(f"  fold {fold+1}/{N_SPLITS} xong (base AUC={base:.4f})")

print(f"\n--- Permutation importance TUNG COT (nhom B_SESS), sap xep giam dan ---")
mean_imp = {c: float(np.mean(v)) for c, v in imp_col.items()}
ranked = sorted(mean_imp.items(), key=lambda kv: -kv[1])
for col, imp in ranked[:15]:
    print(f"  {col:28s} {imp:+.5f}")

# --- Permutation theo CUM tuong quan trong nhom B_SESS ---
print(f"\n--- Gom cum tuong quan (Spearman) trong 23 feature B_SESS ---")
rho = np.atleast_2d(spearmanr(df[FEATURES_B].fillna(-1)).statistic)
rho = np.nan_to_num(rho, nan=0.0)
dist = 1.0 - np.abs(rho)
np.fill_diagonal(dist, 0.0)
dist = (dist + dist.T) / 2.0
labels = fcluster(linkage(squareform(dist, checks=False), method="average"),
                   CLUSTER_THRESHOLD, criterion="distance")
clusters: dict[int, list[str]] = {}
for col, lab in zip(FEATURES_B, labels):
    clusters.setdefault(int(lab), []).append(col)
print(f"  {len(FEATURES_B)} feature -> {len(clusters)} cum")

imp_clu = {k: [] for k in clusters}
for fold in range(N_SPLITS):
    tr_idx, te_idx = np.where(assignment != fold)[0], np.where(assignment == fold)[0]
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31,
                                random_state=RANDOM_STATE, verbose=-1)
    model.fit(train[ALL_FEATURES], y[tr_idx])
    base = roc_auc_score(y[te_idx], model.predict_proba(test[ALL_FEATURES])[:, 1])
    for lab, cols in clusters.items():
        shuffled = test.copy()
        shuffled[cols] = shuffled[cols].to_numpy()[rng.permutation(len(shuffled))]
        imp_clu[lab].append(base - roc_auc_score(y[te_idx], model.predict_proba(shuffled[ALL_FEATURES])[:, 1]))

print(f"\n  {'tong theo COT':>14s}  {'theo CUM':>10s}   cot")
cluster_rows = []
for lab, cols in sorted(clusters.items(), key=lambda kv: -float(np.mean(imp_clu[kv[0]]))):
    sum_cols = float(sum(mean_imp[c] for c in cols))
    clu = float(np.mean(imp_clu[lab]))
    hidden = bool(len(cols) > 1 and clu > sum_cols + 0.0005)
    cluster_rows.append({"columns": cols, "sum_of_column_importance": round(sum_cols, 5),
                          "cluster_importance": round(clu, 5), "hidden_by_correlation": hidden})
    print(f"  {sum_cols:14.5f}  {clu:10.5f}   {', '.join(cols)}{'  <-- BI CHE' if hidden else ''}")

out = {
    "column_importance_ranked": [{"feature": c, "auc_drop": round(v, 5)} for c, v in ranked],
    "cluster_importance": cluster_rows,
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
