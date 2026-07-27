from fastapi import APIRouter, HTTPException, Query
from app.models.recommend import RecommendRequest, RecommendResponse, RecommendedItem
from app.services.sasrec import sasrec_service
from app.services.popularity import popularity_rec_service
from shared_common.database import get_redis_client
from shared_common.contracts import history_key_for, user_history_key, HISTORY_MAX_LEN
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
        # Key naming là hợp đồng dùng chung với BE Java (xem shared_common.contracts) - written
        # by forecast-service/behavior_consumer.py mỗi khi có sự kiện view/cart.
        history_key = history_key_for(user_id=user_id, session_id=session_id)

        redis_client = get_redis_client()
        history_raw = redis_client.lrange(history_key, 0, HISTORY_MAX_LEN - 1) if history_key else []
        
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
            history_key = user_history_key(user_id)
            history_raw = redis_client.lrange(history_key, 0, HISTORY_MAX_LEN - 1)
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
