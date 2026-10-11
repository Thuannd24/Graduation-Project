from fastapi import FastAPI

from app.core.config import search_settings
from app.api.endpoints import search
from app.services.visual_search import visual_search_service
from app.services.text_search import text_search_service
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=search_settings.PROJECT_NAME,
    description="Microservice for semantic hybrid text search and visual search",
    version="1.0.0",
)

# CORS do API Gateway (port 8080) quản lý tập trung — nguyên tắc "Gateway làm hết".
# Không set CORSMiddleware ở đây, nếu không header Access-Control-Allow-Origin sẽ bị
# lặp 2 lần (gateway + service) và browser sẽ chặn response.

# Mount router ở cả path secured (/api/v1/search/**) lẫn public (/api/v1/public/search/**)
# để khớp 2 route đã khai báo ở API Gateway.
app.include_router(search.router, prefix=search_settings.API_V1_STR)
app.include_router(search.router, prefix=f"{search_settings.API_V1_STR}/public")


@app.on_event("startup")
def on_startup():
    """
    Load FAISS index vào RAM (nhẹ, nhanh). Nếu PRELOAD_MODELS=true thì nạp sẵn cả
    CLIP/e5/YOLO (chậm, tốn RAM) — mặc định lazy-load lần gọi đầu.
    Mọi lỗi được nuốt để service vẫn UP (index có thể chưa build).
    """
    try:
        visual_search_service.store.load()
        text_search_service.store.load()
    except Exception as e:  # pragma: no cover
        logger.error(f"Lỗi load FAISS index khi startup: {e}")

    if search_settings.PRELOAD_MODELS:
        logger.info("PRELOAD_MODELS=true → nạp sẵn model encoders...")
        try:
            visual_search_service.warmup()
            text_search_service.warmup()
        except Exception as e:  # pragma: no cover
            logger.error(f"Lỗi preload models: {e}")


@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": search_settings.PROJECT_NAME,
        "text_model": search_settings.TEXT_MODEL_NAME,
        "vision_model": search_settings.VISION_MODEL_NAME,
        "yolo_enabled": search_settings.YOLO_ENABLED,
        "image_index_ready": visual_search_service.store.is_ready,
        "image_index_size": visual_search_service.store.size,
        "text_index_ready": text_search_service.store.is_ready,
        "text_index_size": text_search_service.store.size,
    }


if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting {search_settings.PROJECT_NAME} on port {search_settings.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=search_settings.PORT, reload=True)
