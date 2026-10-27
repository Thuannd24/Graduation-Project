from typing import Optional

from fastapi import APIRouter, Query, Header, HTTPException

from app.core.response import ApiResponse, success
from app.models.search import (
    SearchResponse, SuggestResponse, SearchItem,
    SimilarResponse, SimilarItem,
)
from app.services.hybrid_search import hybrid_search_service
from app.services import catalog
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

# top_k âm/0 trước đây đi thẳng xuống ES (`size=-15`): ES báo lỗi và catalog._mark_es_down() tắt BM25 30s
# cho MỌI người dùng (TC_PH2_HYB_06). Chặn ở biên API: 422.
MAX_TOP_K = 100


# ── TEXT / HYBRID SEARCH ─────────────────────────────────────────────────────

@router.get("/search", response_model=ApiResponse)
def get_hybrid_search(
    q: str = Query(..., description="Query string"),
    top_k: int = Query(10, ge=1, le=MAX_TOP_K, description="Number of results"),
    min_price: Optional[float] = Query(None, ge=0, description="Minimum price filter"),
    max_price: Optional[float] = Query(None, ge=0, description="Maximum price filter"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    try:
        results = hybrid_search_service.search(
            query=q, top_k=top_k, min_price=min_price, max_price=max_price
        )
        items = [SearchItem(**item) for item in results]
        payload = SearchResponse(
            query_understood={
                "intent": "product_search",
                "extracted_attributes": {"keywords": q.split()},
            },
            total=len(items),
            items=items,
        )
        return success(payload)
    except Exception as e:
        logger.error(f"Error executing hybrid search: {e}")
        raise HTTPException(status_code=500, detail="Search failed")


@router.get("/search/suggest", response_model=ApiResponse)
def get_autocomplete_suggestions(q: str = Query(..., description="Autocomplete prefix")):
    suggestions = catalog.suggest(q, size=5)
    return success(SuggestResponse(suggestions=suggestions))


# ── SIMILAR PRODUCTS (PRECOMPUTED) ───────────────────────────────────────────

@router.get("/search/similar/{product_id}", response_model=ApiResponse)
def get_similar_products(product_id: int, top_k: int = Query(10, ge=1, le=MAX_TOP_K)):
    """Sản phẩm tương tự (đọc item-to-item đã precompute trong MongoDB product_similarities)."""
    items = catalog.get_similar_by_product(product_id, top_k=top_k)
    return success(SimilarResponse(
        total=len(items),
        items=[SimilarItem(**it) for it in items],
    ))
