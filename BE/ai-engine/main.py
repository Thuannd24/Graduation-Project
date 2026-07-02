import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="E-commerce AI Engine Service",
    description="Service for LLM RAG, Dynamic Pricing, RFM and Demand Forecasting",
    version="1.0.0"
)

# Configuration - default localhost (override via env vars when deploy EC2)
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/ecommerce_product_nosql")
ELASTICSEARCH_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3308"))

class ChatRequest(BaseModel):
    sessionId: str
    userId: Optional[int] = None
    message: str

class PricingRequest(BaseModel):
    userId: int
    productId: int
    customerTier: str
    segmentationLabel: str
    cartTotal: float

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "redis_host": REDIS_HOST,
        "mongo_uri": MONGO_URI,
        "elasticsearch": ELASTICSEARCH_HOST,
        "database": f"{DB_HOST}:{DB_PORT}"
    }

@app.post("/api/ai/pricing/predict")
def predict_price_sensitivity(request: PricingRequest):
    # Mock dynamic pricing scoring logic (0.0 to 1.0)
    # Price sensitivity logic: high sensitivity = give discount, low sensitivity = no discount
    p_score = 0.5
    if request.segmentationLabel == "At Risk":
        p_score = 0.8
    elif request.customerTier == "VIP":
        p_score = 0.3
        
    action = "GIVE_HIGH_DISCOUNT" if p_score >= 0.7 else "GIVE_LOW_DISCOUNT" if p_score >= 0.4 else "NO_DISCOUNT"
    
    return {
        "aiPriceScore": p_score,
        "recommendedAction": action
    }

@app.post("/api/ai/chat/stream")
def chat_bot_interaction(request: ChatRequest):
    # Simple reply (in production this uses LlamaIndex/LangChain & ES k-NN vector search)
    return {
        "response": f"Xin chào! Tôi đã nhận được tin nhắn của bạn: '{request.message}'. Tôi đang tìm kiếm các sản phẩm phù hợp nhất trong kho hàng.",
        "sessionId": request.sessionId
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
