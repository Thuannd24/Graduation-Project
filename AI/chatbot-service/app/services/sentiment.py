from app.core.config import chatbot_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

class SentimentAnalyzerService:
    def __init__(self):
        logger.info(f"Initializing SentimentAnalyzer with {chatbot_settings.SENTIMENT_MODEL_NAME}...")
        # ONNX or Hugging Face pipeline loaded here
        self.model = None

    def analyze_sentiment(self, text: str) -> dict:
        """
        Analyzes user sentiment. Returns label (positive, neutral, negative) and score.
        """
        logger.info(f"Analyzing sentiment for text: '{text}'")
        text_lower = text.lower()
        
        # Heuristics baseline
        negative_words = ["tệ", "lỗi", "chậm", "kém", "bực", "hoàn tiền", "đắt", "hỏng", "không dùng được"]
        positive_words = ["tốt", "đẹp", "nhanh", "ok", "tuyệt", "xịn", "thích", "cảm ơn", "yêu"]
        
        neg_count = sum(1 for w in negative_words if w in text_lower)
        pos_count = sum(1 for w in positive_words if w in text_lower)
        
        if neg_count > pos_count:
            return {"label": "negative", "score": 0.85}
        elif pos_count > neg_count:
            return {"label": "positive", "score": 0.90}
            
        return {"label": "neutral", "score": 0.50}

sentiment_analyzer_service = SentimentAnalyzerService()
