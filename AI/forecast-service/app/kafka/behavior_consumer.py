"""Kafka consumer nạp hành vi thô (xem sản phẩm / thao tác giỏ hàng) vào Redis (real-time,
phục vụ recs-service) và bảng `user_events` (lịch sử, phục vụ risk scoring — Phase 5/6).

Chạy nền như 1 asyncio.Task song song với FastAPI (xem app/main.py lifespan), KHÔNG chặn request
HTTP nào. Lỗi xử lý 1 message không được làm chết cả consumer loop — log và tiếp tục.
"""
import asyncio
import json
from datetime import datetime

from aiokafka import AIOKafkaConsumer
from sqlalchemy import text

from shared_common.config import shared_settings
from shared_common.contracts import (
    TOPIC_PRODUCT_VIEWED,
    TOPIC_CART_UPDATED,
    ACTION_VIEW_PRODUCT,
    CART_ACTION_MAP,
    history_key_for,
    HISTORY_MAX_LEN,
    HISTORY_TTL_SECONDS,
)
from shared_common.pool import get_pooled_redis_client, get_engine
from shared_common.logger import get_logger

logger = get_logger(__name__)

INSERT_USER_EVENT_SQL = text(
    """
    INSERT INTO user_events (user_id, session_id, item_id, category_id, action_type, created_at)
    VALUES (:user_id, :session_id, :item_id, :category_id, :action_type, :created_at)
    """
)


def _parse_message(topic: str, payload: dict) -> dict | None:
    """Chuẩn hoá message từ 2 topic khác nhau về cùng 1 shape:
    {user_id, session_id, item_id, category_id, action_type, created_at}. Trả None nếu message
    không hợp lệ/thiếu field bắt buộc."""
    try:
        if topic == TOPIC_PRODUCT_VIEWED:
            return {
                "user_id": payload.get("userId") or None,
                "session_id": None,  # ProductViewedEvent chưa track session cho guest
                "item_id": payload["productId"],
                "category_id": payload.get("categoryId"),
                "action_type": ACTION_VIEW_PRODUCT,
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
                "created_at": payload["timestamp"],
            }
    except KeyError as e:
        logger.error(f"Message thiếu field bắt buộc {e} (topic={topic}): {payload}")
        return None

    logger.warning(f"Nhận message từ topic không xử lý: {topic}")
    return None


def _parse_timestamp(raw: str) -> datetime:
    """BE Java ghi timestamp bằng LocalDateTime.now().toString() (ISO, không timezone)."""
    return datetime.fromisoformat(raw)


class BehaviorEventConsumer:
    def __init__(self):
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task | None = None

    async def start(self):
        self._consumer = AIOKafkaConsumer(
            TOPIC_PRODUCT_VIEWED,
            TOPIC_CART_UPDATED,
            bootstrap_servers=shared_settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id="forecast-service-behavior-group",
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._consume_loop())
        logger.info(
            f"BehaviorEventConsumer started, subscribed to "
            f"[{TOPIC_PRODUCT_VIEWED}, {TOPIC_CART_UPDATED}]"
        )

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
                    await self._handle_message(msg.topic, msg.value)
                except Exception as e:
                    # 1 message lỗi không được làm chết consumer loop.
                    logger.error(f"Failed to process message from {msg.topic}: {e}")
                finally:
                    await self._consumer.commit()
        except asyncio.CancelledError:
            pass

    async def _handle_message(self, topic: str, raw_value: bytes):
        payload = json.loads(raw_value.decode("utf-8"))
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

        key = history_key_for(user_id=event["user_id"], session_id=event["session_id"])
        if key is None:
            return

        redis_client = get_pooled_redis_client()
        redis_client.lpush(key, event["item_id"])
        redis_client.ltrim(key, 0, HISTORY_MAX_LEN - 1)
        redis_client.expire(key, HISTORY_TTL_SECONDS)

    def _write_to_db(self, event: dict, created_at: datetime):
        engine = get_engine(shared_settings.DB_NAME)
        with engine.begin() as conn:
            conn.execute(
                INSERT_USER_EVENT_SQL,
                {
                    "user_id": event["user_id"],
                    "session_id": event["session_id"],
                    "item_id": event["item_id"],
                    "category_id": event["category_id"],
                    "action_type": event["action_type"],
                    "created_at": created_at,
                },
            )
