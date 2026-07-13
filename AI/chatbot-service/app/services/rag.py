import requests
import json
from typing import AsyncGenerator, List, Dict, Any
from app.core.config import chatbot_settings
from app.services.prompt import prompt_builder_service
from shared_common.config import shared_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

class RagEngineService:
    def __init__(self):
        pass

    def retrieve_context(self, query: str) -> List[Dict[str, Any]]:
        """
        Calls search-service to retrieve relevant context.
        """
        logger.info(f"Retrieving search context for query: '{query}'")
        url = f"{chatbot_settings.SEARCH_SERVICE_URL}/api/v1/search"
        try:
            response = requests.get(url, params={"q": query, "top_k": 3}, timeout=5)
            if response.status_code == 200:
                data = response.json()
                return data.get("items", [])
        except Exception as e:
            logger.error(f"Failed to retrieve context from search-service: {e}")
        
        # Fallback empty context
        return []

    def format_context_string(self, items: List[Dict[str, Any]]) -> str:
        if not items:
            return "Không tìm thấy sản phẩm nào trong kho khớp trực tiếp với mô tả."
            
        context_lines = []
        for idx, item in enumerate(items):
            context_lines.append(f"{idx+1}. Tên: {item.get('name')}, Giá: {item.get('price')}đ, Độ trùng khớp: {item.get('score')}")
        return "\n".join(context_lines)

    async def generate_response_stream(
        self, system_prompt: str, chat_history: List[Dict[str, Any]], current_message: str
    ) -> AsyncGenerator[str, None]:
        """
        Generates response streaming via SSE. Falls back to mock generator if API key is not present.
        """
        # If Gemini Key is present, we would call Google GenAI
        if shared_settings.GEMINI_API_KEY:
            logger.info("Using Gemini Generative AI for stream...")
            try:
                import google.generativeai as genai
                genai.configure(api_key=shared_settings.GEMINI_API_KEY)
                model = genai.GenerativeModel('gemini-1.5-flash')
                
                # Format context
                formatted_history = []
                for h in chat_history:
                    role = "user" if h['role'] == "user" else "model"
                    formatted_history.append({"parts": [{"text": h['content']}], "role": role})
                
                # Combine system instructions and current message
                full_message = f"{system_prompt}\n\nUser: {current_message}"
                response = model.generate_content(full_message, stream=True)
                
                for chunk in response:
                    if chunk.text:
                        yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                return
            except Exception as e:
                logger.error(f"Gemini API execution failed, falling back to mock: {e}")
                
        # Mock generator for local testing
        logger.info("Using mock response generator...")
        mock_reply = (
            "Dựa trên thông tin kho hàng của chúng tôi, tôi khuyên bạn nên lựa chọn sản phẩm phù hợp. "
            "Sản phẩm này hiện đang có mức giá ưu đãi và có đầy đủ chế độ bảo hành chính hãng từ cửa hàng. "
            "Bạn có muốn tôi hỗ trợ đặt hàng ngay không?"
        )
        # Simulate typing latency
        import asyncio
        words = mock_reply.split(" ")
        for word in words:
            await asyncio.sleep(0.1)
            yield f"data: {json.dumps({'chunk': word + ' '})}\n\n"

rag_engine_service = RagEngineService()
