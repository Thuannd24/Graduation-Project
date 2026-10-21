"""Bước sắp xếp lại (re-ranking) SAU model, theo nghiệp vụ mà SASRec không biết.

SASRec chỉ học THỨ TỰ id sản phẩm, không dùng giá hay danh mục. Đo trên hệ thống ngày 18/10: khách xem
máy 4–18 triệu được gợi ý Galaxy Z Fold7 / Xiaomi 17 Ultra (>30 triệu), và 10 gợi ý có điểm gần bằng
nhau (4,15–4,38) dồn vào một cụm điện thoại. Re-rank ở đây xử lý 2 việc, KHÔNG đổi model:

1. **Tầng giá**: phạt SP đắt hơn `PRICE_CEIL_RATIO` × trung vị giá lịch sử (càng đắt phạt càng nặng),
   phạt nhẹ SP rẻ hơn hẳn (`PRICE_FLOOR_RATIO`) — thường là lệch nhu cầu, không phải cùng phân khúc.
2. **Đa dạng**: không để quá `MAX_CATEGORY_STREAK` SP cùng danh mục liên tiếp; SP bị hoãn vẫn được
   chèn lại ở vị trí sớm nhất hợp lệ (hoặc cuối danh sách) chứ không bị vứt bỏ.

Điểm model gốc (`score`) được GIỮ NGUYÊN trong item trả về để đo/đối chiếu; chỉ thứ tự thay đổi.
"""
from __future__ import annotations

import math
from statistics import median
from typing import Dict, List, Optional

PRICE_CEIL_RATIO = 2.0
PRICE_FLOOR_RATIO = 0.2
# Cường độ phạt (đơn vị: điểm đã chuẩn hoá theo thứ hạng, trong [0, 1]). Gấp 3 lần trung vị -> -0.57,
# gấp 4 lần -> -0.9: SP top-1 đắt gấp 3–4 lần tụt xuống nửa dưới danh sách.
PRICE_CEIL_STEP = 0.1
PRICE_CEIL_PENALTY = 0.8
PRICE_FLOOR_PENALTY = 0.15
MAX_CATEGORY_STREAK = 2


def history_median_price(history_ids: List[int], meta: Optional[Dict[int, dict]]) -> Optional[float]:
    if not meta:
        return None
    prices = [meta[i]["price"] for i in history_ids if i in meta and meta[i].get("price")]
    return float(median(prices)) if prices else None


def price_penalty(price: Optional[float], ref_price: Optional[float]) -> float:
    if not price or not ref_price or ref_price <= 0:
        return 0.0
    ratio = price / ref_price
    if ratio > PRICE_CEIL_RATIO:
        # Bậc 0.1 ngay khi vượt ngưỡng + log2: gấp 4 lần trung vị = -0.9, gấp 8 lần = -1.7 (rớt xuống cuối).
        return PRICE_CEIL_STEP + PRICE_CEIL_PENALTY * math.log2(ratio / PRICE_CEIL_RATIO)
    if ratio < PRICE_FLOOR_RATIO:
        return PRICE_FLOOR_PENALTY
    return 0.0


def diversify(items: List[dict], top_k: int, max_streak: int = MAX_CATEGORY_STREAK) -> List[dict]:
    """Chọn tham lam theo thứ tự sẵn có, hoãn SP làm chuỗi cùng danh mục dài quá `max_streak`."""
    selected: List[dict] = []
    pending = list(items)
    while pending and len(selected) < top_k:
        pick = None
        for idx, item in enumerate(pending):
            cat = item.get("categoryId")
            tail = selected[-max_streak:]
            if cat is None or len(tail) < max_streak or any(t.get("categoryId") != cat for t in tail):
                pick = idx
                break
        if pick is None:  # mọi SP còn lại cùng danh mục với chuỗi cuối -> đành lấy SP tốt nhất
            pick = 0
        selected.append(pending.pop(pick))
    return selected


def rerank(items: List[dict], top_k: int, ref_price: Optional[float]) -> List[dict]:
    """`items` đã theo thứ tự model (tốt nhất trước). Trả tối đa `top_k` item đã re-rank."""
    n = len(items)
    if n == 0:
        return []
    scored = []
    for rank, item in enumerate(items):
        base = 1.0 - rank / n  # chuẩn hoá theo thứ hạng: điểm thô SASRec sát nhau, không so trực tiếp được
        adjusted = base - price_penalty(item.get("price"), ref_price)
        scored.append((adjusted, -rank, item))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return diversify([t[2] for t in scored], top_k)
