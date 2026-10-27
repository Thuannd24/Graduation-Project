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
    TEXT_DIM: int = int(os.getenv("TEXT_DIM", "1024"))     # multilingual-e5-large
    # Nạp model nặng ngay khi service khởi động (True) hay lazy-load lần gọi đầu (False)
    PRELOAD_MODELS: bool = os.getenv("PRELOAD_MODELS", "false").lower() == "true"

    # ── Elasticsearch (BM25 keyword — dùng chung index với product-service) ─────
    ELASTICSEARCH_HOST: str = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
    ES_INDEX_NAME: str = os.getenv("ES_INDEX_NAME", "products")

    # ── Nguồn catalog để build index: "mariadb" (nguồn gốc) | "elasticsearch" ──
    CATALOG_SOURCE: str = os.getenv("CATALOG_SOURCE", "mariadb")

    # ── Thư mục dữ liệu (FAISS index, map) ──────────────────────────────────────
    DATA_DIR: str = os.getenv("DATA_DIR", os.path.join(os.getcwd(), "data"))

    # ── Tham số tìm kiếm ────────────────────────────────────────────────────────
    DEFAULT_TOP_K: int = int(os.getenv("DEFAULT_TOP_K", "10"))
    RRF_K: int = int(os.getenv("RRF_K", "60"))              # khớp hybrid_search.py

    # ── Đường dẫn artefact (dẫn xuất từ DATA_DIR) ───────────────────────────────
    @property
    def text_index_path(self) -> str:
        return os.path.join(self.DATA_DIR, "text_index.faiss")

    @property
    def text_map_path(self) -> str:
        return os.path.join(self.DATA_DIR, "idx2product_text.json")


search_settings = SearchSettings()
