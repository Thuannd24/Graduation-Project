"""PH8 — Unit test thang chiến lược gợi ý (SASRec -> Recency -> Popularity), điểm phổ biến, giới hạn top_k
và gộp lịch sử user/session. Mọi phụ thuộc ngoài (Redis, MariaDB, checkpoint) đều được thay bằng fake/mock.

Mỗi hàm test = 1 test case, mã TC nằm ở tên hàm và dòng đầu docstring.
"""
import pytest
import torch
from fastapi.testclient import TestClient

from app.api.endpoints import recommend as rec
from app.core.config import recs_settings
from app.main import app
from app.services import catalog as catalog_module
from app.services import popularity as pop_module
from app.services import recency as recency_module
from app.services.popularity import PopularityRecService
from app.services.recency import RecencyRecService
from app.services.sasrec import SasRecService
from shared_common.contracts import HISTORY_MAX_LEN


def _products(ids, active=None):
    return {int(i): {"id": str(i), "name": f"P{i}", "price": 1000.0}
            for i in ids if active is None or int(i) in active}


class _Spy:
    def __init__(self, ret):
        self.ret = ret
        self.calls = []

    def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.ret(*args, **kwargs) if callable(self.ret) else self.ret


@pytest.fixture
def ladder(monkeypatch):
    """Cấu hình mặc định: SASRec chưa sẵn sàng, recency tra catalog giả, popularity trả 3 SP cố định."""
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: False)
    monkeypatch.setattr(recency_module, "get_products_by_ids", lambda ids: _products(ids))
    pop = _Spy(lambda top_k=10: [{"id": i, "name": "Pop", "price": 1.0, "score": 1.0} for i in ("900", "901", "902")][:top_k])
    monkeypatch.setattr(rec.popularity_rec_service, "get_popular_items", pop)
    return pop


# ─────────────────────────── Thang chiến lược ───────────────────────────

def test_tc_ph8_strat_01_sasrec_first_when_ready(monkeypatch, ladder):
    """TC_PH8_STRAT_01: Có lịch sử + SASRec sẵn sàng -> dùng tầng sasrec, gắn metadata thật, bỏ SP đã ẩn."""
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: True)
    monkeypatch.setattr(rec.sasrec_service, "recommend",
                        lambda hist, top_k=10: [{"product_id": 50, "score": 0.9}, {"product_id": 51, "score": 0.8},
                                                {"product_id": 52, "score": 0.7}])
    monkeypatch.setattr(rec, "get_products_by_ids", lambda ids: _products(ids, active={50, 52}))
    strategy, items = rec._recommend_for_history([3, 2, 1], top_k=3)
    assert strategy == "sasrec"
    assert [(x["id"], x["score"]) for x in items] == [("50", 0.9), ("52", 0.7)]
    assert ladder.calls == []  # không chạm tới popularity


def test_tc_ph8_strat_02_sasrec_empty_falls_to_recency(monkeypatch, ladder):
    """TC_PH8_STRAT_02: SASRec sẵn sàng nhưng trả rỗng (lịch sử toàn item lạ) -> rơi về recency."""
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: True)
    monkeypatch.setattr(rec.sasrec_service, "recommend", lambda hist, top_k=10: [])
    strategy, items = rec._recommend_for_history([3, 2, 1], top_k=10)
    assert strategy == "recency"
    assert [x["id"] for x in items] == ["3", "2", "1"]


def test_tc_ph8_strat_03_sasrec_all_inactive_falls_to_recency(monkeypatch, ladder):
    """TC_PH8_STRAT_03: SASRec gợi ý toàn SP đã ẩn/xoá (không có trong catalog) -> không trả rỗng mà rơi về recency."""
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: True)
    monkeypatch.setattr(rec.sasrec_service, "recommend", lambda hist, top_k=10: [{"product_id": 77, "score": 0.5}])
    monkeypatch.setattr(rec, "get_products_by_ids", lambda ids: {})
    strategy, items = rec._recommend_for_history([5], top_k=10)
    assert strategy == "recency"
    assert [x["id"] for x in items] == ["5"]


def test_tc_ph8_strat_04_recency_empty_falls_to_popularity(monkeypatch, ladder):
    """TC_PH8_STRAT_04: SASRec tắt, lịch sử chỉ gồm SP đã ẩn -> recency rỗng -> popularity."""
    monkeypatch.setattr(recency_module, "get_products_by_ids", lambda ids: {})
    strategy, items = rec._recommend_for_history([8, 9], top_k=2)
    assert strategy == "popularity"
    assert [x["id"] for x in items] == ["900", "901"]


def test_tc_ph8_strat_05_cold_start_skips_sasrec(monkeypatch, ladder):
    """TC_PH8_STRAT_05: Chưa có lịch sử (cold-start) -> popularity, không gọi SASRec dù model sẵn sàng."""
    called = []
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: called.append("ready") or True)
    monkeypatch.setattr(rec.sasrec_service, "recommend", lambda *a, **k: called.append("rec") or [])
    strategy, items = rec._recommend_for_history([], top_k=10)
    assert strategy == "popularity"
    assert len(items) == 3
    assert "rec" not in called


def test_tc_ph8_strat_06_for_you_uses_sasrec_when_ready(monkeypatch, ladder):
    """TC_PH8_STRAT_06: Khối 'Gợi ý cho bạn' (for_you) dùng SASRec khi sẵn sàng."""
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: True)
    monkeypatch.setattr(rec.sasrec_service, "recommend", lambda hist, top_k=10: [{"product_id": 60, "score": 0.4}])
    monkeypatch.setattr(rec, "get_products_by_ids", lambda ids: _products(ids))
    strategy, items = rec._recommend_for_history([1], top_k=5, source="for_you")
    assert strategy == "sasrec" and [x["id"] for x in items] == ["60"]


def test_tc_ph8_strat_07_for_you_popularity_excludes_seen(monkeypatch, ladder):
    """TC_PH8_STRAT_07: for_you khi SASRec tắt -> popularity đã loại SP đã xem, lấy dư top_k+len(seen) rồi cắt đúng top_k."""
    strategy, items = rec._recommend_for_history([900, 901], top_k=1, source="for_you")
    assert strategy == "popularity"
    assert [x["id"] for x in items] == ["902"]
    assert ladder.calls[-1][1] == {"top_k": 3}  # 1 + 2 item đã xem


def test_tc_ph8_strat_08_trending_ignores_sasrec_and_history(monkeypatch, ladder):
    """TC_PH8_STRAT_08: source=trending luôn là popularity toàn cục, không gọi SASRec dù có lịch sử."""
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: pytest.fail("không được gọi SASRec"))
    strategy, items = rec._recommend_for_history([1, 2], top_k=2, source="trending")
    assert strategy == "popularity" and [x["id"] for x in items] == ["900", "901"]


def test_tc_ph8_strat_09_research_checkpoint_rejected(tmp_path, monkeypatch):
    """TC_PH8_STRAT_09: Checkpoint REES46 (item_space khác platform_v1) bị từ chối -> is_ready=False để endpoint rơi xuống tầng sau."""
    path = tmp_path / "rees46.pt"
    torch.save({"item_space": "rees46_cosmetics", "config": {}, "model_state_dict": {}}, str(path))
    monkeypatch.setattr(recs_settings, "MODEL_WEIGHTS_PATH", str(path))
    svc = SasRecService()
    assert svc.is_ready() is False
    assert "platform_v1" in svc.status["reason"]
    assert svc.recommend([1, 2], top_k=5) == []


def test_tc_ph8_strat_10_missing_checkpoint_not_ready(tmp_path, monkeypatch):
    """TC_PH8_STRAT_10: Không có file checkpoint -> SASRec không sẵn sàng, chỉ thử nạp 1 lần (không đọc đĩa mỗi request)."""
    monkeypatch.setattr(recs_settings, "MODEL_WEIGHTS_PATH", str(tmp_path / "khong-co.pt"))
    svc = SasRecService()
    assert svc.is_ready() is False
    assert "khong tim thay" in svc.status["reason"]
    monkeypatch.setattr(recs_settings, "MODEL_WEIGHTS_PATH", "/khac/hoan-toan.pt")
    svc.is_ready()
    assert "khong-co.pt" in svc.status["reason"]  # lần 2 không nạp lại


# ─────────────────────────── Popularity ───────────────────────────

def test_tc_ph8_pop_01_trending_query_parameters(monkeypatch):
    """TC_PH8_POP_01: Popularity tính trên cửa sổ 30 ngày, trọng số giỏ hàng 3.0, pool 100 ứng viên."""
    spy = _Spy([(1, 6.0)])
    monkeypatch.setattr(pop_module, "get_trending_product_scores", spy)
    monkeypatch.setattr(pop_module, "get_products_by_ids", lambda ids: _products(ids))
    PopularityRecService().get_popular_items(top_k=5)
    assert spy.calls[0][0] == (30, 100, 3.0)


def test_tc_ph8_pop_02_trending_sql_score_formula():
    """TC_PH8_POP_02: get_trending_product_scores truyền đúng tham số score = VIEW + 3×ADD_TO_CART và ép kiểu (int, float)."""
    captured = {}

    class _Conn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, stmt, params):
            captured["sql"] = str(stmt)
            captured["params"] = params

            class _R:
                def all(self_inner):
                    return [("12", "7.0"), (5, 3)]
            return _R()

    class _Engine:
        def connect(self):
            return _Conn()

    orig = catalog_module.get_engine
    catalog_module.get_engine = lambda db: _Engine()
    try:
        out = catalog_module.get_trending_product_scores(30, 100, 3.0)
    finally:
        catalog_module.get_engine = orig
    assert out == [(12, 7.0), (5, 3.0)]
    assert captured["params"] == {"view": "VIEW_PRODUCT", "cart": "ADD_TO_CART", "w": 3.0, "days": 30, "k": 100}
    assert "GROUP BY item_id ORDER BY score DESC" in captured["sql"]


def test_tc_ph8_pop_03_db_error_returns_empty(monkeypatch):
    """TC_PH8_POP_03: Lỗi DB khi tính trending -> trả [] (không ném lỗi lên endpoint)."""
    class _Boom:
        def connect(self):
            raise RuntimeError("db down")

    monkeypatch.setattr(catalog_module, "get_engine", lambda db: _Boom())
    assert catalog_module.get_trending_product_scores(30, 100, 3.0) == []
    assert catalog_module.get_products_by_ids([1, 2]) == {}


def test_tc_ph8_pop_04_cache_expires_after_ttl(monkeypatch):
    """TC_PH8_POP_04: Cache popularity hết hạn sau 300s thì tính lại."""
    spy = _Spy([(1, 1.0)])
    monkeypatch.setattr(pop_module, "get_trending_product_scores", spy)
    monkeypatch.setattr(pop_module, "get_products_by_ids", lambda ids: _products(ids))
    clock = {"t": 1000.0}
    monkeypatch.setattr(pop_module.time, "monotonic", lambda: clock["t"])
    svc = PopularityRecService()
    svc.get_popular_items(3)
    clock["t"] += 299
    svc.get_popular_items(3)
    assert len(spy.calls) == 1
    clock["t"] += 2  # vượt 300s
    svc.get_popular_items(3)
    assert len(spy.calls) == 2


def test_tc_ph8_pop_05_empty_result_not_cached(monkeypatch):
    """TC_PH8_POP_05: Cả user_events lẫn sales_count đều rỗng -> không cache kết quả rỗng, lần sau thử lại."""
    spy = _Spy([])
    monkeypatch.setattr(pop_module, "get_trending_product_scores", spy)
    monkeypatch.setattr(pop_module, "get_top_products", lambda limit: [])
    svc = PopularityRecService()
    assert svc.get_popular_items(5) == []
    assert svc.get_popular_items(5) == []
    assert len(spy.calls) == 2


# ─────────────────────────── top_k ───────────────────────────

def test_tc_ph8_topk_01_popularity_bounds(monkeypatch):
    """TC_PH8_TOPK_01: top_k=0 -> rỗng; top_k lớn hơn số SP có -> trả hết SP hiện có, không lỗi."""
    monkeypatch.setattr(pop_module, "get_trending_product_scores", lambda *a: [(1, 3.0), (2, 2.0), (3, 1.0)])
    monkeypatch.setattr(pop_module, "get_products_by_ids", lambda ids: _products(ids))
    svc = PopularityRecService()
    assert svc.get_popular_items(top_k=0) == []
    assert [x["id"] for x in svc.get_popular_items(top_k=50)] == ["1", "2", "3"]


def test_tc_ph8_topk_02_recency_dedup_and_limit(monkeypatch):
    """TC_PH8_TOPK_02: Recency khử trùng (giữ lần xuất hiện mới nhất), cắt đúng top_k, điểm giảm dần theo thứ hạng."""
    monkeypatch.setattr(recency_module, "get_products_by_ids", lambda ids: _products(ids))
    history = [7, 3, 7, 5, 3, 9, 1, 2]  # newest-first như Redis LPUSH
    items = RecencyRecService().recommend(history, top_k=4)
    assert [x["id"] for x in items] == ["7", "3", "5", "9"]
    assert [x["score"] for x in items] == [4.0, 3.0, 2.0, 1.0]


def test_tc_ph8_topk_03_endpoint_respects_top_k(monkeypatch, ladder, fake_redis):
    """TC_PH8_TOPK_03: GET /recommendations/personal?top_k=2 trả đúng 2 item (lịch sử 5 item)."""
    monkeypatch.setattr(rec, "get_pooled_redis_client", lambda: fake_redis)
    fake_redis.lpush("user:u-1:history", 1, 2, 3, 4, 5)
    r = TestClient(app).get("/api/v1/recommendations/personal?top_k=2", headers={"X-User-Id": "u-1"})
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == ["5", "4"]


# ─────────────────────────── Lịch sử user/session ───────────────────────────

def test_tc_ph8_hist_01_user_history_has_priority(monkeypatch, fake_redis):
    """TC_PH8_HIST_01: Có lịch sử user -> dùng lịch sử user, bỏ qua lịch sử phiên."""
    monkeypatch.setattr(rec, "get_pooled_redis_client", lambda: fake_redis)
    fake_redis.lpush("user:u-1:history", 10, 11)
    fake_redis.lpush("session:s-1:history", 99)
    assert rec._resolve_history("u-1", "s-1") == [11, 10]


def test_tc_ph8_hist_02_fallback_to_session_when_user_empty(monkeypatch, fake_redis):
    """TC_PH8_HIST_02: Khách vừa đăng nhập (lịch sử user rỗng) -> dùng lịch sử của phiên đang duyệt."""
    monkeypatch.setattr(rec, "get_pooled_redis_client", lambda: fake_redis)
    fake_redis.lpush("session:s-1:history", 99, 98)
    assert rec._resolve_history("u-new", "s-1") == [98, 99]


def test_tc_ph8_hist_03_no_identity_returns_empty(monkeypatch, fake_redis):
    """TC_PH8_HIST_03: Không có userId lẫn sessionId -> lịch sử rỗng (không đọc key 'user:None:history')."""
    monkeypatch.setattr(rec, "get_pooled_redis_client", lambda: fake_redis)
    fake_redis.lpush("user:None:history", 1)
    fake_redis.lpush("session:None:history", 2)
    assert rec._resolve_history(None, None) == []


def test_tc_ph8_hist_04_read_history_skips_garbage_and_bounds(fake_redis):
    """TC_PH8_HIST_04: _read_history bỏ phần tử không phải số và chỉ đọc tối đa HISTORY_MAX_LEN (50) phần tử."""
    fake_redis.lpush("k", *range(60))
    fake_redis.lists["k"].insert(1, "abc")
    out = rec._read_history("k", fake_redis)
    assert "abc" not in out and len(out) == HISTORY_MAX_LEN - 1  # 50 phần tử đầu, 1 phần tử rác bị bỏ
    assert out[0] == 59


# ─────────────────────────── Endpoint ───────────────────────────

def test_tc_ph8_api_01_post_requires_session_id():
    """TC_PH8_API_01: POST /recommend thiếu sessionId -> 422 (validation Pydantic)."""
    r = TestClient(app).post("/api/v1/recommend", json={"userId": "u-1"})
    assert r.status_code == 422


def test_tc_ph8_api_02_redis_down_returns_500(monkeypatch):
    """TC_PH8_API_02: Redis lỗi khi đọc lịch sử -> 500 kèm thông điệp lỗi, không trả dữ liệu bịa."""
    def boom():
        raise ConnectionError("redis down")

    monkeypatch.setattr(rec, "get_pooled_redis_client", boom)
    r = TestClient(app).post("/api/v1/recommend", json={"userId": "u-1", "sessionId": "s"})
    assert r.status_code == 500
    assert "redis down" in r.json()["detail"]


def test_tc_ph8_api_03_cross_sell_uses_popularity(monkeypatch, ladder):
    """TC_PH8_API_03: Cross-sell chưa có co-occurrence thật -> trả popularity đúng top_k; thiếu item_ids -> 422."""
    client = TestClient(app)
    r = client.get("/api/v1/recommendations/cross-sell?item_ids=1,2&top_k=2")
    assert r.status_code == 200 and [x["id"] for x in r.json()] == ["900", "901"]
    assert client.get("/api/v1/recommendations/cross-sell").status_code == 422
