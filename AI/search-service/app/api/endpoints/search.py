from fastapi import APIRouter, UploadFile, File, Query, HTTPException
from typing import List, Optional
from app.models.search import SearchResponse, SuggestResponse, SearchItem
from app.services.hybrid_search import hybrid_search_service
from app.services.visual_search import visual_search_service
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.get("/search", response_model=SearchResponse)
def get_hybrid_search(
    q: str = Query(..., description="Query string"),
    top_k: int = Query(10, description="Number of results"),
    min_price: Optional[float] = Query(None, description="Minimum price filter"),
    max_price: Optional[float] = Query(None, description="Maximum price filter")
):
    try:
        results = hybrid_search_service.search(
            query=q, top_k=top_k, min_price=min_price, max_price=max_price
        )
        # Parse query understable attributes
        query_understood = {
            "intent": "product_search",
            "extracted_attributes": {
                "keywords": q.split()
            }
        }
        
        items = [
            SearchItem(
                id=item['id'],
                name=item['name'],
                price=item['price'],
                score=item['score'],
                match_reason=item['match_reason']
            ) for item in results
        ]
        
        return SearchResponse(
            query_understood=query_understood,
            total=len(items),
            items=items
        )
    except Exception as e:
        logger.error(f"Error executing hybrid search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search/suggest", response_model=SuggestResponse)
def get_autocomplete_suggestions(q: str = Query(..., description="Autocomplete prefix")):
    # Simple Trie/Autocomplete mock
    suggestions = [
        f"{q} pro max",
        f"{q} chính hãng",
        f"{q} giá rẻ",
        f"{q} 256GB"
    ]
    return SuggestResponse(suggestions=suggestions)

@router.post("/search/similar-image")
@router.post("/search/image")
async def find_similar_by_image(
    image: UploadFile = File(..., alias="file"),
    top_k: int = Query(10, description="Number of results")
):
    try:
        # Save temp file or read bytes
        contents = image.file
        img_vector = visual_search_service.encode_image(contents)
        results = visual_search_service.search_similar_images(img_vector, top_k=top_k)
        return {
            "total": len(results),
            "items": results
        }
    except Exception as e:
        logger.error(f"Error executing visual search: {e}")
        raise HTTPException(status_code=500, detail=str(e))
