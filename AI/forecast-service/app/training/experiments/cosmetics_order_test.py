"""Đo giá trị của THỨ TỰ trên REES46 Cosmetics — phép kiểm ghép cặp.

Xem [`docs/canvas/recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md) §5.2/5.3.

Luật quyết định (chốt trước): nhận khi mean(Δ) > std(Δ) VÀ >=80% fold dương. Đối chứng âm bắt
buộc: xáo B_SESS giữa các hàng.

## ⚠️ Bản đã sửa vì lý do AN TOÀN BỘ NHỚ (2026-09-18)

Bản đầu (`df.iloc[tr_idx]` mỗi fold + `.copy()` cho đối chứng âm, 5 lượt x 5 fold = 25 lần, trên
DataFrame pandas 5,76M dòng × ~45 cột) làm process tăng liên tục 1,5GB → 2,5GB chỉ sau 2 fold đầu,
không có dấu hiệu dừng lại — đã KILL giữa chừng để tránh treo máy (RAM hệ thống lúc đó chỉ còn ~2GB
trống). Nguyên nhân: mỗi fold giữ lại 1 bản copy DataFrame đầy đủ cột (kể cả cột không cần cho
model như `ts`/`product_id`/`month`), và không có `gc.collect()` ép giải phóng giữa các fold.

Sửa 3 điểm:
  1. Trích X/y ra numpy array MỘT LẦN duy nhất (gọn hơn nhiều so với giữ DataFrame nhiều cột),
     rồi XOÁ DataFrame gốc ngay — không cần các cột phụ (`ts`, `product_id`, `month`) để fit model.
  2. `gc.collect()` cưỡng bức sau MỖI fold.
  3. Dataset lớn hơn 6,2x (5,76M so với 926K dòng) nên GIẢM 5 lượt -> 1 lượt (vẫn 5 fold, nhưng mỗi
     fold giờ có ~4,6M dòng train — thừa sức mạnh thống kê so với 5 lượt trên dữ liệu nhỏ hơn).
"""
from __future__ import annotations

import gc
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

DATASET_PATH = os.environ.get("COSMETICS_DATASET_PATH", "/tmp/cosmetics_dataset.csv")
GROUPS_PATH = os.environ.get("COSMETICS_GROUPS_PATH", "/tmp/cosmetics_groups.json")
OUT_PATH = os.environ.get("COSMETICS_ORDER_RESULT_PATH", "/tmp/cosmetics_order_result.json")

N_SPLITS = int(os.environ.get("N_SPLITS", "5"))
N_REPEATS = int(os.environ.get("N_REPEATS", "1"))
SEED = 42
MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42


def paired(delta: np.ndarray) -> dict:
    mean, std = float(delta.mean()), float(delta.std())
    share = float((delta > 0).mean())
    return {
        "n_folds": int(len(delta)),
        "delta_mean": round(mean, 5), "delta_std": round(std, 5),
        "share_positive": round(share, 3),
        "significant": bool(mean > std and share >= MIN_POSITIVE_SHARE),
    }


def fit_auc(X_tr, y_tr, X_te, y_te) -> float:
    model = lgb.LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31,
                                random_state=RANDOM_STATE, verbose=-1)
    model.fit(X_tr, y_tr)
    return roc_auc_score(y_te, model.predict_proba(X_te)[:, 1])


print("Doc du lieu ...")
df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    groups_def = json.load(f)
FEATURES_A, FEATURES_B = groups_def["A"], groups_def["B_SESS"]
ALL_COLS = FEATURES_A + FEATURES_B
n_a = len(FEATURES_A)

y = df["abandoned"].to_numpy()
groups = df["user_id"].to_numpy()
X = df[ALL_COLS].to_numpy(dtype=np.float32)  # gon hon nhieu so voi giu ca DataFrame nhieu cot
n_total = len(df)
print(f"Mau {n_total:,} | bo gio {y.mean():.1%} | user {df['user_id'].nunique():,}")
print(f"A={n_a} | B_SESS={len(FEATURES_B)}")

del df
gc.collect()
print(f"Giao thuc: {N_REPEATS} luot x {N_SPLITS} fold = {N_REPEATS*N_SPLITS} fold ghep cap\n")

rng_shuffle = np.random.default_rng(RANDOM_STATE)
auc_a, auc_ab, auc_shuf = [], [], []

for repeat in range(N_REPEATS):
    rng = np.random.default_rng(SEED + repeat)
    unique_groups = np.unique(groups)
    fold_of = {g: i % N_SPLITS for i, g in enumerate(rng.permutation(unique_groups))}
    assignment = np.array([fold_of[g] for g in groups])

    for fold in range(N_SPLITS):
        tr_idx = np.where(assignment != fold)[0]
        te_idx = np.where(assignment == fold)[0]

        X_tr_a, X_te_a = X[tr_idx, :n_a], X[te_idx, :n_a]
        auc_a.append(fit_auc(X_tr_a, y[tr_idx], X_te_a, y[te_idx]))

        X_tr_ab, X_te_ab = X[tr_idx], X[te_idx]
        auc_ab.append(fit_auc(X_tr_ab, y[tr_idx], X_te_ab, y[te_idx]))

        # doi chung am: xao PHAN B (cot tu n_a tro di) rieng, khong dung .copy() ca bang
        X_tr_shuf, X_te_shuf = X_tr_ab.copy(), X_te_ab.copy()
        X_tr_shuf[:, n_a:] = X_tr_shuf[rng_shuffle.permutation(len(X_tr_shuf)), n_a:]
        X_te_shuf[:, n_a:] = X_te_shuf[rng_shuffle.permutation(len(X_te_shuf)), n_a:]
        auc_shuf.append(fit_auc(X_tr_shuf, y[tr_idx], X_te_shuf, y[te_idx]))

        del X_tr_a, X_te_a, X_tr_ab, X_te_ab, X_tr_shuf, X_te_shuf
        gc.collect()
        print(f"  luot {repeat+1}/{N_REPEATS} fold {fold+1}/{N_SPLITS} xong")

auc_a, auc_ab, auc_shuf = map(np.array, (auc_a, auc_ab, auc_shuf))
delta_real = auc_ab - auc_a
delta_control = auc_shuf - auc_a

real = paired(delta_real)
control = paired(delta_control)

print("\n--- AUC ---")
print(f"  A (khong thu tu)       {auc_a.mean():.4f} +- {auc_a.std():.4f}")
print(f"  A + B_SESS (co thu tu) {auc_ab.mean():.4f} +- {auc_ab.std():.4f}")
print(f"  A + B_SESS da xao      {auc_shuf.mean():.4f} +- {auc_shuf.std():.4f}")
print("\n--- Hieu ghep cap ---")
print(f"  THAT: delta={real['delta_mean']:+.5f}+-{real['delta_std']:.5f} | {real['share_positive']:.0%} fold+ | GIU={real['significant']}")
print(f"  DOI CHUNG AM: delta={control['delta_mean']:+.5f}+-{control['delta_std']:.5f} | {control['share_positive']:.0%} fold+ | GIU={control['significant']}")
print(f"\n  Harness hop le (doi chung am KHONG duoc nhan): {not control['significant']}")

out = {
    "n_samples": n_total,
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
