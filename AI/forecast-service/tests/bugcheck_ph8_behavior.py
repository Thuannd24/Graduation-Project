"""PH8 — BugCheck (validate vi hành vi): khẳng định HÀNH VI ĐÚNG nghiệp vụ mà code hiện tại CHƯA đạt.

Không khớp mẫu `test_*.py` nên `pytest` mặc định không thu thập. Chạy riêng:
`python -m pytest tests/bugcheck_ph8_behavior.py`.
"""
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.models.behavior import BehaviorEvent  # noqa: E402


def test_tc_ph8_ing_12_non_iso_timestamp_rejected():
    """TC_PH8_ING_12: timestamp không phải ISO-8601 phải bị từ chối ngay ở endpoint (422).
    Hiện tại schema nhận mọi chuỗi -> endpoint trả accepted, rồi consumer `datetime.fromisoformat` lỗi và
    LẶNG LẼ bỏ event (mất dữ liệu mà FE tưởng đã ghi)."""
    with pytest.raises(ValidationError):
        BehaviorEvent(actionType="PAGE_DWELL", weight=12, timestamp="hôm qua lúc 3h", sessionId="s")


def test_tc_ph8_ing_13_nan_weight_rejected():
    """TC_PH8_ING_13: weight = NaN phải bị từ chối (không thuộc [0, 86400]). Hiện tại `v < 0 or v > 86400`
    đều False với NaN nên NaN lọt qua, làm hỏng mọi feature thống kê (mean/sum) tính trên cột weight."""
    with pytest.raises(ValidationError):
        BehaviorEvent(actionType="PAGE_DWELL", weight=float("nan"), timestamp="2026-10-01T03:00:00", sessionId="s")
