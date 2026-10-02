"""PURCHASE từ order-events: chỉ đơn ĐÃ XÁC NHẬN, 1 dòng/sản phẩm, thời điểm = timestamp Kafka (UTC),
không đẩy vào Redis history."""
import asyncio
import json
import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.kafka import behavior_consumer as bc  # noqa: E402

KAFKA_TS_MS = 1_790_000_000_000  # = 2026-09-21 14:13:20 UTC


class FakeResult:
    def __init__(self, rows=None, scalar=None):
        self._rows, self._scalar = rows or [], scalar

    def all(self):
        return self._rows

    def scalar(self):
        return self._scalar


class FakeConn:
    def __init__(self, items, order_user=None):
        self.items, self.order_user, self.inserts = items, order_user, []

    def execute(self, stmt, params=None):
        if stmt is bc.ORDER_ITEMS_SQL:
            return FakeResult(rows=self.items)
        if stmt is bc.ORDER_USER_SQL:
            return FakeResult(scalar=self.order_user)
        if stmt is bc.HAS_SOURCE_COLUMN_SQL:
            return FakeResult(scalar=1)
        self.inserts.append(params)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def consumer(monkeypatch):
    conn = FakeConn(items=[(10, 2), (11, 1)], order_user="db-user")
    engine = type("E", (), {"connect": lambda _s: conn, "begin": lambda _s: conn})()
    monkeypatch.setattr(bc, "get_engine", lambda _n: engine)
    redis_calls = []
    monkeypatch.setattr(bc, "get_pooled_redis_client", lambda: redis_calls.append(1))
    return bc.BehaviorEventConsumer(), conn, redis_calls


def _send(c, payload, ts=KAFKA_TS_MS):
    raw = json.dumps(payload).encode()
    asyncio.run(c._handle_message(bc.TOPIC_ORDER_EVENTS, raw, ts))


def test_confirmed_order_writes_one_purchase_per_item(consumer):
    c, conn, redis_calls = consumer
    _send(c, {"eventType": "OrderConfirmedEvent", "orderId": 5, "userId": "u-1",
              "timestamp": "2026-09-21T21:13:20"})  # giờ máy VN trong payload: phải bị BỎ QUA
    assert [(r["item_id"], r["weight"], r["action_type"], r["user_id"]) for r in conn.inserts] == \
        [(10, 2.0, "PURCHASE", "u-1"), (11, 1.0, "PURCHASE", "u-1")]
    assert all(r["created_at"] == datetime(2026, 9, 21, 14, 13, 20) for r in conn.inserts)  # UTC từ Kafka
    assert redis_calls == []  # PURCHASE không vào Redis history


def test_double_encoded_payload_and_user_from_db(consumer):
    c, conn, _ = consumer
    inner = json.dumps({"eventType": "OrderConfirmedEvent", "orderId": 5})  # outbox: chuỗi JSON bên trong
    asyncio.run(c._handle_message(bc.TOPIC_ORDER_EVENTS, json.dumps(inner).encode(), KAFKA_TS_MS))
    assert {r["user_id"] for r in conn.inserts} == {"db-user"}


@pytest.mark.parametrize("event_type", ["OrderCreatedEvent", "OrderCancelledEvent", "PaymentFailedEvent"])
def test_non_confirmed_events_are_ignored(consumer, event_type):
    c, conn, _ = consumer
    _send(c, {"eventType": event_type, "orderId": 5, "userId": "u-1"})
    assert conn.inserts == []
