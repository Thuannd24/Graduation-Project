from pydantic import BaseModel
from typing import List, Optional

class RecommendRequest(BaseModel):
    userId: Optional[int] = None
    sessionId: str
    top_k: int = 10

class RecommendedItem(BaseModel):
    id: str
    name: str
    price: float
    score: float

class RecommendResponse(BaseModel):
    strategy: str  # sasrec / recency / popularity
    items: List[RecommendedItem]
