import os
from pydantic import BaseModel

class ForecastSettings(BaseModel):
    PROJECT_NAME: str = "Forecast & Analytics Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8004
    
    # Internal services URLs
    USER_SERVICE_URL: str = os.getenv("USER_SERVICE_URL", "http://localhost:8085")

forecast_settings = ForecastSettings()
