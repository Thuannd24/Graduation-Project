"""PH9 — BugCheck (định giá động): khẳng định HÀNH VI ĐÚNG nghiệp vụ mà code hiện tại CHƯA đạt.

Không khớp mẫu `test_*.py` nên `pytest` mặc định không thu thập. Chạy riêng:
`python -m pytest tests/bugcheck_ph9_pricing.py`.
"""
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app  # noqa: E402

BASE = {"userId": 7, "productId": 3, "customerTier": "GOLD", "segmentationLabel": "New", "cartTotal": 100_000}


def test_tc_ph9_price_04_negative_cart_total_rejected():
    """TC_PH9_PRICE_04: cartTotal âm (giá trị giỏ không thể âm) phải bị từ chối 422. Hiện tại PricingRequest không có ràng buộc
    nên cartTotal=-5.000.000 được chấm như 'giỏ nhỏ' và trả 200."""
    r = TestClient(app).post("/api/v1/pricing/predict", json=dict(BASE, cartTotal=-5_000_000))
    assert r.status_code == 422, f"status={r.status_code}, body={r.json()}"


def test_tc_ph9_price_05_unknown_customer_tier_rejected():
    """TC_PH9_PRICE_05: customerTier ngoài tập VIP/GOLD/SILVER/REGULAR (hợp đồng ghi ở models/pricing.py) phải bị từ chối 422.
    Hiện tại là str tự do: 'PLATINUM_HACK' được chấp nhận và âm thầm xử lý như REGULAR."""
    r = TestClient(app).post("/api/v1/pricing/predict", json=dict(BASE, customerTier="PLATINUM_HACK"))
    assert r.status_code == 422, f"status={r.status_code}, body={r.json()}"
