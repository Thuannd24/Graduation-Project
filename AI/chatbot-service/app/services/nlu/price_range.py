"""Hiểu khoảng giá trong câu hỏi tiếng Việt: "tai nghe dưới 500 nghìn", "laptop từ 15 đến 20 triệu",
"điện thoại trên 10tr", "tầm 1tr5", "quà tặng không quá 300k".

Trước đây không có bước này: chatbot bỏ chữ "dưới/nghìn" rồi tìm theo "500" -> khớp laptop có số 500 trong
tên/mô tả (10–25 triệu); câu mẫu "Gợi ý quà tặng dưới 500 nghìn" của chính widget bị coi là lạc đề.

Làm việc trên bản bỏ dấu + chữ thường (khách hay gõ không dấu). Bỏ dấu giữ nguyên VỊ TRÍ ký tự với chuỗi
đã chuẩn hoá NFC (mỗi ký tự có dấu dựng sẵn -> đúng 1 ký tự không dấu), nên span tìm được cắt đúng chuỗi gốc.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass(frozen=True)
class PriceRange:
    min_price: Optional[float] = None
    max_price: Optional[float] = None

    def contains(self, price: Optional[float]) -> bool:
        if price is None:
            return False
        if self.min_price is not None and price < self.min_price:
            return False
        if self.max_price is not None and price > self.max_price:
            return False
        return True

    def describe(self) -> str:
        def vnd(v: float) -> str:
            return f"{v:,.0f}đ".replace(",", ".")

        if self.min_price is not None and self.max_price is not None:
            return f"từ {vnd(self.min_price)} đến {vnd(self.max_price)}"
        if self.max_price is not None:
            return f"dưới {vnd(self.max_price)}"
        return f"trên {vnd(self.min_price)}"


def strip_diacritics(text: str) -> str:
    out = []
    for ch in unicodedata.normalize("NFC", text):
        base = "".join(c for c in unicodedata.normalize("NFD", ch) if unicodedata.category(c) != "Mn")
        base = base.replace("đ", "d").replace("Đ", "D")
        out.append(base[:1] if base else ch)  # luôn đúng 1 ký tự -> giữ vị trí
    return "".join(out)


_UNIT = {
    "trieu": 1_000_000, "tr": 1_000_000, "cu": 1_000_000, "m": 1_000_000,
    "nghin": 1_000, "ngan": 1_000, "k": 1_000,
    "dong": 1, "d": 1, "vnd": 1,
}
_NUM = r"(\d+(?:[.,]\d+)*)"
_UNIT_RE = r"(trieu|tr|cu|nghin|ngan|k|vnd|dong|d|m)?"
# "1tr5" = 1,5 triệu; "2m5" tương tự
_AMOUNT = _NUM + r"\s*" + _UNIT_RE + r"(\d)?(?![a-z0-9])"
_AMOUNT_RE = re.compile(_AMOUNT)

_BETWEEN_RE = re.compile(
    r"(?:\btu|\bkhoang|\btam|\btrong khoang)?\s*" + _AMOUNT + r"\s*(?:den|toi|-|–|~)\s*" + _AMOUNT
)
_MAX_RE = re.compile(r"\b(?:duoi|khong qua|toi da|it hon|nho hon|re hon|<=?|max)\s*" + _AMOUNT)
_MAX_SUFFIX_RE = re.compile(_AMOUNT + r"\s*(?:do lai|tro xuong|tro lai)\b")
_MIN_RE = re.compile(r"\b(?:tren|hon|it nhat|toi thieu|lon hon|>=?|min)\s*" + _AMOUNT)
_MIN_SUFFIX_RE = re.compile(_AMOUNT + r"\s*(?:tro len)\b")
_AROUND_RE = re.compile(r"\b(?:khoang|tam|tam gia|co|gia)\s*" + _AMOUNT)

AROUND_TOLERANCE = 0.2
# Dưới mức này coi là không phải giá (vd "dưới 2 năm", "trên 5 sao") khi không có đơn vị.
_MIN_PLAUSIBLE_PRICE = 10_000


def _to_number(raw: str, unit: Optional[str]) -> Optional[float]:
    if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", raw) and (unit is None or _UNIT.get(unit, 1) == 1):
        return float(re.sub(r"[.,]", "", raw))  # 1.500.000 / 1,500,000
    try:
        return float(raw.replace(",", "."))  # 1,5 triệu / 1.5tr
    except ValueError:
        return None


def _amount(num: str, unit: Optional[str], tail: Optional[str], default_unit: Optional[str] = None) -> Optional[float]:
    unit = unit or default_unit
    value = _to_number(num, unit)
    if value is None:
        return None
    if unit and tail and _UNIT[unit] >= 1_000_000:
        value += int(tail) / 10  # 1tr5 -> 1.5
    if unit:
        value *= _UNIT[unit]
    elif value < _MIN_PLAUSIBLE_PRICE:
        return None  # số trần không đơn vị và quá nhỏ: không phải giá
    return value


def _find(text: str) -> Tuple[Optional[PriceRange], List[Tuple[int, int]]]:
    m = _BETWEEN_RE.search(text)
    if m:
        n1, u1, t1, n2, u2, t2 = m.groups()
        # "từ 5 đến 10 triệu": vế đầu mượn đơn vị của vế sau
        lo = _amount(n1, u1, t1, default_unit=u2)
        hi = _amount(n2, u2, t2, default_unit=u1)
        if lo is not None and hi is not None:
            lo, hi = sorted((lo, hi))
            return PriceRange(lo, hi), [m.span()]

    lo = hi = None
    spans: List[Tuple[int, int]] = []
    for regex, side in ((_MAX_RE, "max"), (_MAX_SUFFIX_RE, "max"), (_MIN_RE, "min"), (_MIN_SUFFIX_RE, "min")):
        m = regex.search(text)
        if not m or any(m.end() > a and m.start() < b for a, b in spans):
            continue  # "rẻ hơn 5tr" đã lấy làm trần, không lấy lại "hơn 5tr" làm sàn
        value = _amount(*m.groups())
        if value is None:
            continue
        if side == "max" and hi is None:
            hi = value
        elif side == "min" and lo is None:
            lo = value
        spans.append(m.span())
    if lo is not None or hi is not None:
        if lo is not None and hi is not None and lo > hi:
            lo, hi = hi, lo
        return PriceRange(lo, hi), spans

    m = _AROUND_RE.search(text)
    if m:
        value = _amount(*m.groups())
        if value is not None and m.group(2):  # "tầm 15 triệu" phải có đơn vị, tránh "có 2 sim"
            return PriceRange(value * (1 - AROUND_TOLERANCE), value * (1 + AROUND_TOLERANCE)), [m.span()]
    return None, []


def parse_price_range(text: str) -> Optional[PriceRange]:
    """None nếu câu không nói tới khoảng giá."""
    return _find(strip_diacritics(text).lower())[0]


def remove_price_phrases(text: str) -> str:
    """Bỏ cụm khoảng giá khỏi câu (giữ phần còn lại để tìm theo từ khoá sản phẩm)."""
    original = unicodedata.normalize("NFC", text)
    _, spans = _find(strip_diacritics(original).lower())
    for start, end in sorted(spans, reverse=True):
        original = original[:start] + " " + original[end:]
    return re.sub(r"\s+", " ", original).strip()
