import threading
import time
from typing import Any, Dict, List

from shared_common.logger import get_logger

from app.services.catalog import get_products_by_ids, get_top_products, get_trending_product_scores

logger = get_logger(__name__)

WINDOW_DAYS = 30
CART_WEIGHT = 3.0  # thêm giỏ là tín hiệu ý định mạnh hơn hẳn 1 lượt xem
CANDIDATE_POOL = 100  # lấy dư để còn đủ top_k sau khi loại SP đã ẩn
CACHE_TTL_SECONDS = 300


class PopularityRecService:
    """Sản phẩm được quan tâm nhiều nhất theo hành vi THẬT (`user_events`, 30 ngày) — tầng cold-start.

    Trước đây xếp theo `products.sales_count`, nhưng không có code nào cập nhật cột này (= 0 cho
    toàn bộ 1.123 SP), nên "Popularity" thực chất trả thứ tự tuỳ ý. Chỉ rơi về `sales_count` khi
    `user_events` chưa có dữ liệu nào (hệ thống mới dựng).

    Kết quả cache trong process `CACHE_TTL_SECONDS` — truy vấn GROUP BY toàn bảng không nên chạy
    mỗi lượt tải trang chủ, và độ phổ biến 30 ngày không đổi đáng kể trong vài phút.
    """

    def __init__(self):
        self._cache: List[Dict[str, Any]] = []
        self._cache_at = 0.0
        self._lock = threading.Lock()

    def _ranked_items(self) -> List[Dict[str, Any]]:
        with self._lock:
            if self._cache and time.monotonic() - self._cache_at < CACHE_TTL_SECONDS:
                return self._cache

            scores = get_trending_product_scores(WINDOW_DAYS, CANDIDATE_POOL, CART_WEIGHT)
            if scores:
                product_map = get_products_by_ids([pid for pid, _ in scores])
                items = [{**product_map[pid], "score": s} for pid, s in scores if pid in product_map]
            else:
                logger.warning("user_events chua co hanh vi nao trong cua so — roi ve sales_count")
                items = get_top_products(CANDIDATE_POOL)

            if items:
                self._cache, self._cache_at = items, time.monotonic()
            return items

    def get_popular_items(self, top_k: int = 10) -> List[Dict[str, Any]]:
        """Top `top_k` sản phẩm ACTIVE phổ biến nhất (fallback cho cold-start)."""
        return self._ranked_items()[:top_k]


popularity_rec_service = PopularityRecService()
