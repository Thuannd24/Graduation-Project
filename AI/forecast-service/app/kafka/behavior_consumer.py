"""Kafka consumer nạp hành vi thô (xem sản phẩm / thao tác giỏ hàng) vào Redis (real-time,
phục vụ recs-service) và bảng `user_events` (lịch sử, phục vụ risk scoring — Phase 5/6).

Chạy nền như 1 asyncio.Task song song với FastAPI (xem app/main.py lifespan), KHÔNG chặn request
HTTP nào. Lỗi xử lý 1 message không được làm chết cả consumer loop — log và tiếp tục.
"""
import asyncio
import json
import time
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer
from sqlalchemy import text

from shared_common.config import shared_settings
from shared_common.contracts import (
    TOPIC_PRODUCT_VIEWED,
    TOPIC_CART_UPDATED,
    TOPIC_USER_BEHAVIOR,
    TOPIC_ORDER_EVENTS,
    ACTION_PURCHASE,
    ORDER_PURCHASE_EVENT_TYPES,
    ACTION_VIEW_PRODUCT,
    CART_ACTION_MAP,
    FE_BEHAVIOR_ACTIONS,
    HISTORY_ACTIONS,
    IMPRESSION_SOURCES,
    history_key_for,
    HISTORY_MAX_LEN,
    HISTORY_TTL_SECONDS,
)
from shared_common.pool import get_pooled_redis_client, get_engine
from shared_common.logger import get_logger

logger = get_logger(__name__)

INSERT_USER_EVENT_SQL = text(
    """
    INSERT INTO user_events (user_id, session_id, item_id, category_id, action_type, weight, created_at)
    VALUES (:user_id, :session_id, :item_id, :category_id, :action_type, :weight, :created_at)
    """
)
INSERT_USER_EVENT_WITH_SOURCE_SQL = text(
    """
    INSERT INTO user_events (user_id, session_id, item_id, category_id, action_type, weight, source, created_at)
    VALUES (:user_id, :session_id, :item_id, :category_id, :action_type, :weight, :source, :created_at)
    """
)
# Cột `source` do Hibernate của order-service tự thêm (ddl-auto: update, xem UserEvent.java) khi nó
# khởi động lại. Consumer KHÔNG giả định cột đã có: nếu forecast-service được deploy trước, INSERT có
# `source` sẽ lỗi và làm mất MỌI event. Kiểm 1 lần, thiếu thì ghi như cũ (bỏ qua source).
ORDER_ITEMS_SQL = text("SELECT product_id, quantity FROM order_items WHERE order_id = :order_id")
ORDER_USER_SQL = text("SELECT user_id FROM orders WHERE id = :order_id")

SOURCE_RECHECK_SECONDS = 300
HAS_SOURCE_COLUMN_SQL = text(
    "SELECT COUNT(*) FROM information_schema.columns "
    "WHERE table_schema = DATABASE() AND table_name = 'user_events' AND column_name = 'source'"
)


def _parse_message(topic: str, payload: dict) -> dict | None:
    """Chuẩn hoá message từ 2 topic khác nhau về cùng 1 shape:
    {user_id, session_id, item_id, category_id, action_type, created_at}. Trả None nếu message
    không hợp lệ/thiếu field bắt buộc."""
    try:
        if topic == TOPIC_PRODUCT_VIEWED:
            return {
                "user_id": payload.get("userId") or None,
                "session_id": payload.get("sessionId") or None,
                "item_id": payload["productId"],
                "category_id": payload.get("categoryId"),
                "action_type": ACTION_VIEW_PRODUCT,
                "weight": None,
                "source": None,
                "created_at": payload["timestamp"],
            }
        if topic == TOPIC_CART_UPDATED:
            action_type = CART_ACTION_MAP.get(payload.get("action"))
            if action_type is None:
                logger.warning(f"Unknown cart action '{payload.get('action')}', skip message")
                return None
            return {
                "user_id": payload.get("userId") or None,
                "session_id": payload.get("sessionId") or None,
                "item_id": payload.get("productId"),  # None cho CLEAR_CART
                "category_id": None,  # CartUpdatedEvent không mang category
                "action_type": action_type,
                "weight": None,
                "source": None,
                "created_at": payload["timestamp"],
            }
        if topic == TOPIC_USER_BEHAVIOR:
            # Vi hành vi từ FE. `actionType` đã được endpoint ingest kiểm tra nằm trong
            # FE_BEHAVIOR_ACTIONS, nhưng kiểm lại ở đây: consumer là đường ghi DUY NHẤT vào
            # `user_events`, nên nó phải tự bảo vệ được kể cả khi có producer khác publish sai.
            action_type = payload.get("actionType")
            if action_type not in FE_BEHAVIOR_ACTIONS:
                logger.warning(f"Vi hành vi có actionType lạ '{action_type}', bỏ message")
                return None
            return {
                "user_id": payload.get("userId") or None,
                "session_id": payload.get("sessionId") or None,
                "item_id": payload.get("itemId"),
                "category_id": payload.get("categoryId"),
                "action_type": action_type,
                "weight": payload.get("weight"),  # % scroll / giây dwell / vị trí impression
                # Giá trị lạ bị bỏ (NULL) thay vì bỏ cả event — source là ngữ cảnh phụ, không bắt buộc
                "source": payload.get("source") if payload.get("source") in IMPRESSION_SOURCES else None,
                "created_at": payload["timestamp"],
            }
    except KeyError as e:
        logger.error(f"Message thiếu field bắt buộc {e} (topic={topic}): {payload}")
        return None

    logger.warning(f"Nhận message từ topic không xử lý: {topic}")
    return None


def _parse_timestamp(raw: str) -> datetime:
    """ISO không timezone, quy ước là UTC cho MỌI nguồn: FE `toISOString()`, BE Java
    `LocalDateTime.now(ZoneOffset.UTC)` — cùng múi giờ với NOW() của DB."""
    return datetime.fromisoformat(raw)


class BehaviorEventConsumer:
    def __init__(self):
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task | None = None
        self._has_source = False
        self._source_checked_at = float("-inf")

    async def start(self):
        # TOPIC_ORDER_EVENTS: lần đầu subscribe, group chưa có offset cho topic này nên đọc lại TỪ ĐẦU
        # (auto_offset_reset="earliest") -> tự backfill PURCHASE cho các đơn đã xác nhận còn trong retention.
        topics = [TOPIC_PRODUCT_VIEWED, TOPIC_CART_UPDATED, TOPIC_USER_BEHAVIOR, TOPIC_ORDER_EVENTS]
        self._consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=shared_settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id="forecast-service-behavior-group",
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._consume_loop())
        logger.info(f"BehaviorEventConsumer started, subscribed to {topics}")

    async def stop(self):
        if self._task:
            self._task.cancel()
        if self._consumer:
            await self._consumer.stop()
        logger.info("BehaviorEventConsumer stopped")

    async def _consume_loop(self):
        try:
            async for msg in self._consumer:
                try:
                    await self._handle_message(msg.topic, msg.value, msg.timestamp)
                except Exception as e:
                    # 1 message lỗi không được làm chết consumer loop.
                    logger.error(f"Failed to process message from {msg.topic}: {e}")
                finally:
                    await self._consumer.commit()
        except asyncio.CancelledError:
            pass

    async def _handle_message(self, topic: str, raw_value: bytes, kafka_timestamp_ms: int | None = None):
        payload = json.loads(raw_value.decode("utf-8"))
        if topic == TOPIC_ORDER_EVENTS:
            return self._handle_order_event(payload, kafka_timestamp_ms)
        event = _parse_message(topic, payload)
        if event is None:
            return

        if not event["user_id"] and not event["session_id"]:
            logger.debug(f"Skip event without any identity (topic={topic})")
            return

        created_at = _parse_timestamp(event["created_at"])

        # Cố ý gọi tuần tự, đồng bộ (Redis client của shared_common là sync, SQLAlchemy engine
        # cũng sync) thay vì driver async — đơn giản hơn cho quy mô đồ án, và tự nhiên tạo
        # backpressure (không bao giờ dội quá tải Redis/MySQL bằng ghi đồng thời). Đánh đổi là
        # throughput thấp hơn nếu traffic lớn — chấp nhận được ở quy mô này.
        self._write_to_redis(event, created_at)
        self._write_to_db(event, created_at)

    def _write_to_redis(self, event: dict, created_at: datetime):
        if event["item_id"] is None:
            return  # CLEAR_CART không có item cụ thể để đưa vào chuỗi lịch sử

        # Chuỗi lịch sử trong Redis được recs-service dùng để GỢI Ý SẢN PHẨM, nên chỉ nhận
        # tương tác thật với sản phẩm (xem/thêm giỏ). Vi hành vi từ FE (mở giỏ, cuộn trang, rời
        # tab...) tuy có thể mang `itemId` bối cảnh nhưng KHÔNG phải hành vi chọn sản phẩm — đẩy
        # vào đây sẽ làm nhiễu gợi ý (vd rời tab 5 lần ở 1 sản phẩm biến nó thành "quan tâm nhất").
        # Whitelist thay vì blacklist FE action: REMOVE_FROM_CART/UPDATE_CART_QTY trước đây lọt vào
        # đây (xem HISTORY_ACTIONS). Bảng `user_events` vẫn ghi MỌI action như cũ.
        if event["action_type"] not in HISTORY_ACTIONS:
            return

        key = history_key_for(user_id=event["user_id"], session_id=event["session_id"])
        if key is None:
            return

        redis_client = get_pooled_redis_client()
        redis_client.lpush(key, event["item_id"])
        redis_client.ltrim(key, 0, HISTORY_MAX_LEN - 1)
        redis_client.expire(key, HISTORY_TTL_SECONDS)

    def _handle_order_event(self, payload, kafka_timestamp_ms: int | None) -> int:
        """Đơn được xác nhận -> 1 dòng PURCHASE cho mỗi sản phẩm (weight = số lượng). Trả số dòng đã ghi.

        - Payload từ outbox qua Debezium có thể bị mã hoá JSON 2 lần (chuỗi JSON bên trong) — giải lần 2.
        - OrderConfirmedEvent không mang danh sách sản phẩm -> tra `order_items` (cùng DB consumer đang ghi).
        - Thời điểm = timestamp của MESSAGE KAFKA (epoch ms -> UTC), KHÔNG lấy `timestamp` trong payload:
          OrderServiceImpl ghi bằng LocalDateTime.now() (giờ máy chạy JVM), sẽ lệch 7h trên máy giờ VN.
          Timestamp Kafka do Debezium đặt lúc publish (trễ vài giây sau commit), và vẫn đúng khi đọc lại
          message cũ (backfill).
        - PURCHASE KHÔNG vào Redis history: ngoài HISTORY_ACTIONS, giữ khớp tập dữ liệu SASRec đang train."""
        if isinstance(payload, str):
            payload = json.loads(payload)
        if payload.get("eventType") not in ORDER_PURCHASE_EVENT_TYPES or payload.get("orderId") is None:
            return 0
        order_id = int(payload["orderId"])
        created_at = (datetime.fromtimestamp(kafka_timestamp_ms / 1000, tz=timezone.utc).replace(tzinfo=None)
                      if kafka_timestamp_ms else datetime.now(timezone.utc).replace(tzinfo=None))

        engine = get_engine(shared_settings.DB_NAME)
        with engine.connect() as conn:
            items = conn.execute(ORDER_ITEMS_SQL, {"order_id": order_id}).all()
            user_id = payload.get("userId") or conn.execute(ORDER_USER_SQL, {"order_id": order_id}).scalar()
        if not user_id:
            logger.warning(f"Don {order_id} xac nhan nhung khong tim thay user_id — bo qua PURCHASE")
            return 0
        for product_id, quantity in items:
            self._write_to_db({
                "user_id": str(user_id), "session_id": None, "item_id": int(product_id), "category_id": None,
                "action_type": ACTION_PURCHASE, "weight": float(quantity or 1), "source": None,
            }, created_at)
        return len(items)

    def _has_source_column(self, conn) -> bool:
        # Đã thấy cột thì nhớ luôn; chưa thấy thì kiểm lại mỗi SOURCE_RECHECK_SECONDS để tự dùng cột
        # ngay khi order-service khởi động lại và Hibernate thêm nó, không cần restart consumer.
        now = time.monotonic()
        if not self._has_source and now - self._source_checked_at >= SOURCE_RECHECK_SECONDS:
            self._source_checked_at = now
            self._has_source = bool(conn.execute(HAS_SOURCE_COLUMN_SQL).scalar())
            if not self._has_source:
                logger.warning("user_events chua co cot `source` (order-service chua khoi dong lai?) — ghi khong kem source")
        return self._has_source

    def _write_to_db(self, event: dict, created_at: datetime):
        engine = get_engine(shared_settings.DB_NAME)
        params = {
            "user_id": event["user_id"],
            "session_id": event["session_id"],
            "item_id": event["item_id"],
            "category_id": event["category_id"],
            "action_type": event["action_type"],
            "weight": event.get("weight"),
            "created_at": created_at,
        }
        with engine.begin() as conn:
            if self._has_source_column(conn):
                conn.execute(INSERT_USER_EVENT_WITH_SOURCE_SQL, {**params, "source": event.get("source")})
            else:
                conn.execute(INSERT_USER_EVENT_SQL, params)
