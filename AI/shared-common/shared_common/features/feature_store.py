"""Feature store tối giản cho chấm điểm churn THẬT (serving), quyết định 2026-10-06 sau khi đo được
`build_feature_matrix()` gốc (SQL tổng hợp) mất 25-40+ phút trên dữ liệu REES46 thật — xem
docs/canvas/churn-risk-log.md mục 2026-10-06. Kiến trúc:

  Tính trước (pandas, `fast_compute.py`, vài giây) -> LƯU vào bảng `user_feature_vectors`
  -> lúc cần chấm điểm (`risk_scoring.predict()`) chỉ ĐỌC bảng này (SELECT đơn giản, mili-giây).

Đánh đổi CỐ Ý, đã bàn với chủ dự án (2026-10-06): dữ liệu chấm điểm chỉ mới bằng lần `refresh()` gần
nhất (job `risk_scheduler` gọi mỗi `RISK_SCAN_INTERVAL_HOURS` giờ), KHÔNG phải tức thời tuyệt đối.
Đổi lại: endpoint admin + job risk-scan không bao giờ phải tự tính lại (không còn phụ thuộc việc
MariaDB/Docker/WSL2 chạy SQL tổng hợp chậm), và chịu tải tốt khi nhiều request cùng lúc.

KHÔNG dùng cho training (`train.py` dùng panel nhiều mốc cắt lịch sử, bảng này chỉ lưu MỘT lát cắt
"hiện tại" — không thay thế được multi-cutoff).
"""
from __future__ import annotations

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.features.fast_compute import compute_live_feature_matrix
from shared_common.logger import get_logger

logger = get_logger(__name__)

TABLE = "user_feature_vectors"

_COLUMN_DDL = ",\n    ".join(f"`{c}` DOUBLE NOT NULL" for c in FEATURE_COLUMNS)
_CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    user_id VARCHAR(100) NOT NULL PRIMARY KEY,
    {_COLUMN_DDL},
    computed_at DATETIME(6) NOT NULL
)
"""


def ensure_table(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(_CREATE_TABLE_SQL))


def refresh(engine: Engine) -> int:
    """Tính lại TOÀN BỘ vector (pandas, vài giây) rồi thay thế nguyên bảng trong 1 transaction —
    reader đang đọc bảng cũ (REPEATABLE READ) sẽ không thấy trạng thái rỗng giữa chừng."""
    ensure_table(engine)
    as_of = pd.Timestamp.now()
    X = compute_live_feature_matrix(engine, as_of=as_of)
    rows = X.reset_index().rename(columns={"index": "user_id"})
    rows["computed_at"] = as_of

    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {TABLE}"))
        rows.to_sql(TABLE, conn, if_exists="append", index=False, method="multi", chunksize=5000)
    logger.info(f"Feature store refreshed: {len(rows):,} user, as_of={as_of}")
    return len(rows)


def load(engine: Engine) -> pd.DataFrame:
    """Đọc lại bảng đã tính sẵn — rỗng nếu chưa từng `refresh()` (chưa train/chưa chạy job nào)."""
    ensure_table(engine)
    with engine.connect() as conn:
        df = pd.read_sql(f"SELECT user_id, {', '.join(FEATURE_COLUMNS)} FROM {TABLE}", conn)
    if df.empty:
        return df.set_index("user_id")[FEATURE_COLUMNS] if "user_id" in df.columns else df
    df["user_id"] = df["user_id"].astype("string")
    return df.set_index("user_id")[FEATURE_COLUMNS]


def last_computed_at(engine: Engine) -> pd.Timestamp | None:
    ensure_table(engine)
    with engine.connect() as conn:
        val = conn.execute(text(f"SELECT MAX(computed_at) FROM {TABLE}")).scalar()
    return pd.Timestamp(val) if val is not None else None
