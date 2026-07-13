from typing import List, Dict, Any
from shared_common.logger import get_logger

logger = get_logger(__name__)

class PopularityRecService:
    def get_popular_items(self, top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieves generally trending items (most views / purchases).
        """
        logger.info(f"Retrieving top {top_k} trending items for cold-start fallback...")
        
        # Real implementation: query Redis sorted set or database aggregated counts.
        # Mocking values for base structure
        trending_items = [
            {"id": f"prod_trend_{i}", "name": f"Mock Trending Product {i}", "price": 299000.0, "score": float(100 - i)}
            for i in range(top_k)
        ]
        return trending_items

popularity_rec_service = PopularityRecService()
