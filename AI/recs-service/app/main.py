from fastapi import FastAPI
from app.core.config import recs_settings
from app.api.endpoints import recommend
from app.services.sasrec import sasrec_service
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=recs_settings.PROJECT_NAME,
    description="Microservice generating personalized user recommendations via SASRec & Cold-start Popularity",
    version="1.0.0"
)

# KHÔNG thêm CORSMiddleware: browser chỉ gọi service này QUA api-gateway, và gateway đã tự thêm header CORS
# (CorsConfig.java) — giống mọi service Java. Trước đây middleware này thêm Access-Control-Allow-Origin LẦN
# THỨ HAI, trình duyệt thấy header bị lặp nên chặn MỌI response gợi ý: khối gợi ý trang chủ và cross-sell chưa
# từng hiện được trên trình duyệt (phát hiện 2026-10-02 khi test bằng Chromium; script Python không bị CORS).
app.include_router(recommend.router, prefix=recs_settings.API_V1_STR)

@app.get("/health")
def health_check():
    sasrec_service.is_ready()  # nạp lười: lần gọi đầu tiên mới đọc checkpoint
    return {
        "status": "UP",
        "service": recs_settings.PROJECT_NAME,
        "weights_path": recs_settings.MODEL_WEIGHTS_PATH,
        "sasrec": sasrec_service.status,  # đang bật hay tắt, vì sao, kết quả cổng đánh giá
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting {recs_settings.PROJECT_NAME} on port {recs_settings.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=recs_settings.PORT, reload=True)
