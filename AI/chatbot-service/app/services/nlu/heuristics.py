"""
Pure keyword heuristics — used only as the offline fallback when the LLM-based
NLU (app.services.nlu.classifier, which owns intent+sentiment+entity extraction
together) has no provider configured or the call fails. Kept in one module since
both heuristics exist purely to serve that single fallback path.
"""
from shared_common.logger import get_logger

logger = get_logger(__name__)

PRODUCT_TERMS = [
    "tìm", "mua", "kiếm", "bán", "có gì", "có k", "có không", "còn không", "còn hàng", "bán không",
    "iphone", "samsung", "galaxy", "xiaomi", "oppo", "redmi", "realme", "vivo", "honor", "nubia", "poco",
    "laptop", "macbook", "ipad", "tablet", "máy tính", "tai nghe", "chuột", "bàn phím", "màn hình",
    "củ sạc", "cáp sạc", "pin dự phòng", "loa", "đồng hồ", "smartwatch", "apple watch",
    "asus", "dell", "hp", "lenovo", "acer", "msi", "rog", "tuf", "legion", "thinkpad", "vivobook", "zenbook",
    "flip", "fold", "airpods", "galaxy buds",
]

# Heuristics baseline. "lỗi"/"hoàn tiền" are deliberately excluded even though they
# often show up in complaints — they're also core vocabulary of completely neutral
# policy questions ("chính sách đổi trả hàng lỗi", "hoàn tiền thế nào") which are far
# more common in this domain, so keeping them caused frequent false "negative" hits.
NEGATIVE_WORDS = ["tệ", "chậm", "kém", "bực", "đắt", "hỏng", "không dùng được", "thất vọng", "bức xúc"]
POSITIVE_WORDS = ["tốt", "đẹp", "nhanh", "ok", "tuyệt", "xịn", "thích", "cảm ơn", "yêu"]

# A bare "voucher"/"điểm thưởng"/"huỷ" mention is ambiguous: "Mã voucher dùng được mấy
# lần?" is a general policy question, "Voucher của tôi còn hạn không?" is a personal
# account lookup. Only the personal phrasing should route to order_action (which — for
# points/voucher — requires a login and calls a real BE tool); everything else falls
# through to the policy_faq keyword check below instead of wrongly demanding login for
# a question anyone could ask.
PERSONAL_MARKERS = ["của tôi", "của mình", "của em", "tôi có", "tôi muốn", "mình có", "cho tôi", "giúp tôi"]


def _is_personal(text_lower: str) -> bool:
    return any(m in text_lower for m in PERSONAL_MARKERS)


def predict_intent(text: str) -> str:
    logger.info(f"Predicting intent for text: '{text}'")
    text_lower = text.lower()
    has_order_ref = any(w in text_lower for w in ["đơn", "#"]) or any(ch.isdigit() for ch in text_lower)
    # Narrower than has_order_ref on purpose: the bare word "đơn" matches almost any
    # order-related sentence, including pure policy questions ("Huỷ đơn thì hoàn tiền bao
    # lâu?") — an actual order NUMBER is a much stronger "this is about a real order" signal.
    has_order_number = "#" in text_lower or any(ch.isdigit() for ch in text_lower)
    personal = _is_personal(text_lower)

    # order_action checked FIRST: more specific than order_tracking/policy_faq,
    # which would otherwise swallow phrases like "huỷ đơn hàng" or "bảo hành đơn #123"
    if ("huỷ" in text_lower or "hủy" in text_lower) and (personal or has_order_number):
        return "order_action"
    elif any(w in text_lower for w in ["điểm thưởng", "điểm tích", "point"]) and personal:
        return "order_action"
    elif ("voucher" in text_lower or "mã giảm giá" in text_lower) and personal:
        return "order_action"
    elif "bảo hành" in text_lower and has_order_ref:
        return "order_action"
    elif has_order_ref and any(w in text_lower for w in [
        "giao", "ship", "tới", "đâu", "trạng thái", "tracking", "vận đơn", "khi nào", "nhận", "vận chuyển"
    ]):
        return "order_tracking"

    if any(w in text_lower for w in ["giá", "bao nhiêu", "nhiêu", "bán mấy", "đắt", "rẻ", "báo giá"]):
        return "price_inquiry"
    elif any(w in text_lower for w in PRODUCT_TERMS):
        return "product_search"
    elif any(w in text_lower for w in ["đơn hàng", "ship", "giao chưa", "mã vận đơn", "tracking", "vận chuyển"]):
        return "order_tracking"
    elif any(w in text_lower for w in [
        "đổi trả", "bảo hành", "hoàn tiền", "chính sách", "vận chuyển", "thanh toán", "trả góp",
        "voucher", "mã giảm giá", "điểm thưởng", "điểm tích", "huỷ", "hủy",
    ]):
        return "policy_faq"
    elif any(w in text_lower for w in ["lỗi", "hỏng", "kém", "chậm", "bức xúc", "tệ", "lừa đảo", "vỡ", "nứt", "trầy", "thất vọng"]):
        return "complaint"

    return "general_chat"


def analyze_sentiment(text: str) -> str:
    logger.info(f"Analyzing sentiment for text: '{text}'")
    text_lower = text.lower()

    neg_count = sum(1 for w in NEGATIVE_WORDS if w in text_lower)
    pos_count = sum(1 for w in POSITIVE_WORDS if w in text_lower)

    if neg_count > pos_count:
        return "negative"
    elif pos_count > neg_count:
        return "positive"
    return "neutral"
