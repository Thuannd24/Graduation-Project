import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional

from app.core.config import chatbot_settings
from app.services import llm_client
from app.services.nlu.price_range import PriceRange, remove_price_phrases
from shared_common.logger import get_logger

import requests

logger = get_logger(__name__)

CONTEXT_BLOCK_RE = re.compile(r"## CONTEXT[^\n]*\n(.*?)(?:\n## |\Z)", re.DOTALL)
GREETING_MOCK_REPLY = (
    "Chào bạn! Aura là trợ lý AI của AuraTech. Aura có thể giúp bạn tìm sản phẩm, "
    "tra đơn hàng hoặc giải đáp chính sách. Bạn cần hỗ trợ gì hôm nay? 😊"
)

# product-service's search is a plain "contains" match (no semantic/fuzzy matching), so the
# full sentence a customer types ("Tìm laptop tầm trung") never matches any product name —
# strip filler words down to the actual product/category/brand terms before querying.
SEARCH_STOPWORDS = {
    "tìm", "mua", "kiếm", "bán", "cho", "tôi", "xem", "có", "không", "giúp", "nhé", "ạ",
    "shop", "muốn", "cần", "sản", "phẩm", "hàng", "loại", "về", "tầm", "trung", "giá",
    "rẻ", "cao", "cấp", "khoảng", "một", "chút", "với", "là", "gì", "nào", "hả", "vậy",
    "để", "được", "dùm", "giùm", "ơi", "bạn", "aura", "hộ", "em", "mình", "thông", "số",
    "cấu", "hình", "chi", "tiết", "máy", "này", "kia", "đó", "hỏi", "tư", "vấn", "báo",
    "k", "ko", "kô", "khum", "nha", "ad", "admin", "ad ơi", "cho tôi",
    "màu", "chống", "nước", "còn", "sao", "the", "co", "khong", "the nao", "vay",
    # Vietnamese function/discourse words: no product-identifying meaning, but long enough
    # (>= 3 chars) to survive the length guard in the single-word fallback stages below —
    # left unfiltered, product-service's search matches them against ordinary marketing
    # copy ("chạy mượt", "tốt nhất", ...) and returns unrelated products (e.g. "poco thì
    # sao" matched on the leftover "thì", never tried "poco" at all).
    "thì", "nhất", "hơn", "vẫn", "cũng", "rồi", "đang", "sẽ", "đã", "mà", "thế",
    "kìa", "nhỉ", "nè", "ừ", "à", "chạy", "cái",
}

# Comparison markers/connectors checked on the diacritics-stripped, lowercased text —
# stripping preserves character positions 1:1 (each accented char maps to exactly one
# plain char), so an index found in the stripped copy slices correctly into the original.
COMPARISON_MARKERS = ["so sanh", "cai nao", "nao hon", "nao tot hon", "hay hon", "ngon hon", " vs "]
COMPARISON_CONNECTORS = [" vs ", " so voi ", " voi ", " va ", " hay ", " hoac "]


def _split_comparison(query: str) -> Optional[tuple]:
    """
    "so sánh X vs Y" / "X voi Y cai nao hon" name two different products in one sentence.
    Searching the whole sentence as one query lets the two names compete for relevance in
    product-service's ranking, and one of them silently drops out of the top results even
    though it exists in the catalog. Splits on the first recognized connector so each side
    can be searched independently; returns None when no comparison is detected.
    """
    stripped = _strip_diacritics(query.lower())
    if not any(marker in stripped for marker in COMPARISON_MARKERS):
        return None
    for connector in COMPARISON_CONNECTORS:
        idx = stripped.find(connector)
        if idx != -1:
            left = query[:idx].strip()
            right = query[idx + len(connector):].strip()
            if left and right:
                return left, right
    return None


def _strip_diacritics(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return without_marks.replace("đ", "d").replace("Đ", "D")


# Customers often type without diacritics ("may" instead of "máy") — match stopwords by
# their diacritics-stripped form too, or unaccented filler words survive into the search
# query and produce noisy/irrelevant catalog matches.
SEARCH_STOPWORDS_STRIPPED = {_strip_diacritics(w) for w in SEARCH_STOPWORDS}


def _extract_search_keywords(text: str) -> str:
    # Normalize 'flip 6' -> 'flip6', 'fold 6' -> 'fold6', 's 24' -> 's24' — ONLY for the
    # Samsung-style model codes that are genuinely written with no space in the catalog's
    # real product names. "ip"/"iphone"/"note"/"mi"/"redmi"/"pad"/"tab" used to be in this
    # list too, but Apple/Xiaomi write those WITH a space ("iPhone 16", "Redmi Note 14") —
    # concatenating them produced "iphone16"/"note14", which never matched anything and
    # made iPhone/Redmi Note/iPad search silently return empty even for a perfectly typed
    # query.
    normalized = re.sub(r'\b(flip|fold|s|a|m)\s+(\d+)\b', r'\1\2', text, flags=re.IGNORECASE)
    # Strip stopwords and punctuation
    cleaned = re.sub(r'[^\w\s]', ' ', normalized.lower())
    words = [
        w for w in cleaned.split()
        if w not in SEARCH_STOPWORDS and _strip_diacritics(w) not in SEARCH_STOPWORDS_STRIPPED and len(w) > 0
    ]
    # If every single word was filtered out, the message carried no identifiable product
    # term at all (e.g. "sản phẩm nào bán chạy nhất" — nothing names an actual product).
    # Falling back to the raw, unfiltered text here would search on stopwords we just
    # spent this whole function removing, in exactly the message least likely to name a
    # real product — better to search nothing and let the caller show "not found".
    return " ".join(words)


def _mock_reply_from_context(system_prompt: str) -> Optional[str]:
    """
    Without a DEEPSEEK_API_KEY, there is no real LLM to read the retrieved context and
    write an answer — so instead of a generic canned reply (misleading when context
    IS available), surface the top retrieved chunk directly. Only used as a fallback;
    a real LLM call always takes priority when DEEPSEEK_API_KEY is set.
    """
    match = CONTEXT_BLOCK_RE.search(system_prompt)
    if not match:
        return None
    context = match.group(1).strip()
    if not context or context.startswith("Không tìm thấy"):
        return None

    first_entry = context.split("\n\n")[0]
    lines = first_entry.split("\n", 1)
    body = (lines[1] if len(lines) > 1 else lines[0]).strip()
    # Source .md files use **bold**/`code` — strip it, the chat widget renders plain text only.
    body = re.sub(r"\*\*(.+?)\*\*", r"\1", body)
    body = body.replace("**", "").replace("`", "")
    if len(body) > 400:
        body = body[:400].rsplit(" ", 1)[0] + "..."
    return f"Theo thông tin Aura tra được: {body}"


# Loại sản phẩm mà TÊN sản phẩm thật sự chứa (dùng để lọc kết quả: search của product-service khớp cả MÔ TẢ,
# nên "tai nghe" trả về cả pin dự phòng có câu "sạc được tai nghe"). Thứ tự: cụm dài trước.
NAME_CATEGORY_TERMS = [
    "pin dự phòng", "pin sạc", "ốp lưng", "bàn phím", "màn hình", "tai nghe", "máy ảnh", "đồng hồ",
    "loa", "sạc", "cáp", "chuột", "laptop", "macbook", "tivi", "ipad", "iphone", "airpods",
]
# "Quà tặng"/không nêu loại SP + có khoảng giá: tìm trong các nhóm phụ kiện/quà phổ biến.
GIFT_TERMS = ["tai nghe", "loa", "sạc", "pin dự phòng", "ốp lưng", "đồng hồ", "chuột", "bàn phím"]
GIFT_MARKERS = ["qua", "goi y", "sinh nhat", "tang ban", "tang nguoi"]
PRICE_POOL_SIZE = 60
PRICE_RESULT_LIMIT = 5


def _name_has(term: str, name: str) -> bool:
    """Mọi từ của loại SP đều có trong tên (theo từ, không theo chuỗi con): "pin dự phòng" khớp
    "Pin sạc dự phòng Aukey", "sạc" không khớp "sạch"."""
    name_words = set(re.findall(r"\w+", _strip_diacritics(name.lower())))
    return all(w in name_words for w in _strip_diacritics(term.lower()).split())


def _price_of(item: Dict[str, Any]) -> Optional[float]:
    for key in ("effectivePrice", "salePrice", "price"):
        value = item.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _vnd(value: float) -> str:
    return f"{value:,.0f}đ".replace(",", ".")


class ProductRagService:
    """
    RAG over the live product catalog: turns a free-form customer message into a
    product-service keyword search, then formats the hits into an LLM context block.
    Counterpart to app.services.rag.policy_rag.PolicyRagService, which does the same
    job for the static policy documents instead of live product data.
    """

    def retrieve_context(self, query: str) -> List[Dict[str, Any]]:
        """
        Calls product-service's real keyword search for real catalog items. A "so sánh X
        vs Y" message names two different products in one sentence — searching the whole
        sentence as a single query lets the two names compete for relevance and one of
        them (often whichever comes first) silently loses, making a real catalog item look
        missing. Detected comparisons are split and searched independently instead.
        """
        halves = _split_comparison(query)
        if halves:
            left, right = halves
            merged: List[Dict[str, Any]] = []
            seen_ids = set()
            for side_query in (left, right):
                for item in self._search_one(side_query)[:3]:
                    if item.get("id") not in seen_ids:
                        seen_ids.add(item.get("id"))
                        merged.append(item)
            if merged:
                return self._attach_specs(merged)
            # Neither half matched anything on its own — fall through to a normal
            # whole-query search rather than returning nothing.

        return self._attach_specs(self._search_one(query))

    def _attach_specs(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        The search endpoint only returns a marketing `description` string — no structured
        spec table (RAM, CPU, camera, battery...), even though that data exists and is
        shown on the storefront's product page. Without this, a question naming an exact
        spec (e.g. "camera sau của Xiaomi Redmi A7") always came back "chưa có thông tin"
        even when the product itself was found, because the specs were never fetched in
        the first place. Attaches each item's `attributes` map from the detail endpoint
        (GET /api/v1/public/products/{id} — public, no auth) under "_specs".

        Fetched CONCURRENTLY, not one-by-one: this is called for up to 5 items, and the
        gateway enforces a hard 30s budget for the whole chat request (see BE/api-gateway
        application.yml ai-engine-cb timelimiter) shared with 2 sequential DeepSeek calls
        elsewhere in the same request — 5 sequential detail calls at up to 3s each could
        alone burn half that budget for no reason, since the calls don't depend on each
        other.
        """
        url_template = f"{chatbot_settings.PRODUCT_SERVICE_URL}/api/v1/public/products/{{}}"

        def _fetch(item: Dict[str, Any]) -> None:
            product_id = item.get("id")
            if product_id is None:
                item["_specs"] = {}
                return
            try:
                resp = requests.get(url_template.format(product_id), timeout=3)
                resp.raise_for_status()
                attributes = (resp.json().get("data") or {}).get("attributes")
                item["_specs"] = attributes if isinstance(attributes, dict) else {}
            except Exception as e:
                logger.warning(f"Failed to fetch specs for product {product_id}: {e}")
                item["_specs"] = {}

        if items:
            with ThreadPoolExecutor(max_workers=len(items)) as pool:
                list(pool.map(_fetch, items))
        return items

    def retrieve_in_price_range(self, query: str, price_range: PriceRange) -> tuple:
        """Tìm theo LOẠI sản phẩm trong câu rồi lọc đúng khoảng giá. Trả (items, ghi_chú_cho_context).

        - Có loại SP nêu tên ("tai nghe") -> tìm loại đó, chỉ giữ SP có tên chứa đúng loại đó.
        - Không nêu loại ("gợi ý quà tặng dưới 500 nghìn") -> tìm trong các nhóm quà/phụ kiện phổ biến.
        - Không có SP nào trong khoảng giá -> KHÔNG bịa: trả vài SP gần khoảng giá nhất và ghi rõ trong
          context là ngoài khoảng giá, để câu trả lời nói thật "chưa có tai nghe dưới 500.000đ".
        """
        rest = remove_price_phrases(query)
        rest_plain = _strip_diacritics(rest.lower())
        terms = [t for t in NAME_CATEGORY_TERMS if _strip_diacritics(t) in rest_plain]
        # bỏ cụm con đã nằm trong cụm dài hơn ("sạc" trong "pin sạc")
        terms = [t for t in terms if not any(t != o and _strip_diacritics(t) in _strip_diacritics(o) for o in terms)]
        keywords = _extract_search_keywords(rest)
        gift = not terms and (not keywords or any(m in rest_plain for m in GIFT_MARKERS))

        candidates: Dict[Any, Dict[str, Any]] = {}
        if terms or gift:
            for term in terms or GIFT_TERMS:
                for item in self._search_one(term, size=PRICE_POOL_SIZE):
                    if _name_has(term, item.get("name") or ""):
                        candidates.setdefault(item.get("id"), item)
        else:
            for item in self._search_one(rest, size=PRICE_POOL_SIZE):
                candidates.setdefault(item.get("id"), item)

        pool = [c for c in candidates.values() if _price_of(c) is not None]
        in_range = [c for c in pool if price_range.contains(_price_of(c))]
        label = ", ".join(terms) if terms else ("quà tặng/phụ kiện" if gift else (keywords or "sản phẩm"))
        if in_range:
            in_range.sort(key=lambda c: (-(c.get("ratingAvg") or 0), -(c.get("salesCount") or 0), _price_of(c)))
            picked = self._diverse(in_range, PRICE_RESULT_LIMIT, by_term=terms or (GIFT_TERMS if gift else []))
            note = f"Các sản phẩm ({label}) có giá {price_range.describe()} đang bán tại AuraTech:"
            return self._attach_specs(picked), note

        def distance(c):
            price = _price_of(c)
            if price_range.max_price is not None and price > price_range.max_price:
                return price - price_range.max_price
            if price_range.min_price is not None and price < price_range.min_price:
                return price_range.min_price - price
            return 0.0

        nearest = sorted(pool, key=distance)[:3]
        if not nearest:
            return [], f"KHÔNG có sản phẩm ({label}) nào có giá {price_range.describe()} trong kho."
        note = (
            f"KHÔNG có sản phẩm ({label}) nào có giá {price_range.describe()} trong kho. "
            f"Phải nói rõ điều này với khách. Các sản phẩm GẦN khoảng giá nhất (NGOÀI khoảng giá, chỉ để tham khảo):"
        )
        return nearest, note

    @staticmethod
    def _diverse(items: List[Dict[str, Any]], limit: int, by_term: List[str]) -> List[Dict[str, Any]]:
        """Xen kẽ các loại SP (vd quà tặng: không trả 5 cái ốp lưng liền nhau)."""
        if len(by_term) <= 1:
            return items[:limit]
        buckets: Dict[str, List[Dict[str, Any]]] = {}
        for item in items:
            key = next((t for t in by_term if _name_has(t, item.get("name") or "")), "")
            buckets.setdefault(key, []).append(item)
        out: List[Dict[str, Any]] = []
        while len(out) < limit and any(buckets.values()):
            for key in list(buckets):
                if buckets[key] and len(out) < limit:
                    out.append(buckets[key].pop(0))
        return out

    def _search_one(self, query: str, size: int = 5) -> List[Dict[str, Any]]:
        keywords = _extract_search_keywords(query)
        logger.info(f"Retrieving product context for query: '{query}' -> keywords: '{keywords}'")
        url = f"{chatbot_settings.PRODUCT_SERVICE_URL}/api/v1/public/products/search"

        def _do_search(q: str, size: int = 5) -> List[Dict[str, Any]]:
            if not q or not q.strip():
                return []
            try:
                # 3s, not 5s: product-service is same-network — a normal reply is <1s, and
                # up to 5 fallback stages can run per call, so a generous per-call timeout
                # multiplies into a large chunk of the gateway's 30s budget for nothing.
                resp = requests.get(url, params={"q": q.strip(), "page": 0, "size": size}, timeout=3)
                resp.raise_for_status()
                return resp.json().get("data", {}).get("content", [])
            except Exception as e:
                logger.warning(f"Product search failed for '{q}': {e}")
                return []

        # 1. Direct search with all cleaned keywords
        items = _do_search(keywords, size)
        if items:
            return items

        # 2. Search without spec suffixes (e.g. strip '12gb', '512gb', '256gb', '8gb', '5g')
        no_specs = re.sub(r'\b(\d+gb|\d+tb|5g|4g|lte)\b', '', keywords, flags=re.IGNORECASE).strip()
        no_specs = re.sub(r'\s+', ' ', no_specs)
        if no_specs and no_specs != keywords:
            items = _do_search(no_specs, size)
            if items:
                return items

        # 3. Search for model identifier token if present (e.g. 'flip6', 'fold6', 's24', 's25', '16 pro')
        words = keywords.split()
        model_tokens = [w for w in words if any(c.isdigit() for c in w) or w in {"flip", "fold", "ultra", "plus", "pro", "max", "air"}]
        if model_tokens:
            model_query = " ".join(model_tokens)
            items = _do_search(model_query, size)
            if items:
                return items

        # 4. Fallback: try searching by specific individual words from right to left (more
        # specific first). Words shorter than 3 chars are almost always noise (chat slang
        # abbreviations like "bn", "gi") rather than a real product/spec term, and a bare
        # short word against a "contains" search tends to match unrelated catalog items.
        for w in reversed(words):
            if w in {"samsung", "apple", "xiaomi", "asus", "dell", "hp", "lenovo", "oppo"}:
                continue # Skip generic brand name at this step
            if len(w) < 3:
                continue
            items = _do_search(w, size)
            if items:
                return items

        # 5. Last resort fallback: first word (covers a bare brand-name query, e.g. "samsung",
        # which step 4 deliberately skips).
        if words and len(words[0]) >= 3:
            return _do_search(words[0], size)

        return []

    def format_context_string(self, items: List[Dict[str, Any]], note: Optional[str] = None) -> str:
        if not items:
            return note or "Không tìm thấy sản phẩm nào trong kho khớp trực tiếp với mô tả."

        context_lines = []
        for idx, item in enumerate(items):
            price = item.get("effectivePrice") or item.get("price")
            desc = item.get("description") or ""
            # Strip HTML tags and limit length
            clean_desc = re.sub(r'<[^>]+>', ' ', desc).strip()
            clean_desc = re.sub(r'\s+', ' ', clean_desc)
            if len(clean_desc) > 350:
                clean_desc = clean_desc[:350] + "..."

            line = f"{idx+1}. Tên: {item.get('name')}, Hãng: {item.get('brand')}, Giá: {price:,.0f}đ" if isinstance(price, (int, float)) else f"{idx+1}. Tên: {item.get('name')}, Hãng: {item.get('brand')}, Giá: {price}đ"

            specs = item.get("_specs") or {}
            if specs:
                spec_str = ", ".join(f"{k}: {v}" for k, v in specs.items() if v)
                if spec_str:
                    line += f"\n   Thông số kỹ thuật: {spec_str}"

            if clean_desc:
                line += f"\n   Mô tả: {clean_desc}"
            context_lines.append(line)
        if note:
            context_lines.insert(0, note)
        return "\n".join(context_lines)

    def generate_reply(
        self, system_prompt: str, chat_history: List[Dict[str, Any]], current_message: str
    ) -> str:
        """
        Generates the chat reply via llm_client (DeepSeek). Falls back to a context-aware
        mock reply if no provider is configured or the call fails (quota, network, ...) —
        the endpoint always returns plain text, there is no real token-by-token streaming
        (the frontend calls this as a normal JSON POST, not SSE/EventSource).
        """
        try:
            text = llm_client.generate_text(system_prompt, chat_history, current_message)
            if text:
                return text
        except Exception as e:
            logger.error(f"LLM call failed, falling back to mock: {e}")

        logger.info("Using mock response generator...")
        return _mock_reply_from_context(system_prompt) or GREETING_MOCK_REPLY


product_rag_service = ProductRagService()
