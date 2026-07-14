import os
from pydantic import BaseModel

class SearchSettings(BaseModel):
    PROJECT_NAME: str = "Search Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8001
    
    # Model configuration
    TEXT_MODEL_NAME: str = os.getenv("TEXT_MODEL_NAME", "intfloat/multilingual-e5-large")
    VISION_MODEL_NAME: str = os.getenv("VISION_MODEL_NAME", "clip-ViT-B-32")
    
    # Elasticsearch Index Name
    ES_INDEX_NAME: str = os.getenv("ES_INDEX_NAME", "products")
    
    # Data directory
    DATA_DIR: str = os.getenv("DATA_DIR", "/app/data")

search_settings = SearchSettings()
