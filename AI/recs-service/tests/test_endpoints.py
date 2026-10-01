import pytest
from fastapi.testclient import TestClient

from app.api.endpoints import recommend as rec_endpoint
from app.main import app
from app.services import recency as recency_module

USER = "42d23463-560c-4491-b0d2-b4a5d65412ef"  # user id thật là Keycloak UUID


def _fake_products(ids):
    return {int(i): {"id": str(i), "name": f"P{i}", "price": 1.0, "image": f"/img/{i}.png"} for i in ids}


@pytest.fixture
def client(monkeypatch, fake_redis):
    monkeypatch.setattr(rec_endpoint, "get_pooled_redis_client", lambda: fake_redis)
    monkeypatch.setattr(rec_endpoint.sasrec_service, "is_ready", lambda: False)
    monkeypatch.setattr(recency_module, "get_products_by_ids", _fake_products)
    monkeypatch.setattr(rec_endpoint.popularity_rec_service, "get_popular_items",
                        lambda top_k=10: [{"id": "999", "name": "Pop", "price": 1.0, "score": 1.0}][:top_k])
    fake_redis.lpush(f"user:{USER}:history", 1, 2, 3)  # 3 là item mới nhất
    fake_redis.lpush("session:sess-anon:history", 7)
    return TestClient(app)


def test_header_identity_is_used(client):
    r = client.get("/api/v1/recommendations/personal", headers={"X-User-Id": USER})
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == ["3", "2", "1"]
    assert r.headers["X-Recs-Strategy"] == "recency"


def test_empty_user_id_query_like_old_fe_falls_back_to_session(client):
    r = client.get("/api/v1/recommendations/personal?user_id=", headers={"X-Session-Id": "sess-anon"})
    assert [x["id"] for x in r.json()] == ["7"]


def test_public_route_serves_anonymous_by_session(client):
    r = client.get("/api/v1/public/recommendations/personal", headers={"X-Session-Id": "sess-anon"})
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == ["7"]


def test_public_route_ignores_user_id_query(client):
    # Không được đọc lịch sử người khác chỉ bằng cách đoán user_id trên route public
    r = client.get(f"/api/v1/public/recommendations/personal?user_id={USER}")
    assert r.headers["X-Recs-Strategy"] == "popularity"


def test_auth_route_ignores_user_id_query(client):
    # Đã đăng nhập (header của chính mình trống lịch sử) cũng không đọc được lịch sử người khác qua query
    r = client.get(f"/api/v1/recommendations/personal?user_id={USER}", headers={"X-User-Id": "someone-else"})
    assert r.headers["X-Recs-Strategy"] == "popularity"


def test_cold_start_returns_popularity(client):
    r = client.get("/api/v1/public/recommendations/personal", headers={"X-Session-Id": "unknown"})
    assert r.headers["X-Recs-Strategy"] == "popularity"
    assert [x["id"] for x in r.json()] == ["999"]


def test_source_recent_returns_history_only(client):
    r = client.get("/api/v1/public/recommendations/personal?source=recent", headers={"X-User-Id": USER})
    assert r.headers["X-Recs-Strategy"] == "recency"
    assert [x["id"] for x in r.json()] == ["3", "2", "1"]


def test_source_recent_is_empty_without_history(client):
    r = client.get("/api/v1/public/recommendations/personal?source=recent", headers={"X-Session-Id": "new"})
    assert r.json() == []


def test_source_trending_ignores_history(client):
    r = client.get("/api/v1/public/recommendations/personal?source=trending", headers={"X-User-Id": USER})
    assert r.headers["X-Recs-Strategy"] == "popularity"


def test_source_for_you_never_falls_back_to_recency(client, monkeypatch):
    # SASRec không sẵn sàng: "Gợi ý cho bạn" phải là món MỚI (popularity đã loại món đã xem),
    # không được lặp lại nội dung tab "Xem gần đây"
    monkeypatch.setattr(rec_endpoint.popularity_rec_service, "get_popular_items",
                        lambda top_k=10: [{"id": i, "name": "P", "price": 1.0, "score": 1.0} for i in ("3", "999", "2")])
    r = client.get("/api/v1/public/recommendations/personal?source=for_you", headers={"X-User-Id": USER})
    assert r.headers["X-Recs-Strategy"] == "popularity"
    assert [x["id"] for x in r.json()] == ["999"]


def test_invalid_source_is_rejected(client):
    r = client.get("/api/v1/public/recommendations/personal?source=bogus")
    assert r.status_code == 422


@pytest.mark.parametrize("user_id", [USER, 12345])
def test_post_recommend_accepts_uuid_and_int(client, user_id):
    r = client.post("/api/v1/recommend", json={"userId": user_id, "sessionId": "s"})
    assert r.status_code == 200


def test_post_recommend_returns_display_fields(client):
    r = client.post("/api/v1/recommend", json={"userId": USER, "sessionId": "s"})
    body = r.json()
    assert body["strategy"] == "recency"
    assert body["items"][0]["image"] == "/img/3.png"
