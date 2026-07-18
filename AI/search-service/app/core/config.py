import os
from pydantic import BaseModel


class SearchSettings(BaseModel):
    """
    Cấu hình search-service. Tuân thủ quy tắc Zero-Hardcode: mọi giá trị đọc từ biến
    môi trường, có fallback hợp lý cho môi trường local. Docker override qua docker-compose.
    """
    PROJECT_NAME: str = "Search Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = int(os.getenv("PORT", "8001"))

    # ── Models ────────────────────────────────────────────────────────────────
    TEXT_MODEL_NAME: str = os.getenv("TEXT_MODEL_NAME", "intfloat/multilingual-e5-large")
    VISION_MODEL_NAME: str = os.getenv("VISION_MODEL_NAME", "clip-ViT-B-32")
    TEXT_DIM: int = int(os.getenv("TEXT_DIM", "1024"))     # multilingual-e5-large
    VISION_DIM: int = int(os.getenv("VISION_DIM", "512"))  # CLIP ViT-B/32
    # Nạp model nặng ngay khi service khởi động (True) hay lazy-load lần gọi đầu (False)
    PRELOAD_MODELS: bool = os.getenv("PRELOAD_MODELS", "false").lower() == "true"

    # ── Elasticsearch (BM25 keyword — dùng chung index với product-service) ─────
    ELASTICSEARCH_HOST: str = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
    ES_INDEX_NAME: str = os.getenv("ES_INDEX_NAME", "products")

    # ── Nguồn catalog để build index: "mariadb" (nguồn gốc) | "elasticsearch" ──
    CATALOG_SOURCE: str = os.getenv("CATALOG_SOURCE", "mariadb")

    # ── Thư mục dữ liệu (FAISS index, map, cache ảnh) ───────────────────────────
    DATA_DIR: str = os.getenv("DATA_DIR", os.path.join(os.getcwd(), "data"))

    # ── YOLO v8 (detect & crop sản phẩm) ────────────────────────────────────────
    # Mặc định TẮT để service chạy được ngay cả khi chưa cài ultralytics/chưa có weights.
    # Bật lên khi đã sẵn sàng: YOLO_ENABLED=true
    YOLO_ENABLED: bool = os.getenv("YOLO_ENABLED", "false").lower() == "true"
    YOLO_WEIGHTS: str = os.getenv("YOLO_WEIGHTS", "yolov8m.pt")
    YOLO_CONF: float = float(os.getenv("YOLO_CONF", "0.25"))
    YOLO_IOU: float = float(os.getenv("YOLO_IOU", "0.45"))
    YOLO_PAD: float = float(os.getenv("YOLO_PAD", "0.10"))

    # ── Tải ảnh từ CDN/cloud ────────────────────────────────────────────────────
    HTTP_USER_AGENT: str = os.getenv(
        "HTTP_USER_AGENT",
        "Mozilla/5.0 (compatible; AuraTechBot/1.0; +https://auratech.local)"
    )
    IMG_DOWNLOAD_TIMEOUT: int = int(os.getenv("IMG_DOWNLOAD_TIMEOUT", "15"))
    IMG_CACHE_ENABLED: bool = os.getenv("IMG_CACHE_ENABLED", "true").lower() == "true"

    # ── Tham số tìm kiếm ────────────────────────────────────────────────────────
    DEFAULT_TOP_K: int = int(os.getenv("DEFAULT_TOP_K", "10"))
    RRF_K: int = int(os.getenv("RRF_K", "60"))              # khớp hybrid_search.py
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "10"))
    # Trọng số kết hợp multimodal (ảnh + text) — cùng không gian CLIP
    MM_IMAGE_WEIGHT: float = float(os.getenv("MM_IMAGE_WEIGHT", "0.7"))
    MM_TEXT_WEIGHT: float = float(os.getenv("MM_TEXT_WEIGHT", "0.3"))

    # ── Đường dẫn artefact (dẫn xuất từ DATA_DIR) ───────────────────────────────
    @property
    def image_index_path(self) -> str:
        return os.path.join(self.DATA_DIR, "item_index.faiss")

    @property
    def image_map_path(self) -> str:
        return os.path.join(self.DATA_DIR, "idx2product_image.json")

    @property
    def text_index_path(self) -> str:
        return os.path.join(self.DATA_DIR, "text_index.faiss")

    @property
    def text_map_path(self) -> str:
        return os.path.join(self.DATA_DIR, "idx2product_text.json")

    @property
    def img_cache_dir(self) -> str:
        return os.path.join(self.DATA_DIR, "img_cache")


search_settings = SearchSettings()
