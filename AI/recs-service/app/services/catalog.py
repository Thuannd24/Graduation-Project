"""Tra cứu thông tin sản phẩm THẬT từ `ecommerce_product_db.products` — dùng chung cho mọi strategy
gợi ý (SASRec, Recency, Popularity) để trả về sản phẩm có thật, thay vì tên/giá bịa.
"""
import threading
import time
from typing import Dict, Iterable, List, Optional

from sqlalchemy import bindparam, text

from shared_common.contracts import ACTION_ADD_TO_CART, ACTION_VIEW_PRODUCT
from shared_common.logger import get_logger
from shared_common.pool import get_engine

logger = get_logger(__name__)

_PRODUCTS_TABLE = "ecommerce_product_db.products"
_USER_EVENTS_TABLE = "ecommerce_order_db.user_events"
_ORDER_ITEMS_TABLE = "ecommerce_order_db.order_items"
_ORDERS_TABLE = "ecommerce_order_db.orders"
_INVENTORIES_TABLE = "ecommerce_inventory_db.inventories"
_CATEGORIES_TABLE = "ecommerce_product_db.categories"

# Các cột `ProductCard` (FE) cần để hiển thị: thiếu `image` thì card gợi ý không có ảnh.
_PRODUCT_COLUMNS = "id, name, price, sale_price, image_url, slug, rating_avg, category_id"


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
        # Dùng cho re-rank đa dạng danh mục và cross-sell theo danh mục phụ kiện; FE bỏ qua được.
        "categoryId": int(row["category_id"]) if row.get("category_id") is not None else None,
    }


def _out_of_stock_ids(conn, product_ids: List[int]) -> set:
    """Id có bản ghi tồn kho nhưng TỔNG số lượng (mọi biến thể) <= 0. SP chưa có bản ghi tồn kho
    coi là "không rõ" và KHÔNG bị loại. Lỗi (vd tài khoản DB chỉ-đọc không có quyền trên
    `ecommerce_inventory_db`) -> không lọc tồn kho thay vì làm mất mọi gợi ý."""
    stmt = text(
        f"SELECT product_id FROM {_INVENTORIES_TABLE} WHERE product_id IN :ids "
        "GROUP BY product_id HAVING SUM(quantity) <= 0"
    ).bindparams(bindparam("ids", expanding=True))
    try:
        return {int(r[0]) for r in conn.execute(stmt, {"ids": list(product_ids)}).all()}
    except Exception as e:
        logger.warning(f"Khong doc duoc ton kho, bo qua loc het hang: {e}")
        return set()


def get_products_by_ids(product_ids: List[int]) -> Dict[int, dict]:
    """{product_id: item} cho các id ACTIVE và CÒN HÀNG tìm thấy — id không tồn tại/đã ẩn/hết hàng bị
    bỏ qua lặng lẽ (gọi nơi dùng phải tự loại các item không có trong dict trả về). Trước đây không
    kiểm tồn kho: gợi ý món không mua được, "Thêm nhanh vào giỏ" báo thành công rồi lại báo hết hàng."""
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
            sold_out = _out_of_stock_ids(conn, [int(r["id"]) for r in rows]) if rows else set()
    except Exception as e:
        logger.error(f"Loi tra cuu san pham theo id: {e}")
        return {}
    return {int(r["id"]): _to_item(r) for r in rows if int(r["id"]) not in sold_out}


def get_product_meta(product_ids: Iterable[int]) -> Optional[Dict[int, dict]]:
    """{id: {price, category_id}} cho các id còn ACTIVE (bất kể tồn kho) — dùng để làm sạch lịch sử
    (bỏ SP đã xoá/ngừng bán) và lấy tầng giá/danh mục của lịch sử hoặc giỏ hàng.

    Trả **None** khi lỗi DB (khác với dict rỗng = không SP nào còn bán): nơi gọi phải giữ nguyên
    hành vi cũ thay vì xoá sạch lịch sử chỉ vì DB chập chờn."""
    ids = sorted({int(i) for i in product_ids})
    if not ids:
        return {}
    stmt = text(
        f"SELECT id, price, sale_price, category_id FROM {_PRODUCTS_TABLE} "
        "WHERE id IN :ids AND active = 1"
    ).bindparams(bindparam("ids", expanding=True))
    try:
        with get_engine("ecommerce_product_db").connect() as conn:
            rows = conn.execute(stmt, {"ids": ids}).mappings().all()
    except Exception as e:
        logger.error(f"Loi tra cuu meta san pham: {e}")
        return None
    return {
        int(r["id"]): {
            "price": _row_price(r),
            "category_id": int(r["category_id"]) if r["category_id"] is not None else None,
        }
        for r in rows
    }


_CATEGORY_CACHE_TTL = 600
_category_cache: dict = {"at": 0.0, "tree": None}
_category_lock = threading.Lock()


def get_category_tree() -> Optional[Dict[int, dict]]:
    """{id: {name, parent_id}} của bảng categories (nhỏ, ít đổi -> cache 10 phút). None nếu lỗi."""
    with _category_lock:
        if _category_cache["tree"] is not None and time.monotonic() - _category_cache["at"] < _CATEGORY_CACHE_TTL:
            return _category_cache["tree"]
        try:
            with get_engine("ecommerce_product_db").connect() as conn:
                rows = conn.execute(text(f"SELECT id, name, parent_id FROM {_CATEGORIES_TABLE}")).mappings().all()
        except Exception as e:
            logger.error(f"Loi doc danh muc: {e}")
            return None
        tree = {int(r["id"]): {"name": r["name"] or "",
                               "parent_id": int(r["parent_id"]) if r["parent_id"] is not None else None}
                for r in rows}
        _category_cache.update(at=time.monotonic(), tree=tree)
        return tree


def get_co_purchased(product_ids: List[int], limit: int) -> List[tuple]:
    """[(product_id, số đơn mua cùng)] — SP xuất hiện CÙNG ĐƠN với bất kỳ SP nào trong `product_ids`
    (bỏ đơn đã huỷ), không gồm chính các SP đó. Rỗng nếu lỗi/không có dữ liệu."""
    if not product_ids:
        return []
    stmt = text(
        "SELECT other.product_id, COUNT(DISTINCT other.order_id) AS cnt "
        f"FROM {_ORDER_ITEMS_TABLE} base "
        f"JOIN {_ORDER_ITEMS_TABLE} other ON other.order_id = base.order_id AND other.product_id <> base.product_id "
        f"JOIN {_ORDERS_TABLE} o ON o.id = base.order_id "
        "WHERE base.product_id IN :ids AND other.product_id NOT IN :ids AND o.status <> 'CANCELLED' "
        "GROUP BY other.product_id ORDER BY cnt DESC LIMIT :k"
    ).bindparams(bindparam("ids", expanding=True))
    try:
        with get_engine("ecommerce_order_db").connect() as conn:
            rows = conn.execute(stmt, {"ids": list(product_ids), "k": limit}).all()
    except Exception as e:
        logger.error(f"Loi tinh mua kem tu order_items: {e}")
        return []
    return [(int(pid), float(cnt)) for pid, cnt in rows]


def get_product_ids_in_categories(category_ids: Iterable[int], limit: int) -> List[int]:
    """Id SP ACTIVE thuộc các danh mục cho trước, ưu tiên đánh giá cao. Rỗng nếu lỗi."""
    cats = sorted({int(c) for c in category_ids})
    if not cats:
        return []
    stmt = text(
        f"SELECT id FROM {_PRODUCTS_TABLE} WHERE category_id IN :cats AND active = 1 "
        "ORDER BY rating_avg DESC, sales_count DESC, id LIMIT :k"
    ).bindparams(bindparam("cats", expanding=True))
    try:
        with get_engine("ecommerce_product_db").connect() as conn:
            return [int(r[0]) for r in conn.execute(stmt, {"cats": cats, "k": limit}).all()]
    except Exception as e:
        logger.error(f"Loi tra cuu san pham theo danh muc: {e}")
        return []


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
