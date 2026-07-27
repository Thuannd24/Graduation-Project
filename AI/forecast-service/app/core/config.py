import os
from pydantic import BaseModel

class ForecastSettings(BaseModel):
    PROJECT_NAME: str = "Forecast & Analytics Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8004
    
    # Internal services URLs
    USER_SERVICE_URL: str = os.getenv("USER_SERVICE_URL", "http://localhost:8085")

    # Churn-risk scan (Phase 6) — xem docs/canvas/churn-risk-implementation-plan.md
    RISK_SCAN_INTERVAL_HOURS: float = float(os.getenv("RISK_SCAN_INTERVAL_HOURS", "1"))
    RISK_ABANDON_GRACE_HOURS: int = int(os.getenv("RISK_ABANDON_GRACE_HOURS", "24"))
    RISK_CHURN_PROBABILITY_THRESHOLD: float = float(os.getenv("RISK_CHURN_PROBABILITY_THRESHOLD", "0.5"))

forecast_settings = ForecastSettings()
