"""Nguồn sự thật duy nhất cho tên Redis key + Kafka topic dùng chung giữa các service AI
và giữa AI <-> BE Java.

Trước khi có file này, 3 chỗ trong AI/ tự định nghĩa quy ước key khác nhau
(`user:*:history` ở recs-service, `chat:*:history` ở chatbot-service, và blueprint
`docs/canvas/recommendation-complete.md` lại đề xuất `sess:{sid}:seq`) — dẫn tới BE Java
và AI không cùng hợp đồng dữ liệu. Module này chốt lại MỘT quy ước, mọi service mới đọc/ghi
Redis hoặc Kafka phải import từ đây, không hardcode chuỗi key/topic riêng.
"""

# --- Redis: lịch sử tương tác sản phẩm (dùng cho recs-service + forecast-service) ---
# Giữ nguyên tên key mà recs-service (app/api/endpoints/recommend.py) đã đọc từ trước, để
# không phải sửa recs-service khi thêm write-path mới.
USER_HISTORY_KEY_FMT = "user:{user_id}:history"
SESSION_HISTORY_KEY_FMT = "session:{session_id}:history"
HISTORY_MAX_LEN = 50  # số item gần nhất giữ lại trong Redis list (LTRIM 0..49)
HISTORY_TTL_SECONDS = 30 * 24 * 3600  # 30 ngày không hoạt động thì hết hạn

# --- Redis: lịch sử hội thoại chatbot (đã có sẵn, ghi lại đây để không ai định nghĩa lại khác đi) ---
CHAT_HISTORY_KEY_FMT = "chat:{session_id}:history"


def user_history_key(user_id) -> str:
    return USER_HISTORY_KEY_FMT.format(user_id=user_id)


def session_history_key(session_id) -> str:
    return SESSION_HISTORY_KEY_FMT.format(session_id=session_id)


def history_key_for(user_id=None, session_id=None) -> str | None:
    """Trả về đúng key Redis theo identity hiện có, None nếu không có identity nào (bỏ qua)."""
    if user_id:
        return user_history_key(user_id)
    if session_id:
        return session_history_key(session_id)
    return None


# --- Kafka topics ---
# Đã tồn tại từ trước (BE Java), liệt kê ở đây để tham chiếu, KHÔNG phải AI tự publish.
TOPIC_USER_CREATED = "user-created-events"
TOPIC_PRODUCT_REVIEWED = "product-reviewed-events"
TOPIC_ORDER_EVENTS = "order-events"
TOPIC_PAYMENT_EVENTS = "payment-events"
TOPIC_INVENTORY_EVENTS = "inventory-events"

# Mới, thuộc phạm vi tính năng churn-risk detection.
TOPIC_PRODUCT_VIEWED = "product-viewed-events"      # producer: product-service
TOPIC_CART_UPDATED = "cart-updated-events"          # producer: order-service (CartUpdatedEvent)
TOPIC_USER_RISK_EVENTS = "user-risk-events"         # producer: forecast-service, consumer: promotion-service
# Vi hành vi bắn TRỰC TIẾP từ FE (không qua service Java nào, vì không có thao tác nghiệp vụ nào để
# gắn vào). FE gọi POST /api/v1/public/behavior/events -> forecast-service publish lên topic này ->
# chính `BehaviorEventConsumer` đọc lại và ghi `user_events`. Cố ý đi vòng qua Kafka thay vì ghi
# thẳng DB từ endpoint: giữ ĐÚNG MỘT đường ghi vào `user_events` (consumer), nên mọi chuẩn hoá/
# guard chỉ tồn tại một chỗ, và có backpressure sẵn khi traffic vi hành vi dày.
TOPIC_USER_BEHAVIOR = "user-behavior-events"        # producer: FE qua forecast-service

# Action type chuẩn hoá ghi vào bảng `user_events` (map từ field `action` của CartUpdatedEvent
# và `eventType` của ProductViewedEvent sang cùng 1 tập giá trị).
ACTION_VIEW_PRODUCT = "VIEW_PRODUCT"
ACTION_ADD_TO_CART = "ADD_TO_CART"
ACTION_UPDATE_CART_QTY = "UPDATE_CART_QTY"
ACTION_REMOVE_FROM_CART = "REMOVE_FROM_CART"
ACTION_CLEAR_CART = "CLEAR_CART"

CART_ACTION_MAP = {
    "ADD_ITEM": ACTION_ADD_TO_CART,
    "UPDATE_QTY": ACTION_UPDATE_CART_QTY,
    "REMOVE_ITEM": ACTION_REMOVE_FROM_CART,
    "CLEAR_CART": ACTION_CLEAR_CART,
}

# Action nào tính là "đã thêm vào giỏ" khi tính feature has_abandoned_cart / conversion rate.
CART_ADD_ACTIONS = {ACTION_ADD_TO_CART, ACTION_UPDATE_CART_QTY}

# --- Vi hành vi (micro-behavior) do FE bắn trực tiếp ---
# Vì sao cần: thí nghiệm trên clickstream thật (RetailRocket, xem
# docs/canvas/churn-risk-log.md mục 2026-08-04) đo được rằng với chỉ 3 loại event
# (view/addtocart/transaction) thì THỨ TỰ hành vi KHÔNG mang thêm thông tin nào (ΔAUC −0,0009) —
# bigram gần như trùng với số đếm. Muốn kiểm chứng được giả thuyết "thứ tự là thứ rule bất lực"
# thì bảng chữ cái hành vi phải đủ phong phú. 5 action cũ + 13 action dưới đây = 18 ký hiệu,
# tức 324 bigram, khi đó thứ tự mới có gì để mang.
#
# Mọi action dưới đây CHỌN CÓ CHỦ ĐÍCH để chạy được trên MOBILE (thị trường TMĐT Việt Nam đa số
# mobile): không dùng gia tốc chuột/hover thuần desktop như tài liệu tham khảo gợi ý, mà dùng
# `visibilitychange`, scroll, thời gian dừng — có trên cả 2 nền tảng.
#
# Giới hạn 30 ký tự: `user_events.action_type` là VARCHAR(30) (xem UserEvent.java).
ACTION_VIEW_CART = "VIEW_CART"                      # mở trang giỏ hàng — tín hiệu ý định mạnh
ACTION_BEGIN_CHECKOUT = "BEGIN_CHECKOUT"            # vào luồng thanh toán
ACTION_VIEW_SHIPPING_FEE = "VIEW_SHIPPING_FEE"      # nhìn thấy khu vực phí vận chuyển
ACTION_COUPON_FAILED = "COUPON_FAILED"              # nhập mã giảm giá KHÔNG hợp lệ
ACTION_COUPON_APPLIED = "COUPON_APPLIED"            # áp mã thành công
ACTION_TAB_HIDDEN = "TAB_HIDDEN"                    # rời tab/thu nhỏ app (so giá ở nơi khác?)
ACTION_TAB_VISIBLE = "TAB_VISIBLE"                  # quay lại
ACTION_SCROLL_DEPTH = "SCROLL_DEPTH"                # weight = % đã cuộn (mốc 25/50/75/100)
ACTION_PAGE_DWELL = "PAGE_DWELL"                    # weight = số giây dừng ở trang
ACTION_PRODUCT_ZOOM = "PRODUCT_ZOOM"                # xem kỹ ảnh sản phẩm
ACTION_SEARCH = "SEARCH"                            # tìm kiếm
ACTION_FILTER_APPLIED = "FILTER_APPLIED"            # lọc — hành vi so sánh
ACTION_SORT_APPLIED = "SORT_APPLIED"                # sắp xếp (thường là sắp theo giá)

# Tập action FE được phép bắn. Endpoint ingest CHỈ nhận các giá trị này — chặn client bịa
# action_type lạ làm bẩn bảng `user_events` (và làm vỡ mọi feature đếm theo action).
FE_BEHAVIOR_ACTIONS = {
    ACTION_VIEW_CART,
    ACTION_BEGIN_CHECKOUT,
    ACTION_VIEW_SHIPPING_FEE,
    ACTION_COUPON_FAILED,
    ACTION_COUPON_APPLIED,
    ACTION_TAB_HIDDEN,
    ACTION_TAB_VISIBLE,
    ACTION_SCROLL_DEPTH,
    ACTION_PAGE_DWELL,
    ACTION_PRODUCT_ZOOM,
    ACTION_SEARCH,
    ACTION_FILTER_APPLIED,
    ACTION_SORT_APPLIED,
}
