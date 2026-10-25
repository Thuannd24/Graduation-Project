"""PH8 — BugCheck: khẳng định HÀNH VI ĐÚNG nghiệp vụ mà code hiện tại CHƯA đạt.

Tên file không khớp mẫu `test_*.py` nên `pytest` mặc định KHÔNG thu thập (CI/người dùng không đỏ).
Chạy riêng: `python -m pytest tests/bugcheck_ph8_recs.py`.
"""
from fastapi.testclient import TestClient

from app.api.endpoints import recommend as rec
from app.main import app
from app.services import recency as recency_module


def _setup(monkeypatch, fake_redis):
    monkeypatch.setattr(rec, "get_pooled_redis_client", lambda: fake_redis)
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: False)
    monkeypatch.setattr(recency_module, "get_products_by_ids",
                        lambda ids: {int(i): {"id": str(i), "name": "P", "price": 1.0} for i in ids})
    fake_redis.lpush("user:u-1:history", 1, 2, 3, 4)


def test_tc_ph8_topk_04_negative_top_k_rejected(monkeypatch, fake_redis):
    """TC_PH8_TOPK_04: top_k âm phải bị từ chối (422) thay vì cắt list kiểu Python ([: -1]) và trả n-1 item."""
    _setup(monkeypatch, fake_redis)
    r = TestClient(app).get("/api/v1/recommendations/personal?top_k=-1", headers={"X-User-Id": "u-1"})
    assert r.status_code == 422, f"status={r.status_code}, body={r.json()}"
