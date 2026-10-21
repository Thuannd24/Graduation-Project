from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from app.models.chatbot import ChatRequest, EscalationRequest
from app.services.nlu import nlu_service
from app.services.nlu.price_range import parse_price_range, strip_diacritics
from app.services.memory import memory_manager_service
from app.services.prompt import prompt_builder_service
from app.services.rag import product_rag_service, policy_rag_service
from app.services import tools
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

OFFTOPIC_MSG = (
    "Xin lỗi bạn, Aura chỉ có thể hỗ trợ các vấn đề liên quan đến mua sắm và dịch vụ "
    "của AuraTech thôi nhé. Aura có thể giúp bạn tìm sản phẩm, tra đơn hàng hoặc giải đáp "
    "chính sách bảo hành không? 😊"
)
POLICY_REJECT_MSG = (
    "Aura chưa có đủ thông tin để trả lời chính xác câu hỏi này. Bạn vui lòng liên hệ "
    "tổng đài 0389.468.847 để được tư vấn chi tiết hơn nhé! 😊"
)
NO_ORDER_ID_MSG = "Bạn cho Aura biết mã đơn hàng (ví dụ #123) để tra cứu giúp bạn nhé."

# Intents that should surface to the frontend as "escalate" so AIChatbotWidget triggers
# its existing handover-to-staff flow (see FE/src/features/chatbot/components/AIChatbotWidget.jsx).
ESCALATING_INTENTS = {"complaint"}

HANDOFF_NOTE = (
    "\n\nAura xin lỗi vì chưa giúp được bạn như mong muốn. Aura đang kết nối bạn với nhân viên hỗ trợ "
    "để giải quyết nhanh hơn nhé."
)
# Hỏi lại cùng một câu (đã chuẩn hoá) từ lần thứ 3 trở đi (2 lần trước đó trong cửa sổ lịch sử) -> bot
# trả lời chưa thoả đáng, chuyển người thật.
REPEAT_THRESHOLD = 2
# Chỉ với câu trả lời do RAG/LLM soạn. Hỏi lại trạng thái đơn / điểm / voucher là bình thường (số liệu đổi
# theo thời gian, hoặc khách chưa đăng nhập) — không phải dấu hiệu bot trả lời sai.
REPEAT_HANDOFF_INTENTS = {"product_search", "price_inquiry", "policy_faq", "general_chat"}
# Cảm xúc tiêu cực chỉ tự chuyển người khi KHÔNG phải câu hỏi sản phẩm/giá/chính sách: "đắt quá" khi hỏi
# giá là bình thường, không cần nhân viên.
NO_SENTIMENT_HANDOFF_INTENTS = {"product_search", "price_inquiry", "policy_faq", "off_topic"}
# Câu hỏi gợi ý/tư vấn mua sắm mà NLU (LLM hoặc heuristic) hay xếp nhầm vào off_topic/general_chat.
SHOPPING_MARKERS = ["qua tang", "goi y", "tu van", "nen mua", "can mua", "muon mua"]


def _text(message: str) -> Dict[str, Any]:
    return {"message": message, "card": None}


def _route_order_tracking(order_id: Optional[int], user_id: Optional[str], user_roles: Optional[str], authorization: Optional[str]) -> Dict[str, Any]:
    if not user_id or not authorization:
        return _text(tools.LOGIN_REQUIRED_MSG)
    if not order_id:
        # Đã đăng nhập: tự liệt kê đơn gần nhất thay vì hỏi lại mã đơn. Chỉ hỏi mã khi không tra được.
        return tools.list_recent_orders(user_id, user_roles, authorization) or _text(NO_ORDER_ID_MSG)
    return tools.get_order_status(order_id, user_id, user_roles, authorization)


def _route_order_action(account_topic: str, order_id: Optional[int], user_id: Optional[str], user_roles: Optional[str], authorization: Optional[str]) -> Dict[str, Any]:
    if account_topic == "cancel":
        return _text(tools.CANCEL_ORDER_GUIDE)

    if not user_id or not authorization:
        return _text(tools.LOGIN_REQUIRED_MSG)

    if account_topic == "points":
        return tools.get_loyalty_points(user_id, user_roles, authorization)
    if account_topic == "voucher":
        return tools.get_user_vouchers(user_id, user_roles, authorization)
    if account_topic == "warranty":
        if not order_id:
            return _text("Bạn cho Aura biết mã đơn hàng (ví dụ #123) để tra bảo hành giúp bạn nhé.")
        return tools.get_warranty_info(order_id, user_id, user_roles, authorization)

    return _text("Aura chưa rõ bạn cần tra cứu thông tin gì, bạn có thể nói cụ thể hơn được không?")


def _map_products(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Maps product-service's ProductDocument shape (BE/product-service/.../entity/
    ProductDocument.java) to the AIProduct shape the widget renders
    (FE/src/services/aiApi.ts).
    """
    products = []
    for item in items:
        sale_price = item.get("salePrice")
        products.append({
            "id": item.get("id"),
            "name": item.get("name", ""),
            "price": sale_price if sale_price is not None else item.get("price", 0),
            "oldPrice": item.get("price") if sale_price is not None else None,
            "image": item.get("imageUrl", ""),
            "brand": item.get("brand", ""),
            "category": item.get("categoryName", ""),
            "rating": item.get("ratingAvg"),
        })
    return products


def _normalize_question(text: str) -> str:
    return " ".join(strip_diacritics(text.lower()).replace("?", " ").replace("!", " ").replace(".", " ").split())


def _is_repeated_question(message: str, history: List[Dict[str, Any]]) -> bool:
    current = _normalize_question(message)
    if len(current) < 4:
        return False  # "ok", "ừ", "#1" lặp lại là bình thường
    previous = [_normalize_question(h.get("content") or "") for h in history if h.get("role") == "user"]
    return sum(1 for p in previous if p == current) >= REPEAT_THRESHOLD


def _handoff_reason(nlu: Dict[str, Any], intent: str, message: str, history: List[Dict[str, Any]]) -> Optional[str]:
    if intent in ESCALATING_INTENTS:
        return None  # đã escalate theo intent
    if intent in REPEAT_HANDOFF_INTENTS and _is_repeated_question(message, history):
        return "repeated_question"
    if (nlu.get("sentiment") == "negative" and nlu.get("sentiment_score", 0) > 0.80
            and intent not in NO_SENTIMENT_HANDOFF_INTENTS):
        return "negative_sentiment"
    return None


def _shopping_override(intent: str, message: str) -> str:
    """Câu hỏi có khoảng giá / gợi ý quà tặng là tìm sản phẩm, không phải lạc đề hay chào hỏi. Chỉ ghi đè
    off_topic/general_chat — policy_faq ("miễn phí ship cho đơn trên 500k?") giữ nguyên."""
    if intent not in ("off_topic", "general_chat"):
        return intent
    plain = strip_diacritics(message.lower())
    if parse_price_range(message) is not None or any(m in plain for m in SHOPPING_MARKERS):
        return "product_search"
    return intent


def _reply(
    session_id: str, intent: str, message: str,
    products: Optional[List[Dict[str, Any]]] = None,
    card: Optional[Dict[str, Any]] = None,
    handoff_reason: Optional[str] = None,
) -> Dict[str, Any]:
    escalate = intent in ESCALATING_INTENTS or handoff_reason is not None
    if handoff_reason:
        message += HANDOFF_NOTE
    memory_manager_service.add_message(session_id=session_id, role="bot", content=message)
    response = {
        "message": message,
        "intent": "escalate" if escalate else intent,
        "products": products or [],
        "card": card,
    }
    if handoff_reason:
        response["handoffReason"] = handoff_reason
    return response


@router.post("/chat")
@router.post("/chatbot/message")
def handle_chat_message(
    request: ChatRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_roles: Optional[str] = Header(None, alias="X-User-Roles"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Defined as a plain (sync) function on purpose: everything inside — NLU, product/
    policy RAG, tools.py lookups, the DeepSeek call — is blocking `requests.*` I/O, no
    real `await` anywhere. FastAPI runs sync path functions in a worker thread pool, so
    one slow chat request no longer blocks the whole event loop's other requests the way
    an `async def` with the same blocking calls would.
    """
    try:
        session_id = request.sessionId
        user_message = request.message

        # Identity comes ONLY from the gateway-verified X-User-Id header. request.userId is a
        # client-supplied body field: treating it as identity let a guest claim to be logged in
        # (TC_PH10_BOT_09). It is ignored for identity.
        auth_user_id = x_user_id or None

        # Fetched before NLU (not just before the LLM call) so the NLU prompt can see the
        # last turn — e.g. resolve a bare "#1" reply to order_tracking when Aura's previous
        # message just asked "cho Aura biết mã đơn hàng". Without this, every message is
        # classified in isolation and a bare order-id reply looks like general_chat.
        chat_history = memory_manager_service.get_history(session_id)

        # 1. NLU: intent + sentiment + order_id + account_topic in one pass (see
        # app/services/nlu/classifier.py for why this replaced 3 separate keyword heuristics).
        nlu = nlu_service.analyze(user_message, chat_history)
        intent = _shopping_override(nlu["intent"], user_message)
        handoff = _handoff_reason(nlu, intent, user_message, chat_history)

        # 2. Save user message to history
        memory_manager_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message,
            metadata={"intent": intent, "sentiment": nlu["sentiment"]}
        )

        # 3. Check for immediate escalation
        if handoff:
            # Khách bực bội / hỏi lặp lại: trả intent "escalate" -> widget tự chuyển sang nhân viên.
            logger.warning(f"Handoff to human ({handoff}, sentiment_score={nlu['sentiment_score']}): session {session_id}")

        # 4. Deterministic, no-LLM branches: order lookups & off-topic guardrail
        if intent == "order_tracking":
            result = _route_order_tracking(nlu["order_id"], auth_user_id, x_user_roles, authorization)
            return _reply(session_id, intent, result["message"], card=result["card"], handoff_reason=handoff)
        if intent == "order_action":
            result = _route_order_action(nlu["account_topic"], nlu["order_id"], auth_user_id, x_user_roles, authorization)
            return _reply(session_id, intent, result["message"], card=result["card"], handoff_reason=handoff)
        if intent == "off_topic":
            return _reply(session_id, intent, OFFTOPIC_MSG)

        # 5. RAG branches: product/price search and policy FAQ
        retrieved_context_str = ""
        items = []
        confidence = "ok"
        citation_titles = []

        if intent in ["product_search", "price_inquiry"]:
            price_range = parse_price_range(user_message)
            if price_range is not None:
                # "tai nghe dưới 500 nghìn": tìm theo loại SP rồi lọc ĐÚNG khoảng giá (trước đây tìm theo
                # chữ số "500" và ra laptop 10–25 triệu).
                items, note = product_rag_service.retrieve_in_price_range(user_message, price_range)
                retrieved_context_str = product_rag_service.format_context_string(items, note)
            else:
                items = product_rag_service.retrieve_context(user_message)
                retrieved_context_str = product_rag_service.format_context_string(items)
        elif intent == "policy_faq":
            items = policy_rag_service.retrieve(user_message)
            if not items:
                confidence = "ok"
                retrieved_context_str = "Tư vấn các chính sách bảo hành, đổi trả, giao hàng của AuraTech."
            else:
                max_score = max((item["score"] for item in items), default=0.0)
                confidence = policy_rag_service.classify_confidence(max_score)

                if confidence == "reject":
                    return _reply(session_id, intent, POLICY_REJECT_MSG, handoff_reason=handoff)

                retrieved_context_str = policy_rag_service.format_context_string(items)
                citation_titles = list(dict.fromkeys(item["title"] for item in items))

        # 6. Build system prompt (base rules + retrieved context + logged-in user info).
        # Login state must come from auth_user_id (gateway-verified X-User-Id header), not
        # request.userId (client-supplied body field) — the frontend never actually sends
        # user_id in the body (see FE/src/services/aiApi.ts sendMessage), so using it here
        # meant the LLM never learned the customer was logged in and could ask redundantly
        # ("bạn đã đăng nhập chưa?") even when they clearly were.
        user_name = f"User #{auth_user_id}" if auth_user_id else "Khách hàng"
        system_prompt = prompt_builder_service.build_system_prompt(
            user_name, retrieved_context_str, confidence=confidence, user_id=auth_user_id
        )

        # 7. Call the LLM with the history fetched in step 1 (still correct here: it was
        # fetched before this turn's user message was saved, so it doesn't duplicate
        # `user_message`, which is passed separately below).
        response_text = product_rag_service.generate_reply(system_prompt, chat_history, user_message)

        if citation_titles:
            response_text += "\n\nTheo: " + ", ".join(citation_titles)

        # 8. Save bot reply to history and respond
        products = _map_products(items) if intent in ["product_search", "price_inquiry"] else []
        return _reply(session_id, intent, response_text, products, handoff_reason=handoff)

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/sessions/{session_id}/history")
def get_session_history(session_id: str):
    history = memory_manager_service.get_history(session_id)
    return {"history": history}

@router.post("/chat/sessions/escalate")
@router.post("/chatbot/escalate")
def escalate_session(request: EscalationRequest):
    logger.info(f"Manual escalation requested for session {request.sessionId}. Reason: {request.reason}")
    # In production, makes a PUT call to BE user-service or notification service
    return {"status": "SUCCESS", "message": "Session escalated to human agent."}
