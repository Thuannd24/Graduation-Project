from PIL import Image
import numpy as np
from sentence_transformers import SentenceTransformer
from app.core.config import search_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

class VisualSearchService:
    def __init__(self):
        logger.info(f"Initializing CLIP model with {search_settings.VISION_MODEL_NAME}...")
        self.model = None

    def _get_model(self):
        if self.model is None:
            self.model = SentenceTransformer(search_settings.VISION_MODEL_NAME)
        return self.model

    def encode_image(self, image_path_or_file) -> np.ndarray:
        """
        Encode an image using CLIP.
        """
        model = self._get_model()
        logger.info("Encoding image using CLIP...")
        image = Image.open(image_path_or_file).convert("RGB")
        embedding = model.encode(image, normalize_embeddings=True)
        return embedding

    def search_similar_images(self, image_vector: np.ndarray, top_k: int = 10):
        """
        Search for similar images.
        """
        logger.info("Searching visually similar products...")
        mock_results = [
            {"id": f"prod_img_{i}", "score": float(0.88 - (i * 0.04)), "name": f"Mock Visually Similar Product {i}", "price": 850000.0}
            for i in range(top_k)
        ]
        return mock_results

visual_search_service = VisualSearchService()
