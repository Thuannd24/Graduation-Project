from typing import List, Dict, Any, Optional

from app.core.config import search_settings
from app.services.text_search import text_search_service
from app.services import catalog
from shared_common.logger import get_logger

logger = get_logger(__name__)


class HybridSearchService:
    """
    Hybrid Search = BM25 (Elasticsearch, sparse) + Dense (e5-large, FAISS) fuse bằng
    Reciprocal Rank Fusion (RRF). Công thức: score(d) = Σ 1/(k + rank_i(d)), k=60.
    """

    def reciprocal_rank_fusion(
        self,
        ranked_lists: Dict[str, List[int]],
        k: int = 60,
    ) -> List[Dict[str, Any]]:
        """
        ranked_lists: {source_name: [productId theo thứ hạng]}.
        Trả list [{id, score, match_reason}] đã sắp giảm dần theo RRF score.
        """
        scores: Dict[int, float] = {}
        sources: Dict[int, List[str]] = {}
        for source, ids in ranked_lists.items():
            for rank, pid in enumerate(ids):
                scores[pid] = scores.get(pid, 0.0) + 1.0 / (k + rank + 1)
                sources.setdefault(pid, []).append(source)
        fused = [
            {"id": pid, "score": sc, "match_reason": "+".join(sorted(set(sources[pid])))}
            for pid, sc in scores.items()
        ]
        fused.sort(key=lambda x: x["score"], reverse=True)
        return fused

    def search(
        self,
        query: str,
        top_k: int = 10,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        pool = top_k * 3

        # 1) Dense (semantic) — e5-large + FAISS text index
        dense = text_search_service.search(query, top_k=pool)
        dense_ids = [d["id"] for d in dense]

        # 2) Sparse (keyword) — BM25 trên Elasticsearch index `products`
        bm25 = catalog.bm25_search(query, size=pool)
        bm25_ids = [b["id"] for b in bm25]

        if not dense_ids and not bm25_ids:
            logger.warning("Cả dense lẫn BM25 đều rỗng (index/ES chưa sẵn sàng?).")
            return []

        # 3) Fuse bằng RRF
        fused = self.reciprocal_rank_fusion(
            {"dense": dense_ids, "bm25": bm25_ids},
            k=search_settings.RRF_K,
        )

        # 4) Fetch metadata + lọc giá
        meta = catalog.get_products_by_ids([f["id"] for f in fused])
        results: List[Dict[str, Any]] = []
        for f in fused:
            m = meta.get(f["id"])
            if not m:
                continue
            price = m["price"]
            if min_price is not None and price < min_price:
                continue
            if max_price is not None and price > max_price:
                continue
            results.append({
                "id": str(f["id"]),
                "name": m["name"],
                "price": price,
                "image": m.get("image"),
                "score": round(float(f["score"]), 6),
                "match_reason": f["match_reason"],
            })
            if len(results) >= top_k:
                break
        return results


hybrid_search_service = HybridSearchService()
