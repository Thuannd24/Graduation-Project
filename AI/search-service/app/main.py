from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import search_settings
from app.api.endpoints import search
from shared_common.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title=search_settings.PROJECT_NAME,
    description="Microservice for semantic hybrid text search and visual search",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(search.router, prefix=search_settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {
        "status": "UP",
        "service": search_settings.PROJECT_NAME,
        "text_model": search_settings.TEXT_MODEL_NAME,
        "vision_model": search_settings.VISION_MODEL_NAME
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting {search_settings.PROJECT_NAME} on port {search_settings.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=search_settings.PORT, reload=True)
