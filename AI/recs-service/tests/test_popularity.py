from app.services import popularity as pop_module
from app.services.popularity import PopularityRecService


def _patch(monkeypatch, trending, active_ids, top_products=()):
    calls = {"trending": 0}

    def fake_trending(window_days, limit, cart_weight):
        calls["trending"] += 1
        return trending

    monkeypatch.setattr(pop_module, "get_trending_product_scores", fake_trending)
    monkeypatch.setattr(pop_module, "get_products_by_ids",
                        lambda ids: {i: {"id": str(i), "name": f"P{i}", "price": 1.0} for i in ids if i in active_ids})
    monkeypatch.setattr(pop_module, "get_top_products", lambda limit: list(top_products))
    return calls


def test_ranks_by_behavior_score_and_drops_inactive(monkeypatch):
    _patch(monkeypatch, trending=[(5, 30.0), (9, 20.0), (2, 10.0)], active_ids={5, 2})
    items = PopularityRecService().get_popular_items(top_k=10)
    assert [(x["id"], x["score"]) for x in items] == [("5", 30.0), ("2", 10.0)]


def test_falls_back_to_sales_count_without_behavior(monkeypatch):
    fallback = [{"id": "1", "name": "A", "price": 1.0, "score": 0.0}]
    _patch(monkeypatch, trending=[], active_ids=set(), top_products=fallback)
    assert PopularityRecService().get_popular_items(top_k=10) == fallback


def test_result_is_cached(monkeypatch):
    calls = _patch(monkeypatch, trending=[(5, 1.0)], active_ids={5})
    svc = PopularityRecService()
    svc.get_popular_items(3)
    svc.get_popular_items(3)
    assert calls["trending"] == 1
