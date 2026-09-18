"""L1 path trên A+C — lỗ hổng đã tự nêu ở feature-space-upgrade-plan.md: "chưa chạy L1 path trên
A+C, số 'chiều hữu dụng' đang suy từ bảng cụm chứ chưa đo trực tiếp".

Câu hỏi: trong 23 feature (17 hành vi + 6 sản phẩm, đã cắt 2 cột chết), bao nhiêu chiều là ĐỦ để
đạt AUC không phân biệt được với dùng cả 23? Đúng phương pháp đã dùng cho panel churn trước đây
(quét C của LogisticRegression L1, đếm hệ số khác 0).

Giao thức: 5 lượt x 5 fold ghép cặp (giống `measure_feature_groups_repeated.py`), MinMaxScaler bắt
buộc cho L1 (nhạy thang đo), đếm số feature còn hệ số |coef| > 1e-6.

Thuần phân tích: không lưu model, không đụng production.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import MinMaxScaler

DATASET_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
GROUPS_PATH = os.environ.get("RR_GROUPS_PATH", "/tmp/feature_groups.json")
ITEM_PATH = os.environ.get("RR_ITEM_FEATURES_PATH", "/tmp/item_features.csv")
OUT_PATH = os.environ.get("RR_L1_RESULT_PATH", "/tmp/l1_path_AC.json")

N_SPLITS, N_REPEATS, SEED = 5, 5, 42
RANDOM_STATE = 42
KEY = ["visitorid", "itemid", "ts"]
C_GRID = [0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0]

# Nhóm C đã cắt 2 cột chết (item_has_properties, item_available) theo Ngày 3 — xem
# feature-space-upgrade-plan.md §10.4
FEATURES_C = [
    "item_category", "item_cat_parent", "item_cat_depth",
    "item_price", "item_age_days", "item_n_prop_changes",
]


def repeated_group_kfold(groups, n_splits, n_repeats, seed):
    unique_groups = np.unique(groups)
    for repeat in range(n_repeats):
        rng = np.random.default_rng(seed + repeat)
        fold_of = {g: i % n_splits for i, g in enumerate(rng.permutation(unique_groups))}
        assignment = np.array([fold_of[g] for g in groups])
        for fold in range(n_splits):
            yield repeat, fold, np.where(assignment != fold)[0], np.where(assignment == fold)[0]


df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    FEATURES_A = json.load(f)["A"]

before = len(df)
item_df = pd.read_csv(ITEM_PATH).drop_duplicates(subset=KEY)
df = df.merge(item_df[KEY + FEATURES_C], on=KEY, how="left")
assert len(df) == before, f"merge lam doi so hang: {before} -> {len(df)}"

FEATURES_AC = FEATURES_A + FEATURES_C
y = df["abandoned"].to_numpy()
groups = df["visitorid"].to_numpy()
print(f"Mau {len(df):,} | A+C={len(FEATURES_AC)} feature")
print(f"Giao thuc: {N_REPEATS} luot x {N_SPLITS} fold = {N_REPEATS * N_SPLITS} fold\n")


def fit_l1(train, test, y_tr, y_te, cols, C):
    scaler = MinMaxScaler().fit(train[cols])
    model = LogisticRegression(
        penalty="l1", solver="liblinear", C=C, class_weight="balanced",
        max_iter=2000, random_state=RANDOM_STATE,
    )
    model.fit(scaler.transform(train[cols]), y_tr)
    proba = model.predict_proba(scaler.transform(test[cols]))[:, 1]
    n_kept = int((np.abs(model.coef_[0]) > 1e-6).sum())
    kept_names = [c for c, w in zip(cols, model.coef_[0]) if abs(w) > 1e-6]
    return roc_auc_score(y_te, proba), n_kept, kept_names


results = {}
for C in C_GRID:
    aucs, n_kepts = [], []
    kept_counter: dict[str, int] = {c: 0 for c in FEATURES_AC}
    for repeat, fold, tr_idx, te_idx in repeated_group_kfold(groups, N_SPLITS, N_REPEATS, SEED):
        train, test = df.iloc[tr_idx], df.iloc[te_idx]
        auc, n_kept, kept_names = fit_l1(train, test, y[tr_idx], y[te_idx], FEATURES_AC, C)
        aucs.append(auc)
        n_kepts.append(n_kept)
        for name in kept_names:
            kept_counter[name] += 1
    aucs, n_kepts = np.array(aucs), np.array(n_kepts)
    top_features = sorted(kept_counter.items(), key=lambda kv: -kv[1])[:6]
    results[str(C)] = {
        "auc_mean": round(float(aucs.mean()), 4),
        "auc_std": round(float(aucs.std()), 4),
        "n_features_kept_mean": round(float(n_kepts.mean()), 1),
        "top_features_by_fold_frequency": [f"{n} ({c}/25)" for n, c in top_features],
    }
    print(
        f"  C={C:<6} AUC={aucs.mean():.4f}+-{aucs.std():.4f} | "
        f"feature giu trung binh={n_kepts.mean():.1f} | top: {[t[0] for t in top_features[:3]]}"
    )

# Mốc đối chiếu: full 23 feature không phạt L1 (C rất lớn ~ không regularize)
full_aucs = []
for repeat, fold, tr_idx, te_idx in repeated_group_kfold(groups, N_SPLITS, N_REPEATS, SEED):
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    auc, _, _ = fit_l1(train, test, y[tr_idx], y[te_idx], FEATURES_AC, C=100.0)
    full_aucs.append(auc)
full_aucs = np.array(full_aucs)
print(f"\n  Doi chieu (C=100, gan nhu khong phat): AUC={full_aucs.mean():.4f}+-{full_aucs.std():.4f}")

noise = full_aucs.std()
best_small = max(
    (row for c, row in results.items() if row["n_features_kept_mean"] <= 5),
    key=lambda r: r["auc_mean"],
    default=None,
)
verdict = {
    "full_AC_auc": {"mean": round(float(full_aucs.mean()), 4), "std": round(float(full_aucs.std()), 4)},
    "noise_floor": round(float(noise), 4),
    "smallest_indistinguishable_config": best_small,
    "indistinguishable_from_full": (
        bool(abs(best_small["auc_mean"] - full_aucs.mean()) < noise) if best_small else None
    ),
}
print("\n" + json.dumps({"per_C": results, "verdict": verdict}, ensure_ascii=False, indent=2))
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump({"per_C": results, "verdict": verdict}, f, ensure_ascii=False, indent=2)
print(f"\nDa luu {OUT_PATH}")
