from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import recs_settings
from app.api.endpoints import recommend
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=recs_settings.PROJECT_NAME,
    description="Microservice generating personalized user recommendations via SASRec & Cold-start Popularity",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommend.router, prefix=recs_settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": recs_settings.PROJECT_NAME,
        "weights_path": recs_settings.MODEL_WEIGHTS_PATH
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting {recs_settings.PROJECT_NAME} on port {recs_settings.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=recs_settings.PORT, reload=True)
