import json
from typing import List, Dict, Any
from shared_common.database import get_redis_client
from shared_common.logger import get_logger

logger = get_logger(__name__)

class MemoryManagerService:
    def __init__(self):
        self.redis = None

    def _get_redis(self):
        if self.redis is None:
            self.redis = get_redis_client()
        return self.redis

    def get_history(self, session_id: str, max_turns: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieves chat history for a session from Redis.
        """
        logger.info(f"Retrieving chat history for session: {session_id}")
        r = self._get_redis()
        key = f"chat:{session_id}:history"
        
        try:
            # Redis stores them as a list of JSON strings
            data = r.lrange(key, 0, -1)
            history = [json.loads(x) for x in data]
            # Since LPUSH inserts at index 0, history is in reverse order. We reverse it back to chronological order.
            history.reverse()
            return history[:max_turns * 2] # 1 turn = 1 user message + 1 bot reply (2 records)
        except Exception as e:
            logger.error(f"Error fetching history from Redis: {e}")
            return []

    def add_message(self, session_id: str, role: str, content: str, metadata: Dict[str, Any] = None):
        """
        Pushes a new message to the sliding window list in Redis.
        """
        logger.info(f"Adding {role} message to session {session_id} history")
        r = self._get_redis()
        key = f"chat:{session_id}:history"
        
        payload = {
            "role": role,
            "content": content,
            "metadata": metadata or {}
        }
        
        try:
            r.lpush(key, json.dumps(payload))
            # Trim the list to store at most 20 messages (10 turns)
            r.ltrim(key, 0, 19)
            # Set TTL of 24 hours
            r.expire(key, 86400)
        except Exception as e:
            logger.error(f"Failed to add message to Redis: {e}")

memory_manager_service = MemoryManagerService()
