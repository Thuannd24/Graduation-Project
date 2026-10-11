"""Nâng sức mạnh phép re-test churn: 5 fold cố định -> 5 LƯỢT x 5 fold = 25, đúng chuẩn RetailRocket.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

## Vì sao cần bản này

`ablation_paired_retest.py` đã sửa đúng lỗi thống kê (so hiệu ghép cặp thay vì so với std baseline),
nhưng vẫn dùng `_evaluate_grouped_cv` — hardcode `random_state=42`, **không lặp lại được**. Với
n=5 mẫu ghép cặp, `abandon_shape` (60% fold dương) và `distinct_sessions_30d` riêng (80% fold
dương) đều CHƯA đủ mẫu để phân biệt "gần đạt nhưng chưa đủ" với "chỉ là may rủi của 5 fold cụ thể".

Đây KHÔNG sửa `train.py` (file production, ngoài phạm vi thí nghiệm) — chỉ NHÂN BẢN đúng logic
chia fold nhân quả của `_evaluate_grouped_cv` (đọc từ `train.py`, giữ nguyên ngữ nghĩa: test =
user giữ lại tại mốc mới nhất, train = user KHÁC ở mốc CŨ HƠN) nhưng cho `random_state` thay đổi
theo từng lượt, y hệt cách `measure_feature_groups_repeated.py` đã làm cho RetailRocket.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import MinMaxScaler

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.features.candidates import CANDIDATE_BLOCKS
from shared_common.pool import get_engine

from app.training.train import _build_training_panel

N_SPLITS, N_REPEATS = 5, 5
MIN_POSITIVE_SHARE = 0.80
RANDOM_STATE = 42


def causal_folds(panel: pd.DataFrame, test_cutoff, n_splits: int, seed: int):
    """Nhân bản logic chia fold của `_evaluate_grouped_cv` (train.py), chỉ đổi seed để lặp lại."""
    test_pool = panel[panel["cutoff"] == test_cutoff]
    train_pool = panel[panel["cutoff"] != test_cutoff]
    users = test_pool.index.to_numpy()
    strat = test_pool["churn_label"].to_numpy()
    minority = int(min((strat == 0).sum(), (strat == 1).sum()))
    splits = min(n_splits, minority)
    if splits < 2 or train_pool.empty:
        return
    skf = StratifiedKFold(n_splits=splits, shuffle=True, random_state=seed)
    for _, holdout_idx in skf.split(users, strat):
        holdout_users = set(users[holdout_idx].tolist())
        fold_test = test_pool[test_pool.index.isin(holdout_users)]
        fold_train = train_pool[~train_pool.index.isin(holdout_users)]
        if fold_train["churn_label"].nunique() < 2 or fold_test["churn_label"].nunique() < 2:
            continue
        yield fold_train, fold_test


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
    test_cutoff = panel["cutoff"].max()
    print(f"Panel: {len(panel)} dong / {panel.index.nunique()} user | churn {panel['churn_label'].mean():.4f}")

    base_cols = list(FEATURE_COLUMNS)
    test_configs: dict[str, list[str]] = dict(CANDIDATE_BLOCKS)
    test_configs["session__avg_events_per_session_30d_ONLY"] = ["avg_events_per_session_30d"]
    test_configs["session__distinct_sessions_30d_ONLY"] = ["distinct_sessions_30d"]

    per_config_delta: dict[str, list[float]] = {name: [] for name in test_configs}
    n_folds_total = 0

    for repeat in range(N_REPEATS):
        seed = RANDOM_STATE + repeat
        fold_list = list(causal_folds(panel, test_cutoff, N_SPLITS, seed))
        n_folds_total += len(fold_list)
        for train_df, test_df in fold_list:
            auc_base = fit_auc(train_df, test_df, base_cols)
            for name, cols in test_configs.items():
                auc_ext = fit_auc(train_df, test_df, base_cols + cols)
                per_config_delta[name].append(auc_ext - auc_base)
        print(f"  luot {repeat + 1}/{N_REPEATS}: {len(fold_list)} fold hop le")

    print(f"\nTong fold ghep cap: {n_folds_total} (muc tieu {N_REPEATS * N_SPLITS})\n")

    results = {}
    for name, deltas in per_config_delta.items():
        stat = paired(np.array(deltas))
        results[name] = stat
        print(
            f"  {name:42s} delta={stat['delta_mean']:+.5f}+-{stat['delta_std']:.5f} | "
            f"{stat['share_positive']:.0%} fold+ ({stat['n_folds']} fold) | GIU={stat['significant']}"
        )

    out = {
        "panel_rows": int(len(panel)),
        "panel_users": int(panel.index.nunique()),
        "n_folds_total": n_folds_total,
        "protocol": f"{N_REPEATS} luot x {N_SPLITS} fold, seed khac nhau moi luot",
        "results": results,
    }
    print("\n" + json.dumps(out, ensure_ascii=False, indent=2))
    with open("/tmp/ablation_repeated_retest.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
