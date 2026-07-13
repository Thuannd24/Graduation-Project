import os
from pydantic import BaseModel

class ChatbotSettings(BaseModel):
    PROJECT_NAME: str = "Chatbot Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8002
    
    # Model Configurations
    INTENT_MODEL_NAME: str = os.getenv("INTENT_MODEL_NAME", "vinai/phobert-base")
    SENTIMENT_MODEL_NAME: str = os.getenv("SENTIMENT_MODEL_NAME", "wonrax/phobert-base-vietnamese-sentiment")
    
    # RAG Settings
    SEARCH_SERVICE_URL: str = os.getenv("SEARCH_SERVICE_URL", "http://localhost:8001")
    
    # Escalation endpoint / webhook (Slack / Telegram / internal BE Zalo)
    ESCALATION_WEBHOOK_URL: str = os.getenv("ESCALATION_WEBHOOK_URL", "")

chatbot_settings = ChatbotSettings()
