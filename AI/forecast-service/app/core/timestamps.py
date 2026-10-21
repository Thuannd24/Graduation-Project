"""Chuẩn hoá thời điểm hành vi từ mọi nguồn về `datetime` UTC **không** tzinfo (cùng quy ước với
cột `user_events.created_at` và NOW() của DB).

Vì sao không dùng thẳng `datetime.fromisoformat`: container chạy Python 3.10, hàm đó chỉ nhận đúng
định dạng `isoformat()` của chính Python, nên từ chối:
  - Java `LocalDateTime.now(ZoneOffset.UTC).toString()` -> `2026-10-18T16:15:51.184564100` (9 chữ số
    phần giây — nano giây). Đây là định dạng product-service/order-service gửi cho MỌI sự kiện xem và
    thêm giỏ, nên trước đây gần như toàn bộ các sự kiện đó bị consumer bỏ (log "Invalid isoformat
    string") và "Xem gần đây" không bao giờ cập nhật.
  - FE `Date.toISOString()` -> `...Z` (hậu tố Z).
Chấp nhận: ISO-8601 có/không offset (`Z`, `+07:00`, `+0700`), phần giây 0–9 chữ số, có/không giây,
dấu cách thay cho `T`, và epoch (số hoặc chuỗi số; >= 1e11 coi là mili giây, nhỏ hơn là giây).
Chuỗi không phải thời điểm (vd "hôm qua lúc 3h") -> ValueError để endpoint trả 422.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone

_ISO_RE = re.compile(
    r"^\s*(?P<date>\d{4}-\d{2}-\d{2})"
    r"(?:[T ](?P<h>\d{2}):(?P<m>\d{2})(?::(?P<s>\d{2})(?:[.,](?P<frac>\d{1,9}))?)?)?"
    r"\s*(?P<tz>Z|z|[+-]\d{2}(?::?\d{2})?)?\s*$"
)
_EPOCH_RE = re.compile(r"^\s*-?\d+(?:\.\d+)?\s*$")

# Ngưỡng phân biệt epoch giây / mili giây: 1e11 giây là năm 5138, còn 1e11 mili giây là năm 1973.
_EPOCH_MILLIS_THRESHOLD = 1e11
# Chặn giá trị vô lý (năm 1970 trở về trước hoặc quá xa tương lai) — dấu hiệu dữ liệu hỏng.
_MIN_YEAR, _MAX_YEAR = 2000, 2100


def _from_epoch(value: float) -> datetime:
    if math.isnan(value) or math.isinf(value):
        raise ValueError("timestamp epoch không hợp lệ")
    seconds = value / 1000.0 if abs(value) >= _EPOCH_MILLIS_THRESHOLD else value
    try:
        return datetime.fromtimestamp(seconds, tz=timezone.utc).replace(tzinfo=None)
    except (OverflowError, OSError, ValueError) as exc:
        raise ValueError(f"timestamp epoch ngoài phạm vi: {value}") from exc


def _from_iso(raw: str) -> datetime:
    m = _ISO_RE.match(raw)
    if not m:
        raise ValueError(f"timestamp không phải ISO-8601/epoch: {raw!r}")
    frac = (m.group("frac") or "").ljust(6, "0")[:6]  # nano giây -> micro giây (cắt, không làm tròn)
    base = m.group("date")
    if m.group("h") is not None:
        base += f"T{m.group('h')}:{m.group('m')}:{m.group('s') or '00'}.{frac}"
    try:
        dt = datetime.fromisoformat(base)
    except ValueError as exc:  # vd tháng 13, ngày 32, giờ 25
        raise ValueError(f"timestamp không hợp lệ: {raw!r}") from exc

    tz = m.group("tz")
    if tz and tz not in ("Z", "z"):
        sign = 1 if tz[0] == "+" else -1
        digits = tz[1:].replace(":", "")
        hours, minutes = int(digits[:2]), int(digits[2:4] or 0)
        if hours > 23 or minutes > 59:
            raise ValueError(f"offset múi giờ không hợp lệ: {raw!r}")
        dt = dt - sign * timedelta(hours=hours, minutes=minutes)
    # Không có offset: quy ước UTC cho mọi nguồn (Java LocalDateTime.now(UTC), FE toISOString).
    return dt


def parse_event_timestamp(raw) -> datetime:
    """Trả `datetime` UTC naive. Raise ValueError nếu không phải thời điểm hợp lệ."""
    if isinstance(raw, bool) or raw is None:
        raise ValueError("timestamp bắt buộc")
    if isinstance(raw, (int, float)):
        dt = _from_epoch(float(raw))
    elif isinstance(raw, str):
        if not raw.strip():
            raise ValueError("timestamp rỗng")
        dt = _from_epoch(float(raw)) if _EPOCH_RE.match(raw) else _from_iso(raw)
    else:
        raise ValueError(f"timestamp sai kiểu: {type(raw).__name__}")
    if not (_MIN_YEAR <= dt.year <= _MAX_YEAR):
        raise ValueError(f"timestamp ngoài phạm vi hợp lý: {raw!r}")
    return dt


def normalize_event_timestamp(raw) -> str:
    """Chuỗi ISO chuẩn (UTC naive, `datetime.isoformat()`) để mọi bước sau đọc lại bằng fromisoformat."""
    return parse_event_timestamp(raw).isoformat()
