from typing import List, Dict, Any
from shared_common.logger import get_logger

logger = get_logger(__name__)

class PromptBuilderService:
    @staticmethod
    def build_system_prompt(user_name: str, retrieved_context: str) -> str:
        system_instructions = (
            "Bạn là trợ lý mua sắm AI thông minh, thân thiện và chuyên nghiệp của shop.\n"
            "Hãy trả lời khách hàng bằng tiếng Việt tự nhiên, ngắn gọn và súc tích (tối đa 3-4 câu).\n"
            "Chỉ tư vấn và sử dụng THÔNG TIN SẢN PHẨM được cung cấp dưới đây.\n"
            "Nếu thông tin không có trong phần sản phẩm hoặc bạn không biết câu trả lời, hãy lịch sự nói:\n"
            "'Để tôi kiểm tra lại thông tin này với bộ phận hỗ trợ kỹ thuật nhé'.\n"
            "Tuyệt đối KHÔNG tự bịa đặt giá cả, số lượng tồn kho hay các tính năng không có trong tài liệu.\n\n"
            f"--- THÔNG TIN KHÁCH HÀNG ---\n"
            f"Tên khách hàng: {user_name}\n\n"
            f"--- SẢN PHẨM LIÊN QUAN TRONG KHO (CONTEXT) ---\n"
            f"{retrieved_context}\n"
        )
        return system_instructions

    @staticmethod
    def format_llm_messages(system_prompt: str, chat_history: List[Dict[str, Any]], current_message: str) -> List[Dict[str, Any]]:
        messages = [{"role": "system", "content": system_prompt}]
        
        for msg in chat_history:
            messages.append({
                "role": "user" if msg['role'] == "user" else "assistant",
                "content": msg['content']
            })
            
        messages.append({"role": "user", "content": current_message})
        return messages

prompt_builder_service = PromptBuilderService()
