"""PH10 (chatbot) — BugCheck: khẳng định HÀNH VI ĐÚNG nghiệp vụ mà code hiện tại CHƯA đạt.

Không khớp mẫu `test_*.py` nên `pytest` mặc định không thu thập. Chạy riêng:
`python -m pytest tests/bugcheck_ph10_chatbot.py`.
"""
import pytest

from app.api.endpoints import chatbot as ep
from app.models.chatbot import ChatRequest
from app.services.nlu import classifier
from app.services.nlu.classifier import NluService


def test_tc_ph10_bot_09_body_user_id_is_not_login(monkeypatch, fake_redis):
    """TC_PH10_BOT_09: Khách KHÔNG có X-User-Id (chưa đăng nhập) nhưng tự gửi `user_id` trong body -> system prompt KHÔNG được
    khai 'Đã đăng nhập: Có'. Hiện tại `auth_user_id = x_user_id or str(request.userId)` nên body do client tự đặt được coi là
    danh tính đã xác thực (trái với chính chú thích bước 6 trong chatbot.py)."""
    seen = {}

    def fake_prompt(user_name, ctx, confidence="ok", user_id=None):
        seen["user_id"] = user_id
        return "SYSTEM"

    monkeypatch.setattr(ep.prompt_builder_service, "build_system_prompt", fake_prompt)
    monkeypatch.setattr(ep.product_rag_service, "generate_reply", lambda *a: "ok")
    monkeypatch.setattr(ep.nlu_service, "analyze", lambda text, history=None: {
        "intent": "general_chat", "sentiment": "neutral", "sentiment_score": 0.5, "order_id": None, "account_topic": "none"})
    req = ChatRequest(sessionId="s-guest", message="Xin chào", userId=999)
    ep.handle_chat_message(req, x_user_id=None, x_user_roles=None, authorization=None)
    assert seen["user_id"] is None, f"prompt nhận user_id={seen['user_id']!r} từ body client"


def test_tc_ph10_nlu_05_complaint_with_purchase_word_escalates(monkeypatch):
    """TC_PH10_NLU_05: Khiếu nại có chữ 'mua' ('Tôi mua tai nghe về bị hỏng, thất vọng quá') phải được nhận là complaint để chuyển nhân viên.
    Hiện tại heuristic dự phòng (khi LLM lỗi/thiếu key) kiểm tra PRODUCT_TERMS ('mua', 'tai nghe') TRƯỚC từ khoá khiếu nại -> product_search,
    khách đang bức xúc bị trả về danh sách sản phẩm."""
    def no_llm(*a, **k):
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    monkeypatch.setattr(classifier.llm_client, "generate_text", no_llm)
    out = NluService().analyze("Tôi mua tai nghe về bị hỏng, thất vọng quá")
    assert out["intent"] == "complaint", f"intent={out['intent']}"
