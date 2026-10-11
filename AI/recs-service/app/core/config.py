import os
from pydantic import BaseModel

class RecsSettings(BaseModel):
    PROJECT_NAME: str = "Recommendations Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8003
    
    # Checkpoint SASRec platform_v1 (sinh bởi forecast-service/.../recsys_platform_sasrec.py). Mặc định
    # tương đối "data/models/..." — khớp WORKDIR /workspace/recs-service + volume ./models trong
    # AI/docker-compose.yml, cùng quy ước MODELS_DIR của shared_common. (Bản cũ "/app/data/..." không
    # nằm dưới WORKDIR nào nên checkpoint không bao giờ được nạp khi chạy Docker.)
    MODEL_WEIGHTS_PATH: str = os.getenv("MODEL_WEIGHTS_PATH", "data/models/sasrec.pt")

recs_settings = RecsSettings()
