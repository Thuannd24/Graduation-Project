from fastapi import APIRouter, HTTPException, Query
from app.models.recommend import RecommendRequest, RecommendResponse, RecommendedItem
from app.services.sasrec import sasrec_service
from app.services.popularity import popularity_rec_service
from shared_common.database import get_redis_client
from shared_common.logger import get_logger
import json

logger = get_logger(__name__)
router = APIRouter()

@router.post("/recommend", response_model=RecommendResponse)
def get_recommendations(request: RecommendRequest):
    try:
        session_id = request.sessionId
        user_id = request.userId
        top_k = request.top_k
        
        # 1. Fetch user item interaction history from Redis or database
        # Redis key format: user:{userId}:history or session:{sessionId}:history
        history_key = f"user:{user_id}:history" if user_id else f"session:{session_id}:history"
        
        redis_client = get_redis_client()
        history_raw = redis_client.lrange(history_key, 0, 49)
        
        # Convert raw strings to list of integers
        item_history = []
        for x in history_raw:
            try:
                item_history.append(int(x))
            except ValueError:
                pass
                
        # 2. Decide strategy
        if item_history:
            strategy = "sasrec"
            recs = sasrec_service.recommend(item_history, top_k=top_k)
        else:
            strategy = "popularity"
            recs = popularity_rec_service.get_popular_items(top_k=top_k)
            
        items = [
            RecommendedItem(
                id=item['id'],
                name=item['name'],
                price=item['price'],
                score=item['score']
            ) for item in recs
        ]
        
        return RecommendResponse(
            strategy=strategy,
            items=items
        )
    except Exception as e:
        logger.error(f"Error in recommendation endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

from typing import Optional

@router.get("/recommendations/personal")
def get_personal_recommendations(user_id: Optional[str] = Query(None, alias="user_id"), top_k: int = 10):
    try:
        redis_client = get_redis_client()
        item_history = []
        if user_id:
            history_key = f"user:{user_id}:history"
            history_raw = redis_client.lrange(history_key, 0, 49)
            for x in history_raw:
                try:
                    item_history.append(int(x))
                except ValueError:
                    pass
        
        if item_history:
            recs = sasrec_service.recommend(item_history, top_k=top_k)
        else:
            recs = popularity_rec_service.get_popular_items(top_k=top_k)
            
        return recs
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommendations/cross-sell")
def get_cross_sell_combo(item_ids: str = Query(..., alias="item_ids"), top_k: int = 5):
    try:
        logger.info(f"Cross-sell requested for items: {item_ids}")
        recs = popularity_rec_service.get_popular_items(top_k=top_k)
        return recs
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
