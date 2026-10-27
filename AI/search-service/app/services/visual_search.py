from typing import List, Dict, Any, Optional, Tuple

import numpy as np
from PIL import Image

from app.core.config import search_settings
from app.services.faiss_store import FaissStore
from app.services.yolo_crop import product_cropper
from app.services import catalog
from shared_common.logger import get_logger

logger = get_logger(__name__)


def _to_match_score(cosine: float) -> int:
    """Quy cosine (đã normalize) về 0–100 để hiển thị badge %."""
    pct = (cosine + 1.0) / 2.0 * 100.0
    return int(max(0, min(100, round(pct))))


class VisualSearchService:
    """
    Visual search: (YOLO crop) → CLIP encode 512-dim → FAISS ANN → metadata.
    CLIP (clip-ViT-B-32) encode được CẢ ảnh và text trong cùng không gian → hỗ trợ multimodal.
    """

    def __init__(self):
        self.model = None
        self.store = FaissStore(
            dim=search_settings.VISION_DIM,
            index_path=search_settings.image_index_path,
            map_path=search_settings.image_map_path,
            name="image",
        )

    def _get_model(self):
        if self.model is None:
            from sentence_transformers import SentenceTransformer  # lazy: chỉ tải khi thực sự encode
            logger.info(f"Loading vision model: {search_settings.VISION_MODEL_NAME}")
            self.model = SentenceTransformer(search_settings.VISION_MODEL_NAME)
        return self.model

    def warmup(self) -> None:
        self._get_model()
        self.store.load()
        product_cropper.warmup()

    # ── Encoding ─────────────────────────────────────────────────────────────
    def encode_image(self, image: Image.Image) -> np.ndarray:
        """Encode 1 PIL.Image → vector 512-dim đã L2-normalize."""
        model = self._get_model()
        return model.encode(image, normalize_embeddings=True)

    def encode_text(self, text: str) -> np.ndarray:
        """Encode text bằng CLIP (cùng không gian với ảnh) — dùng cho multimodal."""
        model = self._get_model()
        return model.encode(text, normalize_embeddings=True)

    def process_upload(self, file_like) -> Tuple[np.ndarray, Optional[Dict[str, float]]]:
        """
        Từ file ảnh user upload → (vector, crop_box).
        Gồm: đọc ảnh → YOLO crop (nếu bật) → CLIP encode.
        """
        from app.services.image_loader import load_image_from_file
        image = load_image_from_file(file_like)
        cropped, crop_box = product_cropper.crop(image)
        vector = self.encode_image(cropped)
        return vector, crop_box

    # ── Search ─────────────────────────────────────────────────────────────────
    def _hits_to_items(self, hits: List[Tuple[int, float]]) -> List[Dict[str, Any]]:
        ids = [pid for pid, _ in hits]
        meta = catalog.get_products_by_ids(ids)
        items = []
        for pid, score in hits:
            m = meta.get(pid)
            if not m:
                continue
            items.append({
                "id": str(pid),
                "name": m["name"],
                "price": m["price"],
                "image": m.get("image"),
                "score": round(float(score), 4),
                "matchScore": _to_match_score(score),
            })
        return items

    def search_similar_images(self, image_vector: np.ndarray, top_k: int = 10) -> List[Dict[str, Any]]:
        """Tìm sản phẩm có ảnh tương tự nhất với query vector."""
        hits = self.store.search(image_vector, top_k=top_k)
        return self._hits_to_items(hits)

    def search_multimodal(self, image_vector: np.ndarray, text: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Kết hợp ảnh + text: query_vec = w_img·vec_img + w_txt·vec_txt, rồi L2-normalize.
        Ví dụ: ảnh chiếc áo + "màu xanh" → áo tương tự màu xanh.
        """
        txt_vec = self.encode_text(text)
        combined = (
            search_settings.MM_IMAGE_WEIGHT * np.asarray(image_vector, dtype="float32")
            + search_settings.MM_TEXT_WEIGHT * np.asarray(txt_vec, dtype="float32")
        )
        norm = np.linalg.norm(combined)
        if norm > 0:
            combined = combined / norm
        hits = self.store.search(combined, top_k=top_k)
        return self._hits_to_items(hits)

    def get_similar_by_product(self, product_id: int, top_k: int = 10) -> List[Dict[str, Any]]:
        """Đọc top similar đã precompute từ MongoDB (nhanh, không cần FAISS real-time)."""
        sims = catalog.get_similar_ids(product_id)[:top_k]
        meta = catalog.get_products_by_ids([s["id"] for s in sims])
        items = []
        for s in sims:
            m = meta.get(s["id"])
            if not m:
                continue
            items.append({
                "id": str(s["id"]),
                "name": m["name"],
                "price": m["price"],
                "image": m.get("image"),
                "score": round(float(s["score"]), 4),
                "matchScore": _to_match_score(s["score"]),
            })
        return items


visual_search_service = VisualSearchService()
