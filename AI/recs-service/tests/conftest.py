import os
import sys

# Chạy `pytest` từ AI/recs-service: cho phép `import app...` như lúc uvicorn chạy service.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest  # noqa: E402


class FakeRedis:
    """Đủ lệnh list mà recs-service/consumer dùng, không cần Redis thật."""

    def __init__(self):
        self.lists: dict[str, list[str]] = {}

    def lpush(self, key, *values):
        for v in values:
            self.lists.setdefault(key, []).insert(0, str(v))

    def ltrim(self, key, start, end):
        self.lists[key] = self.lists.get(key, [])[start:end + 1]

    def lrange(self, key, start, end):
        return list(self.lists.get(key, [])[start:end + 1])

    def expire(self, key, seconds):
        return True

    def exists(self, key):
        return int(key in self.lists)


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture(autouse=True)
def _no_real_db(monkeypatch):
    """Không test nào được chạm MariaDB thật (infra-mariadb mở cổng 3308 ra host, mật khẩu mặc định):
    mọi truy vấn catalog lỗi ngay -> các hàm catalog đi nhánh "DB lỗi" (fail-open). Test cần dữ liệu
    catalog tự monkeypatch hàm cụ thể như trước."""
    from app.services import catalog

    class _NoDb:
        def connect(self):
            raise RuntimeError("tests must not touch the real DB")

    monkeypatch.setattr(catalog, "get_engine", lambda *a, **k: _NoDb())
    catalog._category_cache.update(at=0.0, tree=None)
