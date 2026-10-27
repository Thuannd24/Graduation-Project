"""PH10 (phần AI) — Unit test chatbot-service: định tuyến intent (complaint -> escalate, off_topic guard,
intent đơn hàng cần đăng nhập), ngưỡng từ chối RAG chính sách, NLU (LLM + fallback heuristic), LLM client.

LLM (DeepSeek), Redis, product-service/order-service/user-service đều được mock — không có lời gọi mạng thật.
"""
import json

import pytest
import requests

from app.api.endpoints import chatbot as ep
from app.models.chatbot import ChatRequest
from app.services import llm_client, tools
from app.services.memory import memory_manager_service
from app.services.nlu import classifier
from app.services.nlu.classifier import NluService
from app.services.rag import policy_rag as policy_module
from app.services.rag.policy_rag import PolicyRagService
from app.services.rag.product_rag import ProductRagService
from shared_common.config import shared_settings

JWT = "Bearer eyJ.fake.jwt"


def _nlu(intent, sentiment="neutral", order_id=None, topic="none"):
    return {"intent": intent, "sentiment": sentiment, "sentiment_score": classifier.SENTIMENT_SCORES[sentiment],
            "order_id": order_id, "account_topic": topic, "source": "llm"}


@pytest.fixture
def bot(monkeypatch, fake_redis):
    """Gọi thẳng handle_chat_message với NLU cố định; ghi lại mọi lần gọi LLM / tool."""
    calls = {"llm": [], "prompt": [], "tool": []}

    def fake_reply(system_prompt, history, message):
        calls["llm"].append(message)
        return "LLM trả lời"

    def fake_prompt(user_name, ctx, confidence="ok", user_id=None):
        calls["prompt"].append({"user_name": user_name, "ctx": ctx, "confidence": confidence, "user_id": user_id})
        return "SYSTEM"

    monkeypatch.setattr(ep.product_rag_service, "generate_reply", fake_reply)
    monkeypatch.setattr(ep.prompt_builder_service, "build_system_prompt", fake_prompt)

    def run(message, nlu, user_id=None, roles=None, auth=None, body_user=None):
        monkeypatch.setattr(ep.nlu_service, "analyze", lambda text, history=None: nlu)
        req = ChatRequest(sessionId="sess-1", message=message, userId=body_user)
        return ep.handle_chat_message(req, x_user_id=user_id, x_user_roles=roles, authorization=auth)

    run.calls = calls
    return run


# ─────────────────────────── Định tuyến intent ───────────────────────────

def test_tc_ph10_bot_01_complaint_escalates(bot):
    """TC_PH10_BOT_01: Intent complaint -> trả intent 'escalate' để widget chuyển sang nhân viên; câu trả lời vẫn do LLM soạn."""
    out = bot("Giao hàng chậm quá, tôi rất bức xúc", _nlu("complaint", "negative"))
    assert out["intent"] == "escalate" and out["message"] == "LLM trả lời" and out["products"] == []


def test_tc_ph10_bot_02_off_topic_guard_no_llm(bot):
    """TC_PH10_BOT_02: off_topic -> trả thông điệp từ chối cố định, KHÔNG gọi LLM (tiết kiệm chi phí, tránh trả lời ngoài phạm vi)."""
    out = bot("Thủ đô của Pháp là gì?", _nlu("off_topic"))
    assert out["intent"] == "off_topic" and out["message"] == ep.OFFTOPIC_MSG
    assert bot.calls["llm"] == []


def test_tc_ph10_bot_03_order_tracking_requires_login(bot, monkeypatch):
    """TC_PH10_BOT_03: Tra đơn khi chưa đăng nhập (thiếu X-User-Id hoặc Authorization) -> yêu cầu đăng nhập, không gọi order-service."""
    monkeypatch.setattr(tools.requests, "get", lambda *a, **k: pytest.fail("không được gọi order-service"))
    assert bot("Đơn #12 tới đâu rồi", _nlu("order_tracking", order_id=12))["message"] == tools.LOGIN_REQUIRED_MSG
    assert bot("Đơn #12 tới đâu rồi", _nlu("order_tracking", order_id=12), user_id="u-1")["message"] == tools.LOGIN_REQUIRED_MSG
    assert bot("Đơn #12 tới đâu rồi", _nlu("order_tracking", order_id=12), auth=JWT)["message"] == tools.LOGIN_REQUIRED_MSG


def test_tc_ph10_bot_04_order_tracking_needs_order_id(bot, monkeypatch):
    """TC_PH10_BOT_04: Đã đăng nhập nhưng không có mã đơn -> tự liệt kê đơn gần nhất (THIEU_SOT_NGHIEP_VU §12);
    chỉ khi không tra được danh sách đơn mới hỏi lại mã đơn. Không gọi LLM.
    (Đổi kỳ vọng có chủ đích: trước đây luôn hỏi lại mã đơn.)"""
    def down(*a, **k):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(tools.requests, "get", down)
    out = bot("Đơn hàng của tôi đâu", _nlu("order_tracking"), user_id="u-1", auth=JWT)
    assert out["message"] == ep.NO_ORDER_ID_MSG and bot.calls["llm"] == []


def test_tc_ph10_bot_05_order_tracking_forwards_identity(bot, monkeypatch):
    """TC_PH10_BOT_05: Tra đơn hợp lệ -> gọi order-service kèm X-User-Id/X-User-Roles/Authorization, dịch trạng thái và trả card order_status."""
    seen = {}

    class Resp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"data": {"status": "SHIPPED", "trackingCode": "GHN123", "finalAmount": 1500000,
                             "items": [{"productName": "Tai nghe", "quantity": 2, "unitPrice": 750000}]}}

    def fake_get(url, headers=None, timeout=None):
        seen["url"], seen["headers"] = url, headers
        return Resp()

    monkeypatch.setattr(tools.requests, "get", fake_get)
    out = bot("Đơn #12 tới đâu rồi", _nlu("order_tracking", order_id=12), user_id="u-1", roles="CUSTOMER", auth=JWT)
    assert seen["url"].endswith("/api/v1/orders/12")
    assert seen["headers"] == {"X-User-Id": "u-1", "X-User-Roles": "CUSTOMER", "Authorization": JWT}
    assert "đã được giao cho đơn vị vận chuyển" in out["message"] and "GHN123" in out["message"]
    assert out["card"]["type"] == "order_status" and out["card"]["statusCode"] == "SHIPPED"


def test_tc_ph10_bot_06_order_lookup_errors(monkeypatch):
    """TC_PH10_BOT_06: order-service trả 404 / 403 / lỗi mạng -> thông điệp thân thiện tương ứng, không ném lỗi."""
    def resp(code):
        class R:
            status_code = code

            def raise_for_status(self):
                raise requests.HTTPError(str(code))
        return R()

    monkeypatch.setattr(tools.requests, "get", lambda *a, **k: resp(404))
    assert "không tìm thấy đơn hàng #9" in tools.get_order_status(9, "u", None, JWT)["message"]
    monkeypatch.setattr(tools.requests, "get", lambda *a, **k: resp(403))
    assert "không thuộc tài khoản" in tools.get_order_status(9, "u", None, JWT)["message"]

    def down(*a, **k):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(tools.requests, "get", down)
    assert tools.get_order_status(9, "u", None, JWT) == {"message": tools.SERVICE_UNAVAILABLE_MSG, "card": None}


def test_tc_ph10_bot_07_order_action_rules(bot, monkeypatch):
    """TC_PH10_BOT_07: order_action: 'cancel' trả hướng dẫn tự huỷ (không cần đăng nhập); points/voucher cần đăng nhập; warranty cần mã đơn."""
    monkeypatch.setattr(tools.requests, "get", lambda *a, **k: pytest.fail("không được gọi BE"))
    assert bot("Huỷ đơn giúp tôi", _nlu("order_action", topic="cancel"))["message"] == tools.CANCEL_ORDER_GUIDE
    assert bot("Điểm thưởng của tôi", _nlu("order_action", topic="points"))["message"] == tools.LOGIN_REQUIRED_MSG
    assert bot("Voucher của tôi", _nlu("order_action", topic="voucher"))["message"] == tools.LOGIN_REQUIRED_MSG
    out = bot("Bảo hành của tôi", _nlu("order_action", topic="warranty"), user_id="u-1", auth=JWT)
    assert "mã đơn hàng" in out["message"]


def test_tc_ph10_bot_08_product_search_maps_cards(bot, monkeypatch):
    """TC_PH10_BOT_08: product_search -> RAG sản phẩm, map sang thẻ AIProduct (price = salePrice nếu có, oldPrice = giá gốc)."""
    items = [{"id": 1, "name": "iPhone 15", "price": 20000000, "salePrice": 18000000, "imageUrl": "/i.png",
              "brand": "Apple", "categoryName": "Điện thoại", "ratingAvg": 4.5},
             {"id": 2, "name": "Ốp lưng", "price": 200000, "salePrice": None}]
    monkeypatch.setattr(ep.product_rag_service, "retrieve_context", lambda q: items)
    out = bot("Tìm iPhone 15", _nlu("product_search"))
    p = out["products"]
    assert (p[0]["price"], p[0]["oldPrice"], p[0]["image"]) == (18000000, 20000000, "/i.png")
    assert (p[1]["price"], p[1]["oldPrice"]) == (200000, None)
    assert "iPhone 15" in bot.calls["prompt"][0]["ctx"]


# ─────────────────────────── RAG chính sách ───────────────────────────

@pytest.mark.parametrize("score,level", [(0.86, "ok"), (0.82, "ok"), (0.8199, "disclaimer"), (0.80, "disclaimer"),
                                         (0.7999, "reject"), (0.0, "reject")])
def test_tc_ph10_pol_01_confidence_thresholds(score, level):
    """TC_PH10_POL_01: Ngưỡng tin cậy RAG chính sách: >=0.82 ok, [0.80, 0.82) disclaimer, <0.80 reject (đúng biên)."""
    assert PolicyRagService.classify_confidence(score) == level


def test_tc_ph10_pol_02_low_score_rejects_without_llm(bot, monkeypatch):
    """TC_PH10_POL_02: policy_faq có điểm tối đa < 0.80 -> trả POLICY_REJECT_MSG (hướng về tổng đài), KHÔNG gọi LLM."""
    monkeypatch.setattr(ep.policy_rag_service, "retrieve",
                        lambda q: [{"title": "Bảo hành", "heading": "h", "text": "t", "score": 0.79}])
    out = bot("Bảo hành pin bao lâu", _nlu("policy_faq"))
    assert out["message"] == ep.POLICY_REJECT_MSG and bot.calls["llm"] == []


def test_tc_ph10_pol_03_disclaimer_and_citations(bot, monkeypatch):
    """TC_PH10_POL_03: Điểm trong vùng disclaimer -> prompt mang confidence='disclaimer'; câu trả lời kèm 'Theo:' các tiêu đề nguồn (khử trùng)."""
    monkeypatch.setattr(ep.policy_rag_service, "retrieve", lambda q: [
        {"title": "Đổi trả", "heading": "A", "text": "x", "score": 0.81},
        {"title": "Đổi trả", "heading": "B", "text": "y", "score": 0.80},
        {"title": "Vận chuyển", "heading": "C", "text": "z", "score": 0.79}])
    out = bot("Đổi trả trong bao lâu", _nlu("policy_faq"))
    assert bot.calls["prompt"][0]["confidence"] == "disclaimer"
    assert out["message"] == "LLM trả lời\n\nTheo: Đổi trả, Vận chuyển"


def test_tc_ph10_pol_04_missing_index_returns_empty(tmp_path, monkeypatch):
    """TC_PH10_POL_04: Chưa build policy index -> retrieve() trả [] mà không nạp embedding model."""
    monkeypatch.setattr(policy_module.chatbot_settings, "POLICY_INDEX_DIR", str(tmp_path / "khong-co"))
    svc = PolicyRagService()
    assert svc.retrieve("đổi trả") == [] and svc.model is None


# ─────────────────────────── NLU ───────────────────────────

def test_tc_ph10_nlu_01_llm_output_validated(monkeypatch):
    """TC_PH10_NLU_01: Kết quả LLM được chuẩn hoá: sentiment lạ -> neutral, order_id không phải số -> None, account_topic lạ -> 'none'."""
    monkeypatch.setattr(classifier.llm_client, "generate_text", lambda *a, **k: json.dumps(
        {"intent": "order_tracking", "sentiment": "angry", "order_id": "#12a", "account_topic": "refund"}))
    out = NluService().analyze("đơn của tôi")
    assert out == {"intent": "order_tracking", "sentiment": "neutral", "sentiment_score": 0.5, "order_id": None,
                   "account_topic": "none", "source": "llm"}
    monkeypatch.setattr(classifier.llm_client, "generate_text", lambda *a, **k: json.dumps(
        {"intent": "order_action", "sentiment": "negative", "order_id": " 45 ", "account_topic": "warranty"}))
    out = NluService().analyze("bảo hành đơn 45")
    assert out["order_id"] == 45 and out["sentiment_score"] == 0.85 and out["account_topic"] == "warranty"


def test_tc_ph10_nlu_02_invalid_llm_falls_back(monkeypatch):
    """TC_PH10_NLU_02: LLM trả intent ngoài danh sách hoặc JSON hỏng -> dùng heuristic (source='heuristic'); chỉ gửi 2 lượt lịch sử gần nhất."""
    sent = {}

    def fake(system, history, text, response_schema=None):
        sent["history"] = history
        return json.dumps({"intent": "buy_stuff", "sentiment": "neutral", "order_id": "", "account_topic": "none"})

    monkeypatch.setattr(classifier.llm_client, "generate_text", fake)
    history = [{"role": "user", "content": str(i)} for i in range(5)]
    out = NluService().analyze("Chính sách đổi trả thế nào?", history)
    assert out["source"] == "heuristic" and out["intent"] == "policy_faq"
    assert sent["history"] == history[-2:]
    monkeypatch.setattr(classifier.llm_client, "generate_text", lambda *a, **k: "không phải json")
    assert NluService().analyze("chào bạn")["source"] == "heuristic"


@pytest.mark.parametrize("text,intent,order_id,topic", [
    ("Thời tiết Hà Nội hôm nay thế nào?", "off_topic", None, "none"),
    ("Chào bạn, bạn là ai?", "general_chat", None, "none"),
    ("Tôi muốn huỷ đơn #123", "order_action", 123, "cancel"),
    ("Đơn #45 giao tới đâu rồi?", "order_tracking", 45, "none"),
    ("Sản phẩm bị lỗi, tôi rất bức xúc", "complaint", None, "none"),
    ("Huỷ đơn thì hoàn tiền bao lâu?", "policy_faq", None, "none"),
])
def test_tc_ph10_nlu_03_heuristic_fallback(monkeypatch, text, intent, order_id, topic):
    """TC_PH10_NLU_03: Không có LLM (thiếu API key) -> heuristic phân loại đúng off_topic/general_chat/order_action/order_tracking/complaint/policy_faq."""
    def no_llm(*a, **k):
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    monkeypatch.setattr(classifier.llm_client, "generate_text", no_llm)
    out = NluService().analyze(text)
    assert (out["intent"], out["order_id"], out["account_topic"], out["source"]) == (intent, order_id, topic, "heuristic")


def test_tc_ph10_nlu_04_extract_order_id_patterns():
    """TC_PH10_NLU_04: Trích mã đơn: '#123', 'đơn hàng số 45', số >= 2 chữ số; 1 chữ số đứng lẻ không phải mã đơn."""
    assert tools.extract_order_id("kiểm tra giúp # 123") == 123
    assert tools.extract_order_id("đơn hàng số 45 của tôi") == 45
    assert tools.extract_order_id("mã 98765") == 98765
    assert tools.extract_order_id("tôi có 1 câu hỏi") is None


# ─────────────────────────── LLM client & bộ nhớ hội thoại ───────────────────────────

def test_tc_ph10_llm_01_no_api_key_no_http(monkeypatch):
    """TC_PH10_LLM_01: Thiếu DEEPSEEK_API_KEY -> RuntimeError ngay, không phát sinh HTTP request nào."""
    monkeypatch.setattr(shared_settings, "DEEPSEEK_API_KEY", "")
    monkeypatch.setattr(llm_client.requests, "post", lambda *a, **k: pytest.fail("không được gọi HTTP"))
    with pytest.raises(RuntimeError, match="DEEPSEEK_API_KEY"):
        llm_client.generate_text("sys", [], "hi")


def test_tc_ph10_llm_02_payload_and_error(monkeypatch):
    """TC_PH10_LLM_02: Payload gửi DeepSeek: system + lịch sử (bot -> assistant) + câu hiện tại, JSON mode khi có schema; HTTP lỗi -> RuntimeError 'DeepSeek error'."""
    monkeypatch.setattr(shared_settings, "DEEPSEEK_API_KEY", "sk-test")
    seen = {}

    class Ok:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "{\"intent\":\"general_chat\"}"}}]}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen.update(url=url, headers=headers, json=json, timeout=timeout)
        return Ok()

    monkeypatch.setattr(llm_client.requests, "post", fake_post)
    out = llm_client.generate_text("SYS", [{"role": "user", "content": "a"}, {"role": "bot", "content": "b"}], "c",
                                   response_schema={"type": "OBJECT"})
    assert out == "{\"intent\":\"general_chat\"}"
    assert [m["role"] for m in seen["json"]["messages"]] == ["system", "user", "assistant", "user"]
    assert seen["json"]["response_format"] == {"type": "json_object"} and seen["headers"]["Authorization"] == "Bearer sk-test"

    def boom(*a, **k):
        raise requests.Timeout("timeout")

    monkeypatch.setattr(llm_client.requests, "post", boom)
    with pytest.raises(RuntimeError, match="DeepSeek error"):
        llm_client.generate_text("SYS", [], "c")


def test_tc_ph10_llm_03_reply_fallback_when_llm_down(monkeypatch):
    """TC_PH10_LLM_03: LLM lỗi -> generate_reply không ném lỗi mà trả câu trả lời dự phòng dựng từ context (hoặc lời chào mặc định)."""
    def down(*a, **k):
        raise RuntimeError("DeepSeek error: 503")

    monkeypatch.setattr("app.services.rag.product_rag.llm_client.generate_text", down)
    prompt = "BASE\n\n## CONTEXT (Thông tin tra cứu được từ hệ thống)\n1. [Đổi trả - Điều kiện]\nĐổi trả trong **7 ngày**.\n\n## X"
    out = ProductRagService().generate_reply(prompt, [], "đổi trả")
    assert isinstance(out, str) and out
    assert ProductRagService().generate_reply("không có context", [], "chào")


def test_tc_ph10_mem_01_history_window(fake_redis):
    """TC_PH10_MEM_01: Bộ nhớ hội thoại giữ tối đa 20 tin (10 lượt), TTL 24h, trả về theo thứ tự thời gian cũ -> mới."""
    for i in range(25):
        memory_manager_service.add_message("s-9", "user" if i % 2 == 0 else "bot", f"m{i}")
    key = "chat:s-9:history"
    assert len(fake_redis.lists[key]) == 20 and fake_redis.ttl[key] == 86400
    hist = memory_manager_service.get_history("s-9", max_turns=2)
    assert [h["content"] for h in hist] == ["m21", "m22", "m23", "m24"]
