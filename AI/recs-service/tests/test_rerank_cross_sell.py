"""Re-rank sau SASRec (tầng giá + đa dạng), làm sạch lịch sử, lọc hết hàng, và cross-sell phụ thuộc giỏ.
Mọi truy cập DB/Redis đều là fake (conftest chặn DB thật)."""
from fastapi.testclient import TestClient

from app.api.endpoints import recommend as rec
from app.main import app
from app.services import catalog
from app.services import cross_sell as cs
from app.services import recency as recency_module
from app.services.rerank import diversify, price_penalty, rerank


def _item(pid, price, cat):
    return {"id": str(pid), "name": f"P{pid}", "price": float(price), "categoryId": cat, "score": 1.0}


# ─────────────── re-rank ───────────────

def test_price_penalty_tiers():
    assert price_penalty(10e6, 10e6) == 0.0
    assert price_penalty(20e6, 10e6) == 0.0          # đúng 2× vẫn cùng tầng
    assert 0.85 < price_penalty(40e6, 10e6) < 0.95   # 4× trung vị
    assert price_penalty(80e6, 10e6) > price_penalty(40e6, 10e6)
    assert price_penalty(1e6, 10e6) > 0               # rẻ hơn hẳn: phạt nhẹ
    assert price_penalty(5e6, None) == 0.0            # không có lịch sử giá: không phạt


def test_rerank_pushes_out_of_tier_items_down():
    """Khách xem máy 4–18 triệu (trung vị ~10tr) thì Z Fold7 35tr ở top model phải tụt xuống."""
    items = [_item(1, 35e6, 14), _item(2, 32e6, 16), _item(3, 9e6, 17), _item(4, 12e6, 7), _item(5, 8e6, 18)]
    out = rerank(items, top_k=5, ref_price=10e6)
    ids = [x["id"] for x in out]
    assert ids[:2] == ["3", "4"]                      # cùng tầng giá lên đầu
    assert ids.index("1") >= 2 and ids.index("2") >= 3  # quá 3× trung vị bị đẩy xuống
    assert out[0]["score"] == 1.0  # điểm model gốc giữ nguyên, chỉ đổi thứ tự


def test_diversify_limits_same_category_streak():
    items = [_item(i, 1e6, 14) for i in range(1, 6)] + [_item(9, 1e6, 10)]
    out = diversify(items, top_k=4, max_streak=2)
    assert [x["categoryId"] for x in out] == [14, 14, 10, 14]


def test_sasrec_path_reranks_and_cleans_history(monkeypatch):
    seen = {}
    monkeypatch.setattr(rec.sasrec_service, "is_ready", lambda: True)

    def fake_sasrec(hist, top_k=10):
        seen["hist"], seen["pool"] = list(hist), top_k
        return [{"product_id": 50, "score": 4.4}, {"product_id": 51, "score": 4.3}, {"product_id": 52, "score": 4.2}]

    monkeypatch.setattr(rec.sasrec_service, "recommend", fake_sasrec)
    # SP #2 trong lịch sử đã bị xoá/ngừng bán -> không có trong meta
    monkeypatch.setattr(rec, "get_product_meta", lambda ids: {1: {"price": 5e6, "category_id": 14},
                                                              3: {"price": 7e6, "category_id": 16}})
    monkeypatch.setattr(rec, "get_products_by_ids", lambda ids: {50: _item(50, 40e6, 14), 52: _item(52, 6e6, 17)})
    strategy, items = rec._recommend_for_history([3, 2, 1], top_k=2)
    assert strategy == "sasrec"
    assert seen["hist"] == [3, 1]                 # SP đã xoá bị bỏ khỏi lịch sử
    assert seen["pool"] >= 40                     # lấy dư ứng viên để còn đủ sau lọc/re-rank
    assert [x["id"] for x in items] == ["52", "50"]  # 51 hết hàng/ngừng bán bị lọc, 50 quá tầng giá bị đẩy xuống


def test_recent_source_drops_deleted_history(monkeypatch, fake_redis):
    monkeypatch.setattr(rec, "get_pooled_redis_client", lambda: fake_redis)
    monkeypatch.setattr(rec, "get_product_meta", lambda ids: {i: {"price": 1.0, "category_id": 1} for i in ids if i != 2})
    monkeypatch.setattr(recency_module, "get_products_by_ids",
                        lambda ids: {int(i): {"id": str(i), "name": "P", "price": 1.0} for i in ids})
    fake_redis.lpush("user:u-1:history", 1, 2, 3)
    r = TestClient(app).get("/api/v1/recommendations/personal?source=recent", headers={"X-User-Id": "u-1"})
    assert [x["id"] for x in r.json()] == ["3", "1"]


def test_history_kept_when_db_down(monkeypatch):
    monkeypatch.setattr(rec, "get_product_meta", lambda ids: None)
    assert rec._clean_history([3, 2, 1]) == ([3, 2, 1], None)


def test_top_k_bounds_on_endpoints():
    client = TestClient(app)
    assert client.get("/api/v1/public/recommendations/personal?top_k=0").status_code == 422
    assert client.get("/api/v1/public/recommendations/personal?top_k=1000").status_code == 422
    assert client.get("/api/v1/recommendations/cross-sell?item_ids=1&top_k=-2").status_code == 422
    assert client.post("/api/v1/recommend", json={"sessionId": "s", "top_k": -1}).status_code == 422


# ─────────────── lọc hết hàng ở catalog ───────────────

class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _Conn:
    def __init__(self, products, sold_out):
        self.products, self.sold_out = products, sold_out

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, stmt, params):
        if "inventories" in str(stmt):
            return _Result([(pid,) for pid in self.sold_out])
        return _Result(self.products)


def test_get_products_by_ids_drops_out_of_stock(monkeypatch):
    row = lambda pid: {"id": pid, "name": f"P{pid}", "price": 100, "sale_price": None, "image_url": None,
                       "slug": "s", "rating_avg": None, "category_id": 13}
    conn = _Conn([row(1), row(2)], sold_out=[2])
    monkeypatch.setattr(catalog, "get_engine", lambda db: type("E", (), {"connect": lambda self: conn})())
    out = catalog.get_products_by_ids([1, 2])
    assert list(out) == [1] and out[1]["categoryId"] == 13


# ─────────────── cross-sell theo giỏ ───────────────

TREE = {
    1: {"name": "Điện thoại, Tablet", "parent_id": None}, 14: {"name": "Samsung", "parent_id": 1},
    5: {"name": "Phụ kiện", "parent_id": None}, 10: {"name": "Ốp lưng", "parent_id": 5},
    13: {"name": "Sạc & Cáp", "parent_id": 5}, 15: {"name": "Pin dự phòng", "parent_id": 5},
    2: {"name": "Laptop", "parent_id": None}, 3: {"name": "Âm thanh, Mic thu âm", "parent_id": None},
    11: {"name": "Tai nghe", "parent_id": 3}, 12: {"name": "Loa", "parent_id": 3},
}
CATALOG = {
    100: _item(100, 20e6, 14),  # điện thoại trong giỏ
    101: _item(101, 18e6, 14),  # điện thoại khác (mua cùng đơn trong seed) -> không phải "mua kèm"
    201: _item(201, 300e3, 10), 202: _item(202, 250e3, 10),
    301: _item(301, 400e3, 13), 401: _item(401, 600e3, 15), 501: _item(501, 2e6, 11),
    601: _item(601, 45e6, 2),   # laptop phổ biến
}


def _setup_cart(monkeypatch, popular=(601, 101, 301)):
    monkeypatch.setattr(catalog, "get_product_meta",
                        lambda ids: {i: {"price": CATALOG[i]["price"], "category_id": CATALOG[i]["categoryId"]}
                                     for i in ids if i in CATALOG})
    monkeypatch.setattr(catalog, "get_category_tree", lambda: TREE)
    monkeypatch.setattr(catalog, "get_co_purchased", lambda ids, limit: [(101, 5.0), (201, 3.0)])
    monkeypatch.setattr(catalog, "get_product_ids_in_categories",
                        lambda cats, limit: [pid for pid, it in CATALOG.items() if it["categoryId"] in cats])
    monkeypatch.setattr(catalog, "get_products_by_ids", lambda ids: {i: dict(CATALOG[i]) for i in ids if i in CATALOG})
    monkeypatch.setattr(cs.popularity_rec_service, "get_popular_items",
                        lambda top_k=10: [dict(CATALOG[i]) for i in popular][:top_k])


def test_accessory_categories_follow_cart():
    assert cs.accessory_category_ids([14], TREE) == {10, 13, 15, 11}
    assert 12 in cs.accessory_category_ids([2], TREE)  # laptop -> loa


def test_cross_sell_depends_on_cart_items(monkeypatch):
    _setup_cart(monkeypatch)
    strategy, items = cs.recommend_for_cart([100], top_k=4)
    ids = [x["id"] for x in items]
    assert strategy == "cart_related"
    assert ids[0] == "201"                     # mua cùng đơn + là phụ kiện -> đầu tiên
    assert "101" not in ids and "601" not in ids and "100" not in ids
    assert set(ids) <= {"201", "202", "301", "401", "501"}
    cats = [x["categoryId"] for x in items]
    assert all(a != b for a, b in zip(cats, cats[1:]))  # xen kẽ danh mục


def test_cross_sell_endpoint_and_public_alias(monkeypatch):
    _setup_cart(monkeypatch)
    client = TestClient(app)
    for path in ("/api/v1/recommendations/cross-sell", "/api/v1/public/recommendations/cross-sell"):
        r = client.get(f"{path}?item_ids=100&top_k=3")
        assert r.status_code == 200 and r.headers["X-Recs-Strategy"] == "cart_related"
        assert len(r.json()) == 3 and r.json()[0]["id"] == "201"
    assert client.get("/api/v1/recommendations/cross-sell?item_ids=abc").status_code == 422


def test_cross_sell_falls_back_to_popularity_without_cart_info(monkeypatch):
    _setup_cart(monkeypatch)
    monkeypatch.setattr(catalog, "get_product_meta", lambda ids: None)  # DB lỗi
    strategy, items = cs.recommend_for_cart([601], top_k=2)
    assert strategy == "popularity" and [x["id"] for x in items] == ["101", "301"]
