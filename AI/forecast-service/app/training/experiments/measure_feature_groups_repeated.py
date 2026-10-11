"""Repeated CV + so sánh GHÉP CẶP cho các nhóm feature.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

## Vì sao ghép cặp

Luật cũ so `mean(ΔAUC)` với `std` của **từng AUC riêng lẻ**. Nhưng std đó phần lớn phản ánh **độ khó
khác nhau giữa các fold** — nguồn nhiễu mà mọi cấu hình **cùng chịu**. Ghép cặp theo fold thì nó
triệt tiêu, và sai số còn lại mới đúng là sai số của **hiệu**. Đo được trên nhóm C: std của từng AUC
= 0,0159 nhưng std của hiệu ghép cặp chỉ **0,00207** — luật cũ khắt khe hơn thực tế **7,7×**.

## Luật quyết định (chốt trước khi chạy, áp cho MỌI nhóm)

Nhận khi **cả hai**:
  1. `mean(Δ ghép cặp) > std(Δ ghép cặp)`
  2. `≥ 80%` số fold có Δ dương

Mỗi nhóm mới chạy kèm **đối chứng âm** (xáo chính nhóm đó giữa các hàng). Đối chứng âm mà được nhận
⇒ **harness sai, vứt cả lượt**.

Thuần phân tích: không lưu model, không đụng production.
"""
from __future__ import annotations

import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

DATASET_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
GROUPS_PATH = os.environ.get("RR_GROUPS_PATH", "/tmp/feature_groups.json")
ITEM_PATH = os.environ.get("RR_ITEM_FEATURES_PATH", "/tmp/item_features.csv")
POP_PATH = os.environ.get("RR_POP_FEATURES_PATH", "")
OUT_PATH = os.environ.get("RR_REPEATED_RESULT_PATH", "/tmp/feature_group_repeated.json")

N_SPLITS, N_REPEATS, SEED = 5, 5, 42
MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42
KEY = ["visitorid", "itemid", "ts"]

FEATURES_C = [
    "item_category", "item_cat_parent", "item_cat_depth",
    "item_price", "item_available", "item_age_days", "item_n_prop_changes",
    "item_has_properties",
]


def repeated_group_kfold(groups: np.ndarray, n_splits: int, n_repeats: int, seed: int):
    """Mỗi lượt xáo lại thứ tự GROUP rồi chia đều — train/test luôn rời nhau theo visitor."""
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
assert len(df) == before, f"merge C làm đổi số hàng: {before} -> {len(df)}"

FEATURES_D: list[str] = []
if POP_PATH and os.path.exists(POP_PATH):
    pop_df = pd.read_csv(POP_PATH).drop_duplicates(subset=KEY)
    FEATURES_D = [c for c in pop_df.columns if c not in KEY]
    df = df.merge(pop_df, on=KEY, how="left")
    assert len(df) == before, f"merge D làm đổi số hàng: {before} -> {len(df)}"

y = df["abandoned"].to_numpy()
groups = df["visitorid"].to_numpy()
print(f"Mẫu {len(df):,} | bỏ giỏ {y.mean():.1%} | visitor {df.visitorid.nunique():,}")
print(f"A={len(FEATURES_A)} · C={len(FEATURES_C)} · D={len(FEATURES_D)}")
print(f"Giao thức: {N_REPEATS} lượt x {N_SPLITS} fold = {N_REPEATS * N_SPLITS} fold ghép cặp\n")

CONFIGS: dict[str, dict] = {
    "A": {"cols": FEATURES_A},
    "A+C": {"cols": FEATURES_A + FEATURES_C},
}
COMPARISONS = [("A+C", "A")]
if FEATURES_D:
    CONFIGS["A+D"] = {"cols": FEATURES_A + FEATURES_D}
    CONFIGS["A+C+D"] = {"cols": FEATURES_A + FEATURES_C + FEATURES_D}
    CONFIGS["A+D xáo (đối chứng âm D)"] = {
        "cols": FEATURES_A + FEATURES_D, "shuffle": FEATURES_D
    }
    COMPARISONS += [
        ("A+D", "A"),
        ("A+C+D", "A"),
        ("A+C+D", "A+C"),            # ← câu hỏi chính: D có thêm gì NGOÀI C không
        ("A+D xáo (đối chứng âm D)", "A"),
    ]

rng_shuffle = np.random.default_rng(RANDOM_STATE)


def fit_auc(train, test, y_tr, y_te, columns, shuffle_cols=None) -> float:
    if shuffle_cols:
        train, test = train.copy(), test.copy()
        train[shuffle_cols] = train[shuffle_cols].to_numpy()[rng_shuffle.permutation(len(train))]
        test[shuffle_cols] = test[shuffle_cols].to_numpy()[rng_shuffle.permutation(len(test))]
    model = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31,
        random_state=RANDOM_STATE, verbose=-1,
    )
    model.fit(train[columns], y_tr)
    return roc_auc_score(y_te, model.predict_proba(test[columns])[:, 1])


per_fold: dict[str, list[float]] = {name: [] for name in CONFIGS}
for repeat, fold, tr_idx, te_idx in repeated_group_kfold(groups, N_SPLITS, N_REPEATS, SEED):
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]
    for name, cfg in CONFIGS.items():
        per_fold[name].append(fit_auc(train, test, y_tr, y_te, cfg["cols"], cfg.get("shuffle")))
    if fold == N_SPLITS - 1:
        print(f"  lượt {repeat + 1}/{N_REPEATS} xong")

auc = {name: np.array(vals) for name, vals in per_fold.items()}

print("\n--- AUC ---")
for name, vals in auc.items():
    print(f"  {name:28s} {vals.mean():.4f} ± {vals.std():.4f}")

print("\n--- Hiệu GHÉP CẶP ---")
comparisons = {}
for a, b in COMPARISONS:
    delta = auc[a] - auc[b]
    mean, std = float(delta.mean()), float(delta.std())
    share = float((delta > 0).mean())
    accepted = bool(mean > std and share >= MIN_POSITIVE_SHARE)
    comparisons[f"{a} vs {b}"] = {
        "delta_mean": round(mean, 5),
        "delta_std": round(std, 5),
        "share_folds_positive": round(share, 3),
        "accepted": accepted,
    }
    print(
        f"  {a + ' vs ' + b:34s} Δ = {mean:+.5f} ± {std:.5f} | "
        f"{share:.0%} fold dương | nhận = {accepted}"
    )

control_key = "A+D xáo (đối chứng âm D) vs A"
result = {
    "protocol": f"{N_REPEATS} lượt x {N_SPLITS} fold, chia theo visitor, ghép cặp cùng fold",
    "auc": {n: {"mean": round(float(v.mean()), 4), "std": round(float(v.std()), 4)}
            for n, v in auc.items()},
    "paired_comparisons": comparisons,
    "harness_valid": bool(not comparisons.get(control_key, {}).get("accepted", False)),
}
if "A+C+D vs A+C" in comparisons:
    result["D_adds_beyond_C"] = comparisons["A+C+D vs A+C"]["accepted"]

print(f"\n  Harness hợp lệ: {result['harness_valid']}")
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f"Đã lưu {OUT_PATH}")
