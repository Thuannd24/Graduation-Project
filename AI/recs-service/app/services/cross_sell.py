"""Gợi ý "mua kèm" cho giỏ hàng — PHỤ THUỘC sản phẩm trong giỏ.

Trước đây endpoint cross-sell trả cùng MỘT danh sách phổ biến cho mọi giỏ. Giờ dựng ứng viên từ 2 nguồn:

1. **Mua cùng đơn** (`order_items`, bỏ đơn huỷ): SP thật sự hay được mua chung với SP trong giỏ. Chỉ giữ
   SP thuộc danh mục phụ kiện của giỏ, hoặc KHÁC nhóm gốc với SP trong giỏ và rẻ hơn hẳn SP chính
   (<= `CO_PURCHASE_MAX_PRICE_RATIO`) — để không gợi ý "mua kèm" một chiếc điện thoại thứ hai.
2. **Phụ kiện cùng hệ** (`ACCESSORY_RULES`): giỏ có điện thoại -> ốp lưng, sạc & cáp, pin dự phòng, tai
   nghe; laptop -> sạc, tai nghe, loa... Danh mục được khớp theo TÊN (không hardcode id) trên cây
   `categories`, kể cả danh mục cha (vd "Samsung" là con của "Điện thoại, Tablet").

Ứng viên được lọc ACTIVE + CÒN HÀNG (`get_products_by_ids`), không đắt hơn SP đắt nhất trong giỏ, xếp theo
điểm mua-cùng > phụ kiện phổ biến, rồi xen kẽ danh mục (không 2 SP cùng danh mục liên tiếp). Thiếu thì bù
bằng SP phổ biến KHÁC danh mục giỏ. Không đọc được giỏ (DB lỗi) -> rơi về phổ biến (bỏ SP đã có trong giỏ).
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.services import catalog
from app.services.popularity import popularity_rec_service
from app.services.rerank import diversify

# (từ khoá trong tên danh mục của SP trong giỏ hoặc danh mục cha) -> từ khoá tên danh mục phụ kiện
ACCESSORY_RULES: List[Tuple[Tuple[str, ...], Tuple[str, ...]]] = [
    (("điện thoại", "iphone", "tablet", "máy tính bảng"), ("ốp lưng", "sạc", "pin dự phòng", "tai nghe")),
    (("laptop",), ("sạc", "tai nghe", "loa", "pin dự phòng")),
    (("pc", "màn hình", "máy in", "máy tính để bàn"), ("loa", "tai nghe")),
    (("đồng hồ", "camera", "máy ảnh", "máy quay"), ("sạc", "pin dự phòng")),
    (("tai nghe", "loa", "âm thanh"), ("sạc", "pin dự phòng")),
    (("tivi",), ("loa",)),
    (("phụ kiện", "ốp lưng", "sạc", "pin dự phòng"), ("sạc", "pin dự phòng", "tai nghe", "ốp lưng")),
]
CO_PURCHASE_MAX_PRICE_RATIO = 0.5
# SP ngoài danh mục phụ kiện chỉ được nhận nếu mua cùng ít nhất chừng này đơn (1 đơn lẻ là nhiễu).
CO_PURCHASE_MIN_ORDERS_NON_ACCESSORY = 2
CANDIDATES_PER_SOURCE = 60
POPULARITY_POOL = 100


def _ancestor_names(cat_id: Optional[int], tree: Dict[int, dict]) -> List[str]:
    names, seen = [], set()
    while cat_id is not None and cat_id in tree and cat_id not in seen:
        seen.add(cat_id)
        names.append(tree[cat_id]["name"].lower())
        cat_id = tree[cat_id]["parent_id"]
    return names


def _root(cat_id: Optional[int], tree: Dict[int, dict]) -> Optional[int]:
    seen = set()
    while cat_id in tree and tree[cat_id]["parent_id"] is not None and cat_id not in seen:
        seen.add(cat_id)
        cat_id = tree[cat_id]["parent_id"]
    return cat_id


def accessory_category_ids(cart_category_ids: List[Optional[int]], tree: Dict[int, dict]) -> set:
    wanted: set = set()
    for cat_id in cart_category_ids:
        names = _ancestor_names(cat_id, tree)
        for triggers, accessories in ACCESSORY_RULES:
            if any(t in n for n in names for t in triggers):
                wanted.update(accessories)
    if not wanted:
        return set()
    return {cid for cid, c in tree.items() if any(w in c["name"].lower() for w in wanted)}


def _popular_rank_bonus(exclude: set) -> Dict[int, float]:
    popular = popularity_rec_service.get_popular_items(top_k=POPULARITY_POOL)
    n = max(len(popular), 1)
    return {int(p["id"]): 0.5 * (1 - i / n) for i, p in enumerate(popular) if int(p["id"]) not in exclude}


def _popular_fallback(cart_ids: set, top_k: int, exclude_roots: set = frozenset(),
                      tree: Optional[Dict[int, dict]] = None) -> List[dict]:
    """Bù bằng SP phổ biến, bỏ SP đã trong giỏ và SP cùng NHÓM GỐC với giỏ (giỏ có điện thoại thì
    không bù thêm điện thoại hãng khác)."""
    popular = popularity_rec_service.get_popular_items(top_k=top_k + len(cart_ids) + POPULARITY_POOL)
    out = [p for p in popular
           if int(p["id"]) not in cart_ids
           and not (tree and p.get("categoryId") is not None and _root(p["categoryId"], tree) in exclude_roots)]
    return out[:top_k]


def recommend_for_cart(cart_ids: List[int], top_k: int) -> Tuple[str, List[dict]]:
    """Trả (strategy, items). strategy: `cart_related` khi dựng được từ giỏ, `popularity` khi phải rơi về."""
    cart_set = set(cart_ids)
    cart_meta = catalog.get_product_meta(cart_ids)
    tree = catalog.get_category_tree() if cart_meta else None
    if not cart_meta or tree is None:
        return "popularity", _popular_fallback(cart_set, top_k)

    cart_categories = {m["category_id"] for m in cart_meta.values() if m.get("category_id") is not None}
    max_cart_price = max((m["price"] for m in cart_meta.values() if m.get("price")), default=None)
    acc_categories = accessory_category_ids(list(cart_categories), tree) - cart_categories
    cart_roots = {_root(c, tree) for c in cart_categories}

    scores: Dict[int, float] = {}
    co_counts: Dict[int, float] = {}
    for pid, count in catalog.get_co_purchased(list(cart_set), CANDIDATES_PER_SOURCE):
        scores[pid] = 2.0 + count  # mua cùng đơn là tín hiệu mạnh nhất
        co_counts[pid] = count
    for pid in catalog.get_product_ids_in_categories(acc_categories, CANDIDATES_PER_SOURCE):
        scores.setdefault(pid, 1.0)
    for pid, bonus in _popular_rank_bonus(cart_set).items():
        if pid in scores:
            scores[pid] += bonus
    for pid in cart_set:
        scores.pop(pid, None)

    products = catalog.get_products_by_ids(list(scores)) if scores else {}
    candidates = []
    for pid, item in products.items():
        cat, price = item.get("categoryId"), item.get("price")
        in_accessory = cat in acc_categories
        if max_cart_price and price and price > max_cart_price:
            continue  # phụ kiện đắt hơn SP chính trong giỏ: không phải "mua kèm"
        if not in_accessory and (
            _root(cat, tree) in cart_roots
            or co_counts.get(pid, 0) < CO_PURCHASE_MIN_ORDERS_NON_ACCESSORY
            or not (max_cart_price and price and price <= CO_PURCHASE_MAX_PRICE_RATIO * max_cart_price)
        ):
            continue  # cùng nhóm SP chính (vd điện thoại thứ hai) hoặc không rẻ hơn hẳn -> không phải "mua kèm"
        candidates.append({**item, "score": round(scores[pid], 4)})
    candidates.sort(key=lambda x: (-x["score"], int(x["id"])))
    items = diversify(candidates, top_k, max_streak=1)

    if len(items) < top_k:
        taken = cart_set | {int(x["id"]) for x in items}
        items += _popular_fallback(taken, top_k - len(items), cart_roots, tree)
    return ("cart_related" if candidates else "popularity"), items
