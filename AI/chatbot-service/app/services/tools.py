import re
from datetime import datetime
from typing import Any, Dict, Optional

import requests

from app.core.config import chatbot_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

HOTLINE_SUFFIX = "Nếu cần hỗ trợ thêm, bạn gọi hotline 0389.468.847 (8:00-22:00) nhé."

# order-service trả status bằng tiếng Anh (enum Java) — dịch sang tiếng Việt cho khách dễ hiểu.
# Mỗi label được viết để đọc tự nhiên trong câu "Đơn hàng #{id} hiện {label}."
ORDER_STATUS_LABELS = {
    "PENDING": "đang chờ xử lý",
    "AWAITING_PAYMENT": "đang chờ thanh toán",
    "CONFIRMED": "đã được xác nhận và đang chuẩn bị hàng",
    "PROCESSING": "đang được xử lý",
    "SHIPPED": "đã được giao cho đơn vị vận chuyển",
    "DELIVERED": "đã giao thành công",
    "CANCELLED": "đã bị huỷ",
    "REFUNDED": "đã được hoàn tiền",
}


def _translate_status(status: str) -> str:
    return ORDER_STATUS_LABELS.get(status, status)


def _format_date(value: Optional[str]) -> str:
    if not value:
        return "?"
    cleaned = value.split(".")[0].replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return value


LOGIN_REQUIRED_MSG = (
    "Để tra cứu thông tin này, bạn vui lòng đăng nhập vào tài khoản AuraTech trước nhé. "
    "👉 Đăng nhập ngay tại trang web hoặc app AuraTech."
)
SERVICE_UNAVAILABLE_MSG = f"Aura chưa tra cứu được thông tin này lúc này, bạn vui lòng thử lại sau. {HOTLINE_SUFFIX}"

ORDER_ID_PATTERNS = [
    re.compile(r"#\s*(\d+)"),
    re.compile(r"đơn(?:\s*hàng)?\s*(?:số|mã)?\s*#?\s*(\d+)", re.IGNORECASE),
    re.compile(r"\b(\d{2,})\b"),
]


def extract_order_id(text: str) -> Optional[int]:
    for pattern in ORDER_ID_PATTERNS:
        match = pattern.search(text)
        if match:
            return int(match.group(1))
    return None


def _headers(user_id: Optional[str], user_roles: Optional[str], authorization: Optional[str]) -> dict:
    headers = {}
    if user_id:
        headers["X-User-Id"] = str(user_id)
    if user_roles:
        headers["X-User-Roles"] = user_roles
    if authorization:
        # order/user/promotion-service each verify this JWT themselves against Keycloak
        # (defense in depth on top of the gateway) — X-User-Id alone is NOT enough auth.
        headers["Authorization"] = authorization
    return headers


def _text_only(message: str) -> Dict[str, Any]:
    """Every tool returns {message, card}; card is None for plain-text/error replies —
    the FE renders msg.text as usual and simply has nothing extra to show as a card."""
    return {"message": message, "card": None}


def get_order_status(order_id: int, user_id: str, user_roles: Optional[str] = None, authorization: Optional[str] = None) -> Dict[str, Any]:
    url = f"{chatbot_settings.ORDER_SERVICE_URL}/api/v1/orders/{order_id}"
    try:
        resp = requests.get(url, headers=_headers(user_id, user_roles, authorization), timeout=5)
        if resp.status_code == 404:
            return _text_only(f"Aura không tìm thấy đơn hàng #{order_id}. Bạn kiểm tra lại mã đơn giúp Aura nhé.")
        if resp.status_code == 403:
            return _text_only(f"Đơn hàng #{order_id} không thuộc tài khoản của bạn nên Aura không thể hiển thị nhé.")
        resp.raise_for_status()
        data = resp.json().get("data", {})

        status_code = data.get("status", "")
        status = _translate_status(status_code) if status_code else "không rõ"
        tracking = data.get("trackingCode")
        final_amount = data.get("finalAmount")
        # order-service's OrderResponse already includes line items (see OrderItemResponse:
        # productName, quantity, unitPrice, subtotal) — previously ignored here, so "tôi mua
        # gì vậy" for a known order could never be answered beyond status/amount.
        raw_items = data.get("items") or []

        lines = [f"Đơn hàng #{order_id} hiện {status}."]
        if raw_items:
            lines.append("Sản phẩm trong đơn:")
            for item in raw_items:
                name = item.get("productName", "Sản phẩm")
                qty = item.get("quantity", 1)
                unit_price = item.get("unitPrice")
                price_str = f" x {unit_price:,.0f}đ" if isinstance(unit_price, (int, float)) else ""
                lines.append(f"- {name} (SL: {qty}{price_str})")
        if tracking:
            lines.append(f"Mã vận đơn: {tracking}.")
        if final_amount is not None:
            lines.append(f"Tổng giá trị đơn: {final_amount:,.0f}đ.")

        card_items = [
            {
                "productName": item.get("productName"),
                "productImage": item.get("productImage"),
                "quantity": item.get("quantity"),
                "unitPrice": item.get("unitPrice"),
                "subtotal": item.get("subtotal"),
            }
            for item in raw_items
        ]

        return {
            "message": "\n".join(lines),
            "card": {
                "type": "order_status",
                "orderId": order_id,
                "statusCode": status_code,
                "statusLabel": status,
                "trackingCode": tracking,
                "finalAmount": final_amount,
                "items": card_items,
            },
        }
    except requests.RequestException as e:
        logger.error(f"get_order_status failed for order {order_id}: {e}")
        return _text_only(SERVICE_UNAVAILABLE_MSG)


def get_warranty_info(order_id: int, user_id: str, user_roles: Optional[str] = None, authorization: Optional[str] = None) -> Dict[str, Any]:
    url = f"{chatbot_settings.ORDER_SERVICE_URL}/api/v1/orders/warranty/me"
    try:
        resp = requests.get(url, headers=_headers(user_id, user_roles, authorization), timeout=5)
        resp.raise_for_status()
        items = resp.json().get("data", []) or []
        matching = [item for item in items if item.get("orderId") == order_id]

        if not matching:
            return _text_only(
                f"Aura không tìm thấy thông tin bảo hành cho đơn hàng #{order_id}. {HOTLINE_SUFFIX}"
            )

        lines = []
        card_items = []
        for item in matching:
            product = item.get("productName", "Sản phẩm")
            expiry = _format_date(item.get("warrantyExpiry"))
            days_remaining = item.get("daysRemaining")
            active = bool(item.get("active"))
            state = "còn bảo hành" if active else "đã hết bảo hành"
            remaining_note = f" (còn {days_remaining} ngày)" if active and days_remaining is not None else ""
            lines.append(f"- {product}: {state}, hết hạn {expiry}{remaining_note}.")
            card_items.append({
                "productName": product,
                "productImage": item.get("productImage"),
                "expiry": expiry,
                "daysRemaining": days_remaining,
                "active": active,
            })

        return {
            "message": "Thông tin bảo hành đơn #" + str(order_id) + ":\n" + "\n".join(lines),
            "card": {"type": "warranty", "orderId": order_id, "items": card_items},
        }
    except requests.RequestException as e:
        logger.error(f"get_warranty_info failed for order {order_id}: {e}")
        return _text_only(SERVICE_UNAVAILABLE_MSG)


def get_loyalty_points(user_id: str, user_roles: Optional[str] = None, authorization: Optional[str] = None) -> Dict[str, Any]:
    url = f"{chatbot_settings.USER_SERVICE_URL}/api/v1/users/me/loyalty/points"
    try:
        resp = requests.get(url, headers=_headers(user_id, user_roles, authorization), timeout=5)
        resp.raise_for_status()
        points = resp.json().get("data", 0)
        value = points * 1000
        return {
            "message": f"Bạn hiện có {points} điểm thưởng, tương đương {value:,.0f}đ giảm giá khi mua hàng.",
            "card": {"type": "loyalty", "points": points, "value": value},
        }
    except requests.RequestException as e:
        logger.error(f"get_loyalty_points failed for user {user_id}: {e}")
        return _text_only(SERVICE_UNAVAILABLE_MSG)


def get_user_vouchers(user_id: str, user_roles: Optional[str] = None, authorization: Optional[str] = None) -> Dict[str, Any]:
    url = f"{chatbot_settings.PROMOTION_SERVICE_URL}/api/v1/promotions/vouchers/me"
    try:
        resp = requests.get(url, headers=_headers(user_id, user_roles, authorization), timeout=5)
        resp.raise_for_status()
        vouchers = resp.json().get("data", []) or []
        usable = [v for v in vouchers if v.get("usable")]

        if not usable:
            return _text_only("Bạn hiện chưa có voucher nào còn hiệu lực để sử dụng.")

        lines = []
        card_vouchers = []
        for v in usable:
            title = v.get("title") or v.get("code")
            expires_at = _format_date(v.get("expiresAt"))
            lines.append(f"- {title} (mã: {v.get('code')}), hết hạn {expires_at}.")
            card_vouchers.append({
                "title": title,
                "code": v.get("code"),
                "expiresAt": expires_at,
                "discountPercent": v.get("discountPercent"),
                "discountAmount": v.get("discountAmount"),
                "minOrderValue": v.get("minOrderValue"),
            })

        return {
            "message": "Voucher còn hiệu lực của bạn:\n" + "\n".join(lines),
            "card": {"type": "vouchers", "vouchers": card_vouchers},
        }
    except requests.RequestException as e:
        logger.error(f"get_user_vouchers failed for user {user_id}: {e}")
        return _text_only(SERVICE_UNAVAILABLE_MSG)


CANCEL_ORDER_GUIDE = (
    "Aura không thể huỷ đơn thay bạn, nhưng bạn có thể tự huỷ rất nhanh:\n"
    "Vào mục \"Đơn hàng của tôi\" trên web/app AuraTech → chọn đơn cần huỷ → bấm \"Huỷ đơn\"\n"
    "(chỉ áp dụng khi đơn đang chờ xử lý, đang chờ thanh toán hoặc đã được xác nhận, "
    "chưa được giao cho đơn vị vận chuyển).\n"
    "Nếu đơn đã được giao cho đơn vị vận chuyển, bạn cần liên hệ hỗ trợ thay vì tự huỷ. "
    f"{HOTLINE_SUFFIX}"
)
