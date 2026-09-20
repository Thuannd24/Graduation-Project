import os
import re
from typing import Optional

from shared_common.logger import get_logger

logger = get_logger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYSTEM_PROMPT_FILE = os.path.join(BASE_DIR, "data", "system-prompt.md")

FENCE_RE = re.compile(r"## System Prompt \(Tiếng Việt\)\s*```\s*(.*?)```", re.DOTALL)

FALLBACK_PROMPT = (
    "Bạn là trợ lý AI của AuraTech. Chỉ trả lời dựa trên thông tin được cung cấp trong "
    "context. Nếu không có thông tin, hãy nói bạn chưa biết thay vì đoán."
)


class PromptBuilderService:
    _cached_base_prompt: Optional[str] = None

    @classmethod
    def _load_base_prompt(cls) -> str:
        if cls._cached_base_prompt is not None:
            return cls._cached_base_prompt

        try:
            with open(SYSTEM_PROMPT_FILE, "r", encoding="utf-8") as f:
                raw = f.read()
            match = FENCE_RE.search(raw)
            if match:
                cls._cached_base_prompt = match.group(1).strip()
            else:
                logger.error(f"Could not find fenced system prompt block in {SYSTEM_PROMPT_FILE}")
                cls._cached_base_prompt = FALLBACK_PROMPT
        except Exception as e:
            logger.error(f"Failed to load system prompt file: {e}")
            cls._cached_base_prompt = FALLBACK_PROMPT

        return cls._cached_base_prompt

    @staticmethod
    def build_system_prompt(
        user_name: str,
        retrieved_context: str = "",
        confidence: str = "ok",
        user_id: Optional[int] = None,
    ) -> str:
        parts = [
            PromptBuilderService._load_base_prompt(),
            "## ĐỊNH DẠNG ĐẦU RA\n"
            "Khung chat hiển thị văn bản thuần (plain text), KHÔNG render markdown. "
            "Do đó KHÔNG dùng **chữ đậm**, *chữ nghiêng*, # tiêu đề, hay khối code. "
            "Muốn nhấn mạnh thì viết thường, có thể xuống dòng hoặc dùng dấu \"-\" đầu dòng cho danh sách.",
        ]

        if retrieved_context:
            parts.append(f"## CONTEXT (Thông tin tra cứu được từ hệ thống)\n{retrieved_context}")
            if confidence == "disclaimer":
                parts.append(
                    "## LƯU Ý\nĐộ liên quan của context ở mức trung bình. "
                    "Hãy trả lời kèm câu: \"Thông tin có thể chưa đầy đủ, bạn vui lòng kiểm tra "
                    "lại trên website hoặc liên hệ 0389.468.847 để chắc chắn nhé.\""
                )

        if user_id:
            parts.append(
                "## THÔNG TIN KHÁCH HÀNG HIỆN TẠI\n"
                f"- Tên: {user_name}\n"
                "- Đã đăng nhập: Có"
            )

        return "\n\n".join(parts)


prompt_builder_service = PromptBuilderService()
