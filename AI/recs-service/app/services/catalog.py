"""Tra cứu thông tin sản phẩm THẬT từ `ecommerce_product_db.products` — dùng chung cho mọi strategy
gợi ý (SASRec, Recency, Popularity) để trả về sản phẩm có thật, thay vì tên/giá bịa.
"""
from typing import Dict, List, Optional

from sqlalchemy import bindparam, text

from shared_common.contracts import ACTION_ADD_TO_CART, ACTION_VIEW_PRODUCT
from shared_common.logger import get_logger
from shared_common.pool import get_engine

logger = get_logger(__name__)

_PRODUCTS_TABLE = "ecommerce_product_db.products"
_USER_EVENTS_TABLE = "ecommerce_order_db.user_events"

# Các cột `ProductCard` (FE) cần để hiển thị: thiếu `image` thì card gợi ý không có ảnh.
_PRODUCT_COLUMNS = "id, name, price, sale_price, image_url, slug, rating_avg"


def _row_price(row) -> float:
    # sale_price ưu tiên nếu có (đang khuyến mãi), rơi về price gốc nếu không
    price = row["sale_price"] if row["sale_price"] is not None else row["price"]
    return float(price)


def _row_old_price(row) -> Optional[float]:
    # Giá gốc chỉ có nghĩa khi đang giảm giá thật (FE gạch ngang giá này)
    if row["sale_price"] is not None and row["price"] is not None and row["sale_price"] < row["price"]:
        return float(row["price"])
    return None


def _to_item(row) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "price": _row_price(row),
        "oldPrice": _row_old_price(row),
        "image": row["image_url"],
        "slug": row["slug"],
        "rating": float(row["rating_avg"]) if row["rating_avg"] is not None else None,
    }


def get_products_by_ids(product_ids: List[int]) -> Dict[int, dict]:
    """{product_id: item} cho các id ACTIVE tìm thấy — id không tồn tại/đã ẩn bị bỏ qua lặng lẽ
    (gọi nơi dùng phải tự loại các item không có trong dict trả về)."""
    if not product_ids:
        return {}
    engine = get_engine("ecommerce_product_db")
    stmt = text(
        f"SELECT {_PRODUCT_COLUMNS} FROM {_PRODUCTS_TABLE} "
        "WHERE id IN :ids AND active = 1"
    ).bindparams(bindparam("ids", expanding=True))
    try:
        with engine.connect() as conn:
            rows = conn.execute(stmt, {"ids": list(product_ids)}).mappings().all()
    except Exception as e:
        logger.error(f"Loi tra cuu san pham theo id: {e}")
        return {}
    return {int(r["id"]): _to_item(r) for r in rows}


def get_top_products(limit: int) -> List[dict]:
    """Top sản phẩm ACTIVE theo `sales_count` — CHỈ dùng khi chưa có hành vi nào trong
    `user_events` (xem `popularity.py`): không có code nào cập nhật `sales_count`, nên cột này bằng 0
    cho toàn bộ catalog và thứ tự trả về thực chất là tuỳ ý (đo được 2026-09-26)."""
    engine = get_engine("ecommerce_product_db")
    stmt = text(
        f"SELECT {_PRODUCT_COLUMNS}, sales_count FROM {_PRODUCTS_TABLE} "
        "WHERE active = 1 ORDER BY sales_count DESC, rating_avg DESC LIMIT :k"
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(stmt, {"k": limit}).mappings().all()
    except Exception as e:
        logger.error(f"Loi tra cuu top san pham: {e}")
        return []
    return [{**_to_item(r), "score": float(r["sales_count"] or 0)} for r in rows]


def get_trending_product_scores(window_days: int, limit: int, cart_weight: float) -> List[tuple[int, float]]:
    """[(product_id, score)] theo hành vi THẬT trong `window_days` ngày gần nhất:
    score = số VIEW_PRODUCT + `cart_weight` × số ADD_TO_CART. Rỗng nếu lỗi/không có dữ liệu."""
    engine = get_engine("ecommerce_order_db")
    stmt = text(
        f"SELECT item_id, SUM(CASE WHEN action_type = :cart THEN :w ELSE 1 END) AS score "
        f"FROM {_USER_EVENTS_TABLE} "
        "WHERE action_type IN (:view, :cart) AND item_id IS NOT NULL "
        "AND created_at >= NOW() - INTERVAL :days DAY "
        "GROUP BY item_id ORDER BY score DESC LIMIT :k"
    )
    params = {"view": ACTION_VIEW_PRODUCT, "cart": ACTION_ADD_TO_CART, "w": cart_weight,
              "days": window_days, "k": limit}
    try:
        with engine.connect() as conn:
            rows = conn.execute(stmt, params).all()
    except Exception as e:
        logger.error(f"Loi tinh trending tu user_events: {e}")
        return []
    return [(int(item_id), float(score)) for item_id, score in rows]
