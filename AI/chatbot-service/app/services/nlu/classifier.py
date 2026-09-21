import json
from typing import Any, Dict, List, Optional

from app.services import llm_client
from app.services.nlu import heuristics
from app.services import tools
from shared_common.logger import get_logger

logger = get_logger(__name__)

VALID_INTENTS = [
    "product_search", "price_inquiry", "order_tracking", "order_action",
    "policy_faq", "complaint", "off_topic", "general_chat",
]
VALID_SENTIMENTS = ["positive", "neutral", "negative"]
VALID_ACCOUNT_TOPICS = ["cancel", "points", "voucher", "warranty", "none"]

# Fixed representative scores kept for backward compatibility with the escalation
# threshold check in chatbot.py (sentiment_res['score'] > 0.80) — an LLM label alone
# doesn't produce a comparable magnitude, and the heuristic fallback never did either.
SENTIMENT_SCORES = {"negative": 0.85, "positive": 0.90, "neutral": 0.50}

NLU_SYSTEM_PROMPT = """Bạn là bộ phân tích ngôn ngữ tự nhiên (NLU) cho chatbot bán lẻ công nghệ AuraTech.
Đọc câu hỏi của khách (và lịch sử hội thoại gần nhất nếu có) rồi trả về JSON với các trường sau.

Nếu tin nhắn hiện tại của khách rất ngắn/không rõ nghĩa một mình (ví dụ chỉ có "#1", "123",
"có" ,"ừ"), hãy xem tin nhắn TRƯỚC ĐÓ của Aura trong lịch sử để suy ra ý định thật sự — ví dụ
nếu Aura vừa hỏi "cho Aura biết mã đơn hàng" thì "#1" nghĩa là khách đang cung cấp mã đơn cho
đúng nhu cầu đã hỏi trước đó (order_tracking hoặc order_action tuỳ ngữ cảnh), KHÔNG phải
general_chat.

intent — đúng 1 nhãn trong danh sách:
- product_search: tìm, so sánh, hoặc hỏi tư vấn chọn sản phẩm (không hỏi giá cụ thể).
- price_inquiry: hỏi GIÁ hoặc khuyến mãi của MỘT sản phẩm cụ thể.
- order_tracking: hỏi trạng thái/vị trí một đơn hàng CỤ THỂ (có mã đơn hoặc "đơn hàng của tôi").
- order_action: khách MUỐN THỰC HIỆN NGAY một hành động lên đơn/tài khoản của chính họ, hoặc hỏi
  SỐ LIỆU CÁ NHÂN của họ — "huỷ đơn CỦA TÔI" (ý muốn huỷ thật, không phải hỏi quy định), điểm
  thưởng CỦA TÔI hiện có bao nhiêu, voucher CỦA TÔI, bảo hành đơn CỦA TÔI. KHÔNG dùng cho câu hỏi
  chung về QUY ĐỊNH/HẬU QUẢ liên quan (ví dụ "huỷ đơn thì hoàn tiền/voucher/điểm thế nào" là hỏi
  quy định chung → dùng policy_faq, dù có chữ "huỷ").
- policy_faq: MẶC ĐỊNH cho mọi câu hỏi về cách AuraTech vận hành/phục vụ khách mà không phải hỏi
  số liệu cá nhân của khách — chính sách đổi trả, bảo hành, vận chuyển, thanh toán, điểm thưởng,
  hạng thành viên, hậu quả khi huỷ đơn (hoàn tiền/voucher/điểm), tài khoản (quên mật khẩu, đăng
  nhập), hệ thống cửa hàng/địa chỉ, sao lưu dữ liệu, quy trình thu cũ đổi mới, lỗi thao tác trên
  web/app, hoặc bất kỳ câu hỏi nào liên quan tới dịch vụ của AuraTech mà không khớp rõ vào các
  nhãn khác. Nếu không có context để trả lời, hệ thống sẽ tự nói "chưa có thông tin" — KHÔNG vì
  vậy mà xếp câu hỏi này vào off_topic.
- complaint: phàn nàn, khiếu nại về trải nghiệm mua hàng/sản phẩm/dịch vụ.
- off_topic: CHỈ dùng khi câu hỏi HOÀN TOÀN không liên quan tới AuraTech/mua sắm/công nghệ/dịch
  vụ khách hàng — ví dụ toán học, thời tiết, chính trị, tán gẫu ngoài lề. Đây là nhãn hiếm gặp
  nhất; nếu phân vân giữa off_topic và policy_faq, LUÔN chọn policy_faq.
- general_chat: chào hỏi, cảm ơn, hỏi bot là ai/làm được gì — KHÔNG dùng cho câu hỏi ngoài
  phạm vi (những câu đó dùng off_topic).

sentiment — đúng 1 nhãn: "positive" | "neutral" | "negative" (cảm xúc của khách trong câu này).

order_id — mã đơn hàng khách đề cập, dạng số dưới dạng chuỗi (ví dụ "123"). Chuỗi rỗng "" nếu
không có mã đơn nào trong câu.

account_topic — CHỈ điền khi intent là order_action, chọn đúng 1 trong: "cancel" (khách thực sự
muốn huỷ đơn của họ ngay, không phải hỏi quy định huỷ đơn), "points" (hỏi điểm thưởng của mình),
"voucher" (hỏi voucher của mình), "warranty" (hỏi bảo hành đơn của mình). Nếu intent khác
order_action hoặc không rõ, điền "none".

Chỉ trả JSON, không giải thích thêm."""

NLU_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "intent": {"type": "STRING", "enum": VALID_INTENTS},
        "sentiment": {"type": "STRING", "enum": VALID_SENTIMENTS},
        "order_id": {"type": "STRING"},
        "account_topic": {"type": "STRING", "enum": VALID_ACCOUNT_TOPICS},
    },
    "required": ["intent", "sentiment", "order_id", "account_topic"],
}

# Kept in nlu.py (not chatbot.py) since off_topic classification is now this service's
# job — chatbot.py only ever sees the final intent label.
DOMAIN_KEYWORDS = [
    "sản phẩm", "giá", "đơn hàng", "đơn ", "bảo hành", "đổi trả", "giao hàng", "ship",
    "voucher", "giảm giá", "điểm thưởng", "thanh toán", "trả góp", "hóa đơn", "hoá đơn",
    "cửa hàng", "khiếu nại", "lỗi", "hỏng", "auratech", "aura", "iphone", "samsung",
    "laptop", "macbook", "điện thoại", "máy tính", "tai nghe", "phụ kiện",
    "mật khẩu", "đăng nhập", "tài khoản", "sao lưu", "dữ liệu", "thu cũ", "đổi mới",
    "nhân viên", "vnpay", "cod",
]
GREETING_KEYWORDS = ["chào", "hi", "hello", "cảm ơn", "thank", "bạn là ai", "giúp gì", "giúp được"]

ACCOUNT_TOPIC_KEYWORDS = {
    "cancel": ["huỷ", "hủy"],
    "points": ["điểm thưởng", "điểm tích", "point"],
    "voucher": ["voucher", "mã giảm giá"],
    "warranty": ["bảo hành"],
}


class NluService:
    """
    Single LLM call per message that replaces what used to be 3 separate heuristics
    (intent keywords, sentiment keywords, off-topic keywords) plus a regex order_id
    extraction and another keyword pass to figure out which order_action sub-tool to
    call. Those heuristics kept colliding — e.g. "bao nhiêu" alone can't tell "giá bao
    nhiêu" (price) apart from "chi tiêu bao nhiêu để lên hạng" (membership policy); an
    LLM reading the actual meaning doesn't have that problem. Falls back to
    app.services.nlu.heuristics only when no LLM provider is configured or the call fails.
    """

    def analyze(self, text: str, chat_history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        # Only the last turn (bot question + user reply) is passed — enough to resolve a
        # bare "#1" reply after Aura just asked "cho Aura biết mã đơn hàng", without paying
        # the token cost of the full history on every single NLU call.
        recent_history = (chat_history or [])[-2:]
        try:
            raw = llm_client.generate_text(NLU_SYSTEM_PROMPT, recent_history, text, response_schema=NLU_SCHEMA)
            data = json.loads(raw)
            result = self._validate(data)
            result["source"] = "llm"
            logger.info(f"NLU (LLM): {result}")
            return result
        except Exception as e:
            logger.error(f"NLU LLM call failed, falling back to heuristics: {e}")
            result = self._heuristic_fallback(text)
            result["source"] = "heuristic"
            logger.info(f"NLU (heuristic): {result}")
            return result

    def _validate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        intent = data.get("intent")
        if intent not in VALID_INTENTS:
            raise ValueError(f"invalid intent from LLM: {intent!r}")

        sentiment = data.get("sentiment")
        if sentiment not in VALID_SENTIMENTS:
            sentiment = "neutral"

        order_id: Optional[int] = None
        raw_order_id = str(data.get("order_id") or "").strip()
        if raw_order_id.isdigit():
            order_id = int(raw_order_id)

        account_topic = data.get("account_topic")
        if account_topic not in VALID_ACCOUNT_TOPICS:
            account_topic = "none"

        return {
            "intent": intent,
            "sentiment": sentiment,
            "sentiment_score": SENTIMENT_SCORES[sentiment],
            "order_id": order_id,
            "account_topic": account_topic,
        }

    def _heuristic_fallback(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()

        intent = heuristics.predict_intent(text)
        if intent == "general_chat" and self._is_offtopic(text_lower):
            intent = "off_topic"

        sentiment = heuristics.analyze_sentiment(text)

        order_id = tools.extract_order_id(text_lower)

        account_topic = "none"
        if intent == "order_action":
            for topic, keywords in ACCOUNT_TOPIC_KEYWORDS.items():
                if any(k in text_lower for k in keywords):
                    account_topic = topic
                    break

        return {
            "intent": intent,
            "sentiment": sentiment,
            "sentiment_score": SENTIMENT_SCORES[sentiment],
            "order_id": order_id,
            "account_topic": account_topic,
        }

    @staticmethod
    def _is_offtopic(text_lower: str) -> bool:
        if any(w in text_lower for w in DOMAIN_KEYWORDS):
            return False
        if any(w in text_lower for w in GREETING_KEYWORDS):
            return False
        return True


nlu_service = NluService()
