import os
from pydantic import BaseModel

class RecsSettings(BaseModel):
    PROJECT_NAME: str = "Recommendations Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8003
    
    # Model Weights Dir
    MODEL_WEIGHTS_PATH: str = os.getenv("MODEL_WEIGHTS_PATH", "/app/data/models/sasrec.pt")

recs_settings = RecsSettings()
