"""Tầng 2.3 ("So sánh thuật toán") trên dữ liệu REES46 THẬT — mục duy nhất còn lại ngoài danh sách
"cần cho bảo vệ đồ án" mà người dùng chủ động yêu cầu làm thêm (2026-10-05).

So Logistic Regression (model production) với 2 họ model phi tuyến cây-tập hợp: RandomForest và
HistGradientBoosting. KHÔNG dùng XGBoost/LightGBM thật — 2 thư viện này chưa có trong venv
(`import xgboost`/`lightgbm` đều lỗi `ModuleNotFoundError`) và việc thêm dependency mới cần hỏi trước
(CLAUDE.md). `HistGradientBoostingClassifier` (scikit-learn) là gradient boosting dựa trên histogram —
cùng họ thuật toán, cùng tinh thần so sánh "cây phi tuyến nhiều tham số" mà roadmap muốn, chỉ khác
tên thư viện. Nếu cần đúng XGBoost/LightGBM, phải xin cài thêm.

Dùng LẠI nguyên văn `_evaluate_grouped_cv` (train.py) để lấy ĐÚNG các fold grouped-CV đã dùng cho model
production — không tự chia fold riêng, tránh chênh lệch do cách chia khác nhau. Trên CHÍNH các fold đó
(`train_df`/`test_df` giống hệt), fit thêm RandomForest/HistGB rồi đo cùng kiểu (ngưỡng F1 tune trên
train, đo trên test — `_tuned_cut` từ `rule_benchmark.py`, cùng chuẩn đã dùng cho rule-vs-AI).

Panel: cùng REES46 thật, nhãn orders 60 ngày, 5 mốc cắt (giống retrain/ablation/rule-benchmark).
Kết quả: data/experiment-results/behavior_patterns/algorithm_comparison_rees46_real.json
"""
from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "ecommerce_order_db")

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
sys.path.insert(0, f"{ROOT}/AI/forecast-service")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from shared_common.config import shared_settings  # noqa: E402
from shared_common.features.assembler import FEATURE_COLUMNS  # noqa: E402
from shared_common.pool import get_engine  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.training import rule_benchmark as rb_mod  # noqa: E402
from app.training import train as train_mod  # noqa: E402
from app.training.experiments.fast_panel_builder import build_panel  # noqa: E402

OUT = f"{ROOT}/data/experiment-results/behavior_patterns/algorithm_comparison_rees46_real.json"
NEW_LABEL_WINDOW_DAYS = 60
N_CUTOFFS = 5
MIN_HISTORY_DAYS = 15
RANDOM_STATE = 42

CANDIDATES = {
    "random_forest": lambda: RandomForestClassifier(
        n_estimators=300, max_depth=6, min_samples_leaf=20, class_weight="balanced",
        random_state=RANDOM_STATE, n_jobs=-1,
    ),
    "hist_gradient_boosting": lambda: HistGradientBoostingClassifier(
        max_depth=4, learning_rate=0.05, max_iter=300, l2_regularization=1.0,
        random_state=RANDOM_STATE,
    ),
}


def main() -> None:
    engine = get_engine(shared_settings.DB_NAME)
    with engine.connect() as conn:
        row = conn.execute(text("SELECT MIN(created_at) a, MAX(created_at) b FROM orders")).fetchone()
    data_start, data_end = pd.Timestamp(row.a), pd.Timestamp(row.b)
    reference_now = data_end + pd.Timedelta(days=1)
    latest_cutoff = data_end - pd.Timedelta(days=NEW_LABEL_WINDOW_DAYS)
    earliest_cutoff = data_start + pd.Timedelta(days=MIN_HISTORY_DAYS)
    cutoff_dates = list(pd.date_range(earliest_cutoff, latest_cutoff, periods=N_CUTOFFS))
    print(f"mốc cắt: {[c.date().isoformat() for c in cutoff_dates]}", flush=True)

    engine_for_panel = train_mod.get_engine(train_mod.shared_settings.DB_NAME)
    panel = build_panel(engine_for_panel, cutoff_dates, NEW_LABEL_WINDOW_DAYS, min_delivered_orders=2)
    train_mod._assert_panel_not_contaminated(panel, cutoff_dates)

    test_cutoff = panel["cutoff"].max()
    cv = train_mod._evaluate_grouped_cv(panel, test_cutoff, FEATURE_COLUMNS)
    if "error" in cv:
        raise RuntimeError(cv["error"])
    folds = cv.pop("_folds")
    cv.pop("_oof", None)

    baseline = {
        "auc_mean": cv["auc_mean"], "auc_std": cv["auc_std"], "f1_mean": cv["f1_mean"],
        "precision_mean": cv["precision_mean"], "recall_mean": cv["recall_mean"], "n_splits": cv["n_splits"],
    }
    noise_floor = baseline["auc_std"]
    print(f"baseline (LogisticRegression, production): {baseline}", flush=True)

    results: dict[str, dict] = {"logistic_regression_baseline": baseline}
    for name, factory in CANDIDATES.items():
        aucs, precisions, recalls, f1s = [], [], [], []
        for fold in folds:
            train_df, test_df = fold["train_df"], fold["test_df"]
            y_train = train_df["churn_label"].to_numpy()
            y_test = test_df["churn_label"].to_numpy()
            clf = factory()
            clf.fit(train_df[FEATURE_COLUMNS], y_train)
            proba_train = clf.predict_proba(train_df[FEATURE_COLUMNS])[:, 1]
            proba_test = clf.predict_proba(test_df[FEATURE_COLUMNS])[:, 1]
            precision, recall, f1, _cut = rb_mod._tuned_cut(y_train, proba_train, y_test, proba_test)
            auc = float(roc_auc_score(y_test, proba_test)) if len(np.unique(y_test)) > 1 else None
            aucs.append(auc)
            precisions.append(precision)
            recalls.append(recall)
            f1s.append(f1)

        auc_mean, auc_std = train_mod._mean_std(aucs)
        f1_mean, f1_std = train_mod._mean_std(f1s)
        precision_mean, _ = train_mod._mean_std(precisions)
        recall_mean, _ = train_mod._mean_std(recalls)
        delta_auc = round(auc_mean - baseline["auc_mean"], 4)
        results[name] = {
            "auc_mean": round(auc_mean, 4), "auc_std": round(auc_std, 4) if auc_std else auc_std,
            "f1_mean": round(f1_mean, 4), "f1_std": round(f1_std, 4) if f1_std else f1_std,
            "precision_mean": round(precision_mean, 4), "recall_mean": round(recall_mean, 4),
            "delta_auc_vs_baseline": delta_auc,
            "beats_noise_floor": bool(delta_auc > noise_floor),
            "verdict": "GIỮ (vượt sàn nhiễu)" if delta_auc > noise_floor else "LOẠI (trong nhiễu, LR đủ)",
        }
        print(f"{name}: {results[name]}", flush=True)

    out = {
        "note": "RandomForest/HistGradientBoosting (scikit-learn) thay cho XGBoost/LightGBM — chưa cài "
                "2 thư viện đó, xem docstring.",
        "cutoffs": [str(c) for c in cutoff_dates], "label_window_days": NEW_LABEL_WINDOW_DAYS,
        "noise_floor_auc_std": noise_floor, "results": results,
    }
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, default=str)
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
