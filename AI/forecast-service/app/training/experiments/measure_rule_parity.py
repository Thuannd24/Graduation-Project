"""Ngày 3 — QUY GÁN phần tăng của nhóm C: cho model, hay cho cả rule?

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

## Phần 1 — Rule phải được nhận CÙNG bộ feature

Nguyên tắc đã lập từ giai đoạn churn: baseline rule phải được cho **đúng bộ feature mới**, nếu không
là so lệch. Nhóm C làm LightGBM tăng +0,01113. Câu hỏi:

  - Cây quyết định cũng tăng **ngần ấy** ⇒ C là **thông tin mới cho CẢ HAI BÊN**, không phải ưu thế
    của AI. Phải viết đúng như vậy trong báo cáo.
  - Model tăng **nhiều hơn** cây ⇒ C mang thông tin mà **chỉ model khai thác được** (phải kết hợp
    nhiều chiều mới dùng được) ⇒ đây mới là ưu thế của AI.

Đo bằng hiệu ghép cặp trên CÙNG 25 fold, rồi so trực tiếp `Δ_model − Δ_cây` (cũng ghép cặp).

## Phần 2 — Permutation theo CỤM tương quan

Điểm mù đã biết: `monetary` importance 0,0001 nhưng tương quan 0,877 với `frequency` — xáo một cột
thì cột kia gánh, nên **cả hai trông vô dụng** dù cặp thì thiết yếu. Gom cụm theo Spearman rồi xáo
TOÀN CỤM mới ra tầm quan trọng thật.

Thuần phân tích: không lưu model, không đụng production.
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
from sklearn.tree import DecisionTreeClassifier

DATASET_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
GROUPS_PATH = os.environ.get("RR_GROUPS_PATH", "/tmp/feature_groups.json")
ITEM_PATH = os.environ.get("RR_ITEM_FEATURES_PATH", "/tmp/item_features.csv")
OUT_PATH = os.environ.get("RR_PARITY_RESULT_PATH", "/tmp/rule_parity_result.json")

N_SPLITS, N_REPEATS, SEED = 5, 5, 42
FOLDS_FOR_IMPORTANCE = 5      # permutation không cần tới 25 fold
CLUSTER_THRESHOLD = 0.3       # khoảng cách = 1 - |spearman|, cắt 0,3 tức gom khi |rho| >= 0,7
TREE_DEPTHS = [1, 2, 3, 6]
MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42
KEY = ["visitorid", "itemid", "ts"]

FEATURES_C = [
    "item_category", "item_cat_parent", "item_cat_depth",
    "item_price", "item_available", "item_age_days", "item_n_prop_changes",
    "item_has_properties",
]


def repeated_group_kfold(groups, n_splits, n_repeats, seed):
    unique_groups = np.unique(groups)
    for repeat in range(n_repeats):
        rng = np.random.default_rng(seed + repeat)
        fold_of = {g: i % n_splits for i, g in enumerate(rng.permutation(unique_groups))}
        assignment = np.array([fold_of[g] for g in groups])
        for fold in range(n_splits):
            yield repeat, fold, np.where(assignment != fold)[0], np.where(assignment == fold)[0]


def paired(delta: np.ndarray) -> dict:
    mean, std = float(delta.mean()), float(delta.std())
    share = float((delta > 0).mean())
    return {
        "delta_mean": round(mean, 5),
        "delta_std": round(std, 5),
        "share_positive": round(share, 3),
        "significant": bool(mean > std and share >= MIN_POSITIVE_SHARE),
    }


df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    FEATURES_A = json.load(f)["A"]
before = len(df)
item_df = pd.read_csv(ITEM_PATH).drop_duplicates(subset=KEY)
df = df.merge(item_df[KEY + FEATURES_C], on=KEY, how="left")
assert len(df) == before, f"merge làm đổi số hàng: {before} -> {len(df)}"
FEATURES_AC = FEATURES_A + FEATURES_C

y = df["abandoned"].to_numpy()
groups = df["visitorid"].to_numpy()
print(f"Mau {len(df):,} | A={len(FEATURES_A)} | A+C={len(FEATURES_AC)}")
print(f"Giao thuc: {N_REPEATS} luot x {N_SPLITS} fold ghep cap\n")


def fit_lgb(train, test, y_tr, y_te, cols):
    model = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31,
        random_state=RANDOM_STATE, verbose=-1,
    )
    model.fit(train[cols], y_tr)
    return roc_auc_score(y_te, model.predict_proba(test[cols])[:, 1])


def fit_tree(train, test, y_tr, y_te, cols, depth):
    tree = DecisionTreeClassifier(max_depth=depth, random_state=RANDOM_STATE)
    tree.fit(train[cols], y_tr)
    return roc_auc_score(y_te, tree.predict_proba(test[cols])[:, 1])


# ---------------- PHAN 1: rule co duoc nhan cung bo feature ----------------
methods = ["lgb"] + [f"tree{d}" for d in TREE_DEPTHS]
scores = {f"{m}_{fs}": [] for m in methods for fs in ("A", "AC")}

for repeat, fold, tr_idx, te_idx in repeated_group_kfold(groups, N_SPLITS, N_REPEATS, SEED):
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]
    for fs, cols in (("A", FEATURES_A), ("AC", FEATURES_AC)):
        scores[f"lgb_{fs}"].append(fit_lgb(train, test, y_tr, y_te, cols))
        for depth in TREE_DEPTHS:
            scores[f"tree{depth}_{fs}"].append(fit_tree(train, test, y_tr, y_te, cols, depth))
    if fold == N_SPLITS - 1:
        print(f"  luot {repeat + 1}/{N_REPEATS} xong")

arr = {k: np.array(v) for k, v in scores.items()}

print("\n--- AUC theo bo feature ---")
gains = {}
for name in [f"tree{d}" for d in TREE_DEPTHS] + ["lgb"]:
    a, ac = arr[f"{name}_A"], arr[f"{name}_AC"]
    gains[name] = paired(ac - a)
    label = "LightGBM" if name == "lgb" else f"cay depth-{name[4:]}"
    print(
        f"  {label:14s} A={a.mean():.4f}+-{a.std():.4f}  "
        f"A+C={ac.mean():.4f}+-{ac.std():.4f}  "
        f"loi ich tu C={gains[name]['delta_mean']:+.5f} ({gains[name]['share_positive']:.0%} fold)"
    )

print("\n--- Model huong loi tu C NHIEU HON rule bao nhieu? (ghep cap) ---")
extra = {}
for depth in TREE_DEPTHS:
    diff = (arr["lgb_AC"] - arr["lgb_A"]) - (arr[f"tree{depth}_AC"] - arr[f"tree{depth}_A"])
    extra[f"vs_tree{depth}"] = paired(diff)
    row = extra[f"vs_tree{depth}"]
    print(
        f"  vs cay depth-{depth}: {row['delta_mean']:+.5f} +- {row['delta_std']:.5f} | "
        f"{row['share_positive']:.0%} fold | dang ke = {row['significant']}"
    )

best_tree_a = max(TREE_DEPTHS, key=lambda d: arr[f"tree{d}_A"].mean())
best_tree_ac = max(TREE_DEPTHS, key=lambda d: arr[f"tree{d}_AC"].mean())
gap_a = paired(arr["lgb_A"] - arr[f"tree{best_tree_a}_A"])
gap_ac = paired(arr["lgb_AC"] - arr[f"tree{best_tree_ac}_AC"])
print("\n  Khoang cach LightGBM - cay tot nhat:")
print(f"    tren A   (cay depth-{best_tree_a}): {gap_a['delta_mean']:+.5f} +- {gap_a['delta_std']:.5f}")
print(f"    tren A+C (cay depth-{best_tree_ac}): {gap_ac['delta_mean']:+.5f} +- {gap_ac['delta_std']:.5f}")

# ---------------- PHAN 2: permutation theo CUM tuong quan ----------------
print("\n--- Permutation: theo COT vs theo CUM tuong quan ---")
rho = np.atleast_2d(spearmanr(df[FEATURES_AC].fillna(-1)).statistic)
rho = np.nan_to_num(rho, nan=0.0)
dist = 1.0 - np.abs(rho)
np.fill_diagonal(dist, 0.0)
dist = (dist + dist.T) / 2.0
labels = fcluster(
    linkage(squareform(dist, checks=False), method="average"),
    CLUSTER_THRESHOLD,
    criterion="distance",
)
clusters: dict[int, list[str]] = {}
for col, lab in zip(FEATURES_AC, labels):
    clusters.setdefault(int(lab), []).append(col)
n_multi = sum(1 for v in clusters.values() if len(v) > 1)
print(f"  {len(FEATURES_AC)} feature -> {len(clusters)} cum ({n_multi} cum co >1 cot)")

rng_perm = np.random.default_rng(RANDOM_STATE)
imp_col = {c: [] for c in FEATURES_AC}
imp_clu = {k: [] for k in clusters}
for i, (_, _, tr_idx, te_idx) in enumerate(repeated_group_kfold(groups, N_SPLITS, 1, SEED)):
    if i >= FOLDS_FOR_IMPORTANCE:
        break
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    model = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31,
        random_state=RANDOM_STATE, verbose=-1,
    )
    model.fit(train[FEATURES_AC], y[tr_idx])
    base = roc_auc_score(y[te_idx], model.predict_proba(test[FEATURES_AC])[:, 1])
    for col in FEATURES_AC:
        shuffled = test.copy()
        shuffled[col] = shuffled[col].to_numpy()[rng_perm.permutation(len(shuffled))]
        imp_col[col].append(
            base - roc_auc_score(y[te_idx], model.predict_proba(shuffled[FEATURES_AC])[:, 1])
        )
    for lab, cols in clusters.items():
        shuffled = test.copy()
        shuffled[cols] = shuffled[cols].to_numpy()[rng_perm.permutation(len(shuffled))]
        imp_clu[lab].append(
            base - roc_auc_score(y[te_idx], model.predict_proba(shuffled[FEATURES_AC])[:, 1])
        )

print(f"\n  {'tong theo COT':>14s}  {'theo CUM':>10s}   cot")
cluster_rows = []
for lab, cols in sorted(clusters.items(), key=lambda kv: -float(np.mean(imp_clu[kv[0]]))):
    sum_cols = float(sum(np.mean(imp_col[c]) for c in cols))
    clu = float(np.mean(imp_clu[lab]))
    hidden = bool(len(cols) > 1 and clu > sum_cols + 0.002)
    cluster_rows.append({
        "columns": cols,
        "sum_of_column_importance": round(sum_cols, 5),
        "cluster_importance": round(clu, 5),
        "hidden_by_correlation": hidden,
    })
    print(f"  {sum_cols:14.5f}  {clu:10.5f}   {', '.join(cols)}{'   <-- BI CHE' if hidden else ''}")

result = {
    "part1_rule_parity": {
        "auc": {k: {"mean": round(float(v.mean()), 4), "std": round(float(v.std()), 4)}
                for k, v in arr.items()},
        "gain_from_C": gains,
        "model_extra_gain_over_tree": extra,
        "gap_lgb_minus_best_tree": {
            "on_A": gap_a, "on_A_plus_C": gap_ac,
            "best_tree_depth_A": best_tree_a, "best_tree_depth_AC": best_tree_ac,
        },
    },
    "part2_cluster_importance": cluster_rows,
}
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
