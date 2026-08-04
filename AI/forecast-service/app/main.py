from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import forecast_settings
from app.api.endpoints import forecast, pricing
from app.state import behavior_consumer, behavior_producer, risk_producer, risk_scheduler
from shared_common.logger import get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Cả 2 chạy nền song song với FastAPI, không chặn request HTTP nào (xem
    # docs/canvas/churn-risk-implementation-plan.md Phase 4 & 6).
    await behavior_consumer.start()
    await behavior_producer.start()
    await risk_producer.start()
    risk_scheduler.start()
    yield
    risk_scheduler.shutdown()
    await risk_producer.stop()
    await behavior_producer.stop()
    await behavior_consumer.stop()


app = FastAPI(
    title=forecast_settings.PROJECT_NAME,
    description="Microservice for Demand Forecasting, Anomaly Detection, dynamic pricing, and K-Means RFM segmentation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast.router, prefix=forecast_settings.API_V1_STR)
app.include_router(pricing.router, prefix=forecast_settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": forecast_settings.PROJECT_NAME
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting {forecast_settings.PROJECT_NAME} on port {forecast_settings.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=forecast_settings.PORT, reload=True)
