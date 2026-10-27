"""
Truy cập dữ liệu catalog thật cho search-service:

- MariaDB `ecommerce_product_db` (nguồn gốc): metadata sản phẩm (tên, giá hiệu lực, ảnh).
- Elasticsearch index `products` (product-service tự đồng bộ): BM25 keyword + autocomplete.
  ES không sẵn sàng ⇒ fallback LIKE trên MariaDB để search vẫn chạy được.
- MongoDB `product_similarities` (scripts/build_index.py ghi): sản phẩm tương tự precompute.

Mọi id trả ra là int (productId trong MariaDB).
"""
import re
import threading
import time
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.core.config import search_settings
from shared_common.database import get_mongo_client, get_mysql_connection
from shared_common.logger import get_logger

logger = get_logger(__name__)

SIMILARITY_COLLECTION = "product_similarities"
_META_TTL_SECONDS = 300


# ── MariaDB: metadata ────────────────────────────────────────────────────────

_meta_cache: Dict[int, Tuple[float, Dict[str, Any]]] = {}
_meta_lock = threading.Lock()


def _effective_price(price, sale_price) -> float:
    price = float(price or 0)
    sale = float(sale_price or 0)
    return sale if 0 < sale < price else price


def _query(sql: str, params: Iterable = ()) -> List[Dict[str, Any]]:
    conn = get_mysql_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            return list(cur.fetchall())
    finally:
        conn.close()


def get_products_by_ids(ids: List[int]) -> Dict[int, Dict[str, Any]]:
    """
    {productId: {name, price, image}} cho các sản phẩm đang active.
    Sản phẩm đã ẩn/xoá không có trong kết quả ⇒ caller tự bỏ qua (index cũ vẫn an toàn).
    """
    ids = [int(i) for i in dict.fromkeys(ids)]
    if not ids:
        return {}

    now = time.time()
    result: Dict[int, Dict[str, Any]] = {}
    missing: List[int] = []
    with _meta_lock:
        for pid in ids:
            cached = _meta_cache.get(pid)
            if cached and now - cached[0] < _META_TTL_SECONDS:
                result[pid] = cached[1]
            else:
                missing.append(pid)

    if missing:
        placeholders = ",".join(["%s"] * len(missing))
        try:
            rows = _query(
                f"""
                SELECT p.id, p.name, p.price, p.sale_price,
                       COALESCE(NULLIF(p.image_url, ''),
                                (SELECT pi.image_url FROM product_images pi
                                  WHERE pi.product_id = p.id
                                  ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1)) AS image
                  FROM products p
                 WHERE p.id IN ({placeholders}) AND p.active = 1
                """,
                missing,
            )
        except Exception as e:
            logger.error(f"Lỗi đọc metadata sản phẩm từ MariaDB: {e}")
            rows = []

        with _meta_lock:
            for r in rows:
                meta = {
                    "name": r["name"],
                    "price": _effective_price(r["price"], r["sale_price"]),
                    "image": r["image"],
                }
                _meta_cache[int(r["id"])] = (now, meta)
                result[int(r["id"])] = meta
    return result


def load_catalog_for_index() -> List[Dict[str, Any]]:
    """
    Toàn bộ sản phẩm active kèm text + danh sách ảnh — dùng cho scripts/build_index.py.
    [{id, name, description, brand, category, images: [url, ...]}]
    """
    if search_settings.CATALOG_SOURCE == "elasticsearch":
        return _load_catalog_from_es()

    products = _query(
        """
        SELECT p.id, p.name, p.description, p.image_url,
               COALESCE(b.name, p.brand) AS brand, c.name AS category
          FROM products p
          LEFT JOIN brands b ON b.id = p.brand_id
          LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.active = 1
         ORDER BY p.id
        """
    )
    images = _query(
        """
        SELECT pi.product_id, pi.image_url
          FROM product_images pi
          JOIN products p ON p.id = pi.product_id AND p.active = 1
         ORDER BY pi.product_id, pi.is_primary DESC, pi.sort_order ASC
        """
    )
    by_product: Dict[int, List[str]] = {}
    for r in images:
        by_product.setdefault(int(r["product_id"]), []).append(r["image_url"])

    catalog = []
    for p in products:
        pid = int(p["id"])
        urls = [p["image_url"]] if p["image_url"] else []
        urls += [u for u in by_product.get(pid, []) if u and u not in urls]
        catalog.append({
            "id": pid,
            "name": p["name"] or "",
            "description": p["description"] or "",
            "brand": p["brand"] or "",
            "category": p["category"] or "",
            "images": urls,
        })
    return catalog


# ── Elasticsearch: BM25 + autocomplete ───────────────────────────────────────

_es_client = None
_es_down_until = 0.0
_ES_RETRY_SECONDS = 30


def _get_es():
    """ES client dùng chung. Lỗi kết nối ⇒ tạm bỏ qua ES 30s để request không bị chậm theo timeout."""
    global _es_client
    if time.time() < _es_down_until:
        return None
    if _es_client is None:
        from elasticsearch import Elasticsearch
        _es_client = Elasticsearch(search_settings.ELASTICSEARCH_HOST, request_timeout=3)
    return _es_client


def _mark_es_down(e: Exception) -> None:
    global _es_down_until
    _es_down_until = time.time() + _ES_RETRY_SECONDS
    logger.warning(f"Elasticsearch không khả dụng, dùng fallback MariaDB trong {_ES_RETRY_SECONDS}s: {e}")


def _tokens(text: str) -> List[str]:
    return [t for t in re.split(r"\s+", text.strip()) if t][:8]


def bm25_search(query: str, size: int = 30) -> List[Dict[str, Any]]:
    """[{id, score}] xếp theo BM25 (ES). Fallback: khớp từ khoá trên tên sản phẩm (MariaDB)."""
    if not query.strip():
        return []

    es = _get_es()
    if es is not None:
        try:
            resp = es.search(
                index=search_settings.ES_INDEX_NAME,
                size=size,
                source=False,
                query={
                    "bool": {
                        "must": {
                            "multi_match": {
                                "query": query,
                                "fields": ["name^3", "brand^2", "categoryName^2", "description"],
                                "fuzziness": "AUTO",
                            }
                        },
                        "filter": [{"term": {"active": True}}],
                    }
                },
            )
            return [{"id": int(h["_id"]), "score": float(h["_score"] or 0)} for h in resp["hits"]["hits"]]
        except Exception as e:
            _mark_es_down(e)

    return _keyword_search_db(query, size)


def _keyword_search_db(query: str, size: int) -> List[Dict[str, Any]]:
    tokens = _tokens(query)
    if not tokens:
        return []
    match_expr = " + ".join(["(p.name LIKE %s)"] * len(tokens))
    params = [f"%{t}%" for t in tokens]
    try:
        rows = _query(
            f"""
            SELECT p.id, ({match_expr}) AS matched
              FROM products p
             WHERE p.active = 1
            HAVING matched > 0
             ORDER BY matched DESC, p.sales_count DESC
             LIMIT %s
            """,
            params + [size],
        )
    except Exception as e:
        logger.error(f"Lỗi keyword search fallback: {e}")
        return []
    return [{"id": int(r["id"]), "score": float(r["matched"])} for r in rows]


def suggest(prefix: str, size: int = 5) -> List[str]:
    """Gợi ý tên sản phẩm cho ô tìm kiếm (match_phrase_prefix trên ES, fallback LIKE)."""
    prefix = prefix.strip()
    if len(prefix) < 2:
        return []

    names: List[str] = []
    es = _get_es()
    if es is not None:
        try:
            resp = es.search(
                index=search_settings.ES_INDEX_NAME,
                size=size * 2,
                source=["name"],
                query={
                    "bool": {
                        "must": {"match_phrase_prefix": {"name": {"query": prefix}}},
                        "filter": [{"term": {"active": True}}],
                    }
                },
                sort=[{"_score": "desc"}, {"salesCount": {"order": "desc", "unmapped_type": "integer"}}],
            )
            names = [h["_source"]["name"] for h in resp["hits"]["hits"] if h.get("_source", {}).get("name")]
        except Exception as e:
            _mark_es_down(e)

    if not names:
        try:
            rows = _query(
                """
                SELECT p.name FROM products p
                 WHERE p.active = 1 AND p.name LIKE %s
                 ORDER BY (p.name LIKE %s) DESC, p.sales_count DESC
                 LIMIT %s
                """,
                [f"%{prefix}%", f"{prefix}%", size * 2],
            )
            names = [r["name"] for r in rows]
        except Exception as e:
            logger.error(f"Lỗi suggest fallback: {e}")

    return list(dict.fromkeys(names))[:size]


def _load_catalog_from_es() -> List[Dict[str, Any]]:
    from elasticsearch.helpers import scan

    es = _get_es()
    if es is None:
        raise RuntimeError("Elasticsearch không khả dụng — đặt CATALOG_SOURCE=mariadb.")
    catalog = []
    for doc in scan(es, index=search_settings.ES_INDEX_NAME, query={"query": {"term": {"active": True}}}):
        s = doc["_source"]
        catalog.append({
            "id": int(doc["_id"]),
            "name": s.get("name") or "",
            "description": s.get("description") or "",
            "brand": s.get("brand") or "",
            "category": s.get("categoryName") or "",
            "images": [s["imageUrl"]] if s.get("imageUrl") else [],
        })
    return catalog


# ── MongoDB: sản phẩm tương tự (precompute) ──────────────────────────────────

_mongo_client = None


def _similarity_collection():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = get_mongo_client()
    return _mongo_client.get_default_database()[SIMILARITY_COLLECTION]


def get_similar_ids(product_id: int) -> List[Dict[str, Any]]:
    """[{id, score}] giảm dần — schema khớp entity ProductSimilarity của product-service."""
    try:
        doc = _similarity_collection().find_one({"productId": int(product_id)})
    except Exception as e:
        logger.error(f"Lỗi đọc product_similarities: {e}")
        return []
    if not doc:
        return []
    items = [
        {"id": int(s["similarProductId"]), "score": float(s.get("similarityScore") or 0)}
        for s in doc.get("similarItems", [])
        if s.get("similarProductId") is not None and int(s["similarProductId"]) != int(product_id)
    ]
    items.sort(key=lambda x: x["score"], reverse=True)
    return items


def save_similarities(similar: Dict[int, List[Tuple[int, float]]]) -> int:
    """Ghi đè toàn bộ product_similarities (dùng khi build index). Trả số document đã ghi."""
    from pymongo import ReplaceOne

    col = _similarity_collection()
    now = datetime.utcnow()
    ops = [
        ReplaceOne(
            {"productId": pid},
            {
                "productId": pid,
                "similarItems": [{"similarProductId": sid, "similarityScore": round(score, 6)} for sid, score in items],
                "updatedAt": now,
            },
            upsert=True,
        )
        for pid, items in similar.items()
    ]
    if ops:
        col.bulk_write(ops, ordered=False)
    col.delete_many({"productId": {"$nin": list(similar.keys())}})
    return len(ops)


def _to_match_score(cosine: float) -> int:
    """Quy cosine (đã normalize) về 0–100 để hiển thị badge %."""
    pct = (cosine + 1.0) / 2.0 * 100.0
    return int(max(0, min(100, round(pct))))


def get_similar_by_product(product_id: int, top_k: int = 10) -> List[Dict[str, Any]]:
    """Đọc top similar đã precompute từ MongoDB (nhanh, không cần FAISS real-time)."""
    sims = get_similar_ids(product_id)[:top_k]
    meta = get_products_by_ids([s["id"] for s in sims])
    items = []
    for s in sims:
        m = meta.get(s["id"])
        if not m:
            continue
        items.append({
            "id": str(s["id"]),
            "name": m["name"],
            "price": m["price"],
            "image": m.get("image"),
            "score": round(float(s["score"]), 4),
            "matchScore": _to_match_score(s["score"]),
        })
    return items


def clear_meta_cache(product_ids: Optional[List[int]] = None) -> None:
    with _meta_lock:
        if product_ids is None:
            _meta_cache.clear()
        else:
            for pid in product_ids:
                _meta_cache.pop(int(pid), None)
