from fastapi import FastAPI
from app.core.config import chatbot_settings
from app.api.endpoints import chatbot
from app.services.rag import policy_rag_service
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=chatbot_settings.PROJECT_NAME,
    description="Microservice for RAG Chatbot, Intent Classification, and Sentiment Analysis",
    version="1.0.0"
)


@app.on_event("startup")
def _warm_up_policy_rag() -> None:
    # Blocking on purpose: pay the one-time embedding-model load cost here, before this
    # service accepts any traffic, instead of on whichever user's message happens to be
    # the first policy_faq question (see PolicyRagService.warm_up docstring for why that
    # was causing false "connection error" reports in the frontend).
    logger.info("Warming up Policy RAG (embedding model + FAISS index)...")
    policy_rag_service.warm_up()
    logger.info("Policy RAG warm-up done.")

# No CORSMiddleware here on purpose: every real browser request reaches this service through
# the API Gateway (BE/api-gateway/.../CorsConfig.java), which already sets CORS headers for
# the whole system. Adding a second CORS layer here produced duplicate Access-Control-Allow-
# Origin headers in the final response — browsers reject responses with more than one, so
# every browser call failed with a generic network error even though this service itself
# returned 200. Direct curl/server-to-server calls are unaffected either way (CORS is a
# browser-only enforcement mechanism).

app.include_router(chatbot.router, prefix=chatbot_settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": chatbot_settings.PROJECT_NAME,
        "intent_model": chatbot_settings.INTENT_MODEL_NAME,
        "sentiment_model": chatbot_settings.SENTIMENT_MODEL_NAME
    }
