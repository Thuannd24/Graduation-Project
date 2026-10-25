"""Khoảng giá ("tai nghe dưới 500 nghìn"), liệt kê đơn gần nhất cho khách đã đăng nhập, và chuyển nhân viên khi
khách bực bội / hỏi lặp lại. Không gọi HTTP thật: requests.get của product-service/order-service là fake."""
import pytest

from app.api.endpoints import chatbot as ep
from app.models.chatbot import ChatRequest
from app.services import tools
from app.services.nlu import classifier
from app.services.nlu.classifier import NluService
from app.services.nlu.price_range import PriceRange, parse_price_range, remove_price_phrases
from app.services.rag import product_rag as rag_module
from app.services.rag.product_rag import ProductRagService

JWT = "Bearer eyJ.fake.jwt"


@pytest.mark.parametrize("text,lo,hi", [
    ("tai nghe dưới 500 nghìn", None, 500_000),
    ("Gợi ý quà tặng dưới 500 nghìn", None, 500_000),
    ("tai nghe duoi 500k", None, 500_000),
    ("laptop từ 15 đến 20 triệu", 15_000_000, 20_000_000),
    ("máy 4 đến 18 triệu", 4_000_000, 18_000_000),
    ("điện thoại trên 10tr", 10_000_000, None),
    ("điện thoại rẻ hơn 5 triệu", None, 5_000_000),
    ("tai nghe 500k đổ lại", None, 500_000),
    ("tầm 1tr5", 1_200_000, 1_800_000),
])
def test_parse_price_range(text, lo, hi):
    assert parse_price_range(text) == PriceRange(lo, hi)


@pytest.mark.parametrize("text", ["iphone 15 pro max", "có 2 sim không", "bảo hành dưới 2 năm",
                                  "pin 20000mah", "samsung s24 128gb"])
def test_no_price_range(text):
    assert parse_price_range(text) is None


def test_remove_price_phrases_keeps_product_terms():
    assert remove_price_phrases("tai nghe dưới 500 nghìn") == "tai nghe"


CATALOG = {
    "tai nghe": [
        {"id": 951, "name": "Tai nghe Bluetooth Anker Soundcore R50i", "effectivePrice": 650000.0, "price": 650000.0},
        {"id": 949, "name": "Tai nghe chụp tai Xiaomi Redmi", "effectivePrice": 1990000.0, "price": 1990000.0},
        # khớp mô tả, không phải tai nghe -> không được trả về như tai nghe
        {"id": 648, "name": "Pin sạc dự phòng Aukey 10000mAh", "effectivePrice": 390000.0, "price": 390000.0},
    ],
    "sạc": [{"id": 672, "name": "Sạc Anker 20W", "effectivePrice": 290000.0, "price": 290000.0}],
    "pin dự phòng": [{"id": 648, "name": "Pin sạc dự phòng Aukey 10000mAh", "effectivePrice": 390000.0, "price": 390000.0}],
    "ốp lưng": [{"id": 525, "name": "Ốp lưng iPhone 17", "effectivePrice": 360000.0, "price": 360000.0},
                {"id": 527, "name": "Ốp lưng iPhone 17 Pro Max", "effectivePrice": 675000.0, "price": 675000.0}],
    "loa": [{"id": 357, "name": "Loa Bluetooth JBL Go 5", "effectivePrice": 1290000.0, "price": 1290000.0}],
}


@pytest.fixture
def rag(monkeypatch):
    svc = ProductRagService()
    monkeypatch.setattr(svc, "_search_one", lambda q, size=5: list(CATALOG.get(q.lower(), [])))
    monkeypatch.setattr(svc, "_attach_specs", lambda items: items)
    return svc


def test_headphones_under_500k_does_not_invent(rag):
    items, note = rag.retrieve_in_price_range("tai nghe dưới 500 nghìn", parse_price_range("tai nghe dưới 500 nghìn"))
    assert "KHÔNG có sản phẩm (tai nghe)" in note
    assert [i["id"] for i in items][0] == 951            # gần khoảng giá nhất, ghi rõ là ngoài khoảng
    assert 648 not in [i["id"] for i in items]           # pin dự phòng không bị coi là tai nghe


def test_gift_under_500k_returns_cheap_accessories(rag):
    q = "Gợi ý quà tặng dưới 500 nghìn"
    items, note = rag.retrieve_in_price_range(q, parse_price_range(q))
    assert items and all(i["effectivePrice"] <= 500_000 for i in items)
    assert {i["id"] for i in items} == {672, 648, 525}
    assert "dưới 500.000đ" in note


@pytest.fixture
def bot(monkeypatch, fake_redis):
    calls = {"prompt": [], "llm": []}
    monkeypatch.setattr(ep.prompt_builder_service, "build_system_prompt",
                        lambda user_name, ctx, confidence="ok", user_id=None: calls["prompt"].append(ctx) or "SYSTEM")
    monkeypatch.setattr(ep.product_rag_service, "generate_reply",
                        lambda system, history, message: calls["llm"].append(message) or "LLM trả lời")

    def run(message, nlu, user_id=None, auth=None, roles=None):
        monkeypatch.setattr(ep.nlu_service, "analyze", lambda text, history=None: nlu)
        req = ChatRequest(sessionId="sess-x", message=message)
        return ep.handle_chat_message(req, x_user_id=user_id, x_user_roles=roles, authorization=auth)

    run.calls = calls
    return run


def _nlu(intent, sentiment="neutral"):
    return {"intent": intent, "sentiment": sentiment, "sentiment_score": classifier.SENTIMENT_SCORES[sentiment],
            "order_id": None, "account_topic": "none", "source": "llm"}


def test_gift_prompt_not_refused_as_off_topic(bot, monkeypatch):
    """Câu mẫu của widget: LLM NLU lỡ xếp off_topic thì vẫn phải được tư vấn theo khoảng giá."""
    seen = {}

    def fake_range(query, price_range):
        seen["range"] = price_range
        return [{"id": 672, "name": "Sạc Anker 20W", "price": 290000, "salePrice": None}], "Các sản phẩm"

    monkeypatch.setattr(ep.product_rag_service, "retrieve_in_price_range", fake_range)
    out = bot("Gợi ý quà tặng dưới 500 nghìn", _nlu("off_topic"))
    assert out["intent"] == "product_search" and out["message"] != ep.OFFTOPIC_MSG
    assert seen["range"] == PriceRange(None, 500_000)
    assert out["products"][0]["id"] == 672


def test_heuristic_routes_price_and_gift_questions(monkeypatch):
    monkeypatch.setattr(classifier.llm_client, "generate_text", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("no key")))
    assert NluService().analyze("Gợi ý quà tặng dưới 500 nghìn")["intent"] == "product_search"
    assert NluService().analyze("tai nghe dưới 500 nghìn")["intent"] == "product_search"
    # câu hỏi quy định có từ "hỏng" không bị coi là khiếu nại
    assert NluService().analyze("Tai nghe bị hỏng thì đổi trả thế nào?")["intent"] != "complaint"


class _Resp:
    status_code = 200

    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return {"data": self._data}


def test_logged_in_user_gets_recent_orders(bot, monkeypatch):
    seen = {}
    orders = [
        {"id": 7, "userId": "u-1", "status": "DELIVERED", "finalAmount": 1500000, "createdAt": "2026-10-01T10:00:00",
         "items": [{"productName": "Tai nghe A"}]},
        {"id": 9, "userId": "u-1", "status": "SHIPPED", "finalAmount": 300000, "createdAt": "2026-10-15T08:00:00",
         "items": [{"productName": "Ốp lưng"}, {"productName": "Sạc"}]},
        {"id": 99, "userId": "someone-else", "status": "PENDING", "createdAt": "2026-10-18T08:00:00", "items": []},
    ]

    def fake_get(url, headers=None, timeout=None):
        seen["url"], seen["headers"] = url, headers
        return _Resp(orders)

    monkeypatch.setattr(tools.requests, "get", fake_get)
    out = bot("Đơn hàng của tôi đâu", _nlu("order_tracking"), user_id="u-1", auth=JWT, roles="CUSTOMER")
    assert seen["url"].endswith("/api/v1/orders") and seen["headers"]["X-User-Id"] == "u-1"
    assert "#9" in out["message"] and "#7" in out["message"] and "#99" not in out["message"]
    assert out["message"].index("#9") < out["message"].index("#7")  # mới nhất trước
    assert out["card"]["type"] == "order_list" and [o["orderId"] for o in out["card"]["orders"]] == [9, 7]
    assert out["message"] != ep.NO_ORDER_ID_MSG and bot.calls["llm"] == []


def test_logged_in_user_without_orders(bot, monkeypatch):
    monkeypatch.setattr(tools.requests, "get", lambda *a, **k: _Resp([]))
    out = bot("Đơn hàng của tôi đâu", _nlu("order_tracking"), user_id="u-1", auth=JWT)
    assert "chưa có đơn hàng" in out["message"]


def test_repeated_question_hands_off(bot, monkeypatch):
    monkeypatch.setattr(ep.policy_rag_service, "retrieve", lambda q: [])
    q = "Chính sách đổi trả thế nào?"
    assert bot(q, _nlu("policy_faq"))["intent"] == "policy_faq"
    assert bot(q, _nlu("policy_faq"))["intent"] == "policy_faq"
    out = bot(q, _nlu("policy_faq"))
    assert out["intent"] == "escalate" and out["handoffReason"] == "repeated_question"
    assert out["message"].endswith(ep.HANDOFF_NOTE)


def test_negative_sentiment_hands_off_but_not_for_price_talk(bot):
    out = bot("Bot trả lời vô dụng quá", _nlu("general_chat", "negative"))
    assert out["intent"] == "escalate" and out["handoffReason"] == "negative_sentiment"
    out = bot("Đắt quá vậy", _nlu("price_inquiry", "negative"))
    assert out["intent"] == "price_inquiry" and "handoffReason" not in out
