from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.recommend import RecommendRequest, RecommendResponse, RecommendedItem
from app.services.catalog import get_products_by_ids
from app.services.popularity import popularity_rec_service
from app.services.recency import recency_rec_service
from app.services.sasrec import sasrec_service
from shared_common.contracts import HISTORY_MAX_LEN, history_key_for, user_history_key
from shared_common.database import get_redis_client
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


def _read_history(history_key: Optional[str], redis_client) -> list[int]:
    if not history_key:
        return []
    history_raw = redis_client.lrange(history_key, 0, HISTORY_MAX_LEN - 1)
    item_history = []
    for x in history_raw:
        try:
            item_history.append(int(x))
        except ValueError:
            pass
    return item_history


def _recommend_for_history(item_history: list[int], top_k: int) -> tuple[str, list[dict]]:
    """Thang chiến lược theo thứ tự ưu tiên, mỗi tầng chỉ dùng khi tầng trước không áp dụng được:

    1. **sasrec** — chỉ khi có checkpoint `platform_v1` hợp lệ (xem cảnh báo trong
       `services/sasrec.py`) VÀ ánh xạ được item thật. Hiện CHƯA có checkpoint nào đạt điều kiện
       này được triển khai (xem #2).
    2. **recency** — "gợi ý lại item vừa xem gần nhất". Đo được (2026-09-21) trên dữ liệu thật
       của platform: quy tắc này (recall@10=0,2754) THẮNG cả SASRec train riêng cho platform
       (0,1976) lẫn Popularity toàn cục (0,0020) — xem `services/recency.py`. Vì vậy đây là tầng
       cá nhân hoá MẶC ĐỊNH cho tới khi có checkpoint SASRec thật sự vượt qua được nó.
    3. **popularity** — cold-start (chưa có lịch sử) hoặc khi 2 tầng trên không trả được gì.
    """
    if item_history and sasrec_service.is_ready():
        sasrec_recs = sasrec_service.recommend(item_history, top_k=top_k)
        if sasrec_recs:
            product_map = get_products_by_ids([r["product_id"] for r in sasrec_recs])
            items = [
                {**product_map[r["product_id"]], "score": r["score"]}
                for r in sasrec_recs
                if r["product_id"] in product_map
            ]
            if items:
                return "sasrec", items

    if item_history:
        recency_recs = recency_rec_service.recommend(item_history, top_k=top_k)
        if recency_recs:
            return "recency", recency_recs

    return "popularity", popularity_rec_service.get_popular_items(top_k=top_k)


@router.post("/recommend", response_model=RecommendResponse)
def get_recommendations(request: RecommendRequest):
    try:
        # Key naming là hợp đồng dùng chung với BE Java (xem shared_common.contracts) - written
        # by forecast-service/behavior_consumer.py mỗi khi có sự kiện view/cart.
        history_key = history_key_for(user_id=request.userId, session_id=request.sessionId)
        redis_client = get_redis_client()
        item_history = _read_history(history_key, redis_client)

        strategy, recs = _recommend_for_history(item_history, request.top_k)
        items = [RecommendedItem(**item) for item in recs]

        return RecommendResponse(strategy=strategy, items=items)
    except Exception as e:
        logger.error(f"Error in recommendation endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations/personal")
def get_personal_recommendations(user_id: Optional[str] = Query(None, alias="user_id"), top_k: int = 10):
    try:
        redis_client = get_redis_client()
        history_key = user_history_key(user_id) if user_id else None
        item_history = _read_history(history_key, redis_client)

        _, recs = _recommend_for_history(item_history, top_k)
        return recs
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations/cross-sell")
def get_cross_sell_combo(item_ids: str = Query(..., alias="item_ids"), top_k: int = 5):
    try:
        logger.info(f"Cross-sell requested for items: {item_ids}")
        # TODO(platform_v1): dùng co-occurrence thật (item-item) khi có đủ dữ liệu order thật;
        # hiện chưa có bước tính đó nên vẫn rơi về Popularity thay vì bịa "combo".
        recs = popularity_rec_service.get_popular_items(top_k=top_k)
        return recs
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
