from typing import Any, Dict, List, Optional

import requests

from app.core.config import chatbot_settings
from shared_common.config import shared_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)


def generate_text(
    system_prompt: str,
    chat_history: List[Dict[str, Any]],
    current_message: str,
    response_schema: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Calls DeepSeek's chat completions API — the only LLM provider this service uses.
    Pass response_schema (any truthy dict) to request DeepSeek's JSON-object mode,
    used by app.services.nlu for structured intent/sentiment extraction.
    """
    if not shared_settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured in AI/.env")

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(
        {"role": "user" if h["role"] == "user" else "assistant", "content": h["content"]}
        for h in chat_history
    )
    messages.append({"role": "user", "content": current_message})

    payload = {"model": chatbot_settings.DEEPSEEK_MODEL_NAME, "messages": messages}
    if response_schema:
        payload["response_format"] = {"type": "json_object"}

    try:
        response = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {shared_settings.DEEPSEEK_API_KEY}"},
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"DeepSeek call failed: {e}")
        raise RuntimeError(f"DeepSeek error: {e}")
