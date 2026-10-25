import os
import sys

# Chạy `pytest` từ AI/chatbot-service: cho phép `import app...` như lúc uvicorn chạy service.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest  # noqa: E402


class FakeRedis:
    """Đủ lệnh list mà memory.py dùng (lpush/ltrim/lrange/expire), không cần Redis thật."""

    def __init__(self):
        self.lists = {}
        self.ttl = {}

    def lpush(self, key, *values):
        for v in values:
            self.lists.setdefault(key, []).insert(0, v)

    def ltrim(self, key, start, end):
        self.lists[key] = self.lists.get(key, [])[start:end + 1]

    def lrange(self, key, start, end):
        return list(self.lists.get(key, [])[start:end + 1])

    def expire(self, key, seconds):
        self.ttl[key] = seconds
        return True


@pytest.fixture
def fake_redis(monkeypatch):
    from app.services.memory import memory_manager_service
    r = FakeRedis()
    monkeypatch.setattr(memory_manager_service, "redis", r)
    return r
