"""Thí nghiệm mở rộng feature (bước 3) — trả lời "thêm feature này có ĐÁNG không" bằng số.

## Vì sao cần harness riêng thay vì cứ thêm feature vào assembler

Grouped CV ở `train.py` đo được AUC **kèm std**: run thật cho 0.9381 ± 0.0263, fold thấp nhất
0.8971 / cao nhất 0.9691. Nghĩa là **sàn nhiễu ~±0.026**. Nếu thêm 1 block feature rồi thấy AUC
lên 0.945 thì đó KHÔNG phải cải thiện — nó nằm trong nhiễu. Muốn kết luận được thì phải so
`delta_auc` với std của chính baseline, và đó là việc module này làm.

Ngoài ra dữ liệu có đa cộng tuyến nặng (đo Spearman trên 500 user: `frequency`↔`monetary` 0.877,
`days_since_last_activity`↔`recent_view_count` −0.847, `category_diversity_viewed`↔`recent_view_count`
0.751). Hệ quả:
- Hệ số Logistic Regression riêng lẻ KHÔNG đọc được như "độ quan trọng" — 2 feature tương quan
  0.88 thì phần đóng góp bị chia tuỳ ý giữa chúng. Vì vậy có `permutation_importance` (đo trên
  holdout, bền với cộng tuyến) để SỬA bảng hệ số.
- Thêm feature tương quan nữa sẽ làm hệ số càng bất định mà AUC không tăng. Nên module này cũng
  chạy **L1 path** để trả lời câu ngược lại, hữu ích hơn: *bỏ được bao nhiêu feature mà AUC không
  giảm?* Với đồ án, "chứng minh 4 feature là đủ" là kết quả mạnh hơn "thêm 10 feature nữa".

Không lưu model. Đây là công cụ phân tích, gọi qua `POST /api/v1/models/ablation`.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import MinMaxScaler

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.features.candidates import CANDIDATE_BLOCKS, CANDIDATE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine

from app.training.train import _build_training_panel, _evaluate_grouped_cv, _mean_std

logger = get_logger(__name__)

PERMUTATION_REPEATS = 10
L1_C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0]
RANDOM_STATE = 42


def _cv_auc(panel: pd.DataFrame, test_cutoff, columns: list[str]) -> dict:
    cv = _evaluate_grouped_cv(panel, test_cutoff, columns)
    if "error" in cv:
        return {"error": cv["error"]}
    return {
        "auc_mean": cv["auc_mean"],
        "auc_std": cv["auc_std"],
        "f1_mean": cv["f1_mean"],
        "precision_mean": cv["precision_mean"],
        "recall_mean": cv["recall_mean"],
        "n_features": len(columns),
        "_folds": cv.get("_folds", []),
    }


def _permutation_importance(folds: list[dict], columns: list[str]) -> list[dict]:
    """Chạy permutation importance trên holdout của TỪNG fold rồi lấy trung bình.

    Khác hệ số LR: đo mức AUC tụt khi xáo trộn riêng 1 cột, nên không bị hiện tượng "chia phần
    đóng góp" giữa các feature tương quan. Đây là bảng độ quan trọng nên tin.
    """
    per_feature: dict[str, list[float]] = {column: [] for column in columns}

    for fold in folds:
        test_df = fold["test_df"]
        if test_df["churn_label"].nunique() < 2:
            continue
        scaler, clf = fold["scaler"], fold["clf"]
        X = scaler.transform(test_df[columns])
        y = test_df["churn_label"].to_numpy()
        result = permutation_importance(
            clf, X, y, scoring="roc_auc", n_repeats=PERMUTATION_REPEATS, random_state=RANDOM_STATE
        )
        for i, column in enumerate(columns):
            per_feature[column].append(float(result.importances_mean[i]))

    rows = []
    for column, values in per_feature.items():
        mean, std = _mean_std(values)
        rows.append(
            {
                "feature": column,
                "auc_drop_mean": None if mean is None else round(mean, 4),
                "auc_drop_std": None if std is None else round(std, 4),
            }
        )
    rows.sort(key=lambda r: -(r["auc_drop_mean"] or 0.0))
    return rows


def _l1_path(panel: pd.DataFrame, test_cutoff, columns: list[str]) -> list[dict]:
    """Quét cường độ regularization L1: mỗi mức C cho biết còn lại bao nhiêu feature và AUC là bao
    nhiêu. Dùng cùng cách chia fold như grouped CV nên số AUC so sánh được trực tiếp với baseline."""
    test_pool = panel[panel["cutoff"] == test_cutoff]
    train_pool = panel[panel["cutoff"] != test_cutoff]

    from sklearn.model_selection import StratifiedKFold

    users = test_pool.index.to_numpy()
    strat = test_pool["churn_label"].to_numpy()
    minority = int(min((strat == 0).sum(), (strat == 1).sum()))
    n_splits = int(min(5, minority))
    if n_splits < 2:
        return [{"error": "không đủ dữ liệu cho L1 path"}]

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE)
    splits = [set(users[idx].tolist()) for _, idx in skf.split(users, strat)]

    rows = []
    for C in L1_C_GRID:
        aucs, kept_counts, kept_union = [], [], set()
        for holdout in splits:
            fold_test = test_pool[test_pool.index.isin(holdout)]
            fold_train = train_pool[~train_pool.index.isin(holdout)]
            if fold_train["churn_label"].nunique() < 2 or fold_test["churn_label"].nunique() < 2:
                continue

            scaler = MinMaxScaler()
            X_train = scaler.fit_transform(fold_train[columns])
            clf = LogisticRegression(
                penalty="l1", solver="liblinear", C=C, class_weight="balanced", max_iter=2000
            )
            clf.fit(X_train, fold_train["churn_label"])

            proba = clf.predict_proba(scaler.transform(fold_test[columns]))[:, 1]
            aucs.append(float(roc_auc_score(fold_test["churn_label"], proba)))

            kept = [columns[i] for i, c in enumerate(clf.coef_[0]) if abs(c) > 1e-8]
            kept_counts.append(len(kept))
            kept_union.update(kept)

        mean, std = _mean_std(aucs)
        kept_mean, _ = _mean_std([float(k) for k in kept_counts])
        rows.append(
            {
                "C": C,
                "auc_mean": None if mean is None else round(mean, 4),
                "auc_std": None if std is None else round(std, 4),
                "features_kept_avg": None if kept_mean is None else round(kept_mean, 1),
                "features_kept_union": sorted(kept_union),
            }
        )
    return rows


def run_ablation() -> dict[str, Any]:
    """So baseline (11 feature production) với baseline + từng block ứng viên, rồi + tất cả.

    Kết luận `verdict` được quyết định bằng cách so `delta_auc` với `auc_std` của baseline — KHÔNG
    phải cứ AUC cao hơn là tốt hơn.
    """
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine, include_candidates=True)
    test_cutoff = panel["cutoff"].max()

    baseline = _cv_auc(panel, test_cutoff, FEATURE_COLUMNS)
    if "error" in baseline:
        raise RuntimeError(baseline["error"])
    baseline_folds = baseline.pop("_folds")
    noise_floor = baseline["auc_std"] or 0.0

    results = {"baseline": baseline, "noise_floor_auc_std": noise_floor, "blocks": {}}

    for block_name, block_columns in CANDIDATE_BLOCKS.items():
        columns = FEATURE_COLUMNS + block_columns
        scored = _cv_auc(panel, test_cutoff, columns)
        scored.pop("_folds", None)
        if "error" in scored:
            results["blocks"][block_name] = scored
            continue
        delta = round(scored["auc_mean"] - baseline["auc_mean"], 4)
        scored.update(
            {
                "added": block_columns,
                "delta_auc": delta,
                "beats_noise_floor": bool(delta > noise_floor),
                "verdict": "GIỮ" if delta > noise_floor else "LOẠI (trong nhiễu)",
            }
        )
        results["blocks"][block_name] = scored

    all_columns = FEATURE_COLUMNS + CANDIDATE_COLUMNS
    combined = _cv_auc(panel, test_cutoff, all_columns)
    combined.pop("_folds", None)
    if "error" not in combined:
        delta = round(combined["auc_mean"] - baseline["auc_mean"], 4)
        combined.update(
            {
                "delta_auc": delta,
                "beats_noise_floor": bool(delta > noise_floor),
                "verdict": "GIỮ" if delta > noise_floor else "LOẠI (trong nhiễu)",
            }
        )
    results["all_candidates"] = combined

    results["permutation_importance_baseline"] = _permutation_importance(baseline_folds, FEATURE_COLUMNS)
    results["l1_path_baseline"] = _l1_path(panel, test_cutoff, FEATURE_COLUMNS)
    results["panel"] = {
        "rows": int(len(panel)),
        "users": int(panel.index.nunique()),
        "churn_rate": round(float(panel["churn_label"].mean()), 4),
    }

    logger.info(
        f"Ablation xong. baseline AUC={baseline['auc_mean']}±{baseline['auc_std']}, "
        f"sàn nhiễu={noise_floor}, "
        f"kết luận từng block="
        + str({k: v.get("verdict") for k, v in results["blocks"].items()})
    )
    return results
