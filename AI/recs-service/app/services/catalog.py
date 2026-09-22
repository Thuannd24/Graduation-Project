"""Tra cứu thông tin sản phẩm THẬT (name/price) từ `ecommerce_product_db.products` — dùng chung
cho mọi strategy gợi ý (SASRec, Popularity) để trả về sản phẩm có thật, thay vì tên/giá bịa.
"""
from typing import Dict, List

from sqlalchemy import bindparam, text

from shared_common.logger import get_logger
from shared_common.pool import get_engine

logger = get_logger(__name__)

_PRODUCTS_TABLE = "ecommerce_product_db.products"


def _row_price(row) -> float:
    # sale_price ưu tiên nếu có (đang khuyến mãi), rơi về price gốc nếu không
    price = row["sale_price"] if row["sale_price"] is not None else row["price"]
    return float(price)


def get_products_by_ids(product_ids: List[int]) -> Dict[int, dict]:
    """{product_id: {id, name, price}} cho các id ACTIVE tìm thấy — id không tồn tại/đã ẩn bị bỏ
    qua lặng lẽ (gọi nơi dùng phải tự loại các item không có trong dict trả về)."""
    if not product_ids:
        return {}
    engine = get_engine("ecommerce_product_db")
    stmt = text(
        f"SELECT id, name, price, sale_price FROM {_PRODUCTS_TABLE} "
        "WHERE id IN :ids AND active = 1"
    ).bindparams(bindparam("ids", expanding=True))
    try:
        with engine.connect() as conn:
            rows = conn.execute(stmt, {"ids": list(product_ids)}).mappings().all()
    except Exception as e:
        logger.error(f"Loi tra cuu san pham theo id: {e}")
        return {}
    return {int(r["id"]): {"id": str(r["id"]), "name": r["name"], "price": _row_price(r)} for r in rows}


def get_top_products(limit: int) -> List[dict]:
    """Top sản phẩm ACTIVE theo lượt bán, dùng cho Popularity/cold-start."""
    engine = get_engine("ecommerce_product_db")
    stmt = text(
        f"SELECT id, name, price, sale_price, sales_count FROM {_PRODUCTS_TABLE} "
        "WHERE active = 1 ORDER BY sales_count DESC, rating_avg DESC LIMIT :k"
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(stmt, {"k": limit}).mappings().all()
    except Exception as e:
        logger.error(f"Loi tra cuu top san pham: {e}")
        return []
    return [
        {"id": str(r["id"]), "name": r["name"], "price": _row_price(r), "score": float(r["sales_count"] or 0)}
        for r in rows
    ]
