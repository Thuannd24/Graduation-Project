import json
import os
from typing import Any, Dict, List

from app.core.config import chatbot_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

# app/services/rag/policy_rag.py -> chatbot-service root is 4 levels up.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class PolicyRagService:
    """
    Retrieval over data/policies/*.md using a FAISS index built by
    scripts/build_policy_index.py. Model and index are lazy-loaded so
    importing this module (e.g. at FastAPI startup) stays cheap.
    Counterpart to app.services.rag.product_rag.ProductRagService, which does the same
    job for the live product catalog instead of the static policy documents.
    """

    def __init__(self):
        self.model = None
        self.index = None
        self.chunks: List[Dict[str, Any]] = []

    def _index_paths(self):
        index_dir = os.path.join(BASE_DIR, chatbot_settings.POLICY_INDEX_DIR)
        return (
            os.path.join(index_dir, "policy.index"),
            os.path.join(index_dir, "policy_meta.json"),
        )

    def warm_up(self) -> None:
        """
        Loads the embedding model and FAISS index eagerly. Call this once at app startup
        (see app/main.py) — without it, the cost (~30-45s to download/load the embedding
        model the first time) falls on whichever user sends the first policy_faq message,
        and can exceed the API gateway's CircuitBreaker timeout (30s, see BE/api-gateway
        application.yml), which then reports a false "connection error" to the frontend
        even though this service is still working and would have answered a moment later.
        """
        self._ensure_loaded()

    def _ensure_loaded(self) -> bool:
        if self.index is not None:
            return True

        index_path, meta_path = self._index_paths()
        if not os.path.exists(index_path) or not os.path.exists(meta_path):
            logger.error(
                f"Policy index not found at {index_path}. "
                f"Run scripts/build_policy_index.py first."
            )
            return False

        try:
            import faiss
            from sentence_transformers import SentenceTransformer

            logger.info(f"Loading policy embedding model '{chatbot_settings.POLICY_EMBEDDING_MODEL}'...")
            self.model = SentenceTransformer(chatbot_settings.POLICY_EMBEDDING_MODEL)

            logger.info(f"Loading FAISS policy index from {index_path}...")
            self.index = faiss.read_index(index_path)
            with open(meta_path, "r", encoding="utf-8") as f:
                self.chunks = json.load(f)

            return True
        except ImportError as e:
            logger.warning(f"Policy RAG dependencies not available ({e}). Policy search will use LLM general knowledge.")
            return False

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Returns up to top_k chunks: {slug, title, category, heading, text, score}
        ordered by descending similarity score (cosine, since vectors are normalized).
        """
        if not self._ensure_loaded():
            return []

        query_vec = self.model.encode([f"query: {query}"], normalize_embeddings=True)
        scores, indices = self.index.search(query_vec, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.chunks):
                continue
            chunk = self.chunks[idx]
            results.append({**chunk, "score": float(score)})
        return results

    @staticmethod
    def classify_confidence(max_score: float) -> str:
        """
        "ok"         -> score >= chatbot_settings.POLICY_CONFIDENCE_OK, answer normally
        "disclaimer" -> score >= POLICY_CONFIDENCE_DISCLAIMER, answer with a disclaimer
        "reject"     -> below that, refuse and point to hotline (do not call the LLM)

        Thresholds are configurable, not hardcoded here — see app/core/config.py for the
        current values and why they had to be re-calibrated for the embedding model in use.
        """
        if max_score >= chatbot_settings.POLICY_CONFIDENCE_OK:
            return "ok"
        if max_score >= chatbot_settings.POLICY_CONFIDENCE_DISCLAIMER:
            return "disclaimer"
        return "reject"

    @staticmethod
    def format_context_string(items: List[Dict[str, Any]]) -> str:
        if not items:
            return "Không tìm thấy thông tin chính sách nào liên quan."
        lines = []
        for idx, item in enumerate(items):
            lines.append(f"{idx + 1}. [{item['title']} - {item['heading']}]\n{item['text']}")
        return "\n\n".join(lines)


policy_rag_service = PolicyRagService()
