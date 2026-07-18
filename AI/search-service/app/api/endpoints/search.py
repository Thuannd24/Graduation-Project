from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, Query, Header, HTTPException

from app.core.response import ApiResponse, success
from app.models.search import (
    SearchResponse, SuggestResponse, SearchItem,
    VisualSearchResponse, VisualSearchItem, CropBox, SimilarResponse,
)
from app.services.hybrid_search import hybrid_search_service
from app.services.visual_search import visual_search_service
from app.services import catalog
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ── TEXT / HYBRID SEARCH ─────────────────────────────────────────────────────

@router.get("/search", response_model=ApiResponse)
def get_hybrid_search(
    q: str = Query(..., description="Query string"),
    top_k: int = Query(10, description="Number of results"),
    min_price: Optional[float] = Query(None, description="Minimum price filter"),
    max_price: Optional[float] = Query(None, description="Maximum price filter"),
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


# ── VISUAL SEARCH ─────────────────────────────────────────────────────────────

def _visual_response(items, crop_box) -> ApiResponse:
    return success(VisualSearchResponse(
        total=len(items),
        items=[VisualSearchItem(**it) for it in items],
        cropBox=CropBox(**crop_box) if crop_box else None,
    ))


@router.post("/search/similar-image", response_model=ApiResponse)
@router.post("/search/image", response_model=ApiResponse)
async def find_similar_by_image(
    file: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None, description="Ảnh sản phẩm cần tìm"),
    top_k: int = Query(10),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    upload = image or file  # FE gửi field 'image'; giữ tương thích 'file'
    if upload is None:
        raise HTTPException(status_code=422, detail="Thiếu file ảnh (field 'image' hoặc 'file').")
    try:
        vector, crop_box = visual_search_service.process_upload(upload.file)
        items = visual_search_service.search_similar_images(vector, top_k=top_k)
        return _visual_response(items, crop_box)
    except Exception as e:
        logger.error(f"Error executing visual search: {e}")
        raise HTTPException(status_code=500, detail="Visual search failed")


@router.post("/search/multimodal", response_model=ApiResponse)
async def multimodal_search(
    q: str = Form(..., description="Text mô tả bổ sung, vd: 'màu xanh'"),
    file: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    top_k: int = Query(10),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    upload = image or file
    if upload is None:
        raise HTTPException(status_code=422, detail="Thiếu file ảnh.")
    try:
        vector, crop_box = visual_search_service.process_upload(upload.file)
        items = visual_search_service.search_multimodal(vector, q, top_k=top_k)
        return _visual_response(items, crop_box)
    except Exception as e:
        logger.error(f"Error executing multimodal search: {e}")
        raise HTTPException(status_code=500, detail="Multimodal search failed")


@router.get("/search/similar/{product_id}", response_model=ApiResponse)
def get_similar_products(product_id: int, top_k: int = Query(10)):
    """Sản phẩm tương tự (đọc item-to-item đã precompute trong MongoDB product_similarities)."""
    items = visual_search_service.get_similar_by_product(product_id, top_k=top_k)
    return success(SimilarResponse(
        total=len(items),
        items=[VisualSearchItem(**it) for it in items],
    ))
