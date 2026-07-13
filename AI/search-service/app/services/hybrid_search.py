from typing import List, Dict, Any
from app.services.text_search import text_search_service
from shared_common.logger import get_logger

logger = get_logger(__name__)

class HybridSearchService:
    def __init__(self):
        pass

    def reciprocal_rank_fusion(self, bm25_results: List[Dict[str, Any]], dense_results: List[Dict[str, Any]], k: int = 60) -> List[Dict[str, Any]]:
        """
        Reciprocal Rank Fusion (RRF) algorithm.
        bm25_results and dense_results are lists of dicts containing at least 'id'.
        """
        logger.info("Fusing BM25 and Dense search results using RRF...")
        rrf_scores = {}
        
        # Helper to compute and accumulate RRF scores
        def accum_scores(results):
            for rank, item in enumerate(results):
                item_id = item['id']
                score = 1.0 / (k + rank + 1)
                if item_id in rrf_scores:
                    rrf_scores[item_id]['rrf_score'] += score
                    # Keep other metadata
                    rrf_scores[item_id]['sources'].append(item.get('source', 'unknown'))
                else:
                    rrf_scores[item_id] = {
                        'id': item_id,
                        'name': item.get('name', 'Product'),
                        'price': item.get('price', 0.0),
                        'rrf_score': score,
                        'sources': [item.get('source', 'unknown')]
                    }

        # Tag sources
        for item in bm25_results:
            item['source'] = 'bm25'
        for item in dense_results:
            item['source'] = 'dense'

        accum_scores(bm25_results)
        accum_scores(dense_results)

        # Sort by RRF score descending
        sorted_items = sorted(rrf_scores.values(), key=lambda x: x['rrf_score'], reverse=True)
        
        # Convert RRF scores back to a normalized-like score
        for item in sorted_items:
            item['score'] = float(item['rrf_score'])
            item['match_reason'] = "+".join(item['sources'])
            del item['rrf_score']
            del item['sources']

        return sorted_items

    def search(self, query: str, top_k: int = 10, min_price: float = None, max_price: float = None) -> List[Dict[str, Any]]:
        logger.info(f"Performing hybrid search for query: '{query}'")
        
        # 1. Get Dense/Semantic results
        query_vector = text_search_service.encode_query(query)
        dense_res = text_search_service.search_semantic(query_vector, top_k=top_k * 2)
        
        # 2. Get Sparse/BM25 results (mocked here, in production queries Elasticsearch)
        bm25_res = [
            {"id": f"prod_{i}", "name": f"Mock Keyword Product {i}", "price": 450000.0}
            for i in range(5, 5 + top_k * 2)
        ]
        
        # 3. Fuse results
        fused = self.reciprocal_rank_fusion(bm25_res, dense_res)
        
        # Filter by price if provided
        if min_price is not None:
            fused = [x for x in fused if x['price'] >= min_price]
        if max_price is not None:
            fused = [x for x in fused if x['price'] <= max_price]
            
        return fused[:top_k]

hybrid_search_service = HybridSearchService()
