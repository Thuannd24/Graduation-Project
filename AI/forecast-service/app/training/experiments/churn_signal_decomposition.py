"""Cốt lõi bài toán churn: nhãn "không mua trong 120 ngày" được tạo bởi cái gì, và TÍN HIỆU NÀO dự đoán được nó?

Đầu vào: panel xuất từ mô phỏng (tools/data-seed/export-churn-panel.mjs) — đúng định nghĩa production (5 mốc cắt,
>= 2 đơn DELIVERED, nhãn = không có đơn trong 120 ngày sau mốc) kèm ground truth ẩn (đã rời bỏ chưa, tốc độ mua thật).

Câu hỏi:
  Q1. Trong các dòng bị gán nhãn churn, bao nhiêu % là ĐÃ RỜI BỎ thật, bao nhiêu % chỉ là MUA CHẬM (còn sống)?
  Q2. TRẦN lý thuyết: biết ground truth thì dự đoán nhãn tốt cỡ nào (AUC)? Phần còn lại là may rủi không dự đoán nổi.
  Q3. Mỗi loại tín hiệu đạt bao nhiêu so với trần: recency đơn lẻ, frequency đơn lẻ, Logistic Regression production
      (6 feature từ orders), LR + "recency so với nhịp mua của chính khách", cây tăng cường, và nghiệm đóng BG/NBD.

GIỚI HẠN (ghi rõ khi dùng): dữ liệu là TỔNG HỢP sinh từ BG/NBD + hệ số ngành, nên kết luận nói về chính quá trình
sinh đó, không phải khách thật. LƯU Ý SỬA (2026-10-02): bản đầu docstring nói feature hành vi "không thể mang thêm thông
tin" — SAI. Việc rời bỏ độc lập với hành vi, nhưng (a) cường độ duyệt nền tỉ lệ với tốc độ mua λ, (b) sau khi rời bỏ
duyệt còn ×churnViewDecay (đo trên REES46) → hành vi có đường mang tín hiệu "tốc độ" và "đã chết". Q4 đo điều đó.
Kết quả: data/experiment-results/behavior_patterns/churn_signal_decomposition.json
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
from scipy.special import hyp2f1
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import MinMaxScaler, StandardScaler

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
PANEL = f"{ROOT}/data/experiment-results/churn_panel.csv"
FIT = json.load(open(f"{ROOT}/data/experiment-results/behavior_patterns/bgnbd_fit.json", encoding="utf-8"))["orii"]["params"]
OUT = f"{ROOT}/data/experiment-results/behavior_patterns/churn_signal_decomposition.json"
H = 120.0


def cond_expected(p: dict, x, tx, T, t: float) -> np.ndarray:
    """E[số giao dịch trong (T, T+t] | x, t_x, T] — Fader et al. (2005), công thức (10); đã kiểm chéo Monte Carlo."""
    r, alpha, a, b = p["r"], p["alpha"], p["a"], p["b"]
    z = t / (alpha + T + t)
    num = (a + b + x - 1) / (a - 1) * (1 - ((alpha + T) / (alpha + T + t)) ** (r + x) * hyp2f1(r + x, b + x, a + b + x - 1, z))
    den = 1 + a / np.maximum(b + x - 1, 1e-12) * ((alpha + T) / (alpha + tx)) ** (r + x)
    return num / den


def p_alive(p: dict, x, tx, T) -> np.ndarray:
    r, alpha, a, b = p["r"], p["alpha"], p["a"], p["b"]
    odds = a / np.maximum(b + x - 1, 1e-12) * ((alpha + T) / (alpha + tx)) ** (r + x)
    return 1 / (1 + odds)


def cv_auc(model_fn, X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, n_splits: int = 5) -> tuple[float, float, float]:
    aucs, aps = [], []
    for tr, te in GroupKFold(n_splits).split(X, y, groups):
        m = model_fn()
        m.fit(X.iloc[tr], y[tr])
        pr = m.predict_proba(X.iloc[te])[:, 1]
        aucs.append(roc_auc_score(y[te], pr))
        aps.append(average_precision_score(y[te], pr))
    return float(np.mean(aucs)), float(np.std(aucs)), float(np.mean(aps))


def main() -> None:
    d = pd.read_csv(PANEL)
    y = d["label"].to_numpy()
    g = d["user"].to_numpy()
    x = (d["frequency"] - 1).to_numpy(float)
    tx, T = d["t_x"].to_numpy(float), d["T"].to_numpy(float)
    res: dict = {"n_rows": int(len(d)), "n_users": int(d["user"].nunique()), "churn_rate": round(float(y.mean()), 4)}

    # ---- Q1: nhãn churn gồm những gì ----
    dead = d["dead_at_cutoff"].to_numpy() == 1
    lab1 = y == 1
    res["Q1_label_composition"] = {
        "share_dead_among_label1": round(float(dead[lab1].mean()), 4),
        "share_alive_but_slow_among_label1": round(float((~dead[lab1]).mean()), 4),
        "share_label1_among_dead": round(float(y[dead].mean()), 4) if dead.any() else None,
        "share_label1_among_alive": round(float(y[~dead].mean()), 4),
        "n_dead_rows": int(dead.sum()),
    }

    # ---- Q2: trần lý thuyết (biết ground truth) ----
    lam = d["lam_day"].to_numpy(float)
    oracle = np.where(dead, 1.0, np.exp(-lam * H))  # P(không có đơn trong 120 ngày | trạng thái thật, tốc độ thật)
    res["Q2_oracle_ceiling"] = {
        "auc": round(float(roc_auc_score(y, oracle)), 4),
        "pr_auc": round(float(average_precision_score(y, oracle)), 4),
        "note": "trần AUC của MỌI bộ dự đoán trên dữ liệu này; phần còn lại là may rủi (thời điểm mua ngẫu nhiên)",
    }
    # trần khi KHÔNG biết trạng thái chết, chỉ biết tốc độ thật (tách phần "biết ai chậm" khỏi "biết ai đã chết")
    res["Q2_oracle_ceiling"]["auc_knowing_only_true_rate"] = round(float(roc_auc_score(y, np.exp(-lam * H))), 4)
    res["Q2_oracle_ceiling"]["auc_knowing_only_dead_flag"] = round(float(roc_auc_score(y, dead.astype(float))), 4)

    # ---- Q3: từng loại tín hiệu ----
    sig = {}
    sig["recency_alone"] = {"auc": round(float(roc_auc_score(y, d["recency"])), 4)}
    sig["frequency_alone(-)"] = {"auc": round(float(roc_auc_score(y, -d["frequency"])), 4)}
    mean_gap = (tx / np.maximum(x, 1)).clip(min=1.0)
    sig["recency_over_own_mean_gap"] = {"auc": round(float(roc_auc_score(y, d["recency"] / mean_gap)), 4)}
    exp_future = cond_expected(FIT, x, tx, T, H)
    sig["bgnbd_expected_purchases(-)"] = {"auc": round(float(roc_auc_score(y, -exp_future)), 4),
                                          "pr_auc": round(float(average_precision_score(y, -exp_future)), 4)}
    sig["bgnbd_1_minus_p_alive"] = {"auc": round(float(roc_auc_score(y, 1 - p_alive(FIT, x, tx, T))), 4)}

    order_cols = ["frequency", "recency", "monetary", "avg_order_value", "cancel_rate", "discount_dependency"]
    Xp = d[order_cols].copy()
    m, s, ap = cv_auc(lambda: make_pipeline(MinMaxScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), Xp, y, g)
    sig["LR_production_6_order_features(MinMax)"] = {"auc": round(m, 4), "auc_std": round(s, 4), "pr_auc": round(ap, 4)}

    Xl = Xp.copy()
    for c in ("frequency", "recency", "monetary", "avg_order_value"):
        Xl[c] = np.log1p(Xl[c])
    m, s, ap = cv_auc(lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), Xl, y, g)
    sig["LR_6_features_log1p"] = {"auc": round(m, 4), "auc_std": round(s, 4), "pr_auc": round(ap, 4)}

    Xr = Xl.copy()
    Xr["log_recency_over_gap"] = np.log1p(d["recency"]) - np.log1p(mean_gap)
    Xr["log_T"] = np.log1p(T)
    m, s, ap = cv_auc(lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), Xr, y, g)
    sig["LR_log1p + recency_over_own_gap + T"] = {"auc": round(m, 4), "auc_std": round(s, 4), "pr_auc": round(ap, 4)}

    Xb = d[order_cols + ["t_x", "T"]].copy()
    m, s, ap = cv_auc(lambda: HistGradientBoostingClassifier(max_iter=150, learning_rate=0.06, max_depth=4, random_state=0), Xb, y, g)
    sig["GradientBoosting_6_features+t_x+T"] = {"auc": round(m, 4), "auc_std": round(s, 4), "pr_auc": round(ap, 4)}

    Xe = Xr.copy()
    Xe["bgnbd_neg_expected"] = -exp_future
    m, s, ap = cv_auc(lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), Xe, y, g)
    sig["LR + BG/NBD expected purchases as a feature"] = {"auc": round(m, 4), "auc_std": round(s, 4), "pr_auc": round(ap, 4)}
    res["Q3_signals"] = sig

    # ---- Q4: 5 feature hành vi có thêm gì trên nền 6 feature orders không ----
    beh = ["days_since_last_activity", "recent_view_count", "cart_abandon_count", "view_to_cart_conversion_rate", "category_diversity_viewed"]
    q4 = {"single_feature_auc": {c: round(float(max(roc_auc_score(y, d[c]), 1 - roc_auc_score(y, d[c]))), 4) for c in beh}}
    all11 = order_cols + beh
    m, s_, ap = cv_auc(lambda: make_pipeline(MinMaxScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), d[all11], y, g)
    q4["LR_production_11_features(MinMax)"] = {"auc": round(m, 4), "auc_std": round(s_, 4), "pr_auc": round(ap, 4)}
    X11 = d[all11].copy()
    for c in ("frequency", "recency", "monetary", "avg_order_value", "days_since_last_activity", "recent_view_count", "category_diversity_viewed"):
        X11[c] = np.log1p(X11[c])
    m, s_, ap = cv_auc(lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), X11, y, g)
    q4["LR_11_features_log1p"] = {"auc": round(m, 4), "auc_std": round(s_, 4), "pr_auc": round(ap, 4)}
    X11b = X11.copy()
    X11b["bgnbd_neg_expected"] = -exp_future
    m, s_, ap = cv_auc(lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)), X11b, y, g)
    q4["LR_11_log1p + BG/NBD expected"] = {"auc": round(m, 4), "auc_std": round(s_, 4), "pr_auc": round(ap, 4)}
    Xg = d[all11 + ["t_x", "T"]]
    m, s_, ap = cv_auc(lambda: HistGradientBoostingClassifier(max_iter=150, learning_rate=0.06, max_depth=4, random_state=0), Xg, y, g)
    q4["GradientBoosting_11_features+t_x+T"] = {"auc": round(m, 4), "auc_std": round(s_, 4), "pr_auc": round(ap, 4)}
    res["Q4_behavior_features"] = q4

    # ---- tách theo số lần mua: tín hiệu đổi thế nào khi khách có ít/nhiều lịch sử ----
    by_freq = {}
    for lo, hi in ((2, 2), (3, 4), (5, 99)):
        mk = (d["frequency"] >= lo) & (d["frequency"] <= hi)
        if mk.sum() >= 200 and y[mk].min() != y[mk].max():
            by_freq[f"{lo}-{hi} đơn"] = {"n": int(mk.sum()), "churn": round(float(y[mk].mean()), 3),
                                          "oracle_auc": round(float(roc_auc_score(y[mk], oracle[mk])), 4),
                                          "bgnbd_auc": round(float(roc_auc_score(y[mk], -exp_future[mk])), 4)}
    res["by_purchase_count"] = by_freq

    print(json.dumps(res, ensure_ascii=False, indent=1))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
