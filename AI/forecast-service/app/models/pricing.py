from pydantic import BaseModel
from typing import Optional

class PricingRequest(BaseModel):
    userId: int
    productId: int
    customerTier: str  # VIP, GOLD, SILVER, REGULAR
    segmentationLabel: str  # Champions, Loyalist, At Risk, New
    cartTotal: float

class PricingResponse(BaseModel):
    aiPriceScore: float  # 0.0 to 1.0 representing sensitivity
    recommendedAction: str  # GIVE_HIGH_DISCOUNT, GIVE_LOW_DISCOUNT, NO_DISCOUNT
