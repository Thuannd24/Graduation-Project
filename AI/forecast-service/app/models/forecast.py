from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class ForecastRequest(BaseModel):
    productId: int
    days_to_predict: int = 30

class ForecastPoint(BaseModel):
    date: str
    predicted_quantity: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None

class ForecastResponse(BaseModel):
    productId: int
    predictions: List[ForecastPoint]
    model_used: str

class AnomalyRequest(BaseModel):
    metric_name: str  # revenue, order_count, traffic
    historical_data: List[float]

class AnomalyResponse(BaseModel):
    is_anomaly: bool
    confidence_score: float
    threshold_value: float
    actual_value: float
