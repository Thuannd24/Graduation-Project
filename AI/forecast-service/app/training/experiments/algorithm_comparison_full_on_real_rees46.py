"""Tầng 2.3 mở rộng — thử THÊM các thuật toán khác, xếp từ MỚI NHẤT đến CŨ NHẤT (yêu cầu người dùng
2026-10-05, chấp nhận mọi vấn đề phát sinh — gồm cả việc phải cài thêm xgboost/lightgbm/catboost vào
venv, đã cài trong phiên này). Bản trước (`algorithm_comparison_on_real_rees46.py`) chỉ có
RandomForest/HistGradientBoosting (thay cho XGBoost/LightGBM vì lúc đó chưa cài) — giữ nguyên, không
sửa, để không mất kết quả đã ghi log; file này là lượt chạy mở rộng thêm.

Thứ tự thuật toán (mới nhất -> cũ nhất theo năm công bố gốc, không phải năm thư viện release):
  catboost (2017) -> lightgbm (2017) -> xgboost (2014) -> hist_gradient_boosting/sklearn (lấy cảm hứng
  LightGBM, ~2019) -> gradient_boosting_sklearn (Friedman 2001) -> random_forest (Breiman 2001) ->
  svm_rbf (Cortes & Vapnik 1995) -> decision_tree/CART (Breiman 1984) -> knn (Cover & Hart 1967) ->
  gaussian_nb (cổ điển, thống kê Bayes ~giữa TK 20).

Cùng fold grouped-CV với `_evaluate_grouped_cv` (train.py) — KHÔNG tự chia fold riêng, để so công bằng
với Logistic Regression production trên đúng cùng dữ liệu train/test mỗi fold. Model dựa khoảng cách
(SVM, KNN) cần chuẩn hoá — dùng lại đúng kiểu MinMaxScaler như pipeline LR; model cây/boosting dùng
feature thô (không cần scale). Panel: REES46 thật, nhãn orders 60 ngày, 5 mốc cắt (giống mọi script
khác hôm nay).

Base rate churn ở panel này ~63% (không lệch nặng) nên KHÔNG cố cân bằng lớp cho những thuật toán
không có tham số `class_weight` built-in (XGBoost/CatBoost/GradientBoostingClassifier/GaussianNB/KNN)
— dùng `class_weight='balanced'` cho model nào có hỗ trợ sẵn, còn lại để mặc định, ghi rõ trong kết quả.

Kết quả: data/experiment-results/behavior_patterns/algorithm_comparison_full_rees46_real.json
"""
from __future__ import annotations

import json
import os
import sys
import time

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "ecommerce_order_db")

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
sys.path.insert(0, f"{ROOT}/AI/forecast-service")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from catboost import CatBoostClassifier  # noqa: E402
from lightgbm import LGBMClassifier  # noqa: E402
from shared_common.config import shared_settings  # noqa: E402
from shared_common.features.assembler import FEATURE_COLUMNS  # noqa: E402
from shared_common.pool import get_engine  # noqa: E402
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.naive_bayes import GaussianNB  # noqa: E402
from sklearn.neighbors import KNeighborsClassifier  # noqa: E402
from sklearn.preprocessing import MinMaxScaler  # noqa: E402
from sklearn.svm import SVC  # noqa: E402
from sklearn.tree import DecisionTreeClassifier  # noqa: E402
from sqlalchemy import text  # noqa: E402
from xgboost import XGBClassifier  # noqa: E402

from app.training import rule_benchmark as rb_mod  # noqa: E402
from app.training import train as train_mod  # noqa: E402
from app.training.experiments.fast_panel_builder import build_panel  # noqa: E402

OUT = f"{ROOT}/data/experiment-results/behavior_patterns/algorithm_comparison_full_rees46_real.json"
NEW_LABEL_WINDOW_DAYS = 60
N_CUTOFFS = 5
MIN_HISTORY_DAYS = 15
RANDOM_STATE = 42

# (tên, factory, cần_scale) — thứ tự MỚI NHẤT -> CŨ NHẤT
CANDIDATES: list[tuple[str, object, bool]] = [
    ("catboost_2017", lambda: CatBoostClassifier(
        iterations=300, depth=4, learning_rate=0.05, auto_class_weights="Balanced",
        random_state=RANDOM_STATE, verbose=False, allow_writing_files=False,
    ), False),
    ("lightgbm_2017", lambda: LGBMClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05, class_weight="balanced",
        random_state=RANDOM_STATE, verbosity=-1, n_jobs=-1,
    ), False),
    ("xgboost_2014", lambda: XGBClassifier(
        n_estimators=300, max_depth=4, learning_rate=0.05, eval_metric="logloss",
        random_state=RANDOM_STATE, n_jobs=-1,
    ), False),
    ("gradient_boosting_sklearn_2001", lambda: GradientBoostingClassifier(
        n_estimators=300, max_depth=3, learning_rate=0.05, random_state=RANDOM_STATE,
    ), False),
    ("random_forest_2001", lambda: RandomForestClassifier(
        n_estimators=300, max_depth=6, min_samples_leaf=20, class_weight="balanced",
        random_state=RANDOM_STATE, n_jobs=-1,
    ), False),
    ("svm_rbf_1995", lambda: SVC(
        kernel="rbf", probability=True, class_weight="balanced", random_state=RANDOM_STATE,
    ), True),
    ("decision_tree_1984", lambda: DecisionTreeClassifier(
        max_depth=6, class_weight="balanced", random_state=RANDOM_STATE,
    ), False),
    ("knn_1967", lambda: KNeighborsClassifier(n_neighbors=25, n_jobs=-1), True),
    ("gaussian_nb_classic", lambda: GaussianNB(), True),
]


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
    print(f"baseline (LogisticRegression_1958, production): {baseline}", flush=True)

    results: dict[str, dict] = {"logistic_regression_1958_baseline": baseline}
    for name, factory, needs_scaling in CANDIDATES:
        t0 = time.time()
        aucs, precisions, recalls, f1s = [], [], [], []
        try:
            for fold in folds:
                train_df, test_df = fold["train_df"], fold["test_df"]
                y_train = train_df["churn_label"].to_numpy()
                y_test = test_df["churn_label"].to_numpy()

                if needs_scaling:
                    scaler = MinMaxScaler()
                    X_train = scaler.fit_transform(train_df[FEATURE_COLUMNS])
                    X_test = scaler.transform(test_df[FEATURE_COLUMNS])
                else:
                    X_train = train_df[FEATURE_COLUMNS].to_numpy()
                    X_test = test_df[FEATURE_COLUMNS].to_numpy()

                clf = factory()
                clf.fit(X_train, y_train)
                proba_train = clf.predict_proba(X_train)[:, 1]
                proba_test = clf.predict_proba(X_test)[:, 1]
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
                "seconds": round(time.time() - t0, 1),
            }
        except Exception as e:  # chấp nhận hết vấn đề phát sinh — ghi lại lỗi, không dừng cả script
            results[name] = {"error": f"{type(e).__name__}: {e}", "seconds": round(time.time() - t0, 1)}
        print(f"{name}: {results[name]}", flush=True)

    out = {
        "note": "Thứ tự MỚI NHẤT -> CŨ NHẤT theo năm công bố thuật toán gốc. class_weight='balanced' dùng "
                "khi thuật toán hỗ trợ sẵn; base rate panel ~63% (không lệch nặng) nên không cố cân bằng "
                "thêm cho thuật toán không hỗ trợ (xgboost/gradient_boosting_sklearn/gaussian_nb/knn).",
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
