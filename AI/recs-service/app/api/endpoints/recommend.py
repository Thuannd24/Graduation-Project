from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Response

from app.models.recommend import RecommendRequest, RecommendResponse, RecommendedItem
from app.services.catalog import get_product_meta, get_products_by_ids
from app.services.cross_sell import recommend_for_cart
from app.services.popularity import popularity_rec_service
from app.services.recency import recency_rec_service
from app.services.rerank import history_median_price, rerank
from app.services.sasrec import sasrec_service
from shared_common.contracts import HISTORY_MAX_LEN, session_history_key, user_history_key
from shared_common.logger import get_logger
from shared_common.pool import get_pooled_redis_client

logger = get_logger(__name__)
router = APIRouter()

# Nguồn gợi ý cho từng khối UI — xem `_recommend_for_history`. Giá trị lạ -> FastAPI trả 422.
Source = Literal["auto", "for_you", "recent", "trending"]

# top_k âm trước đây bị cắt kiểu Python ([:-1] -> n-1 item) thay vì báo lỗi (TC_PH8_TOPK_04).
MAX_TOP_K = 100
TopK = Query(10, ge=1, le=MAX_TOP_K)
# SASRec trả dư ứng viên để còn đủ top_k sau khi lọc hết hàng/ngừng bán và re-rank theo giá/đa dạng.
SASREC_CANDIDATE_FACTOR = 4
SASREC_MIN_CANDIDATES = 40


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


def _resolve_history(user_id: Optional[str], session_id: Optional[str]) -> list[int]:
    """Lịch sử theo user nếu có, rỗng thì rơi về lịch sử của phiên hiện tại.

    Consumer ghi vào `user:{uid}:history` khi event có user, ngược lại vào `session:{sid}:history`
    (xem `history_key_for`). Khách vừa đăng nhập chưa có lịch sử user nhưng phiên đang duyệt thì
    có — bỏ qua phiên sẽ phí đúng tín hiệu mới nhất.
    """
    redis_client = get_pooled_redis_client()
    history = _read_history(user_history_key(user_id), redis_client) if user_id else []
    if not history and session_id:
        history = _read_history(session_history_key(session_id), redis_client)
    return history


def _clean_history(item_history: list[int]) -> tuple[list[int], Optional[dict]]:
    """Bỏ SP đã xoá/ngừng bán khỏi lịch sử (trước đây lịch sử vẫn chứa SP không còn tra cứu được,
    làm nhiễu cả Recency lẫn đầu vào SASRec). Trả kèm meta (giá, danh mục) để re-rank dùng lại.
    DB lỗi -> giữ nguyên lịch sử (meta=None) thay vì xoá sạch."""
    if not item_history:
        return item_history, {}
    meta = get_product_meta(item_history)
    if meta is None:
        return item_history, None
    return [i for i in item_history if i in meta], meta


def _recommend_for_history(item_history: list[int], top_k: int, source: Source = "auto") -> tuple[str, list[dict]]:
    """Thang chiến lược theo thứ tự ưu tiên, mỗi tầng chỉ dùng khi tầng trước không áp dụng được:

    1. **sasrec** — chỉ khi `MODEL_WEIGHTS_PATH` trỏ tới checkpoint `platform_v1` hợp lệ (xem cảnh
       báo trong `services/sasrec.py`) VÀ ánh xạ được item thật. Tầng này LOẠI item đã xem.
    2. **recency** — "gợi ý lại item vừa xem gần nhất" (chỉ gồm item đã xem). Trên seed 2026-09-26:
       Recency HR@10=0,212 vs SASRec-loại-item-đã-xem 0,094 — hai tầng phục vụ hai bài toán khác
       nhau (xem lại vs khám phá), xem docs/AI/recsys-p1-assessment-and-plan.md §4.1.
    3. **popularity** — cold-start (chưa có lịch sử) hoặc khi 2 tầng trên không trả được gì.

    `source` khác "auto" chọn thẳng MỘT nguồn cho từng khối UI (quyết định D1 trong plan: tách
    "xem lại" khỏi "khám phá" để mỗi khối có baseline/metric riêng):
      - `for_you`  — khám phá: SASRec; không dùng được thì Popularity ĐÃ LOẠI item đã xem.
      - `recent`   — xem lại: Recency; chưa có lịch sử thì trả rỗng (không bịa).
      - `trending` — Popularity toàn cục.
    """
    item_history, history_meta = _clean_history(item_history)
    if source == "recent":
        return "recency", recency_rec_service.recommend(item_history, top_k=top_k) if item_history else []
    if source == "trending":
        return "popularity", popularity_rec_service.get_popular_items(top_k=top_k)

    if item_history and sasrec_service.is_ready():
        items = _sasrec_items(item_history, top_k, history_meta)
        if items:
            return "sasrec", items

    if source == "for_you":
        seen = set(item_history)
        popular = popularity_rec_service.get_popular_items(top_k=top_k + len(seen))
        return "popularity", [p for p in popular if int(p["id"]) not in seen][:top_k]

    if item_history:
        recency_recs = recency_rec_service.recommend(item_history, top_k=top_k)
        if recency_recs:
            return "recency", recency_recs

    return "popularity", popularity_rec_service.get_popular_items(top_k=top_k)


def _sasrec_items(item_history: list[int], top_k: int, history_meta: Optional[dict] = None) -> list[dict]:
    pool = max(top_k * SASREC_CANDIDATE_FACTOR, SASREC_MIN_CANDIDATES)
    sasrec_recs = sasrec_service.recommend(item_history, top_k=pool)
    if not sasrec_recs:
        return []
    # get_products_by_ids chỉ trả SP ACTIVE + còn hàng -> SP ngừng bán/hết hàng rơi khỏi danh sách.
    product_map = get_products_by_ids([r["product_id"] for r in sasrec_recs])
    items = [
        {**product_map[r["product_id"]], "score": r["score"]}
        for r in sasrec_recs
        if r["product_id"] in product_map
    ]
    return rerank(items, top_k, history_median_price(item_history, history_meta))


@router.post("/recommend", response_model=RecommendResponse)
def get_recommendations(request: RecommendRequest):
    try:
        # Key naming là hợp đồng dùng chung với BE Java (xem shared_common.contracts) - written
        # by forecast-service/behavior_consumer.py mỗi khi có sự kiện view/cart.
        item_history = _resolve_history(request.userId, request.sessionId)

        strategy, recs = _recommend_for_history(item_history, request.top_k)
        items = [RecommendedItem(**item) for item in recs]

        return RecommendResponse(strategy=strategy, items=items)
    except Exception as e:
        logger.error(f"Error in recommendation endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _personal(user_id: Optional[str], session_id: Optional[str], top_k: int, source: Source,
              response: Response) -> list[dict]:
    item_history = _resolve_history(user_id, session_id)
    strategy, recs = _recommend_for_history(item_history, top_k, source)
    # Body giữ nguyên dạng list như trước (FE đang đọc list); strategy đưa ra header để debug/đo.
    response.headers["X-Recs-Strategy"] = strategy
    return recs


@router.get("/recommendations/personal")
def get_personal_recommendations(
    response: Response,
    top_k: int = TopK,
    source: Source = "auto",
    x_user_id: Optional[str] = Header(None),
    x_session_id: Optional[str] = Header(None),
):
    """Route cần đăng nhập ở gateway. Danh tính CHỈ lấy từ `X-User-Id` do gateway inject từ JWT.

    Trước đây nhận `?user_id=` — ai đã đăng nhập cũng đọc được gợi ý dựng từ lịch sử của người khác.
    Client cũ còn gửi tham số này vẫn chạy (FastAPI bỏ qua query lạ), chỉ là không còn tác dụng.
    """
    try:
        return _personal(x_user_id or None, x_session_id, top_k, source, response)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/recommendations/personal")
def get_public_personal_recommendations(
    response: Response,
    top_k: int = TopK,
    source: Source = "auto",
    x_user_id: Optional[str] = Header(None),
    x_session_id: Optional[str] = Header(None),
):
    """Cho cả khách chưa đăng nhập (gateway đã route + permitAll `/api/v1/public/**`).

    Cố ý KHÔNG nhận `user_id` qua query: route public mà tin query thì ai cũng đọc được gợi ý dựng
    từ lịch sử xem của người khác. Chỉ tin `X-User-Id` (gateway strip header client, inject từ JWT
    nếu request có token) và `X-Session-Id` của chính phiên đang gọi.
    """
    try:
        return _personal(x_user_id or None, x_session_id, top_k, source, response)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _parse_item_ids(raw: str) -> list[int]:
    ids: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if not part.isdigit():
            raise HTTPException(status_code=422, detail=f"item_ids phải là danh sách id số, nhận '{part}'")
        if int(part) not in ids:
            ids.append(int(part))
    if not ids:
        raise HTTPException(status_code=422, detail="item_ids rỗng")
    return ids[:50]


def _cross_sell(item_ids: str, top_k: int, response: Response) -> list[dict]:
    cart_ids = _parse_item_ids(item_ids)
    try:
        strategy, recs = recommend_for_cart(cart_ids, top_k)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    response.headers["X-Recs-Strategy"] = strategy
    return recs


@router.get("/recommendations/cross-sell")
def get_cross_sell_combo(response: Response, item_ids: str = Query(..., alias="item_ids"),
                         top_k: int = Query(5, ge=1, le=MAX_TOP_K)):
    """"Mua kèm" cho giỏ hàng: `item_ids` = product id trong giỏ, phân tách bằng dấu phẩy.
    Phụ thuộc giỏ (mua cùng đơn + phụ kiện cùng hệ), xem app/services/cross_sell.py."""
    return _cross_sell(item_ids, top_k, response)


@router.get("/public/recommendations/cross-sell")
def get_public_cross_sell_combo(response: Response, item_ids: str = Query(..., alias="item_ids"),
                                top_k: int = Query(5, ge=1, le=MAX_TOP_K)):
    """Bản public cho khách chưa đăng nhập (giỏ khách vãng lai) — không dùng danh tính nào."""
    return _cross_sell(item_ids, top_k, response)
