"""Phân quyền ADMIN cho endpoint train/quét rủi ro, bỏ CORS trùng với gateway, và parse timestamp
hành vi từ Java/FE. Không chạm Kafka/DB thật: các hàm nặng được thay bằng fake.
"""
import os
import sys
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.endpoints import forecast as fc  # noqa: E402
from app.core.timestamps import parse_event_timestamp  # noqa: E402
from app.kafka import behavior_consumer as bc  # noqa: E402
from app.main import app  # noqa: E402
from app.models.behavior import BehaviorEvent  # noqa: E402

ADMIN = {"X-User-Id": "u-admin", "X-User-Roles": "default-roles-ecommerce,ADMIN"}
CUSTOMER = {"X-User-Id": "u-1", "X-User-Roles": "CUSTOMER"}


@pytest.fixture
def fake_jobs(monkeypatch):
    calls = []

    async def fake_scan():
        calls.append("scan")
        return {"status": "SUCCESS", "vouchers": 0}

    monkeypatch.setattr(fc, "train_and_evaluate", lambda: calls.append("train") or {"auc": 0.7})
    monkeypatch.setattr(fc.risk_scheduler, "run_risk_scan", fake_scan)
    return calls


@pytest.mark.parametrize("path", ["/api/v1/models/train", "/api/v1/risk/trigger-scan", "/api/v1/rfm/trigger",
                                  "/api/v1/models/ablation", "/api/v1/models/calibration",
                                  "/api/v1/models/label-diagnostics", "/api/v1/models/rule-benchmark"])
def test_admin_endpoints_reject_customer_and_anonymous(path, fake_jobs):
    client = TestClient(app)
    assert client.post(path).status_code == 401
    assert client.post(path, headers=CUSTOMER).status_code == 403
    assert client.post(path, headers={"X-User-Id": "u-2", "X-User-Roles": "STAFF"}).status_code == 403
    assert fake_jobs == []


def test_admin_can_train_and_scan(fake_jobs):
    client = TestClient(app)
    assert client.post("/api/v1/models/train", headers=ADMIN).json()["status"] == "SUCCESS"
    r = client.post("/api/v1/risk/trigger-scan", headers={"X-User-Id": "u", "X-User-Roles": "ROLE_ADMIN"})
    assert r.status_code == 200
    assert fake_jobs == ["train", "scan"]


def test_no_service_side_cors_header():
    """Gateway đã thêm Access-Control-Allow-Origin; service thêm nữa thì trình duyệt chặn response."""
    r = TestClient(app).get("/health", headers={"Origin": "http://localhost:5173"})
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


@pytest.mark.parametrize("raw,expected", [
    ("2026-10-18T16:15:51.184564100", datetime(2026, 10, 18, 16, 15, 51, 184564)),  # Java LocalDateTime (nano)
    ("2026-10-18T16:15", datetime(2026, 10, 18, 16, 15)),                            # Java bỏ giây khi = 0
    ("2026-10-18T16:15:51.123Z", datetime(2026, 10, 18, 16, 15, 51, 123000)),         # FE toISOString
    ("2026-10-18T23:15:51+07:00", datetime(2026, 10, 18, 16, 15, 51)),                # có offset -> UTC
    ("2026-10-18T23:15:51.5+0700", datetime(2026, 10, 18, 16, 15, 51, 500000)),
    ("2026-10-18 16:15:51", datetime(2026, 10, 18, 16, 15, 51)),
    (1760804151000, datetime(2025, 10, 18, 16, 15, 51)),                                # epoch millis
    ("1760804151000", datetime(2025, 10, 18, 16, 15, 51)),
    (1760804151, datetime(2025, 10, 18, 16, 15, 51)),                                   # epoch giây
])
def test_parse_java_and_fe_timestamps(raw, expected):
    assert parse_event_timestamp(raw) == expected
    assert bc._parse_timestamp(raw) == expected


@pytest.mark.parametrize("raw", ["hôm qua lúc 3h", "", "2026-13-01T00:00:00", "2026-10-18T25:00:00",
                                 "18/10/2026 16:15", "nan", "1e400", True, None, "2026-10-18T16:15:51+25:00"])
def test_invalid_timestamps_rejected(raw):
    with pytest.raises(ValueError):
        parse_event_timestamp(raw)


def test_behavior_event_normalizes_timestamp_to_utc_iso():
    ev = BehaviorEvent(actionType="PAGE_DWELL", weight=3, timestamp="2026-10-18T16:15:51.123Z", sessionId="s")
    assert ev.timestamp == "2026-10-18T16:15:51.123000"
    with pytest.raises(ValidationError):
        BehaviorEvent(actionType="PAGE_DWELL", weight=float("inf"), timestamp="2026-10-18T16:15:51", sessionId="s")


def test_endpoint_rejects_bad_timestamp_with_422(monkeypatch):
    async def must_not_publish(events):
        raise AssertionError("không được publish lô có timestamp sai")

    monkeypatch.setattr(fc.behavior_producer, "publish_batch", must_not_publish)
    body = {"events": [{"actionType": "PAGE_DWELL", "weight": 1, "timestamp": "hôm qua", "sessionId": "s"}]}
    assert TestClient(app).post("/api/v1/public/behavior/events", json=body).status_code == 422
