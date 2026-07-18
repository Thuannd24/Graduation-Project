from typing import List, Dict, Any

import numpy as np

from app.core.config import search_settings
from app.services.faiss_store import FaissStore
from shared_common.logger import get_logger

logger = get_logger(__name__)


class TextSearchService:
    """
    Dense retrieval bằng multilingual-e5-large (1024-dim).
    e5 yêu cầu prefix "query: " cho câu tìm kiếm và "passage: " cho tài liệu.
    Vector tra cứu trong text FAISS index (build offline từ mô tả sản phẩm).
    """

    def __init__(self):
        self.model = None
        self.store = FaissStore(
            dim=search_settings.TEXT_DIM,
            index_path=search_settings.text_index_path,
            map_path=search_settings.text_map_path,
            name="text",
        )

    def _get_model(self):
        if self.model is None:
            from sentence_transformers import SentenceTransformer  # lazy: chỉ tải khi thực sự encode
            logger.info(f"Loading text model: {search_settings.TEXT_MODEL_NAME}")
            self.model = SentenceTransformer(search_settings.TEXT_MODEL_NAME)
        return self.model

    def warmup(self) -> None:
        self._get_model()
        self.store.load()

    def _is_e5(self) -> bool:
        return "e5" in search_settings.TEXT_MODEL_NAME.lower()

    def encode_query(self, query: str) -> np.ndarray:
        model = self._get_model()
        text = f"query: {query}" if self._is_e5() else query
        return model.encode(text, normalize_embeddings=True)

    def encode_passage(self, passage: str) -> np.ndarray:
        model = self._get_model()
        text = f"passage: {passage}" if self._is_e5() else passage
        return model.encode(text, normalize_embeddings=True)

    def search_semantic(self, query_vector: np.ndarray, top_k: int = 10) -> List[Dict[str, Any]]:
        """Tra cứu FAISS text index. Trả list [{id, score}] (id = productId)."""
        hits = self.store.search(query_vector, top_k=top_k)
        return [{"id": pid, "score": score} for pid, score in hits]

    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        vec = self.encode_query(query)
        return self.search_semantic(vec, top_k=top_k)


text_search_service = TextSearchService()
