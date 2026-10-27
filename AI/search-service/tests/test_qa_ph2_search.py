"""PH2 (phần AI) — Unit test search-service: hợp nhất RRF, hybrid search + lọc giá, hiểu truy vấn/từ khoá,
gợi ý (suggest), FAISS store (build/save/load/reload) và metadata catalog.

Elasticsearch, MariaDB, MongoDB và model e5 đều được mock; FAISS dùng index nhỏ (dim=4) trong thư mục tạm.
"""
import os
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api.endpoints import search as search_ep
from app.core.config import search_settings
from app.main import app
from app.services import catalog
from app.services import hybrid_search as hs_module
from app.services.faiss_store import FaissStore
from app.services.hybrid_search import HybridSearchService
from app.services.catalog import _to_match_score

META = {
    1: {"name": "iPhone 15", "price": 20_000_000.0, "image": "/1.png"},
    2: {"name": "iPhone 15 Pro", "price": 28_000_000.0, "image": "/2.png"},
    3: {"name": "Ốp lưng iPhone", "price": 200_000.0, "image": None},
    4: {"name": "Sạc 20W", "price": 500_000.0, "image": "/4.png"},
}


@pytest.fixture
def hybrid(monkeypatch):
    calls = {}

    def dense(query, top_k=10):
        calls["dense_k"] = top_k
        return [{"id": 2, "score": 0.9}, {"id": 1, "score": 0.8}, {"id": 3, "score": 0.7}]

    def bm25(query, size=30):
        calls["bm25_size"] = size
        return [{"id": 1, "score": 12.0}, {"id": 4, "score": 8.0}, {"id": 99, "score": 5.0}]

    def meta(ids):
        calls["meta_ids"] = list(ids)
        return {i: META[i] for i in ids if i in META}

    monkeypatch.setattr(hs_module.text_search_service, "search", dense)
    monkeypatch.setattr(hs_module.catalog, "bm25_search", bm25)
    monkeypatch.setattr(hs_module.catalog, "get_products_by_ids", meta)
    return calls


def _store(tmp_path, dim=4, name="t"):
    return FaissStore(dim=dim, index_path=str(tmp_path / f"{name}.faiss"), map_path=str(tmp_path / f"{name}.json"), name=name)


def _unit(v):
    v = np.asarray(v, dtype="float32")
    return v / np.linalg.norm(v)


# ─────────────────────────── RRF ───────────────────────────

def test_tc_ph2_rrf_01_formula_single_list():
    """TC_PH2_RRF_01: RRF score(d) = 1/(k + rank) với rank bắt đầu từ 1, k=60."""
    fused = HybridSearchService().reciprocal_rank_fusion({"bm25": [10, 20]}, k=60)
    assert [f["id"] for f in fused] == [10, 20]
    assert fused[0]["score"] == pytest.approx(1 / 61) and fused[1]["score"] == pytest.approx(1 / 62)
    assert fused[0]["match_reason"] == "bm25"


def test_tc_ph2_rrf_02_agreement_beats_single_top():
    """TC_PH2_RRF_02: SP xuất hiện ở cả 2 nguồn được cộng điểm (match_reason 'bm25+dense') và vượt SP chỉ đứng đầu 1 nguồn."""
    fused = HybridSearchService().reciprocal_rank_fusion({"dense": [7, 5], "bm25": [8, 5]}, k=60)
    assert fused[0]["id"] == 5 and fused[0]["match_reason"] == "bm25+dense"
    assert fused[0]["score"] == pytest.approx(2 / 62)
    assert HybridSearchService().reciprocal_rank_fusion({"dense": [], "bm25": []}) == []


def test_tc_ph2_rrf_03_k_parameter_and_duplicates():
    """TC_PH2_RRF_03: k nhỏ làm hạng đầu chênh lớn hơn; SP lặp trong 1 nguồn vẫn chỉ ghi 1 lần trong match_reason."""
    f0 = HybridSearchService().reciprocal_rank_fusion({"dense": [1, 2]}, k=0)
    assert f0[0]["score"] == pytest.approx(1.0) and f0[1]["score"] == pytest.approx(0.5)
    dup = HybridSearchService().reciprocal_rank_fusion({"dense": [3, 3]}, k=60)
    assert len(dup) == 1 and dup[0]["match_reason"] == "dense"


# ─────────────────────────── Hybrid search + lọc giá ───────────────────────────

def test_tc_ph2_hyb_01_fuse_dense_and_bm25(hybrid):
    """TC_PH2_HYB_01: Hybrid lấy pool = top_k×3 từ mỗi nguồn, fuse RRF, trả id dạng chuỗi + metadata + match_reason; bỏ SP không còn active (id 99)."""
    out = HybridSearchService().search("iphone 15", top_k=10)
    assert hybrid["dense_k"] == 30 and hybrid["bm25_size"] == 30
    assert out[0]["id"] == "1" and out[0]["match_reason"] == "bm25+dense"
    assert {o["id"] for o in out} == {"1", "2", "3", "4"}
    assert all(isinstance(o["score"], float) and o["name"] for o in out)


def test_tc_ph2_hyb_02_price_filter_inclusive(hybrid):
    """TC_PH2_HYB_02: Lọc giá theo giá hiệu lực, biên min/max bao gồm (500.000 và 20.000.000 được giữ)."""
    out = HybridSearchService().search("iphone", top_k=10, min_price=500_000, max_price=20_000_000)
    assert sorted(o["id"] for o in out) == ["1", "4"]


def test_tc_ph2_hyb_03_top_k_cap(hybrid):
    """TC_PH2_HYB_03: Kết quả không vượt top_k (top_k=2 -> 2 SP có điểm RRF cao nhất)."""
    out = HybridSearchService().search("iphone", top_k=2)
    assert [o["id"] for o in out] == ["1", "2"]


def test_tc_ph2_hyb_04_both_sources_empty(monkeypatch):
    """TC_PH2_HYB_04: Dense lẫn BM25 đều rỗng (index/ES chưa sẵn sàng) -> [] và không truy vấn metadata."""
    monkeypatch.setattr(hs_module.text_search_service, "search", lambda q, top_k=10: [])
    monkeypatch.setattr(hs_module.catalog, "bm25_search", lambda q, size=30: [])
    monkeypatch.setattr(hs_module.catalog, "get_products_by_ids", lambda ids: pytest.fail("không được gọi DB"))
    assert HybridSearchService().search("xyz") == []


def test_tc_ph2_hyb_05_text_index_missing_skips_model(tmp_path, monkeypatch):
    """TC_PH2_HYB_05: Chưa build text index -> dense trả [] mà KHÔNG nạp model e5 (~2GB); hybrid vẫn chạy bằng BM25."""
    svc = hs_module.text_search_service
    monkeypatch.setattr(svc, "store", _store(tmp_path, dim=search_settings.TEXT_DIM, name="text"))
    monkeypatch.setattr(svc, "_get_model", lambda: pytest.fail("không được nạp model"))
    assert svc.search("tai nghe") == []
    monkeypatch.setattr(hs_module.catalog, "bm25_search", lambda q, size=30: [{"id": 4, "score": 3.0}])
    monkeypatch.setattr(hs_module.catalog, "get_products_by_ids", lambda ids: {i: META[i] for i in ids})
    out = HybridSearchService().search("sạc")
    assert [(o["id"], o["match_reason"]) for o in out] == [("4", "bm25")]


# ─────────────────────────── Hiểu truy vấn / từ khoá ───────────────────────────

def test_tc_ph2_qu_01_endpoint_query_understood(monkeypatch):
    """TC_PH2_QU_01: GET /search trả envelope SUCCESS, query_understood.intent='product_search', keywords tách theo khoảng trắng."""
    monkeypatch.setattr(search_ep.hybrid_search_service, "search",
                        lambda query, top_k, min_price, max_price: [
                            {"id": "1", "name": "iPhone 15", "price": 1.0, "image": None, "score": 0.03, "match_reason": "bm25"}])
    r = TestClient(app).get("/api/v1/public/search", params={"q": "iphone  15 pro max"})
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == "SUCCESS"
    qu = body["data"]["query_understood"]
    assert qu["intent"] == "product_search" and qu["extracted_attributes"]["keywords"] == ["iphone", "15", "pro", "max"]
    assert body["data"]["total"] == 1


def test_tc_ph2_qu_02_endpoint_error_and_missing_q(monkeypatch):
    """TC_PH2_QU_02: Lỗi nội bộ khi tìm -> 500 'Search failed' (không lộ stacktrace); thiếu tham số q -> 422."""
    def boom(**kw):
        raise RuntimeError("faiss crashed: /secret/path")

    monkeypatch.setattr(search_ep.hybrid_search_service, "search", boom)
    client = TestClient(app)
    r = client.get("/api/v1/search", params={"q": "abc"})
    assert r.status_code == 500 and r.json()["detail"] == "Search failed"
    assert client.get("/api/v1/search").status_code == 422


def test_tc_ph2_qu_03_bm25_tokens_and_blank_query(monkeypatch):
    """TC_PH2_QU_03: Truy vấn rỗng/khoảng trắng -> BM25 trả [] không gọi ES; tách token tối đa 8 từ cho fallback LIKE."""
    monkeypatch.setattr(catalog, "_get_es", lambda: pytest.fail("không được gọi ES"))
    assert catalog.bm25_search("   ") == []
    assert catalog._tokens("  a  b c d e f g h i j ") == ["a", "b", "c", "d", "e", "f", "g", "h"]


def test_tc_ph2_qu_04_es_down_falls_back_to_db(monkeypatch):
    """TC_PH2_QU_04: ES lỗi -> đánh dấu ES down 30s và fallback LIKE trên MariaDB (mỗi token 1 điều kiện, giới hạn size)."""
    monkeypatch.setattr(catalog, "_es_down_until", 0.0)
    monkeypatch.setattr(catalog, "_es_client", None)

    class DeadES:
        def search(self, **kw):
            raise ConnectionError("es down")

    captured = {}

    def fake_query(sql, params=()):
        captured["sql"], captured["params"] = sql, list(params)
        return [{"id": 3, "matched": 2}, {"id": 1, "matched": 1}]

    monkeypatch.setattr(catalog, "_es_client", DeadES())
    monkeypatch.setattr(catalog, "_query", fake_query)
    out = catalog.bm25_search("ốp iphone", size=7)
    assert out == [{"id": 3, "score": 2.0}, {"id": 1, "score": 1.0}]
    assert captured["params"] == ["%ốp%", "%iphone%", 7]
    assert catalog._es_down_until > time.time() + 25
    assert catalog._get_es() is None  # trong 30s không thử ES nữa


def test_tc_ph2_qu_05_es_hits_mapped(monkeypatch):
    """TC_PH2_QU_05: ES hoạt động -> map _id sang int, _score None -> 0.0, lọc active=True trong truy vấn."""
    monkeypatch.setattr(catalog, "_es_down_until", 0.0)
    seen = {}

    class ES:
        def search(self, **kw):
            seen.update(kw)
            return {"hits": {"hits": [{"_id": "12", "_score": 3.5}, {"_id": "8", "_score": None}]}}

    monkeypatch.setattr(catalog, "_es_client", ES())
    assert catalog.bm25_search("loa", size=5) == [{"id": 12, "score": 3.5}, {"id": 8, "score": 0.0}]
    assert seen["size"] == 5 and seen["query"]["bool"]["filter"] == [{"term": {"active": True}}]


# ─────────────────────────── Suggest ───────────────────────────

def test_tc_ph2_sug_01_short_prefix(monkeypatch):
    """TC_PH2_SUG_01: Prefix < 2 ký tự (sau khi trim) -> [] không truy vấn ES/DB."""
    monkeypatch.setattr(catalog, "_get_es", lambda: pytest.fail("không được gọi ES"))
    monkeypatch.setattr(catalog, "_query", lambda *a, **k: pytest.fail("không được gọi DB"))
    assert catalog.suggest(" i ") == []


def test_tc_ph2_sug_02_es_dedup_and_limit(monkeypatch):
    """TC_PH2_SUG_02: Gợi ý từ ES được khử trùng, giữ thứ tự, tối đa size=5; ES lấy dư size×2."""
    monkeypatch.setattr(catalog, "_es_down_until", 0.0)
    names = ["iPhone 15", "iPhone 15", "iPhone 15 Pro", "iPhone 14", "iPhone 13", "iPhone 12", "iPhone 11"]
    seen = {}

    class ES:
        def search(self, **kw):
            seen.update(kw)
            return {"hits": {"hits": [{"_source": {"name": n}} for n in names] + [{"_source": {}}]}}

    monkeypatch.setattr(catalog, "_es_client", ES())
    assert catalog.suggest("ip") == ["iPhone 15", "iPhone 15 Pro", "iPhone 14", "iPhone 13", "iPhone 12"]
    assert seen["size"] == 10


def test_tc_ph2_sug_03_db_fallback(monkeypatch):
    """TC_PH2_SUG_03: ES lỗi -> fallback LIKE (chứa prefix, ưu tiên bắt đầu bằng prefix); endpoint trả envelope SUCCESS."""
    monkeypatch.setattr(catalog, "_es_down_until", time.time() + 30)  # ES đang bị đánh dấu down
    captured = {}

    def fake_query(sql, params=()):
        captured["params"] = list(params)
        return [{"name": "Sạc 20W"}, {"name": "Sạc dự phòng"}]

    monkeypatch.setattr(catalog, "_query", fake_query)
    r = TestClient(app).get("/api/v1/public/search/suggest", params={"q": "Sạc"})
    assert r.status_code == 200 and r.json()["data"]["suggestions"] == ["Sạc 20W", "Sạc dự phòng"]
    assert captured["params"] == ["%Sạc%", "Sạc%", 10]


# ─────────────────────────── Match score bounds ───────────────────────────

def test_tc_ph2_match_score_bounds():
    """TC_PH2_MATCH_01: Cosine quy về % badge: -1 -> 0, 0 -> 50, 1 -> 100, vượt biên bị kẹp."""
    assert [_to_match_score(x) for x in (-1.0, 0.0, 1.0, 1.5, -2.0)] == [0, 50, 100, 100, 0]


# ─────────────────────────── FAISS store ───────────────────────────

def test_tc_ph2_faiss_01_build_search_dedup(tmp_path):
    """TC_PH2_FAISS_01: Nhiều vector/1 SP -> search gộp theo SP, giữ cosine cao nhất, sắp giảm dần, cắt top_k; top_k<=0 -> []."""
    s = _store(tmp_path)
    vecs = np.stack([_unit([1, 0, 0, 0]), _unit([0.9, 0.1, 0, 0]), _unit([0.5, 0.5, 0, 0]), _unit([0, 0, 1, 0])])
    s.build(vecs, [10, 10, 20, 30])
    hits = s.search(_unit([1, 0, 0, 0]), top_k=2)
    assert [h[0] for h in hits] == [10, 20] and hits[0][1] == pytest.approx(1.0, abs=1e-5)
    assert s.search(_unit([1, 0, 0, 0]), top_k=0) == []
    with pytest.raises(ValueError):
        s.search(np.ones(3, dtype="float32"), top_k=1)


def test_tc_ph2_faiss_02_build_validation(tmp_path):
    """TC_PH2_FAISS_02: build từ chối ma trận sai số chiều và số productId lệch số vector."""
    s = _store(tmp_path)
    with pytest.raises(ValueError):
        s.build(np.ones((2, 3), dtype="float32"), [1, 2])
    with pytest.raises(ValueError):
        s.build(np.ones((2, 4), dtype="float32"), [1])


def test_tc_ph2_faiss_03_save_load_roundtrip(tmp_path):
    """TC_PH2_FAISS_03: save ghi index+map (không để file .tmp), store mới load lại đúng số vector; chưa có file -> load False, is_ready False."""
    empty = _store(tmp_path, name="none")
    assert empty.load() is False and empty.is_ready is False and empty.search(_unit([1, 0, 0, 0])) == []
    s = _store(tmp_path)
    s.build(np.stack([_unit([1, 0, 0, 0]), _unit([0, 1, 0, 0])]), [5, 6])
    s.save()
    assert not os.path.exists(s.index_path + ".tmp")
    s2 = _store(tmp_path)
    assert s2.load() is True and s2.size == 2 and s2.is_ready


def test_tc_ph2_faiss_04_reject_corrupt_index(tmp_path):
    """TC_PH2_FAISS_04: Index lệch số chiều (đổi model chưa build lại) hoặc map lệch số vector -> load False, giữ trạng thái chưa sẵn sàng."""
    s = _store(tmp_path)
    s.build(np.stack([_unit([1, 0, 0, 0])]), [5])
    s.save()
    wrong_dim = FaissStore(dim=8, index_path=s.index_path, map_path=s.map_path, name="t8")
    assert wrong_dim.load() is False and not wrong_dim.is_ready
    with open(s.map_path, "w", encoding="utf-8") as f:
        f.write("[5, 6, 7]")
    bad_map = _store(tmp_path)
    assert bad_map.load() is False and not bad_map.is_ready


def test_tc_ph2_faiss_05_reload_if_changed(tmp_path, monkeypatch):
    """TC_PH2_FAISS_05: reload_if_changed chỉ kiểm tra tối đa 1 lần/30s và chỉ nạp lại khi file index có mtime mới hơn."""
    writer = _store(tmp_path)
    writer.build(np.stack([_unit([1, 0, 0, 0])]), [1])
    writer.save()
    reader = _store(tmp_path)
    loads = []
    real_load = reader.load
    monkeypatch.setattr(reader, "load", lambda: loads.append(1) or real_load())
    clock = {"t": 1_000_000.0}
    monkeypatch.setattr("app.services.faiss_store.time.time", lambda: clock["t"])
    reader.reload_if_changed()
    assert len(loads) == 1 and reader.size == 1
    reader.reload_if_changed()                    # cùng mtime + trong 30s -> không nạp
    writer.build(np.stack([_unit([1, 0, 0, 0]), _unit([0, 1, 0, 0])]), [1, 2])
    writer.save()
    newer = os.stat(writer.index_path).st_mtime + 100
    os.utime(writer.index_path, (newer, newer))
    reader.reload_if_changed()                    # chưa đủ 30s -> chưa kiểm tra
    assert len(loads) == 1
    clock["t"] += 31
    reader.reload_if_changed()                    # đủ 30s + mtime mới -> nạp lại
    assert len(loads) == 2 and reader.size == 2


# ─────────────────────────── Catalog / giá ───────────────────────────

def test_tc_ph2_meta_01_effective_price():
    """TC_PH2_META_01: Giá hiệu lực = sale_price khi 0 < sale < price; sale >= price, 0 hoặc NULL -> giá gốc."""
    assert catalog._effective_price(1000, 800) == 800.0
    assert catalog._effective_price(1000, 1000) == 1000.0
    assert catalog._effective_price(1000, 1200) == 1000.0
    assert catalog._effective_price(1000, None) == 1000.0
    assert catalog._effective_price(None, None) == 0.0


def test_tc_ph2_meta_02_metadata_cache_and_db_error(monkeypatch):
    """TC_PH2_META_02: get_products_by_ids khử trùng id, cache 300s (lần 2 không truy vấn lại), lỗi DB -> {} không ném lỗi."""
    catalog.clear_meta_cache()
    calls = []

    def fake_query(sql, params=()):
        calls.append(list(params))
        return [{"id": 1, "name": "A", "price": 1000, "sale_price": 900, "image": "/a.png"}]

    monkeypatch.setattr(catalog, "_query", fake_query)
    assert catalog.get_products_by_ids([1, 1, 2]) == {1: {"name": "A", "price": 900.0, "image": "/a.png"}}
    assert calls == [[1, 2]]
    catalog.get_products_by_ids([1])
    assert len(calls) == 1  # id 1 lấy từ cache

    def boom(sql, params=()):
        raise RuntimeError("db down")

    monkeypatch.setattr(catalog, "_query", boom)
    assert catalog.get_products_by_ids([77]) == {}
    catalog.clear_meta_cache()
