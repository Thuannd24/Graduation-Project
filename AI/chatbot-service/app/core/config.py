import os

from dotenv import load_dotenv
from pydantic import BaseModel

# Shared env file for every service under AI/ (AI/.env, gitignored — see AI/.env.example).
# This file lives at AI/chatbot-service/app/core/, so AI/ is 3 levels up.
_AI_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
load_dotenv(os.path.join(_AI_ROOT, ".env"))


class ChatbotSettings(BaseModel):
    PROJECT_NAME: str = "Chatbot Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8002

    # Model Configurations
    INTENT_MODEL_NAME: str = os.getenv("INTENT_MODEL_NAME", "vinai/phobert-base")
    SENTIMENT_MODEL_NAME: str = os.getenv("SENTIMENT_MODEL_NAME", "wonrax/phobert-base-vietnamese-sentiment")
    
    # Product search: AI/search-service's /api/v1/search is 100% mock data (no real
    # Elasticsearch/DB query anywhere in it), so product_search/price_inquiry call BE's
    # real product-service search directly instead — same read-only pattern as
    # ORDER_SERVICE_URL below.
    PRODUCT_SERVICE_URL: str = os.getenv("PRODUCT_SERVICE_URL", "http://localhost:8089")

    # LLM provider — see app/services/llm_client.py. DeepSeek is the only provider used;
    # there is no Gemini/OpenAI fallback despite comments to that effect in older docs.
    DEEPSEEK_MODEL_NAME: str = os.getenv("DEEPSEEK_MODEL_NAME", "deepseek-chat")

    # Policy RAG (FAISS) Settings
    POLICY_EMBEDDING_MODEL: str = os.getenv("POLICY_EMBEDDING_MODEL", "intfloat/multilingual-e5-base")
    POLICY_DATA_DIR: str = os.getenv("POLICY_DATA_DIR", "../../FE/src/assets/policies_source")
    POLICY_INDEX_DIR: str = os.getenv("POLICY_INDEX_DIR", "data/index")
    # Calibrated empirically against intfloat/multilingual-e5-base: its cosine scores are
    # compressed into a narrow high band (irrelevant queries still score ~0.78-0.80, relevant
    # ones ~0.82-0.86) — the round 0.75/0.65 cutoffs from the design doc never reject anything
    # with this model. Re-measure with scripts/build_policy_index.py if the model changes.
    POLICY_CONFIDENCE_OK: float = 0.82
    POLICY_CONFIDENCE_DISCLAIMER: float = 0.80

    # BE Microservices (read-only lookups, called directly, headers forwarded from API Gateway)
    ORDER_SERVICE_URL: str = os.getenv("ORDER_SERVICE_URL", "http://localhost:8082")
    USER_SERVICE_URL: str = os.getenv("USER_SERVICE_URL", "http://localhost:8085")
    PROMOTION_SERVICE_URL: str = os.getenv("PROMOTION_SERVICE_URL", "http://localhost:8087")

    # Escalation endpoint / webhook (Slack / Telegram / internal BE Zalo)
    ESCALATION_WEBHOOK_URL: str = os.getenv("ESCALATION_WEBHOOK_URL", "")

chatbot_settings = ChatbotSettings()
