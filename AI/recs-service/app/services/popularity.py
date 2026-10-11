from typing import Any, Dict, List

from shared_common.logger import get_logger

from app.services.catalog import get_top_products

logger = get_logger(__name__)


class PopularityRecService:
    def get_popular_items(self, top_k: int = 10) -> List[Dict[str, Any]]:
        """Sản phẩm ACTIVE bán chạy nhất (fallback cho cold-start và khi SASRec chưa sẵn sàng)."""
        logger.info(f"Retrieving top {top_k} trending items for cold-start fallback...")
        return get_top_products(top_k)


popularity_rec_service = PopularityRecService()
