from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import chatbot_settings
from app.api.endpoints import chatbot
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=chatbot_settings.PROJECT_NAME,
    description="Microservice for RAG Chatbot, Intent Classification, and Sentiment Analysis",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chatbot.router, prefix=chatbot_settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": chatbot_settings.PROJECT_NAME,
        "intent_model": chatbot_settings.INTENT_MODEL_NAME,
        "sentiment_model": chatbot_settings.SENTIMENT_MODEL_NAME
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting {chatbot_settings.PROJECT_NAME} on port {chatbot_settings.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=chatbot_settings.PORT, reload=True)
