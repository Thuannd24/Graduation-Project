from app.core.config import chatbot_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

class IntentClassifierService:
    def __init__(self):
        logger.info(f"Initializing IntentClassifier with {chatbot_settings.INTENT_MODEL_NAME}...")
        # PhoBERT sequence classification model would be initialized here
        self.model = None

    def predict_intent(self, text: str) -> str:
        """
        Classifies user query into one of the following:
        - product_search
        - price_inquiry
        - order_tracking
        - policy_faq
        - complaint
        - general_chat
        """
        logger.info(f"Predicting intent for text: '{text}'")
        text_lower = text.lower()
        
        # Simple heuristic rule engine as a fallback / baseline
        if any(w in text_lower for w in ["tìm", "mua", "kiếm", "bán", "có gì", "xem áo", "xem giày"]):
            return "product_search"
        elif any(w in text_lower for w in ["giá", "bao nhiêu", "nhiêu", "bán mấy", "đắt", "rẻ"]):
            return "price_inquiry"
        elif any(w in text_lower for w in ["đơn hàng", "ship", "giao chưa", "mã vận đơn", "tracking", "vận chuyển"]):
            return "order_tracking"
        elif any(w in text_lower for w in ["đổi trả", "bảo hành", "hoàn tiền", "chính sách"]):
            return "policy_faq"
        elif any(w in text_lower for w in ["lỗi", "hỏng", "kém", "chậm", "bức xúc", "tệ", "lừa đảo"]):
            return "complaint"
        
        return "general_chat"

intent_classifier_service = IntentClassifierService()
