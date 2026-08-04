"""Bước 2: đo 4 mốc trên CÙNG bộ fold, chia theo visitor (user-disjoint) như mọi phần khác của dự án.

  1. RULE tốt nhất trên nhóm A   -> quét lưới, chọn ngưỡng trên train, đo trên test (KHÔNG cherry-pick)
  2. LightGBM trên nhóm A        -> đo giá trị của TƯƠNG TÁC PHI TUYẾN (rule không có)
  3. LightGBM trên A + B         -> đo giá trị của THỨ TỰ (rule không biểu diễn được)
  4. LightGBM trên A + B đã XÁO  -> ĐỐI CHỨNG ÂM: xáo thứ tự nhóm B giữa các mẫu.
                                    Nếu (4) ~ (2) thì phần hơn của (3) đúng là do thứ tự thật,
                                    không phải do "thêm cột nào cũng tăng điểm".

Kết luận chỉ được rút khi delta VƯỢT SÀN NHIỄU (±std giữa các fold) — cùng chuẩn đã dùng cả dự án.
"""
import json

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import GroupKFold

DATA = "/tmp/seq_dataset.csv"
N_SPLITS = 5
RANDOM_STATE = 42
QUANTILES = np.arange(0.05, 1.0, 0.05)

df = pd.read_csv(DATA)
with open("/tmp/feature_groups.txt") as f:
    FEATURES_A = f.readline().strip().split(",")
    FEATURES_B = f.readline().strip().split(",")

y = df["abandoned"].to_numpy()
groups = df["visitorid"].to_numpy()
print(f"Mẫu {len(df):,} | bỏ giỏ {y.mean():.1%} | visitor {df.visitorid.nunique():,}")
print(f"A={len(FEATURES_A)} feature (rule dùng được) | B={len(FEATURES_B)} feature (chỉ model)")

gkf = GroupKFold(n_splits=N_SPLITS)
splits = list(gkf.split(df, y, groups))


def best_rule(train, y_tr, test, y_te, columns):
    """Quét MỌI feature nhóm A × 2 chiều × 19 mốc phân vị; chọn theo F1 trên TRAIN, đo trên TEST."""
    best = (-1, None)
    for col in columns:
        vals = train[col].to_numpy()
        for q in QUANTILES:
            thr = np.quantile(vals, q)
            for direction in (">=", "<="):
                pred_tr = (vals >= thr) if direction == ">=" else (vals <= thr)
                s = f1_score(y_tr, pred_tr.astype(int), zero_division=0)
                if s > best[0]:
                    best = (s, (col, direction, thr))
    col, direction, thr = best[1]
    v = test[col].to_numpy()
    pred = (v >= thr) if direction == ">=" else (v <= thr)
    return {
        "f1": f1_score(y_te, pred.astype(int), zero_division=0),
        "rule": f"{col} {direction} {thr:.4g}",
    }


def run_lgb(train, y_tr, test, y_te, columns):
    m = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31,
        random_state=RANDOM_STATE, verbose=-1,
    )
    m.fit(train[columns], y_tr)
    p = m.predict_proba(test[columns])[:, 1]
    # Ngưỡng cũng tune trên TRAIN (công bằng với rule) rồi mới đo F1 trên test
    p_tr = m.predict_proba(train[columns])[:, 1]
    best_thr, best_s = 0.5, -1
    for thr in np.arange(0.2, 0.85, 0.01):
        s = f1_score(y_tr, (p_tr >= thr).astype(int), zero_division=0)
        if s > best_s:
            best_s, best_thr = s, thr
    return {
        "auc": roc_auc_score(y_te, p),
        "f1": f1_score(y_te, (p >= best_thr).astype(int), zero_division=0),
    }


rng = np.random.default_rng(RANDOM_STATE)
res = {k: {"auc": [], "f1": []} for k in ("lgb_A", "lgb_AB", "lgb_AB_shuffled")}
res["rule_A"] = {"f1": []}
rules_chosen = []

for i, (tr_idx, te_idx) in enumerate(splits, 1):
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]

    r = best_rule(train, y_tr, test, y_te, FEATURES_A)
    res["rule_A"]["f1"].append(r["f1"])
    rules_chosen.append(r["rule"])

    for key, cols in (("lgb_A", FEATURES_A), ("lgb_AB", FEATURES_A + FEATURES_B)):
        out = run_lgb(train, y_tr, test, y_te, cols)
        res[key]["auc"].append(out["auc"])
        res[key]["f1"].append(out["f1"])

    # Đối chứng âm: xáo trộn nhóm B giữa các HÀNG (giữ phân bố từng cột, phá liên kết với nhãn)
    tr_s, te_s = train.copy(), test.copy()
    tr_s[FEATURES_B] = tr_s[FEATURES_B].to_numpy()[rng.permutation(len(tr_s))]
    te_s[FEATURES_B] = te_s[FEATURES_B].to_numpy()[rng.permutation(len(te_s))]
    out = run_lgb(tr_s, y_tr, te_s, y_te, FEATURES_A + FEATURES_B)
    res["lgb_AB_shuffled"]["auc"].append(out["auc"])
    res["lgb_AB_shuffled"]["f1"].append(out["f1"])
    print(f"  fold {i}/{N_SPLITS} xong")


def ms(v):
    return (round(float(np.mean(v)), 4), round(float(np.std(v)), 4)) if v else (None, None)


summary = {}
for k, v in res.items():
    entry = {}
    for metric, vals in v.items():
        m, s = ms(vals)
        entry[f"{metric}_mean"], entry[f"{metric}_std"] = m, s
    summary[k] = entry
summary["rule_A"]["rules_per_fold"] = rules_chosen

# Kết luận: delta có vượt sàn nhiễu không?
noise = summary["lgb_AB"]["auc_std"]
d_order = round(summary["lgb_AB"]["auc_mean"] - summary["lgb_A"]["auc_mean"], 4)
d_shuf = round(summary["lgb_AB_shuffled"]["auc_mean"] - summary["lgb_A"]["auc_mean"], 4)
d_rule_f1 = round(summary["lgb_AB"]["f1_mean"] - summary["rule_A"]["f1_mean"], 4)

summary["verdict"] = {
    "noise_floor_auc_std": noise,
    "delta_auc_from_ORDER (AB - A)": d_order,
    "order_beats_noise": bool(d_order > noise),
    "delta_auc_shuffled_control (should be ~0)": d_shuf,
    "control_is_clean": bool(abs(d_shuf) <= noise),
    "delta_f1_model_vs_best_rule": d_rule_f1,
    "model_beats_rule_beyond_noise": bool(d_rule_f1 > summary["lgb_AB"]["f1_std"]),
}

print("\n" + json.dumps(summary, ensure_ascii=False, indent=2))
with open("/tmp/seq_experiment_result.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
