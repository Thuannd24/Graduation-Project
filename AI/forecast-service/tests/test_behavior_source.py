"""Cột `source` của user_events: validate ở endpoint, chuẩn hoá ở consumer, và consumer không làm mất
event khi DB chưa có cột (order-service chưa khởi động lại để Hibernate thêm cột)."""
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.kafka import behavior_consumer as bc  # noqa: E402
from app.models.behavior import BehaviorEvent  # noqa: E402

TS = "2026-10-01T03:00:00"


def test_endpoint_accepts_known_source_and_missing_source():
    assert BehaviorEvent(actionType="IMPRESSION", itemId=1, weight=1, timestamp=TS, source="for_you").source == "for_you"
    assert BehaviorEvent(actionType="SCROLL_DEPTH", weight=50, timestamp=TS).source is None  # client cũ


def test_endpoint_rejects_unknown_source():
    with pytest.raises(ValidationError):
        BehaviorEvent(actionType="IMPRESSION", itemId=1, timestamp=TS, source="hacked")


def test_consumer_keeps_valid_source_and_drops_unknown_without_losing_event():
    ok = bc._parse_message(bc.TOPIC_USER_BEHAVIOR, {"actionType": "IMPRESSION", "itemId": 1, "weight": 2,
                                                    "source": "search", "timestamp": TS, "sessionId": "s"})
    odd = bc._parse_message(bc.TOPIC_USER_BEHAVIOR, {"actionType": "IMPRESSION", "itemId": 1,
                                                     "source": "???", "timestamp": TS, "sessionId": "s"})
    assert ok["source"] == "search" and ok["weight"] == 2
    assert odd is not None and odd["source"] is None


def test_business_events_have_no_source():
    view = bc._parse_message(bc.TOPIC_PRODUCT_VIEWED, {"productId": 5, "timestamp": TS, "sessionId": "s"})
    assert view["source"] is None


class FakeConn:
    def __init__(self, has_column: bool):
        self.has_column = has_column
        self.inserts = []

    def execute(self, stmt, params=None):
        if stmt is bc.HAS_SOURCE_COLUMN_SQL:
            return type("R", (), {"scalar": lambda _self: int(self.has_column)})()
        self.inserts.append((stmt, params))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeEngine:
    def __init__(self, conn):
        self.conn = conn

    def begin(self):
        return self.conn


def _write(monkeypatch, consumer, conn):
    monkeypatch.setattr(bc, "get_engine", lambda _name: FakeEngine(conn))
    event = bc._parse_message(bc.TOPIC_USER_BEHAVIOR, {"actionType": "IMPRESSION", "itemId": 1, "weight": 1,
                                                       "source": "for_you", "timestamp": TS, "sessionId": "s"})
    consumer._write_to_db(event, bc._parse_timestamp(TS))


def test_writes_source_when_column_exists(monkeypatch):
    conn = FakeConn(has_column=True)
    _write(monkeypatch, bc.BehaviorEventConsumer(), conn)
    stmt, params = conn.inserts[-1]
    assert stmt is bc.INSERT_USER_EVENT_WITH_SOURCE_SQL and params["source"] == "for_you"


def test_falls_back_to_old_insert_when_column_missing(monkeypatch):
    conn = FakeConn(has_column=False)
    _write(monkeypatch, bc.BehaviorEventConsumer(), conn)
    stmt, params = conn.inserts[-1]
    assert stmt is bc.INSERT_USER_EVENT_SQL and "source" not in params  # event vẫn được ghi
