"""Chẩn đoán định nghĩa nhãn churn (Tầng 0.2 — xem docs/canvas/churn-risk-tier0-plan.md).

## Vấn đề đang chẩn đoán

Nhãn hiện tại = "không có hoạt động nào (**xem HOẶC mua**) trong 30 ngày tới", lấy từ
`orders` ∪ `user_events`. Feature mạnh nhất = `category_diversity_viewed` ("số category **xem** trong
30 ngày qua"), permutation importance **0.2253** so với 0.0285 của hạng nhì — lấy từ **cùng nguồn
`user_events`**, cửa sổ kề nhau, cùng nghĩa "có hoạt động". Bài toán vì thế gần như thành *"user đang
hoạt động có tiếp tục hoạt động không"*.

Bằng chứng bài toán đã bão hoà (từ ablation): 3/3 block feature thất bại, **đối chứng âm (+0.0033)
ăn điểm cao hơn cả 2 block thật**; L1 cho ~2 feature đạt AUC không phân biệt được với 11 feature.

## Vì sao không chốt thẳng "60 ngày không đơn"

`lambdaBase ~ lognormal(log 0.5, 0.9)` (tools/data-seed/lib/profiles.mjs) ⇒ user trung vị mua ~0,5
đơn/tháng. Cửa sổ 60 ngày: `P(không đơn | λ=0,5) = e^−1 ≈ 0,37` ⇒ **~37% user khỏe mạnh bị dán nhãn
churn do nhiễu Poisson**. AUC sẽ tụt vì nhiễu nhãn *không giảm được*, không phải vì model yếu. Nên
phải quét lưới rồi để số liệu quyết định.

## Vì sao MỌI biến thể dùng CÙNG một bộ cutoff

Cửa sổ nhãn dài hơn đòi mốc cắt phải lùi xa hơn (cần đủ thời gian quan sát nhãn trong quá khứ). Nếu
mỗi biến thể tự chọn mốc theo cửa sổ của nó thì lượng lịch sử mỗi user có tại mốc cũng khác nhau ⇒
base rate và AUC lệch vì HAI nguyên nhân trộn lẫn. Vì vậy dùng chung bộ cutoff neo theo cửa sổ DÀI
NHẤT trong lưới: các biến thể khác nhau **chỉ** ở định nghĩa nhãn.

Đánh đổi phải khai báo: mốc gần nhất là 150 ngày trước, nên không dùng được dữ liệu 5 tháng gần đây.
Với mục đích *so sánh định nghĩa nhãn* thì đây là lựa chọn đúng; con số tuyệt đối vì thế không so
trực tiếp được với run production (mốc gần nhất 60 ngày).

Module thuần phân tích: KHÔNG lưu model, KHÔNG đổi `labels.py` production.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.logger import get_logger
from shared_common.pool import get_engine

from app.training.ablation import _permutation_importance
from app.training.train import _evaluate_grouped_cv

logger = get_logger(__name__)

LABEL_WINDOWS = [60, 90, 120]
LABEL_SOURCES = ["activity", "orders"]
MIN_ORDERS_FILTERS = [0, 2]  # 0 = mọi user; 2 = chỉ user có >= 2 đơn DELIVERED tại mốc cắt

LABEL_BUFFER_DAYS = 30  # đệm an toàn sau cửa sổ nhãn
CUTOFF_SPACING_DAYS = 30
N_CUTOFFS = 5


def _diagnostic_cutoffs() -> list[int]:
    """Bộ cutoff dùng chung, neo theo cửa sổ nhãn DÀI NHẤT để mọi biến thể so được với nhau."""
    newest = max(LABEL_WINDOWS) + LABEL_BUFFER_DAYS
    return [newest + CUTOFF_SPACING_DAYS * i for i in range(N_CUTOFFS)]


def run_label_diagnostics() -> dict[str, Any]:
    """Quét lưới (cửa sổ × nguồn nhãn × lọc dân số), báo base_rate + AUC grouped CV ± std +
    permutation importance của feature mạnh nhất.

    Cột `top_feature_importance` là cái trả lời câu hỏi thật: nếu `category_diversity_viewed` vẫn áp
    đảo ~0.2x thì tautology CHƯA bị phá, đổi nhãn xong vẫn vô nghĩa.
    """
    engine = get_engine(shared_settings.DB_NAME)
    cutoffs = _diagnostic_cutoffs()

    results: dict[str, Any] = {
        "cutoffs_days_ago": cutoffs,
        "note": (
            "Mọi biến thể dùng chung bộ cutoff (neo theo cửa sổ dài nhất) nên chỉ khác nhau ở định "
            "nghĩa nhãn. Số tuyệt đối KHÔNG so trực tiếp với run production (mốc gần nhất 60 ngày)."
        ),
        "variants": [],
    }

    # Panel chỉ phụ thuộc (cửa sổ, nguồn nhãn); bộ lọc dân số áp sau nên tái dùng được panel.
    for window in LABEL_WINDOWS:
        for source in LABEL_SOURCES:
            try:
                panel = _build_panel(engine, cutoffs, window, source)
            except Exception as e:
                logger.warning(f"window={window} source={source}: dựng panel thất bại ({e})")
                results["variants"].append(
                    {"label_window_days": window, "label_source": source, "error": str(e)}
                )
                continue

            for min_orders in MIN_ORDERS_FILTERS:
                entry = {
                    "label_window_days": window,
                    "label_source": source,
                    "min_delivered_orders": min_orders,
                }
                subset = panel if min_orders <= 0 else panel[panel["frequency"] >= min_orders]

                entry["rows"] = int(len(subset))
                entry["users"] = int(subset.index.nunique())
                if subset.empty:
                    entry["error"] = "không còn dòng nào sau khi lọc"
                    results["variants"].append(entry)
                    continue

                entry["base_rate"] = round(float(subset["churn_label"].mean()), 4)

                test_cutoff = subset["cutoff"].max()
                cv = _evaluate_grouped_cv(subset, test_cutoff)
                if "error" in cv:
                    entry["error"] = cv["error"]
                    results["variants"].append(entry)
                    continue

                folds = cv.pop("_folds", [])
                cv.pop("_oof", None)
                entry.update(
                    {
                        "auc_mean": cv["auc_mean"],
                        "auc_std": cv["auc_std"],
                        "f1_mean": cv["f1_mean"],
                        "precision_mean": cv["precision_mean"],
                        "recall_mean": cv["recall_mean"],
                        "n_splits": cv["n_splits"],
                    }
                )

                importance = _permutation_importance(folds, FEATURE_COLUMNS)
                top = importance[0] if importance else None
                entry["top_feature"] = None if top is None else top["feature"]
                entry["top_feature_importance"] = None if top is None else top["auc_drop_mean"]
                entry["top3"] = [
                    {"feature": row["feature"], "auc_drop": row["auc_drop_mean"]} for row in importance[:3]
                ]
                results["variants"].append(entry)

    logger.info(
        "Label diagnostics xong: "
        + str(
            [
                (
                    v.get("label_window_days"),
                    v.get("label_source"),
                    v.get("min_delivered_orders"),
                    v.get("base_rate"),
                    v.get("auc_mean"),
                    v.get("top_feature"),
                )
                for v in results["variants"]
            ]
        )
    )
    return results


def _build_panel(engine, cutoffs: list[int], window: int, source: str) -> pd.DataFrame:
    from app.training.train import _build_training_panel

    return _build_training_panel(
        engine,
        cutoffs_days_ago=cutoffs,
        label_window_days=window,
        label_source=source,
        min_delivered_orders=0,  # module này tự lọc theo MIN_ORDERS_FILTERS -> không để lọc 2 lần
    )
