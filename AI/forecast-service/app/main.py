from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import forecast_settings
from app.api.endpoints import forecast, pricing
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=forecast_settings.PROJECT_NAME,
    description="Microservice for Demand Forecasting, Anomaly Detection, dynamic pricing, and K-Means RFM segmentation",
    version="1.0.0"
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
