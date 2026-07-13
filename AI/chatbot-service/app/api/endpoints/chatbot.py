from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.models.chatbot import ChatRequest, EscalationRequest
from app.services.intent import intent_classifier_service
from app.services.sentiment import sentiment_analyzer_service
from app.services.memory import memory_manager_service
from app.services.prompt import prompt_builder_service
from app.services.rag import rag_engine_service
from shared_common.logger import get_logger
import datetime
import requests
import json

logger = get_logger(__name__)
router = APIRouter()

@router.post("/chat")
@router.post("/chatbot/message")
async def chat_stream(request: ChatRequest):
    try:
        session_id = request.sessionId
        user_message = request.message
        user_id = request.userId
        
        # 1. Intent Classification
        intent = intent_classifier_service.predict_intent(user_message)
        logger.info(f"Intent classified: {intent}")
        
        # 2. Sentiment Analysis
        sentiment_res = sentiment_analyzer_service.analyze_sentiment(user_message)
        logger.info(f"Sentiment: {sentiment_res}")
        
        # Save user message to history
        memory_manager_service.add_message(
            session_id=session_id,
            role="user",
            content=user_message,
            metadata={"intent": intent, "sentiment": sentiment_res['label']}
        )
        
        # 3. Retrieve context if needed
        retrieved_context_str = ""
        items = []
        if intent in ["product_search", "price_inquiry"]:
            items = rag_engine_service.retrieve_context(user_message)
            retrieved_context_str = rag_engine_service.format_context_string(items)
            
        # 4. Fetch chat history
        chat_history = memory_manager_service.get_history(session_id)
        
        # 5. Build system prompt
        user_name = f"User #{user_id}" if user_id else "Khách hàng"
        system_prompt = prompt_builder_service.build_system_prompt(user_name, retrieved_context_str)
        
        # Check for immediate escalation
        if sentiment_res['label'] == "negative" and sentiment_res['score'] > 0.80:
            logger.warning(f"Negative sentiment score too high ({sentiment_res['score']})! Escalating session: {session_id}")
            # In production, triggers Zalo/Slack notification
            
        async def event_generator():
            # Send initial metadata chunk
            metadata_payload = {
                "intent": intent,
                "sentiment": sentiment_res['label'],
                "retrievedItems": items
            }
            yield f"data: {json.dumps({'metadata': metadata_payload})}\n\n"
            
            # Stream the LLM response
            full_response_text = ""
            async for chunk in rag_engine_service.generate_response_stream(system_prompt, chat_history, user_message):
                # Extract clean chunk text
                try:
                    data_str = chunk.replace("data: ", "").strip()
                    if data_str:
                        payload = json.loads(data_str)
                        if "chunk" in payload:
                            full_response_text += payload["chunk"]
                except Exception:
                    pass
                yield chunk
                
            # After generation, save bot reply to history
            memory_manager_service.add_message(
                session_id=session_id,
                role="bot",
                content=full_response_text
            )
            
        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        logger.error(f"Error in chat stream endpoint: {e}")
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
