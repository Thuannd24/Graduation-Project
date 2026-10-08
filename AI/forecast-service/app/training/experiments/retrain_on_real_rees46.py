"""RE-BASELINE churn trên dữ liệu REES46 THẬT đã transform vào DB (2026-10-05) — thay cho panel giả lập cũ.

Vấn đề phải xử lý TRƯỚC khi gọi thẳng `train_and_evaluate()`: lưới mốc cắt production
(CUTOFF_DAYS_AGO=[270,240,210,180,150], LABEL_WINDOW_DAYS=120) giả định có SẴN >= 390 ngày dữ liệu
(270 ngày lùi về quá khứ + 120 ngày cửa sổ nhãn ở mốc xa nhất). Dữ liệu REES46 transform chỉ có 152
ngày (02/05–01/10/2026) — đo trực tiếp 2026-10-05: nếu giữ nguyên 120 ngày, mốc cắt hợp lệ chỉ nằm
trong 32/152 ngày đầu, panel tối đa ~4.400 user. KHÔNG dùng nhãn production nguyên trạng.

Quyết định (đo thực nghiệm, không đoán): LABEL_WINDOW_DAYS = 60 — cùng bậc độ lớn với chu kỳ mua
trung bình đo trên chính Online Retail II qua BG/NBD (α/r ≈ 97 ngày/lần mua) và cho phép 5 mốc cắt
trải gần hết 152 ngày dữ liệu (15→92 ngày từ lúc bắt đầu), tổng ~24.400 dòng panel thay vì ~4.400
nếu giữ 120 ngày. Đổi `LABEL_VERSION` để không ai nhầm so AUC này với AUC "120d" cũ — 2 nhãn khác
nhau, _retrain_gate() đã có sẵn cơ chế bỏ qua so sánh AUC khi đổi label_version.

Cách làm: KHÔNG sửa train.py (giữ nguyên code production) — ghi đè vài biến module + bọc
`_build_training_panel` bằng functools.partial ngay trong script này, rồi gọi đúng
`train_and_evaluate()` thật (KMeans + LR + calibration + retrain gate + lưu artifact), để toàn bộ
pipeline đã validate không đổi, chỉ đổi THAM SỐ THỜI GIAN cho khớp dữ liệu thật.

Kết quả: in ra metrics, lưu model mới (cập nhật `latest.json` nếu qua retrain gate), và ghi JSON đầy
đủ vào data/experiment-results/behavior_patterns/retrain_rees46_real.json.
"""
from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "ecommerce_order_db")  # rfm.py/behavior.py dùng tên bảng KHÔNG gắn schema -> cần đúng DB mặc định
os.environ.setdefault("MODELS_DIR", "D:/JAVA/Graduation-Project/AI/models")  # khớp vị trí artifact production hiện có

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
sys.path.insert(0, f"{ROOT}/AI/forecast-service")

import pandas as pd  # noqa: E402
from shared_common.config import shared_settings  # noqa: E402
from shared_common.pool import get_engine  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.training import train as train_mod  # noqa: E402
from app.training.experiments.fast_panel_builder import build_panel  # noqa: E402

OUT = f"{ROOT}/data/experiment-results/behavior_patterns/retrain_rees46_real.json"
NEW_LABEL_WINDOW_DAYS = 60
N_CUTOFFS = 5
MIN_HISTORY_DAYS = 15  # ngày tối thiểu từ lúc dữ liệu bắt đầu tới mốc cắt sớm nhất


def main() -> None:
    engine = get_engine(shared_settings.DB_NAME)
    with engine.connect() as conn:
        row = conn.execute(text("SELECT MIN(created_at) a, MAX(created_at) b FROM orders")).fetchone()
    data_start, data_end = pd.Timestamp(row.a), pd.Timestamp(row.b)
    span_days = (data_end - data_start).days
    print(f"Phạm vi dữ liệu orders: {data_start.date()} -> {data_end.date()} ({span_days} ngày)", flush=True)

    reference_now = data_end + pd.Timedelta(days=1)
    latest_cutoff = data_end - pd.Timedelta(days=NEW_LABEL_WINDOW_DAYS)
    earliest_cutoff = data_start + pd.Timedelta(days=MIN_HISTORY_DAYS)
    if earliest_cutoff >= latest_cutoff:
        raise SystemExit(
            f"Không đủ dữ liệu cho cửa sổ {NEW_LABEL_WINDOW_DAYS} ngày: cần earliest_cutoff < latest_cutoff "
            f"({earliest_cutoff.date()} >= {latest_cutoff.date()})"
        )
    cutoff_dates = pd.date_range(earliest_cutoff, latest_cutoff, periods=N_CUTOFFS)
    cutoffs_days_ago = [(reference_now - c).days for c in cutoff_dates]
    print(f"reference_now = {reference_now.date()} | label_window_days = {NEW_LABEL_WINDOW_DAYS}")
    print("mốc cắt (ngày thật -> days_ago):", [(c.date().isoformat(), d) for c, d in zip(cutoff_dates, cutoffs_days_ago)])

    new_label_version = f"churn_label_v3_orders_{NEW_LABEL_WINDOW_DAYS}d_min2_rees46real"
    train_mod.CUTOFF_DAYS_AGO = cutoffs_days_ago
    train_mod.LABEL_WINDOW_DAYS = NEW_LABEL_WINDOW_DAYS
    train_mod.LABEL_VERSION = new_label_version

    # Panel builder nhanh (pandas trong RAM) thay cho _build_training_panel gốc (SQL tổng hợp quá chậm
    # trên MariaDB qua Docker/WSL2 với 7,3 triệu user_events — xem docstring fast_panel_builder.py).
    # Tính ĐÚNG công thức gốc, chỉ khác nơi tính; _assert_panel_not_contaminated vẫn chạy nguyên vẹn
    # vì nằm trong train_and_evaluate(), không bị panel builder thay thế bỏ qua.
    engine_for_panel = train_mod.get_engine(train_mod.shared_settings.DB_NAME)
    panel_cache = build_panel(engine_for_panel, list(cutoff_dates), NEW_LABEL_WINDOW_DAYS, min_delivered_orders=2)
    train_mod._assert_panel_not_contaminated(panel_cache, list(cutoff_dates))
    train_mod._build_training_panel = lambda *a, **k: panel_cache

    metrics = train_mod.train_and_evaluate()
    print(json.dumps(metrics, ensure_ascii=False, indent=1, default=str))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "data_range": [str(data_start), str(data_end)],
            "reference_now": str(reference_now),
            "cutoffs_days_ago": cutoffs_days_ago,
            "label_window_days": NEW_LABEL_WINDOW_DAYS,
            "label_version": new_label_version,
            "metrics": metrics,
        }, fh, ensure_ascii=False, indent=1, default=str)
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
