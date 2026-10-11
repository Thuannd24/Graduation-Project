"""Kiểm định & hiệu chỉnh xác suất churn (Tầng 0.1 — xem docs/canvas/churn-risk-tier0-plan.md).

## Vấn đề

`_fit_classifier` dùng `LogisticRegression(class_weight="balanced")`. sklearn đặt trọng số
`w_c = n_samples / (n_classes * n_c)` ⇒ TỔNG trọng số 2 lớp bằng nhau ⇒ model ước lượng hậu nghiệm
dưới **tiên nghiệm 50/50**, không phải base rate thật (đo được: 0.1883). Xác suất trả về bị **thổi
phồng hệ thống**, và trước module này repo KHÔNG có phép đo calibration nào.

## Vì sao việc này quan trọng hơn "chỉ là một metric nữa"

Hiệu chỉnh về tiên nghiệm thật là phép dịch **odds** nhân hằng số — đơn điệu nhưng **phi tuyến** trên
thang xác suất. Hệ quả:

- AUC và xếp hạng theo `P` thuần: **KHÔNG đổi** (đơn điệu bảo toàn thứ tự). Dùng làm phép kiểm tra
  bug: nếu AUC lệch giữa `raw` và `prior_shift` thì code sai.
- Xếp hạng theo `P × monetary`: **ĐỔI**. Đây là phép nhân, P bị co giãn khác nhau ở các mức khác nhau
  nên thứ tự của tích thay đổi giữa các user có `monetary` khác nhau.

⇒ Con số "xếp theo tổn thất kỳ vọng giữ được 3,7–7,7× doanh thu" đã báo cáo **phải đo lại**.

Module thuần phân tích: KHÔNG lưu model, KHÔNG đổi hành vi phát voucher.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine

from app.training.train import (
    BUDGET_K_VALUES,
    DEFAULT_THRESHOLD,
    _build_training_panel,
    _evaluate_grouped_cv,
    _mean_std,
    _score,
)

logger = get_logger(__name__)

N_BINS = 10
CALIBRATION_INTERNAL_CV = 3


def _prior_shift(proba: np.ndarray, train_base_rate: float) -> np.ndarray:
    """Đưa xác suất từ tiên nghiệm 50/50 (do class_weight='balanced') về tiên nghiệm thật.

        odds_thật = odds_model * pi/(1-pi)

    `pi` là base rate của TẬP TRAIN của chính fold đó — không dùng base rate toàn panel vì tập test
    của fold nằm ngoài tập train, lấy số toàn panel là để thông tin của test lọt vào phép hiệu chỉnh.
    """
    pi = float(np.clip(train_base_rate, 1e-6, 1 - 1e-6))
    p = np.clip(proba, 1e-9, 1 - 1e-9)
    odds = (p / (1.0 - p)) * (pi / (1.0 - pi))
    return odds / (1.0 + odds)


def _reliability_curve(y_true: np.ndarray, proba: np.ndarray, n_bins: int = N_BINS) -> list[dict]:
    """Chia xác suất dự đoán thành `n_bins` khoảng đều, so xác suất TRUNG BÌNH DỰ ĐOÁN với TỈ LỆ
    THỰC TẾ trong khoảng đó. Model calibrated tốt thì 2 số này sát nhau ở mọi bin."""
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    # right=True + trừ 1 để giá trị đúng bằng 0.0 không rơi ra bin -1
    idx = np.clip(np.digitize(proba, edges[1:-1], right=True), 0, n_bins - 1)

    rows = []
    for b in range(n_bins):
        mask = idx == b
        count = int(mask.sum())
        if count == 0:
            continue
        rows.append(
            {
                "bin": f"[{edges[b]:.1f},{edges[b + 1]:.1f})",
                "count": count,
                "predicted_mean": round(float(proba[mask].mean()), 4),
                "observed_rate": round(float(y_true[mask].mean()), 4),
                "gap": round(float(proba[mask].mean() - y_true[mask].mean()), 4),
            }
        )
    return rows


def _ece(y_true: np.ndarray, proba: np.ndarray, n_bins: int = N_BINS) -> float:
    """Expected Calibration Error — trung bình có trọng số của |dự đoán − thực tế| theo từng bin."""
    curve = _reliability_curve(y_true, proba, n_bins)
    total = len(proba)
    if total == 0:
        return 0.0
    return float(sum(row["count"] * abs(row["gap"]) for row in curve) / total)


def _ranking(frame: pd.DataFrame, proba_column: str) -> dict:
    """revenue-recall@K cho CẢ HAI cách xếp hạng, tính trên CÙNG một run.

    - `by_probability`: xếp theo P thuần → **bất biến** với hiệu chỉnh (biến đổi đơn điệu). Có mặt ở
      đây để tỉ số "hơn bao nhiêu lần" được tính trong cùng một lần chia fold, không phải ghép số
      giữa hai run khác nhau (cutoff dịch theo ngày chạy nên hai run không so trực tiếp được).
    - `by_expected_loss`: xếp theo `P × monetary` → **đổi** theo hiệu chỉnh, vì là phép nhân.
    """
    working = frame.copy()
    working["expected_loss"] = working[proba_column] * working["monetary"]
    total_revenue_at_risk = float((working["y_true"] * working["monetary"]).sum())

    out: dict[str, Any] = {"total_revenue_at_risk": round(total_revenue_at_risk, 2)}
    for k in BUDGET_K_VALUES:
        if k > len(working):
            continue
        entry = {}
        for name, column in (("by_probability", proba_column), ("by_expected_loss", "expected_loss")):
            top = working.nlargest(k, column)
            captured = float((top["y_true"] * top["monetary"]).sum())
            entry[name] = {
                "precision_at_k": round(float(top["y_true"].mean()), 4),
                "revenue_recall_at_k": (
                    round(captured / total_revenue_at_risk, 4) if total_revenue_at_risk > 0 else None
                ),
            }
        ratio = (
            entry["by_expected_loss"]["revenue_recall_at_k"] / entry["by_probability"]["revenue_recall_at_k"]
            if entry["by_probability"]["revenue_recall_at_k"]
            else None
        )
        entry["expected_loss_over_probability"] = None if ratio is None else round(ratio, 2)
        out[f"k={k}"] = entry
    return out


def _best_threshold(y_true: np.ndarray, proba: np.ndarray) -> dict:
    from sklearn.metrics import f1_score

    best = {"threshold": DEFAULT_THRESHOLD, "f1": -1.0}
    for threshold in np.arange(0.05, 0.96, 0.01):
        f1 = float(f1_score(y_true, (proba >= threshold).astype(int), zero_division=0))
        if f1 > best["f1"]:
            best = {"threshold": round(float(threshold), 2), "f1": round(f1, 4)}
    return best


def run_calibration_study() -> dict[str, Any]:
    """So 4 phương án xác suất trên CÙNG một cách chia fold (bắt buộc — so chéo giữa các lần chia
    fold khác nhau thì chênh lệch lẫn với nhiễu chia fold).

    Phương án: `raw` (nguyên trạng) · `prior_shift` (công thức odds) · `platt` / `isotonic`
    (`CalibratedClassifierCV` refit TRONG tập train của từng fold).
    """
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine)
    test_cutoff = panel["cutoff"].max()

    cv = _evaluate_grouped_cv(panel, test_cutoff)
    if "error" in cv:
        raise RuntimeError(cv["error"])
    folds = cv.pop("_folds")
    cv.pop("_oof", None)

    variants = ("raw", "prior_shift", "platt", "isotonic")
    pooled: dict[str, list[pd.DataFrame]] = {name: [] for name in variants}
    per_fold_auc: dict[str, list[float]] = {name: [] for name in variants}

    for fold_index, fold in enumerate(folds, start=1):
        train_df, test_df = fold["train_df"], fold["test_df"]
        scaler, clf = fold["scaler"], fold["clf"]

        X_train = scaler.transform(train_df[FEATURE_COLUMNS])
        X_test = scaler.transform(test_df[FEATURE_COLUMNS])
        y_train = train_df["churn_label"].to_numpy()
        y_true = test_df["churn_label"].to_numpy()
        train_base_rate = float(y_train.mean())

        probabilities = {"raw": clf.predict_proba(X_test)[:, 1]}
        probabilities["prior_shift"] = _prior_shift(probabilities["raw"], train_base_rate)

        for method in ("sigmoid", "isotonic"):
            name = "platt" if method == "sigmoid" else "isotonic"
            try:
                calibrated = CalibratedClassifierCV(
                    LogisticRegression(class_weight="balanced", max_iter=1000),
                    method=method,
                    cv=CALIBRATION_INTERNAL_CV,
                )
                calibrated.fit(X_train, y_train)
                probabilities[name] = calibrated.predict_proba(X_test)[:, 1]
            except Exception as e:  # dữ liệu quá ít cho CV lồng nhau -> bỏ phương án, không giết cả study
                logger.warning(f"Fold {fold_index}: {name} thất bại ({e}); bỏ qua phương án này ở fold này")

        for name, proba in probabilities.items():
            if len(np.unique(y_true)) > 1:
                per_fold_auc[name].append(float(roc_auc_score(y_true, proba)))
            pooled[name].append(
                pd.DataFrame(
                    {
                        "y_true": y_true,
                        "proba": proba,
                        "monetary": test_df["monetary"].to_numpy(),
                    },
                    index=test_df.index,
                )
            )

    results: dict[str, Any] = {
        "base_rate_panel": round(float(panel["churn_label"].mean()), 4),
        "n_folds": len(folds),
        "n_bins": N_BINS,
        "variants": {},
    }

    for name in variants:
        if not pooled[name]:
            results["variants"][name] = {"error": "không chạy được ở fold nào"}
            continue

        frame = pd.concat(pooled[name])
        y_true = frame["y_true"].to_numpy()
        proba = frame["proba"].to_numpy()

        auc_mean, auc_std = _mean_std(per_fold_auc[name])
        best = _best_threshold(y_true, proba)

        results["variants"][name] = {
            "brier": round(float(brier_score_loss(y_true, proba)), 5),
            "ece": round(_ece(y_true, proba), 5),
            "mean_predicted": round(float(proba.mean()), 4),
            "observed_rate": round(float(y_true.mean()), 4),
            "auc_mean": None if auc_mean is None else round(auc_mean, 4),
            "auc_std": None if auc_std is None else round(auc_std, 4),
            "at_threshold_0.5": {
                k: (round(v, 4) if isinstance(v, float) else v)
                for k, v in _score(y_true, proba, DEFAULT_THRESHOLD).items()
            },
            "best_threshold": best,
            "reliability_curve": _reliability_curve(y_true, proba),
            "ranking": _ranking(frame, "proba"),
        }

    # Phép kiểm tra bug: biến đổi đơn điệu NGẶT (prior_shift) phải giữ nguyên AUC. isotonic có thể
    # lệch nhẹ vì sinh giá trị trùng (đơn điệu không ngặt) -> chấp nhận, nhưng phải nhìn thấy.
    raw_auc = results["variants"].get("raw", {}).get("auc_mean")
    shift_auc = results["variants"].get("prior_shift", {}).get("auc_mean")
    results["sanity_auc_invariant_under_prior_shift"] = (
        None if (raw_auc is None or shift_auc is None) else bool(abs(raw_auc - shift_auc) < 1e-6)
    )

    scored = {
        name: v["ece"] for name, v in results["variants"].items() if isinstance(v.get("ece"), float)
    }
    results["best_by_ece"] = min(scored, key=scored.get) if scored else None

    logger.info(
        f"Calibration study xong. ECE={scored} | best={results['best_by_ece']} | "
        f"AUC bất biến dưới prior_shift={results['sanity_auc_invariant_under_prior_shift']}"
    )
    return results
