"""Tầng 2.2 ("Benchmark Rule vs AI") trên dữ liệu REES46 THẬT — roadmap thứ tự ưu tiên cho bảo vệ
đồ án: 0.1 hiệu chỉnh -> 0.2 sửa nhãn -> 2.1 re-baseline -> **2.2 benchmark rule vs AI**. Ba bước đầu
đã xong qua việc chuyển hẳn sang dữ liệu thật (`retrain_on_real_rees46.py`: nhãn orders-based 60 ngày,
hiệu chỉnh isotonic, model `churn_classifier` live). Bước này còn thiếu: con số 2.2 cũ (L1 path ~2
feature đạt AUC 0.93) đo trên dữ liệu SYNTHETIC CŨ, không còn giá trị tham chiếu.

Không viết lại logic so sánh: gọi NGUYÊN VĂN `app/training/rule_benchmark.py::run_rule_benchmark()`
(rule 1 biến, rule 2 biến AND, cây quyết định depth 1/2/3, rule tham chiếu viết tay, so với model
LogisticRegression đã hiệu chỉnh isotonic — tất cả trên CÙNG fold `_evaluate_grouped_cv`). Chỉ
monkeypatch `_build_training_panel` để nó nhận panel thật đã build sẵn bằng `fast_panel_builder.py`
(cùng thiết kế thời gian đã dùng cho re-baseline/ablation: label_window=60 ngày, 5 mốc cắt
2026-05-18->2026-08-02 — xem docstring `retrain_on_real_rees46.py`).

Kết quả: data/experiment-results/behavior_patterns/rule_benchmark_rees46_real.json
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

from app.training import rule_benchmark as rb_mod  # noqa: E402
from app.training import train as train_mod  # noqa: E402
from app.training.experiments.fast_panel_builder import build_panel  # noqa: E402

OUT = f"{ROOT}/data/experiment-results/behavior_patterns/rule_benchmark_rees46_real.json"
NEW_LABEL_WINDOW_DAYS = 60
N_CUTOFFS = 5
MIN_HISTORY_DAYS = 15


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

    # `_label_definition()` (gọi bên trong run_rule_benchmark) đọc global của chính train.py — đặt lại
    # để metadata trong kết quả khớp đúng panel thật, dù panel đã được build sẵn ở trên.
    train_mod.CUTOFF_DAYS_AGO = [(reference_now - c).days for c in cutoff_dates]
    train_mod.LABEL_WINDOW_DAYS = NEW_LABEL_WINDOW_DAYS
    train_mod.LABEL_VERSION = f"churn_label_v3_orders_{NEW_LABEL_WINDOW_DAYS}d_min2_rees46real"

    rb_mod._build_training_panel = lambda *a, **k: panel
    results = rb_mod.run_rule_benchmark()

    print(json.dumps(results, ensure_ascii=False, indent=1, default=str))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"cutoffs": [str(c) for c in cutoff_dates], "label_window_days": NEW_LABEL_WINDOW_DAYS,
                   "results": results}, fh, ensure_ascii=False, indent=1, default=str)
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
