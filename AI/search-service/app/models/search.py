from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class SearchRequest(BaseModel):
    q: str
    top_k: int = 10
    min_price: Optional[float] = None
    max_price: Optional[float] = None

class SearchItem(BaseModel):
    id: str
    name: str
    price: float
    score: float
    match_reason: str  # bm25 / dense / hybrid

class SearchResponse(BaseModel):
    query_understood: Dict[str, Any]
    total: int
    items: List[SearchItem]

class SuggestResponse(BaseModel):
    suggestions: List[str]

class SimilarRequest(BaseModel):
    itemId: str
    top_k: int = 10
