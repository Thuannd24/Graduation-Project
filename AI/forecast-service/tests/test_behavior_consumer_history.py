"""Redis `*:history` (đầu vào gợi ý) chỉ nhận VIEW_PRODUCT/ADD_TO_CART — xoá khỏi giỏ không được biến
item thành "quan tâm gần nhất". Bảng `user_events` không thuộc phạm vi test này (vẫn ghi mọi action)."""
import os
import sys
from datetime import datetime

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.kafka import behavior_consumer as bc  # noqa: E402


class FakeRedis:
    def __init__(self):
        self.lists = {}

    def lpush(self, key, value):
        self.lists.setdefault(key, []).insert(0, str(value))

    def ltrim(self, key, start, end):
        self.lists[key] = self.lists[key][start:end + 1]

    def expire(self, key, seconds):
        return True


@pytest.fixture
def redis_and_consumer(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(bc, "get_pooled_redis_client", lambda: fake)
    return fake, bc.BehaviorEventConsumer()


def _event(action, item=3):
    return {"user_id": "u1", "session_id": "s1", "item_id": item, "category_id": None,
            "action_type": action, "weight": None, "created_at": "2026-09-26T10:00:00"}


@pytest.mark.parametrize("action", ["VIEW_PRODUCT", "ADD_TO_CART"])
def test_product_interest_goes_to_history(redis_and_consumer, action):
    fake, consumer = redis_and_consumer
    consumer._write_to_redis(_event(action), datetime.now())
    assert fake.lists["user:u1:history"] == ["3"]


@pytest.mark.parametrize("action", ["REMOVE_FROM_CART", "UPDATE_CART_QTY", "IMPRESSION", "PRODUCT_ZOOM"])
def test_non_interest_actions_are_excluded(redis_and_consumer, action):
    fake, consumer = redis_and_consumer
    consumer._write_to_redis(_event(action), datetime.now())
    assert fake.lists == {}


def test_history_is_capped(redis_and_consumer):
    fake, consumer = redis_and_consumer
    for i in range(bc.HISTORY_MAX_LEN + 5):
        consumer._write_to_redis(_event("VIEW_PRODUCT", item=i), datetime.now())
    history = fake.lists["user:u1:history"]
    assert len(history) == bc.HISTORY_MAX_LEN
    assert history[0] == str(bc.HISTORY_MAX_LEN + 4)  # mới nhất ở đầu
