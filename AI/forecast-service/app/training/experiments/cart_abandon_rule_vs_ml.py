"""Bước 2: đo rule vs model trên CÙNG bộ fold, chia theo visitor (user-disjoint).

## ❗ BA LỖI ĐO ĐÃ SỬA Ở BẢN NÀY

1. **Baseline rule quá yếu.** Bản trước chỉ quét `1 feature × 1 ngưỡng` — dạng rule yếu nhất
   có thể — trong khi `app/training/rule_benchmark.py` (bên churn) đã quét cả rule 2 điều kiện
   AND lẫn cây quyết định depth 1/2/3. Nay bổ sung **cây depth 1/2/3/6** = tập rule tối ưu do
   máy tìm ở cùng mức phức tạp, tức baseline rule-based MẠNH NHẤT dựng được.

2. **Không thể so trên metric xếp hạng.** Bản trước chỉ tính F1 cho rule, không tính AUC, nên
   về mặt cấu trúc không so được rule vs model trên xếp hạng — trong khi chính phân tích lại
   kết luận F1 là metric rác ở base rate ~70%. Nay mọi phương pháp đều có AUC, và
   **phán quyết tự động tính trên AUC**; F1 vẫn báo nhưng luôn kèm baseline tầm thường
   ("đoán tất cả đều bỏ giỏ") để không bao giờ đọc nhầm nữa.

3. **Số trong báo cáo không tái lập được.** Bảng cây depth-1/2/3/6/10 từng ghi trong
   `docs/canvas/churn-risk-log.md` KHÔNG do file này sinh ra (grep toàn `experiments/`:
   `DecisionTree` chỉ có trong `synthetic_sequence_dgp.py`). Script đã chạy nằm ở `/tmp` với
   tên khác. Nay mọi con số trong bảng đều do CHÍNH file này sinh ra.

## Các mốc đo

  0. Baseline tầm thường     -> đoán tất cả = bỏ giỏ. Mốc phải vượt trước khi nói bất cứ điều gì.
  1. Xếp hạng bằng 1 feature -> chọn feature trên train theo AUC, đo AUC trên test.
  2. Rule 1 biến 1 ngưỡng    -> quét lưới, chọn trên train, đo trên test (F1).
  3. Cây depth 1/2/3/6 trên A-> rule tối ưu do máy tìm; báo cả số lá để biết người có viết tay nổi không.
  4. LightGBM trên A         -> giá trị của TƯƠNG TÁC PHI TUYẾN.
  5. LightGBM trên A+B_SESS  -> giá trị của THỨ TỰ **trong phiên** (bản đã sửa lỗi cắt phiên).
  6. LightGBM trên A+B_VIS   -> thứ tự tính XUYÊN PHIÊN = đúng thiết kế cũ, giữ để ĐỊNH LƯỢNG lỗi.
  7. LightGBM A+B_SESS XÁO   -> ĐỐI CHỨNG ÂM. Nếu (7) ~ (4) thì phần hơn của (5) là thứ tự thật.

Kết luận chỉ được rút khi delta VƯỢT SÀN NHIỄU (±std giữa các fold) — cùng chuẩn cả dự án.

⚠ Giới hạn còn lại (chưa sửa, cố ý): `GroupKFold` chỉ tách visitor, KHÔNG giữ nhân quả thời
gian như `_evaluate_grouped_cv` bên churn. Hiện chưa gây rò rỉ vì mọi feature đều đã trừ chính
event hiện tại và các fold rời nhau theo visitor — nhưng sẽ RÒ RỈ NGAY khi thêm nhóm feature
mức dân số (vd tỉ lệ bỏ giỏ theo item/category), vì thống kê đó chạy xuyên thời gian.
"""
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.tree import DecisionTreeClassifier

DATA = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
GROUPS_PATH = os.environ.get("RR_GROUPS_PATH", "/tmp/feature_groups.json")
OUT_PATH = os.environ.get("RR_RESULT_PATH", "/tmp/seq_experiment_result.json")
N_SPLITS = 5
RANDOM_STATE = 42
QUANTILES = np.arange(0.05, 1.0, 0.05)
TREE_DEPTHS = [1, 2, 3, 6]

df = pd.read_csv(DATA)
with open(GROUPS_PATH, encoding="utf-8") as f:
    groups_def = json.load(f)
FEATURES_A = groups_def["A"]
FEATURES_B_SESS = groups_def["B_SESS"]
FEATURES_B_VIS = groups_def["B_VIS"]

y = df["abandoned"].to_numpy()
groups = df["visitorid"].to_numpy()
print(f"Mẫu {len(df):,} | bỏ giỏ {y.mean():.1%} | visitor {df.visitorid.nunique():,}")
print(
    f"A={len(FEATURES_A)} (rule dùng được) | B_SESS={len(FEATURES_B_SESS)} (thứ tự trong phiên) "
    f"| B_VIS={len(FEATURES_B_VIS)} (thứ tự xuyên phiên — thiết kế cũ)"
)

gkf = GroupKFold(n_splits=N_SPLITS)
splits = list(gkf.split(df, y, groups))


def tuned_f1(y_tr, score_tr, y_te, score_te, grid):
    """Chọn ngưỡng theo F1 TRÊN TRAIN rồi đo trên TEST — đối xử với model y như với rule."""
    best_thr, best_s = grid[0], -1.0
    for thr in grid:
        s = f1_score(y_tr, (score_tr >= thr).astype(int), zero_division=0)
        if s > best_s:
            best_s, best_thr = s, thr
    return f1_score(y_te, (score_te >= best_thr).astype(int), zero_division=0)


def best_single_feature_ranking(train, y_tr, test, y_te, columns):
    """Xếp hạng bằng ĐÚNG MỘT feature: chọn feature + chiều trên TRAIN theo AUC, đo trên TEST.

    Đây là phép so trực tiếp cho luận điểm "một con số có đủ mang tín hiệu không".
    """
    best = (-1.0, None, 1.0)
    for col in columns:
        v_tr = train[col].to_numpy(dtype=float)
        if len(np.unique(v_tr)) < 2:
            continue
        for sign in (1.0, -1.0):
            auc_tr = roc_auc_score(y_tr, v_tr * sign)
            if auc_tr > best[0]:
                best = (auc_tr, col, sign)
    _, col, sign = best
    v_te = test[col].to_numpy(dtype=float) * sign
    return {"auc": roc_auc_score(y_te, v_te), "feature": f"{'+' if sign > 0 else '-'}{col}"}


def best_rule_f1(train, y_tr, test, y_te, columns):
    """Rule tốt nhất dạng `feature >= t` / `<= t`: chọn theo F1 TRÊN TRAIN, đo trên TEST."""
    best = (-1.0, None)
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


def run_tree(train, y_tr, test, y_te, columns, depth):
    """Cây giới hạn độ sâu = tập rule tối ưu do máy tìm ở cùng mức phức tạp."""
    t = DecisionTreeClassifier(max_depth=depth, random_state=RANDOM_STATE)
    t.fit(train[columns], y_tr)
    p_tr = t.predict_proba(train[columns])[:, 1]
    p_te = t.predict_proba(test[columns])[:, 1]
    return {
        "auc": roc_auc_score(y_te, p_te),
        "f1": tuned_f1(y_tr, p_tr, y_te, p_te, np.arange(0.05, 0.96, 0.01)),
        "leaves": int(t.get_n_leaves()),
    }


def run_lgb(train, y_tr, test, y_te, columns):
    m = lgb.LGBMClassifier(
        n_estimators=300, learning_rate=0.05, num_leaves=31,
        random_state=RANDOM_STATE, verbose=-1,
    )
    m.fit(train[columns], y_tr)
    p_tr = m.predict_proba(train[columns])[:, 1]
    p_te = m.predict_proba(test[columns])[:, 1]
    return {
        "auc": roc_auc_score(y_te, p_te),
        "f1": tuned_f1(y_tr, p_tr, y_te, p_te, np.arange(0.2, 0.85, 0.01)),
    }


rng = np.random.default_rng(RANDOM_STATE)
res: dict[str, dict[str, list]] = {}
chosen: dict[str, list[str]] = {}
leaves: dict[str, list[int]] = {}


def record(name, auc=None, f1=None):
    entry = res.setdefault(name, {"auc": [], "f1": []})
    if auc is not None:
        entry["auc"].append(auc)
    if f1 is not None:
        entry["f1"].append(f1)


for i, (tr_idx, te_idx) in enumerate(splits, 1):
    train, test = df.iloc[tr_idx], df.iloc[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]

    # 0. Baseline tầm thường: đoán tất cả đều bỏ giỏ (AUC = 0.5 theo định nghĩa).
    record("baseline_predict_all", auc=0.5, f1=f1_score(y_te, np.ones_like(y_te), zero_division=0))

    # 1. Xếp hạng bằng 1 feature
    r1 = best_single_feature_ranking(train, y_tr, test, y_te, FEATURES_A)
    record("rank_best_single_feature", auc=r1["auc"])
    chosen.setdefault("rank_best_single_feature", []).append(r1["feature"])

    # 2. Rule 1 biến 1 ngưỡng
    r2 = best_rule_f1(train, y_tr, test, y_te, FEATURES_A)
    record("rule_1feature", f1=r2["f1"])
    chosen.setdefault("rule_1feature", []).append(r2["rule"])

    # 3. Cây depth 1/2/3/6 trên nhóm A
    for depth in TREE_DEPTHS:
        rt = run_tree(train, y_tr, test, y_te, FEATURES_A, depth)
        record(f"tree_depth_{depth}", auc=rt["auc"], f1=rt["f1"])
        leaves.setdefault(f"tree_depth_{depth}", []).append(rt["leaves"])

    # 4-6. LightGBM trên 3 không gian feature
    for key, cols in (
        ("lgb_A", FEATURES_A),
        ("lgb_A_Bsess", FEATURES_A + FEATURES_B_SESS),
        ("lgb_A_Bvis", FEATURES_A + FEATURES_B_VIS),
    ):
        out = run_lgb(train, y_tr, test, y_te, cols)
        record(key, auc=out["auc"], f1=out["f1"])

    # 7. Đối chứng âm: xáo B_SESS giữa các HÀNG (giữ phân bố từng cột, phá liên kết với nhãn)
    tr_s, te_s = train.copy(), test.copy()
    tr_s[FEATURES_B_SESS] = tr_s[FEATURES_B_SESS].to_numpy()[rng.permutation(len(tr_s))]
    te_s[FEATURES_B_SESS] = te_s[FEATURES_B_SESS].to_numpy()[rng.permutation(len(te_s))]
    out = run_lgb(tr_s, y_tr, te_s, y_te, FEATURES_A + FEATURES_B_SESS)
    record("lgb_A_Bsess_shuffled", auc=out["auc"], f1=out["f1"])

    print(f"  fold {i}/{N_SPLITS} xong")


def ms(v):
    return (round(float(np.mean(v)), 4), round(float(np.std(v)), 4)) if v else (None, None)


summary: dict[str, dict] = {}
for k, v in res.items():
    entry = {}
    for metric, vals in v.items():
        mean, std = ms(vals)
        entry[f"{metric}_mean"], entry[f"{metric}_std"] = mean, std
    summary[k] = entry
for k, v in chosen.items():
    summary[k]["chosen_per_fold"] = v
for k, v in leaves.items():
    summary[k]["leaves_per_fold"] = v

# --- Phán quyết: TÍNH TRÊN AUC (không phải F1 — xem lỗi #2 ở đầu file) ---
noise = summary["lgb_A"]["auc_std"]
auc_a = summary["lgb_A"]["auc_mean"]
auc_sess = summary["lgb_A_Bsess"]["auc_mean"]
auc_vis = summary["lgb_A_Bvis"]["auc_mean"]
auc_shuf = summary["lgb_A_Bsess_shuffled"]["auc_mean"]
best_tree = max(TREE_DEPTHS, key=lambda d: summary[f"tree_depth_{d}"]["auc_mean"])
auc_tree_best = summary[f"tree_depth_{best_tree}"]["auc_mean"]
auc_tree2 = summary["tree_depth_2"]["auc_mean"]
auc_1f = summary["rank_best_single_feature"]["auc_mean"]

d_order_sess = round(auc_sess - auc_a, 4)
d_order_vis = round(auc_vis - auc_a, 4)
d_shuf = round(auc_shuf - auc_a, 4)
auc_model_best = max(auc_a, auc_sess, auc_vis)

summary["verdict"] = {
    "metric": "AUC (F1 chỉ để tham khảo — base rate lệch làm F1 vô nghĩa)",
    "noise_floor_auc_std": noise,
    "trivial_baseline_f1": summary["baseline_predict_all"]["f1_mean"],
    "model_f1": summary["lgb_A_Bsess"]["f1_mean"],
    "f1_is_meaningless_here": bool(
        (summary["lgb_A_Bsess"]["f1_mean"] - summary["baseline_predict_all"]["f1_mean"]) < 0.05
    ),
    # Giá trị của THỨ TỰ, và tác động của lỗi cắt phiên đã sửa
    "delta_auc_ORDER_in_session (A+B_SESS - A)": d_order_sess,
    "delta_auc_ORDER_cross_session (A+B_VIS - A)": d_order_vis,
    "order_in_session_beats_noise": bool(d_order_sess > noise),
    "session_scoping_gain (SESS - VIS)": round(auc_sess - auc_vis, 4),
    "session_scoping_mattered": bool(abs(auc_sess - auc_vis) > noise),
    "delta_auc_shuffled_control (should be ~0)": d_shuf,
    "control_is_clean": bool(abs(d_shuf) <= noise),
    # Model vs rule TỐT NHẤT, trên metric xếp hạng
    "auc_best_single_feature": auc_1f,
    "auc_tree_depth2_handwritable": auc_tree2,
    "auc_best_tree": auc_tree_best,
    "best_tree_depth": best_tree,
    "auc_best_model": round(auc_model_best, 4),
    "delta_auc_model_vs_best_tree": round(auc_model_best - auc_tree_best, 4),
    "model_beats_best_rule_beyond_noise": bool((auc_model_best - auc_tree_best) > noise),
    "delta_auc_model_vs_1feature": round(auc_model_best - auc_1f, 4),
}

print("\n" + json.dumps(summary, ensure_ascii=False, indent=2))
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"\nĐã lưu {OUT_PATH}")
