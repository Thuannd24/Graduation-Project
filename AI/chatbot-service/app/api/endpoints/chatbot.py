from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from app.models.chatbot import ChatRequest, EscalationRequest
from app.services.nlu import nlu_service
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


def _text(message: str) -> Dict[str, Any]:
    return {"message": message, "card": None}


def _route_order_tracking(order_id: Optional[int], user_id: Optional[str], user_roles: Optional[str], authorization: Optional[str]) -> Dict[str, Any]:
    if not user_id or not authorization:
        return _text(tools.LOGIN_REQUIRED_MSG)
    if not order_id:
        return _text(NO_ORDER_ID_MSG)
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


def _reply(
    session_id: str, intent: str, message: str,
    products: Optional[List[Dict[str, Any]]] = None,
    card: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    memory_manager_service.add_message(session_id=session_id, role="bot", content=message)
    return {
        "message": message,
        "intent": "escalate" if intent in ESCALATING_INTENTS else intent,
        "products": products or [],
        "card": card,
    }


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
        user_id = request.userId

        # Prefer the gateway-verified header; request.userId is only a display fallback.
        auth_user_id = x_user_id or (str(user_id) if user_id else None)

        # Fetched before NLU (not just before the LLM call) so the NLU prompt can see the
        # last turn — e.g. resolve a bare "#1" reply to order_tracking when Aura's previous
        # message just asked "cho Aura biết mã đơn hàng". Without this, every message is
        # classified in isolation and a bare order-id reply looks like general_chat.
        chat_history = memory_manager_service.get_history(session_id)

        # 1. NLU: intent + sentiment + order_id + account_topic in one pass (see
        # app/services/nlu/classifier.py for why this replaced 3 separate keyword heuristics).
        nlu = nlu_service.analyze(user_message, chat_history)
        intent = nlu["intent"]

        # 2. Save user message to history
        memory_manager_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message,
            metadata={"intent": intent, "sentiment": nlu["sentiment"]}
        )

        # 3. Check for immediate escalation
        if nlu["sentiment"] == "negative" and nlu["sentiment_score"] > 0.80:
            logger.warning(f"Negative sentiment score too high ({nlu['sentiment_score']})! Escalating session: {session_id}")
            # In production, triggers Zalo/Slack notification

        # 4. Deterministic, no-LLM branches: order lookups & off-topic guardrail
        if intent == "order_tracking":
            result = _route_order_tracking(nlu["order_id"], auth_user_id, x_user_roles, authorization)
            return _reply(session_id, intent, result["message"], card=result["card"])
        if intent == "order_action":
            result = _route_order_action(nlu["account_topic"], nlu["order_id"], auth_user_id, x_user_roles, authorization)
            return _reply(session_id, intent, result["message"], card=result["card"])
        if intent == "off_topic":
            return _reply(session_id, intent, OFFTOPIC_MSG)

        # 5. RAG branches: product/price search and policy FAQ
        retrieved_context_str = ""
        items = []
        confidence = "ok"
        citation_titles = []

        if intent in ["product_search", "price_inquiry"]:
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
                    return _reply(session_id, intent, POLICY_REJECT_MSG)

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
        return _reply(session_id, intent, response_text, products)

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
