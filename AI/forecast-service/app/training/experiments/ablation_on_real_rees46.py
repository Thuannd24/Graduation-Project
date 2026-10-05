"""Ablation (roadmap: "re-baseline: chạy lại ablation, đừng tin 11 feature là đủ") trên dữ liệu REES46 THẬT.

Kế thừa đúng quyết định thời gian của `retrain_on_real_rees46.py` (label_window=60, 5 mốc cắt 2026-05-18→
2026-08-02 — xem docstring file đó để biết vì sao). Dùng `fast_panel_builder.py` + `fast_candidates_builder.py`
(đã xác minh khớp 100% công thức gốc trên 8 user mẫu, xem log chạy 2026-10-05) để tránh SQL tổng hợp quá chậm,
rồi gọi lại ĐÚNG logic ablation gốc (`_cv_auc`, `_permutation_importance`, `_l1_path`) bằng cách monkeypatch
`ablation._build_training_panel` — không viết lại logic so sánh/thống kê.

Ưu tiên của người dùng (2026-10-02, ghi trong memory): kết luận cũ "11 feature đủ, gap_dispersion không giúp"
đo trên BỘ SINH GIẢ LẬP, nơi feature mở rộng được sinh CỐ Ý độc lập với nhãn churn — không phải sự thật phổ
quát. Chạy lại ablation lần này là phép kiểm tra TRÊN DỮ LIỆU THẬT, kết luận có giá trị thật.
"""
from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "ecommerce_order_db")

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
sys.path.insert(0, f"{ROOT}/AI/forecast-service")

import pandas as pd  # noqa: E402
from shared_common.config import shared_settings  # noqa: E402
from shared_common.pool import get_engine  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.training import ablation as ablation_mod  # noqa: E402
from app.training import train as train_mod  # noqa: E402
from app.training.experiments.fast_candidates_builder import CANDIDATE_COLUMNS, fetch_candidate_features  # noqa: E402
from app.training.experiments.fast_panel_builder import FEATURE_COLUMNS, build_panel, churn_labels, load_raw  # noqa: E402

OUT = f"{ROOT}/data/experiment-results/behavior_patterns/ablation_rees46_real.json"
NEW_LABEL_WINDOW_DAYS = 60
N_CUTOFFS = 5
MIN_HISTORY_DAYS = 15


def build_panel_with_candidates(engine, cutoffs: list[pd.Timestamp], label_window_days: int) -> pd.DataFrame:
    orders, events = load_raw(engine)
    print(f"đã đọc: {len(orders):,} orders, {len(events):,} events", flush=True)
    orders_by_user = {u: g["created_at"].sort_values().to_numpy() for u, g in orders.groupby("user_id")}
    frames = []
    for cutoff in cutoffs:
        from app.training.experiments.fast_panel_builder import behavior_features, rfm_features

        rfm = rfm_features(orders, cutoff)
        beh = behavior_features(orders, events, cutoff, orders_by_user)
        cand = fetch_candidate_features(orders, events, orders_by_user, cutoff)
        X = rfm.join(beh, how="outer").join(cand, how="left")
        for c in FEATURE_COLUMNS:
            if c not in X:
                X[c] = 0.0
        defaults = {
            "recency": 9999, "frequency": 0, "monetary": 0.0, "avg_order_value": 0.0,
            "cancel_rate": 0.0, "discount_dependency": 0.0, "recent_view_count": 0,
            "days_since_last_activity": 9999, "cart_abandon_count": 0,
            "view_to_cart_conversion_rate": 0.0, "category_diversity_viewed": 0,
        }
        X[FEATURE_COLUMNS] = X[FEATURE_COLUMNS].fillna(defaults)
        X[CANDIDATE_COLUMNS] = X[CANDIDATE_COLUMNS].fillna(fetch_candidate_features.__globals__["CANDIDATE_DEFAULTS"])
        frame = X.copy()
        frame["churn_label"] = churn_labels(orders, X.index, cutoff, label_window_days)
        frame["cutoff"] = cutoff
        frames.append(frame)
        print(f"  mốc cắt {cutoff.date()}: {len(frame):,} user trước lọc frequency", flush=True)
    panel = pd.concat(frames)
    before = len(panel)
    panel = panel[panel["frequency"] >= 2]
    print(f"Lọc dân số: {before} -> {len(panel)} dòng")
    return panel


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

    panel = build_panel_with_candidates(engine, cutoff_dates, NEW_LABEL_WINDOW_DAYS)
    train_mod._assert_panel_not_contaminated(panel, cutoff_dates)

    ablation_mod._build_training_panel = lambda *a, **k: panel
    results = ablation_mod.run_ablation()

    print(json.dumps({k: v for k, v in results.items() if k not in ("permutation_importance_baseline", "l1_path_baseline")},
                     ensure_ascii=False, indent=1, default=str))
    print("\n=== permutation importance (baseline 11 feature) ===")
    for r in results["permutation_importance_baseline"]:
        print(f"  {r['feature']:30s} auc_drop={r['auc_drop_mean']} ± {r['auc_drop_std']}")
    print("\n=== L1 path (baseline 11 feature) ===")
    for r in results["l1_path_baseline"]:
        print(f"  C={r.get('C')}: auc={r.get('auc_mean')} ± {r.get('auc_std')}  feature_giữ_TB={r.get('features_kept_avg')}  union={r.get('features_kept_union')}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"cutoffs": [str(c) for c in cutoff_dates], "label_window_days": NEW_LABEL_WINDOW_DAYS,
                   "results": results}, fh, ensure_ascii=False, indent=1, default=str)
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
