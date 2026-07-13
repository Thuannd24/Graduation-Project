import numpy as np
from sentence_transformers import SentenceTransformer
from app.core.config import search_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

class TextSearchService:
    def __init__(self):
        logger.info(f"Initializing SentenceTransformer with {search_settings.TEXT_MODEL_NAME}...")
        # In a real environment, we'd load this on startup. For testing, we can lazily load it.
        self.model = None

    def _get_model(self):
        if self.model is None:
            self.model = SentenceTransformer(search_settings.TEXT_MODEL_NAME)
        return self.model

    def encode_query(self, query: str) -> np.ndarray:
        """
        Encode query text. multilingual-e5 requires "query: " prefix.
        """
        model = self._get_model()
        prefix = "query: " if "e5" in search_settings.TEXT_MODEL_NAME else ""
        processed_query = f"{prefix}{query}"
        
        logger.info(f"Encoding query: {processed_query}")
        embedding = model.encode(processed_query, normalize_embeddings=True)
        return embedding

    def encode_passage(self, passage: str) -> np.ndarray:
        """
        Encode passage text. multilingual-e5 requires "passage: " prefix.
        """
        model = self._get_model()
        prefix = "passage: " if "e5" in search_settings.TEXT_MODEL_NAME else ""
        processed_passage = f"{prefix}{passage}"
        
        embedding = model.encode(processed_passage, normalize_embeddings=True)
        return embedding

    def search_semantic(self, query_vector: np.ndarray, top_k: int = 10):
        """
        Perform vector search. In production, this queries Elasticsearch k-NN index or FAISS.
        """
        logger.info(f"Searching semantic space for vector, top_k: {top_k}")
        # Mock retrieval for base implementation
        mock_results = [
            {"id": f"prod_{i}", "score": float(0.95 - (i * 0.05)), "name": f"Mock Semantic Product {i}", "price": 500000.0}
            for i in range(top_k)
        ]
        return mock_results

text_search_service = TextSearchService()
