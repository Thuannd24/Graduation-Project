"""Re-test 7 block ứng viên churn bằng PHÉP KIỂM GHÉP CẶP — sửa lỗi thống kê đã xác nhận.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md) §11.

## Vì sao cần re-test

`ablation.py:167-198` (đã đọc code, xác nhận, không suy đoán) tính:
    delta_auc = block_run.auc_mean - baseline.auc_mean     # 2 lần CV RIÊNG BIỆT
    noise_floor = baseline.auc_std                          # std của baseline, KHÔNG PHẢI của hiệu
    verdict = "GIỮ" nếu delta_auc > noise_floor

Đây đúng là phép kiểm đã đo được là SAI trên RetailRocket: so hiệu với std của TỪNG cấu hình
riêng biệt (phần lớn là độ khó khác nhau giữa các fold — nhiễu mà baseline và block+baseline CÙNG
CHỊU), thay vì so với std của HIỆU đã ghép cặp theo fold. Chênh lệch đo được: 7,7×.

Script này KHÔNG sửa `ablation.py` (file production, không nằm trong phạm vi thí nghiệm) — chỉ
re-test độc lập, dùng ĐÚNG fold (từ `_evaluate_grouped_cv`) để baseline và block+baseline được đo
trên CÙNG fold, rồi ghép cặp theo fold.

## Hai điều tra thêm cho 2 ứng viên nghi có tiềm năng bị đo sai

1. `abandon_shape`: kiểm tra tương quan với `cart_abandon_count` (đã có trong 11 feature production)
   — nếu tương quan cao, phần "giá trị" đo được có thể là trùng lặp, không phải thông tin mới.
2. `session`: tách `avg_events_per_session_30d` và `distinct_sessions_30d` thành 2 phép đo ĐỘC LẬP
   ngoài phép đo cả block — kiểm tra giả thuyết "1 feature tốt bị 1 feature trùng lặp che mất" khi
   ablation.py cũ chỉ đo cả block gộp chung.

## Giới hạn PHẢI nói khi báo cáo

Panel churn chỉ có **5 fold cố định** (`_evaluate_grouped_cv` hardcode `random_state=42`, không có
tham số lặp lại) — so với 25 fold (5 lượt × 5 fold) đã dùng cho RetailRocket. n=5 mẫu ghép cặp có
sức mạnh thống kê THẤP HƠN NHIỀU. Ngưỡng "≥80% fold dương" ở đây thô (4/5 hoặc 5/5). Không nên đọc
kết quả này với cùng mức tin cậy như kết quả RetailRocket.

Thuần phân tích: không lưu model, không đổi threshold, không đụng `assembler.py`/`candidates.py`.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import MinMaxScaler

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.features.candidates import CANDIDATE_BLOCKS
from shared_common.pool import get_engine

from app.training.train import _build_training_panel, _evaluate_grouped_cv

MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42


def paired(delta: np.ndarray) -> dict:
    mean, std = float(delta.mean()), float(delta.std())
    share = float((delta > 0).mean())
    return {
        "n_folds": int(len(delta)),
        "delta_mean": round(mean, 5),
        "delta_std": round(std, 5),
        "share_positive": round(share, 3),
        "significant": bool(mean > std and share >= MIN_POSITIVE_SHARE),
    }


def fit_auc(train: pd.DataFrame, test: pd.DataFrame, cols: list[str]) -> float:
    scaler = MinMaxScaler().fit(train[cols])
    model = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=RANDOM_STATE)
    model.fit(scaler.transform(train[cols]), train["churn_label"])
    proba = model.predict_proba(scaler.transform(test[cols]))[:, 1]
    return roc_auc_score(test["churn_label"], proba)


if __name__ == "__main__":
    engine = get_engine(shared_settings.DB_NAME)
    panel = _build_training_panel(engine, include_candidates=True)
    print(f"Panel: {len(panel)} dong / {panel.index.nunique()} user | churn {panel['churn_label'].mean():.4f}")

    # 1 lan goi de lay DUNG bo fold - baseline va block deu doc tu CUNG fold['train_df']/test_df
    cv = _evaluate_grouped_cv(panel, panel["cutoff"].max())
    if "error" in cv:
        raise RuntimeError(cv["error"])
    folds = cv["_folds"]
    print(f"So fold (co dinh, khong lap lai): {len(folds)}\n")

    base_cols = list(FEATURE_COLUMNS)
    auc_base = np.array([fit_auc(f["train_df"], f["test_df"], base_cols) for f in folds])
    print(f"Baseline (11 feature production): {auc_base.mean():.4f} +- {auc_base.std():.4f}\n")

    results: dict[str, dict] = {}

    test_configs: dict[str, list[str]] = dict(CANDIDATE_BLOCKS)
    # Dieu tra 2: tach session thanh 2 phep do doc lap, NGOAI phep do ca block
    test_configs["session__avg_events_per_session_30d_ONLY"] = ["avg_events_per_session_30d"]
    test_configs["session__distinct_sessions_30d_ONLY"] = ["distinct_sessions_30d"]

    for name, cols in test_configs.items():
        ext_cols = base_cols + cols
        auc_ext = np.array([fit_auc(f["train_df"], f["test_df"], ext_cols) for f in folds])
        stat = paired(auc_ext - auc_base)
        results[name] = {
            "columns": cols,
            "auc_baseline": {"mean": round(float(auc_base.mean()), 4), "std": round(float(auc_base.std()), 4)},
            "auc_with_block": {"mean": round(float(auc_ext.mean()), 4), "std": round(float(auc_ext.std()), 4)},
            "paired": stat,
        }
        print(
            f"  {name:42s} {auc_base.mean():.4f} -> {auc_ext.mean():.4f} | "
            f"delta={stat['delta_mean']:+.5f}+-{stat['delta_std']:.5f} | "
            f"{stat['share_positive']:.0%} fold duong | GIU={stat['significant']}"
        )

    # Dieu tra 1: tuong quan abandon_shape voi cart_abandon_count da co trong production
    print("\n--- Dieu tra 1: cart_abandon_rate co trung voi cart_abandon_count khong? ---")
    corr = panel[["cart_abandon_rate", "cart_abandon_count"]].corr(method="spearman").iloc[0, 1]
    print(f"  Spearman(cart_abandon_rate, cart_abandon_count) = {corr:.4f}")

    # Dieu tra 2 (dinh luong do phu): gap_dispersion co bao nhieu % dong la gia tri MAC DINH?
    print("\n--- Dieu tra 2: gap_dispersion bi pha loang boi sentinel mac dinh bao nhieu? ---")
    from shared_common.features.candidates import NO_REPEAT_PURCHASE_DAYS
    for col in ("interpurchase_gap_std", "interpurchase_gap_max"):
        pct_default = float((panel[col] == float(NO_REPEAT_PURCHASE_DAYS)).mean())
        print(f"  {col:26s} {pct_default:.1%} dong = gia tri mac dinh (sentinel)")

    out = {
        "panel_rows": int(len(panel)),
        "panel_users": int(panel.index.nunique()),
        "n_folds": len(folds),
        "caveat": "n=5 fold co dinh, khong lap lai - suc manh thap hon nhieu so voi 25-fold RetailRocket",
        "old_method_confirmed_flawed": "ablation.py so delta_auc voi std cua baseline (khong ghep cap)",
        "results": results,
        "investigation_1_correlation_abandon_rate_vs_count": round(float(corr), 4),
        "investigation_2_gap_dispersion_default_share": {
            col: float((panel[col] == float(NO_REPEAT_PURCHASE_DAYS)).mean())
            for col in ("interpurchase_gap_std", "interpurchase_gap_max")
        },
    }
    print("\n" + json.dumps(out, ensure_ascii=False, indent=2))
    with open("/tmp/ablation_paired_retest.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
