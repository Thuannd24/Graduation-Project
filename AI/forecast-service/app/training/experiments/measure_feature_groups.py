"""Đo giá trị của từng NHÓM feature mới, trên cùng giao thức đã dùng cho baseline.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

Mốc phải vượt (đã đo, `cart_abandon_rule_vs_ml.py`):
    LightGBM trên 17 feature hành vi phẳng = **0,7462**, sàn nhiễu **±0,0111**
⇒ Nhận một nhóm khi **ΔAUC > 0,0111**.

Giao thức giữ NGUYÊN để so được: GroupKFold theo visitor (5 fold), AUC (không F1 — base rate 70%),
cùng tham số LightGBM.

Mỗi nhóm mới luôn chạy kèm **đối chứng âm** (xáo trộn chính nhóm đó giữa các hàng). Nếu bản xáo
không tụt so với bản thật thì phần hơn của nhóm là ảo — hoặc harness đang rò rỉ.

Script thuần phân tích: không lưu model, không đụng production.
"""
from __future__ import annotations

import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

DATASET_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
GROUPS_PATH = os.environ.get("RR_GROUPS_PATH", "/tmp/feature_groups.json")
ITEM_PATH = os.environ.get("RR_ITEM_FEATURES_PATH", "/tmp/item_features.csv")
POP_PATH = os.environ.get("RR_POP_FEATURES_PATH", "")  # nhóm D — ngày 2, chưa có thì bỏ qua
OUT_PATH = os.environ.get("RR_GROUP_RESULT_PATH", "/tmp/feature_group_result.json")

N_SPLITS = 5
RANDOM_STATE = 42

df = pd.read_csv(DATASET_PATH)
with open(GROUPS_PATH, encoding="utf-8") as f:
    groups_def = json.load(f)
FEATURES_A = groups_def["A"]

# --- Ghép nhóm C (và D nếu đã có) theo đúng thứ tự hàng ---
item_df = pd.read_csv(ITEM_PATH)
FEATURES_C = [
    "item_category", "item_cat_parent", "item_cat_depth",
    "item_price", "item_available", "item_age_days", "item_n_prop_changes",
    "item_has_properties",
]
key = ["visitorid", "itemid", "ts"]
# RetailRocket có sự kiện trùng hệt nhau -> merge theo key sẽ NHÂN BẢN hàng nếu không khử trùng
# trước. Lần chạy đầu để lọt lỗi này: 69.332 -> 70.064 hàng (+1,1%).
before = len(df)
item_df = item_df.drop_duplicates(subset=key)
df = df.merge(item_df[key + FEATURES_C], on=key, how="left")
assert len(df) == before, f"merge làm đổi số hàng: {before} -> {len(df)}"

FEATURES_D: list[str] = []
if POP_PATH and os.path.exists(POP_PATH):
    pop_df = pd.read_csv(POP_PATH)
    FEATURES_D = [c for c in pop_df.columns if c not in key]
    df = df.merge(pop_df, on=key, how="left")

y = df["abandoned"].to_numpy()
groups = df["visitorid"].to_numpy()
print(f"Mẫu {len(df):,} | bỏ giỏ {y.mean():.1%} | visitor {df.visitorid.nunique():,}")
print(f"A={len(FEATURES_A)} · C={len(FEATURES_C)} · D={len(FEATURES_D)}")

splits = list(GroupKFold(n_splits=N_SPLITS).split(df, y, groups))
rng = np.random.default_rng(RANDOM_STATE)


def run(columns: list[str], shuffle_cols: list[str] | None = None) -> tuple[float, float]:
    aucs = []
    for tr_idx, te_idx in splits:
        train, test = df.iloc[tr_idx].copy(), df.iloc[te_idx].copy()
        if shuffle_cols:
            # xáo giữa các HÀNG: giữ phân bố từng cột, phá liên kết với nhãn
            train[shuffle_cols] = train[shuffle_cols].to_numpy()[rng.permutation(len(train))]
            test[shuffle_cols] = test[shuffle_cols].to_numpy()[rng.permutation(len(test))]
        model = lgb.LGBMClassifier(
            n_estimators=300, learning_rate=0.05, num_leaves=31,
            random_state=RANDOM_STATE, verbose=-1,
        )
        model.fit(train[columns], y[tr_idx])
        proba = model.predict_proba(test[columns])[:, 1]
        aucs.append(roc_auc_score(y[te_idx], proba))
    return float(np.mean(aucs)), float(np.std(aucs))


configs: dict[str, dict] = {
    "A (baseline hành vi)": {"cols": FEATURES_A},
    "A + C (sản phẩm)": {"cols": FEATURES_A + FEATURES_C},
    "A + C ĐÃ XÁO (đối chứng âm)": {"cols": FEATURES_A + FEATURES_C, "shuffle": FEATURES_C},
    "chỉ C": {"cols": FEATURES_C},
}
if FEATURES_D:
    configs["A + D (dân số)"] = {"cols": FEATURES_A + FEATURES_D}
    configs["A + C + D"] = {"cols": FEATURES_A + FEATURES_C + FEATURES_D}
    configs["A + C + D ĐÃ XÁO"] = {
        "cols": FEATURES_A + FEATURES_C + FEATURES_D,
        "shuffle": FEATURES_C + FEATURES_D,
    }

results: dict[str, dict] = {}
for name, cfg in configs.items():
    mean, std = run(cfg["cols"], cfg.get("shuffle"))
    results[name] = {"auc_mean": round(mean, 4), "auc_std": round(std, 4)}
    print(f"  {name:34s} AUC {mean:.4f} ± {std:.4f}")

base = results["A (baseline hành vi)"]["auc_mean"]
noise = results["A (baseline hành vi)"]["auc_std"]
for name, row in results.items():
    row["delta_vs_A"] = round(row["auc_mean"] - base, 4)
    row["beats_noise"] = bool(row["delta_vs_A"] > noise)

verdict = {
    "noise_floor": noise,
    "delta_C": results["A + C (sản phẩm)"]["delta_vs_A"],
    "delta_C_shuffled": results["A + C ĐÃ XÁO (đối chứng âm)"]["delta_vs_A"],
    "C_beats_noise": results["A + C (sản phẩm)"]["beats_noise"],
    "control_is_clean": bool(
        abs(results["A + C ĐÃ XÁO (đối chứng âm)"]["delta_vs_A"]) <= noise
    ),
}
if FEATURES_D:
    verdict["delta_D"] = results["A + D (dân số)"]["delta_vs_A"]
    verdict["delta_CD"] = results["A + C + D"]["delta_vs_A"]
    verdict["D_adds_beyond_C"] = bool(
        results["A + C + D"]["auc_mean"] - results["A + C (sản phẩm)"]["auc_mean"] > noise
    )

out = {"results": results, "verdict": verdict}
print("\n" + json.dumps(out, ensure_ascii=False, indent=2))
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"\nĐã lưu {OUT_PATH}")
