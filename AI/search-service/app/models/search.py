from pydantic import BaseModel
from typing import List, Optional, Dict, Any


# ── Text / Hybrid search ─────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    q: str
    top_k: int = 10
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class SearchItem(BaseModel):
    id: str
    name: str
    price: float
    image: Optional[str] = None
    score: float
    match_reason: str  # bm25 / dense / bm25+dense


class SearchResponse(BaseModel):
    query_understood: Dict[str, Any]
    total: int
    items: List[SearchItem]


class SuggestResponse(BaseModel):
    suggestions: List[str]


# ── Visual search ─────────────────────────────────────────────────────────────

class CropBox(BaseModel):
    """Vùng sản phẩm YOLO nhận diện, đơn vị % (0–100) — khớp contract FE SearchPage.jsx."""
    x: float
    y: float
    width: float
    height: float


class VisualSearchItem(BaseModel):
    id: str
    name: str
    price: float
    image: Optional[str] = None
    score: float
    matchScore: int  # score quy về 0–100 để hiển thị badge % trên FE


class VisualSearchResponse(BaseModel):
    total: int
    items: List[VisualSearchItem]
    cropBox: Optional[CropBox] = None


# ── Similar items (item-to-item, precompute) ─────────────────────────────────

class SimilarRequest(BaseModel):
    itemId: str
    top_k: int = 10


class SimilarResponse(BaseModel):
    total: int
    items: List[VisualSearchItem]
