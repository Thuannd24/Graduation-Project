"""Benchmark Rule-based vs AI (Tầng 2.2 — xem docs/canvas/churn-risk-roadmap.md).

Trả lời câu hỏi phản biện trực tiếp: *"Sao không viết vài câu IF/SQL cho xong?"*

## Nguyên tắc: phải đánh bại rule TỐT NHẤT, không phải rule dựng để thua

`churn-risk-feature-overview.md:95-100` từng nêu ví dụ
`if days_since_last_activity > 7 and cart_abandon: at_risk = true` rồi lập luận bằng lời rằng ML tốt
hơn. Nếu chỉ so với đúng một rule tự chọn thì người phản biện sẽ nói baseline được dựng để thua. Nên
module này **quét lưới** để tìm rule tốt nhất có thể, ở 3 mức độ phức tạp tăng dần:

- `rule_1feature`  — 1 biến 1 ngưỡng, quét MỌI feature × 2 chiều × lưới phân vị
- `rule_2feature`  — hai điều kiện AND (đúng dạng rule tay hay viết), quét mọi cặp × chiều × ngưỡng
- `tree_depth_1/2/3` — cây quyết định giới hạn độ sâu: đây là **tập rule tối ưu do máy tìm** ở cùng
  mức phức tạp, tức baseline rule-based MẠNH NHẤT có thể dựng. Cây sâu 2 tương đương một chùm rule
  AND 2 tầng nhưng ngưỡng được tối ưu đồng thời chứ không quét thô.

## Hai điều then chốt để benchmark không tự lừa mình

1. **Chọn rule trên TẬP TRAIN, đo trên TẬP TEST.** Nếu chọn ngưỡng bằng cách xem điểm trên test thì
   rule sẽ trông giỏi một cách giả tạo (đó là tối ưu trực tiếp trên tập đánh giá).
2. **Dùng ĐÚNG các fold của `_evaluate_grouped_cv`** (tách user + nhân quả thời gian). So chéo giữa
   các cách chia fold khác nhau thì chênh lệch lẫn với nhiễu chia fold.

## Đại lượng mà rule KHÔNG có

Rule trả về nhãn nhị phân ⇒ **không xếp hạng được**. Cột `auc_ranking` vì vậy chỉ có nghĩa với model
(và với rule 1 biến, nếu coi chính biến đó là điểm số — đây là phép so trực tiếp cho luận điểm "1
chiều vs nhiều chiều"). Với rule 2 điều kiện AND thì AUC không áp dụng được, và đó chính là lý do
không thể dùng rule để phân bổ ngân sách voucher theo tổn thất kỳ vọng.

Module thuần phân tích: KHÔNG lưu model, KHÔNG đổi hành vi production.
"""
from __future__ import annotations

from itertools import combinations
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.tree import DecisionTreeClassifier, export_text

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine

from app.training.train import (
    _build_training_panel,
    _evaluate_grouped_cv,
    _fit_calibrated,
    _label_definition,
    _mean_std,
)

logger = get_logger(__name__)

# Lưới ngưỡng theo PHÂN VỊ của tập train (không dùng giá trị tuyệt đối cố định: thang các feature rất
# khác nhau, và phân vị tự thích ứng với phân bố thật).
QUANTILES_1F = np.arange(0.05, 1.0, 0.05)   # 19 mốc cho rule 1 biến
QUANTILES_2F = np.arange(0.1, 1.0, 0.1)     # 9 mốc/biến cho rule 2 biến (9x9x4 chiều x 55 cặp)
TREE_DEPTHS = [1, 2, 3]
RANDOM_STATE = 42

# Rule tham chiếu viết tay — để đối chiếu "rule mà người ta thực sự sẽ viết" với "rule tốt nhất tìm
# được". Rule đầu chính là ví dụ trong churn-risk-feature-overview.md.
REFERENCE_RULES: list[dict] = [
    {
        "name": "doc_example: days_inactive>7 AND cart_abandon>=1",
        "conditions": [("days_since_last_activity", ">=", 7.0), ("cart_abandon_count", ">=", 1.0)],
    },
    {
        "name": "classic_rfm: recency>30 AND cart_abandon>=2",
        "conditions": [("recency", ">=", 30.0), ("cart_abandon_count", ">=", 2.0)],
    },
    {
        "name": "recency>90",
        "conditions": [("recency", ">=", 90.0)],
    },
]


def _apply(df: pd.DataFrame, conditions: list[tuple[str, str, float]]) -> np.ndarray:
    """Áp một chùm điều kiện AND, trả mảng 0/1."""
    mask = np.ones(len(df), dtype=bool)
    for column, op, threshold in conditions:
        values = df[column].to_numpy()
        mask &= (values >= threshold) if op == ">=" else (values <= threshold)
    return mask.astype(int)


def _prf(y_true: np.ndarray, y_pred: np.ndarray) -> tuple[float, float, float]:
    """precision / recall / F1 tính trực tiếp từ TP/FP/FN — nhanh hơn sklearn khi phải quét hàng chục
    nghìn rule ứng viên mỗi fold."""
    tp = float(np.sum((y_pred == 1) & (y_true == 1)))
    fp = float(np.sum((y_pred == 1) & (y_true == 0)))
    fn = float(np.sum((y_pred == 0) & (y_true == 1)))
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) else 0.0
    return precision, recall, f1


def _search_1feature(train_df: pd.DataFrame) -> dict:
    """Rule tốt nhất dạng `feature >= t` hoặc `feature <= t`, chọn theo F1 TRÊN TẬP TRAIN."""
    y = train_df["churn_label"].to_numpy()
    best = {"f1": -1.0}
    for column in FEATURE_COLUMNS:
        values = train_df[column].to_numpy()
        thresholds = np.unique(np.quantile(values, QUANTILES_1F))
        for threshold in thresholds:
            for op in (">=", "<="):
                _, _, f1 = _prf(y, _apply(train_df, [(column, op, threshold)]))
                if f1 > best["f1"]:
                    best = {"f1": f1, "conditions": [(column, op, float(threshold))]}
    return best


def _search_2feature(train_df: pd.DataFrame) -> dict:
    """Rule tốt nhất dạng `A op a AND B op b`, chọn theo F1 TRÊN TẬP TRAIN.

    Đây là dạng rule tay thực tế hay viết. Quét mọi cặp feature (55 cặp) × 4 tổ hợp chiều × lưới
    9x9 ngưỡng phân vị ~ 17.8k ứng viên/fold.
    """
    y = train_df["churn_label"].to_numpy()
    grids = {
        column: np.unique(np.quantile(train_df[column].to_numpy(), QUANTILES_2F))
        for column in FEATURE_COLUMNS
    }

    best = {"f1": -1.0}
    for col_a, col_b in combinations(FEATURE_COLUMNS, 2):
        for op_a in (">=", "<="):
            for op_b in (">=", "<="):
                for t_a in grids[col_a]:
                    mask_a = (
                        train_df[col_a].to_numpy() >= t_a
                        if op_a == ">="
                        else train_df[col_a].to_numpy() <= t_a
                    )
                    if not mask_a.any():
                        continue
                    for t_b in grids[col_b]:
                        mask_b = (
                            train_df[col_b].to_numpy() >= t_b
                            if op_b == ">="
                            else train_df[col_b].to_numpy() <= t_b
                        )
                        _, _, f1 = _prf(y, (mask_a & mask_b).astype(int))
                        if f1 > best["f1"]:
                            best = {
                                "f1": f1,
                                "conditions": [
                                    (col_a, op_a, float(t_a)),
                                    (col_b, op_b, float(t_b)),
                                ],
                            }
    return best


def _describe(conditions: list[tuple[str, str, float]]) -> str:
    return " AND ".join(f"{c} {op} {t:.4g}" for c, op, t in conditions)


def _tuned_cut(
    y_train: np.ndarray, proba_train: np.ndarray, y_test: np.ndarray, proba_test: np.ndarray
) -> tuple[float, float, float, float]:
    """Chọn ngưỡng cắt theo F1 TRÊN TRAIN, rồi đo trên TEST. Trả `(precision, recall, f1, ngưỡng)`.

    BẮT BUỘC phải có để benchmark công bằng: rule đã được quét lưới để lấy ngưỡng tốt nhất, nên nếu
    model bị đánh giá ở một ngưỡng cố định (0.5) thì đó là so lệch — rule được tune còn model thì
    không. Bản đầu của module này mắc đúng lỗi đó: model ra F1 0.5833 ở ngưỡng 0.5 trong khi ngưỡng
    tune được của nó là ~0.26.
    """
    best_threshold, best_f1 = 0.5, -1.0
    for threshold in np.arange(0.05, 0.96, 0.01):
        _, _, f1 = _prf(y_train, (proba_train >= threshold).astype(int))
        if f1 > best_f1:
            best_threshold, best_f1 = float(threshold), f1
    precision, recall, f1 = _prf(y_test, (proba_test >= best_threshold).astype(int))
    return precision, recall, f1, round(best_threshold, 2)


def run_rule_benchmark() -> dict[str, Any]:
    """So model đang chạy với baseline rule-based ở nhiều mức phức tạp, trên CÙNG bộ fold."""
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine)
    test_cutoff = panel["cutoff"].max()

    cv = _evaluate_grouped_cv(panel, test_cutoff)
    if "error" in cv:
        raise RuntimeError(cv["error"])
    folds = cv.pop("_folds")
    cv.pop("_oof", None)

    # Mỗi phương pháp -> danh sách metric theo fold
    scores: dict[str, dict[str, list]] = {}
    chosen_rules: dict[str, list[str]] = {}

    def record(
        name: str,
        precision: float,
        recall: float,
        f1: float,
        auc: float | None,
        cut: float | None = None,
    ):
        entry = scores.setdefault(
            name, {"precision": [], "recall": [], "f1": [], "auc": [], "cut": []}
        )
        entry["precision"].append(precision)
        entry["recall"].append(recall)
        entry["f1"].append(f1)
        entry["auc"].append(auc)
        entry["cut"].append(cut)

    for fold_index, fold in enumerate(folds, start=1):
        train_df, test_df = fold["train_df"], fold["test_df"]
        y_test = test_df["churn_label"].to_numpy()

        # --- rule tham chiếu viết tay (không học gì, ngưỡng cố định) ---
        for reference in REFERENCE_RULES:
            precision, recall, f1 = _prf(y_test, _apply(test_df, reference["conditions"]))
            record(f"ref::{reference['name']}", precision, recall, f1, None)

        # --- rule 1 biến: CHỌN trên train, ĐO trên test ---
        best_1f = _search_1feature(train_df)
        precision, recall, f1 = _prf(y_test, _apply(test_df, best_1f["conditions"]))
        column, op, _ = best_1f["conditions"][0]
        # Rule 1 biến có thể xếp hạng bằng CHÍNH biến đó -> tính được AUC. Đây là phép so trực tiếp
        # cho luận điểm "1 chiều vs nhiều chiều".
        score_1f = test_df[column].to_numpy() * (1.0 if op == ">=" else -1.0)
        auc_1f = float(roc_auc_score(y_test, score_1f)) if len(np.unique(y_test)) > 1 else None
        record("rule_1feature", precision, recall, f1, auc_1f)
        chosen_rules.setdefault("rule_1feature", []).append(_describe(best_1f["conditions"]))

        # --- rule 2 điều kiện AND ---
        best_2f = _search_2feature(train_df)
        precision, recall, f1 = _prf(y_test, _apply(test_df, best_2f["conditions"]))
        record("rule_2feature", precision, recall, f1, None)  # nhãn nhị phân -> không xếp hạng được
        chosen_rules.setdefault("rule_2feature", []).append(_describe(best_2f["conditions"]))

        y_train = train_df["churn_label"].to_numpy()

        # --- cây quyết định giới hạn độ sâu = tập rule tối ưu do máy tìm ---
        for depth in TREE_DEPTHS:
            tree = DecisionTreeClassifier(
                max_depth=depth, class_weight="balanced", random_state=RANDOM_STATE
            )
            tree.fit(train_df[FEATURE_COLUMNS], y_train)
            proba_train = tree.predict_proba(train_df[FEATURE_COLUMNS])[:, 1]
            proba = tree.predict_proba(test_df[FEATURE_COLUMNS])[:, 1]
            precision, recall, f1, cut = _tuned_cut(y_train, proba_train, y_test, proba)
            auc = float(roc_auc_score(y_test, proba)) if len(np.unique(y_test)) > 1 else None
            record(f"tree_depth_{depth}", precision, recall, f1, auc, cut)
            if fold_index == 1 and depth <= 2:
                chosen_rules.setdefault(f"tree_depth_{depth}", []).append(
                    export_text(tree, feature_names=list(FEATURE_COLUMNS), max_depth=depth).strip()
                )

        # --- model đang chạy: LR 11 feature + hiệu chỉnh isotonic ---
        # Ngưỡng cũng chọn trên train (giống rule) — xem ghi chú trong _tuned_cut.
        scaler = fold["scaler"]
        model = _fit_calibrated(train_df, scaler)
        proba_train = model.predict_proba(scaler.transform(train_df[FEATURE_COLUMNS]))[:, 1]
        proba = model.predict_proba(scaler.transform(test_df[FEATURE_COLUMNS]))[:, 1]
        precision, recall, f1, cut = _tuned_cut(y_train, proba_train, y_test, proba)
        auc = float(roc_auc_score(y_test, proba)) if len(np.unique(y_test)) > 1 else None
        record("model_logreg_calibrated", precision, recall, f1, auc, cut)

    summary: dict[str, Any] = {}
    for name, metrics in scores.items():
        row: dict[str, Any] = {}
        for metric, values in metrics.items():
            mean, std = _mean_std(values)
            row[f"{metric}_mean"] = None if mean is None else round(mean, 4)
            row[f"{metric}_std"] = None if std is None else round(std, 4)
        summary[name] = row

    model_f1 = summary["model_logreg_calibrated"]["f1_mean"]
    model_f1_std = summary["model_logreg_calibrated"]["f1_std"] or 0.0
    best_rule_name = max(
        (n for n in summary if n != "model_logreg_calibrated"),
        key=lambda n: summary[n]["f1_mean"] or 0.0,
    )
    best_rule_f1 = summary[best_rule_name]["f1_mean"] or 0.0
    gap = round(model_f1 - best_rule_f1, 4)

    verdict = {
        "best_rule_baseline": best_rule_name,
        "best_rule_f1": best_rule_f1,
        "model_f1": model_f1,
        "f1_gap": gap,
        "noise_floor_f1_std": round(model_f1_std, 4),
        "model_beats_best_rule_beyond_noise": bool(gap > model_f1_std),
        "note": (
            "Rule chỉ trả nhãn nhị phân nên KHÔNG xếp hạng được -> không dùng được để phân bổ ngân "
            "sách voucher theo tổn thất kỳ vọng, bất kể F1 bao nhiêu. Đây là khác biệt về NĂNG LỰC, "
            "không phải về độ chính xác."
        ),
    }

    result = {
        "n_folds": len(folds),
        "panel_rows": int(len(panel)),
        "panel_users": int(panel.index.nunique()),
        "churn_rate": round(float(panel["churn_label"].mean()), 4),
        # _label_definition() chứ không phải cv.get(...): `label_definition` được gắn ở
        # train_and_evaluate, không có trong output của _evaluate_grouped_cv.
        "label_definition": _label_definition(),
        "summary": summary,
        "chosen_rules_per_fold": chosen_rules,
        "verdict": verdict,
    }

    logger.info(
        f"Rule benchmark xong: model F1={model_f1}±{model_f1_std} vs rule tốt nhất "
        f"({best_rule_name}) F1={best_rule_f1} | chênh {gap} | "
        f"vượt sàn nhiễu={verdict['model_beats_best_rule_beyond_noise']}"
    )
    return result
