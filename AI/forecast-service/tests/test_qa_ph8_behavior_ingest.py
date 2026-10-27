"""PH8 — Unit test validate lô vi hành vi (POST /api/v1/public/behavior/events, BehaviorBatchRequest) và
producer Kafka. Producer được thay bằng fake: không gửi gì lên topic thật.
"""
import asyncio
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.endpoints import forecast as fc  # noqa: E402
from app.kafka.behavior_producer import BehaviorEventProducer  # noqa: E402
from app.main import app  # noqa: E402
from app.models.behavior import MAX_BATCH_SIZE, BehaviorBatchRequest, BehaviorEvent  # noqa: E402
from shared_common.contracts import FE_BEHAVIOR_ACTIONS, TOPIC_USER_BEHAVIOR  # noqa: E402

TS = "2026-10-01T03:00:00"
URL = "/api/v1/public/behavior/events"


def _ev(**kw):
    base = {"actionType": "SCROLL_DEPTH", "weight": 50, "timestamp": TS, "sessionId": "s-1"}
    base.update(kw)
    return base


@pytest.fixture
def published(monkeypatch):
    sent = []

    async def fake_publish(events):
        sent.extend(events)
        return len(events)

    monkeypatch.setattr(fc.behavior_producer, "publish_batch", fake_publish)
    return sent


def test_tc_ph8_ing_01_all_fe_actions_accepted():
    """TC_PH8_ING_01: Cả 14 actionType trong whitelist FE_BEHAVIOR_ACTIONS đều hợp lệ."""
    req = BehaviorBatchRequest(events=[_ev(actionType=a) for a in sorted(FE_BEHAVIOR_ACTIONS)])
    assert len(req.events) == len(FE_BEHAVIOR_ACTIONS) == 14


@pytest.mark.parametrize("action", ["VIEW_PRODUCT", "PURCHASE", "view_cart", "DROP_TABLE"])
def test_tc_ph8_ing_02_action_outside_whitelist_rejected(action):
    """TC_PH8_ING_02: actionType ngoài whitelist (kể cả action chỉ server được ghi như VIEW_PRODUCT/PURCHASE, sai hoa-thường) bị từ chối."""
    with pytest.raises(ValidationError):
        BehaviorEvent(**_ev(actionType=action))


@pytest.mark.parametrize("weight,ok", [(0, True), (86400, True), (None, True), (-0.01, False), (86400.01, False)])
def test_tc_ph8_ing_03_weight_range(weight, ok):
    """TC_PH8_ING_03: weight hợp lệ trong [0, 86400] (biên 0 và 86400 nhận, ngoài biên từ chối); weight bỏ trống được."""
    if ok:
        assert BehaviorEvent(**_ev(weight=weight)).weight == weight
    else:
        with pytest.raises(ValidationError):
            BehaviorEvent(**_ev(weight=weight))


def test_tc_ph8_ing_04_batch_size_limit():
    """TC_PH8_ING_04: Lô đúng 200 event hợp lệ; 201 event bị từ chối (chặn lô khổng lồ làm nghẽn Kafka/DB)."""
    assert MAX_BATCH_SIZE == 200
    assert len(BehaviorBatchRequest(events=[_ev()] * 200).events) == 200
    with pytest.raises(ValidationError):
        BehaviorBatchRequest(events=[_ev()] * 201)


def test_tc_ph8_ing_05_timestamp_required():
    """TC_PH8_ING_05: Thiếu timestamp (thời điểm xảy ra thật, cần để giữ thứ tự) -> từ chối."""
    data = _ev()
    data.pop("timestamp")
    with pytest.raises(ValidationError):
        BehaviorEvent(**data)


def test_tc_ph8_ing_06_endpoint_identity_from_gateway_header(published):
    """TC_PH8_ING_06: userId chỉ lấy từ header X-User-Id (gateway inject); field userId client tự gửi trong body bị bỏ qua."""
    body = {"events": [dict(_ev(), userId="nguoi-khac"), _ev(actionType="VIEW_CART", weight=None)]}
    r = TestClient(app).post(URL, json=body, headers={"X-User-Id": "u-real"})
    assert r.status_code == 200
    assert r.json() == {"received": 2, "accepted": 2}
    assert [e["userId"] for e in published] == ["u-real", "u-real"]
    assert published[1]["actionType"] == "VIEW_CART"


def test_tc_ph8_ing_07_endpoint_guest_has_no_user_id(published):
    """TC_PH8_ING_07: Khách chưa đăng nhập vẫn được ghi nhận, userId=None, giữ sessionId/source/timestamp gốc."""
    r = TestClient(app).post(URL, json={"events": [_ev(actionType="IMPRESSION", itemId=5, weight=1, source="for_you")]})
    assert r.status_code == 200
    e = published[0]
    assert e["userId"] is None and e["sessionId"] == "s-1" and e["source"] == "for_you" and e["timestamp"] == TS


def test_tc_ph8_ing_08_endpoint_rejects_invalid_batch(published):
    """TC_PH8_ING_08: Lô có 1 event sai (action lạ) -> 422 cả lô, không publish event nào."""
    r = TestClient(app).post(URL, json={"events": [_ev(), _ev(actionType="HACK")]})
    assert r.status_code == 422
    assert published == []


def test_tc_ph8_ing_09_publish_failure_still_200(monkeypatch):
    """TC_PH8_ING_09: Kafka lỗi khi publish -> vẫn 200 (đường phụ trợ không làm FE báo lỗi), accepted=0."""
    async def boom(events):
        raise RuntimeError("kafka down")

    monkeypatch.setattr(fc.behavior_producer, "publish_batch", boom)
    r = TestClient(app).post(URL, json={"events": [_ev(), _ev()]})
    assert r.status_code == 200 and r.json() == {"received": 2, "accepted": 0}


def test_tc_ph8_ing_10_producer_partition_key_and_payload():
    """TC_PH8_ING_10: Producer gửi đúng topic user-behavior-events, key = sessionId -> userId -> 'anonymous', payload có eventId/eventType."""
    class FakeKafka:
        def __init__(self):
            self.sent = []

        async def send(self, topic, value, key):
            self.sent.append((topic, json.loads(value), key))

    p = BehaviorEventProducer()
    p._producer = FakeKafka()
    events = [{"sessionId": "s-9", "userId": "u-1", "actionType": "SEARCH"},
              {"sessionId": None, "userId": "u-1", "actionType": "SEARCH"},
              {"sessionId": None, "userId": None, "actionType": "SEARCH"}]
    n = asyncio.run(p.publish_batch(events))
    assert n == 3
    assert [s[2] for s in p._producer.sent] == [b"s-9", b"u-1", b"anonymous"]
    assert all(s[0] == TOPIC_USER_BEHAVIOR for s in p._producer.sent)
    assert p._producer.sent[0][1]["eventType"] == "UserBehaviorEvent" and p._producer.sent[0][1]["eventId"]


def test_tc_ph8_ing_11_producer_not_started_drops_batch():
    """TC_PH8_ING_11: Producer chưa start (Kafka chưa sẵn sàng lúc khởi động) -> trả 0, không ném lỗi."""
    assert asyncio.run(BehaviorEventProducer().publish_batch([{"sessionId": "s"}])) == 0
