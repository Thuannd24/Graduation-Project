"""Đo giá trị của THỨ TỰ trên REES46 Cosmetics — phép kiểm ghép cặp đã sửa lỗi hôm nay.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §5.2.

Giao thức: 5 lượt x 5 fold ghép cặp, chia theo user (giống `measure_feature_groups_repeated.py`).
Luật quyết định (chốt trước, giống mọi phép đo hôm nay): nhận khi mean(Δ) > std(Δ) VÀ
>=80% fold dương. Đối chứng âm bắt buộc: xáo B_SESS giữa các hàng.
"""
from __future__ import annotations

import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

DATASET_PATH = os.environ.get("COSMETICS_DATASET_PATH", "/tmp/cosmetics_dataset.csv")
GROUPS_PATH = os.environ.get("COSMETICS_GROUPS_PATH", "/tmp/cosmetics_groups.json")
OUT_PATH = os.environ.get("COSMETICS_ORDER_RESULT_PATH", "/tmp/cosmetics_order_result.json")

N_SPLITS, N_REPEATS, SEED = 5, 5, 42
MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42


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
        "delta_mean": round(mean, 5), "delta_std": round(std, 5),
        "share_positive": round(share, 3),
        "significant": bool(mean > std and share >= MIN_POSITIVE_SHARE),
    }


df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    groups_def = json.load(f)
FEATURES_A, FEATURES_B_SESS = groups_def["A"], groups_def["B_SESS"]

y = df["abandoned"].to_numpy()
groups = df["user_id"].to_numpy()
print(f"Mau {len(df):,} | bo gio {y.mean():.1%} | user {df.user_id.nunique():,}")
print(f"A={len(FEATURES_A)} | B_SESS={len(FEATURES_B_SESS)}")
print(f"Giao thuc: {N_REPEATS} luot x {N_SPLITS} fold = {N_REPEATS*N_SPLITS} fold ghep cap\n")

rng_shuffle = np.random.default_rng(RANDOM_STATE)


def fit_auc(train, test, y_tr, y_te, cols, shuffle_cols=None):
    if shuffle_cols:
        train, test = train.copy(), test.copy()
        train[shuffle_cols] = train[shuffle_cols].to_numpy()[rng_shuffle.permutation(len(train))]
        test[shuffle_cols] = test[shuffle_cols].to_numpy()[rng_shuffle.permutation(len(test))]
    model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31,
                                random_state=RANDOM_STATE, verbose=-1)
    model.fit(train[cols], y_tr)
    return roc_auc_score(y_te, model.predict_proba(test[cols])[:, 1])


auc_a, auc_ab, auc_shuf = [], [], []
for repeat, fold, tr_idx, te_idx in repeated_group_kfold(groups, N_SPLITS, N_REPEATS, SEED):
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]
    auc_a.append(fit_auc(train, test, y_tr, y_te, FEATURES_A))
    auc_ab.append(fit_auc(train, test, y_tr, y_te, FEATURES_A + FEATURES_B_SESS))
    auc_shuf.append(fit_auc(train, test, y_tr, y_te, FEATURES_A + FEATURES_B_SESS, FEATURES_B_SESS))
    if fold == N_SPLITS - 1:
        print(f"  luot {repeat+1}/{N_REPEATS} xong")

auc_a, auc_ab, auc_shuf = map(np.array, (auc_a, auc_ab, auc_shuf))
delta_real = auc_ab - auc_a
delta_control = auc_shuf - auc_a

real = paired(delta_real)
control = paired(delta_control)

print("\n--- AUC ---")
print(f"  A (khong thu tu)     {auc_a.mean():.4f} +- {auc_a.std():.4f}")
print(f"  A + B_SESS (co thu tu) {auc_ab.mean():.4f} +- {auc_ab.std():.4f}")
print(f"  A + B_SESS da xao      {auc_shuf.mean():.4f} +- {auc_shuf.std():.4f}")
print("\n--- Hieu ghep cap ---")
print(f"  THAT: delta={real['delta_mean']:+.5f}+-{real['delta_std']:.5f} | {real['share_positive']:.0%} fold+ | GIU={real['significant']}")
print(f"  DOI CHUNG AM: delta={control['delta_mean']:+.5f}+-{control['delta_std']:.5f} | {control['share_positive']:.0%} fold+ | GIU={control['significant']}")
print(f"\n  Harness hop le (doi chung am KHONG duoc nhan): {not control['significant']}")

out = {
    "auc": {"A": {"mean": round(float(auc_a.mean()),4), "std": round(float(auc_a.std()),4)},
            "A_plus_B": {"mean": round(float(auc_ab.mean()),4), "std": round(float(auc_ab.std()),4)},
            "A_plus_B_shuffled": {"mean": round(float(auc_shuf.mean()),4), "std": round(float(auc_shuf.std()),4)}},
    "order_effect": real, "negative_control": control,
    "harness_valid": bool(not control["significant"]),
    "order_matters": bool(real["significant"]),
}
print("\n" + json.dumps(out, ensure_ascii=False, indent=2))
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
