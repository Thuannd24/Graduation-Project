from fastapi import APIRouter, HTTPException
from app.models.pricing import PricingRequest, PricingResponse
from app.services.pricing import dynamic_pricing_service
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.post("/pricing/predict", response_model=PricingResponse)
def get_price_sensitivity(request: PricingRequest):
    try:
        res = dynamic_pricing_service.calculate_price_sensitivity(
            user_id=request.userId,
            product_id=request.productId,
            customer_tier=request.customerTier,
            segmentation_label=request.segmentationLabel,
            cart_total=request.cartTotal
        )
        return PricingResponse(
            aiPriceScore=res['aiPriceScore'],
            recommendedAction=res['recommendedAction']
        )
    except Exception as e:
        logger.error(f"Error in dynamic pricing endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
