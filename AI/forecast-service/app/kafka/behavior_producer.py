"""Publish vi hành vi (micro-behavior) do FE bắn lên Kafka, để chính `BehaviorEventConsumer` đọc
lại và ghi vào `user_events`.

Vì sao đi vòng qua Kafka thay vì endpoint ghi thẳng DB: giữ **đúng một** đường ghi vào `user_events`
(consumer), nên mọi chuẩn hoá/guard/chống lỗi chỉ tồn tại ở một chỗ — nếu endpoint ghi trực tiếp thì
sẽ có 2 đường ghi song song vào cùng 1 bảng và dễ lệch nhau khi sửa. Thêm nữa Kafka cho backpressure
sẵn: vi hành vi có tần suất cao hơn hẳn event nghiệp vụ, dội thẳng vào MySQL sẽ nghẽn.
"""
import json
import uuid
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer

from shared_common.config import shared_settings
from shared_common.contracts import TOPIC_USER_BEHAVIOR
from shared_common.logger import get_logger

logger = get_logger(__name__)


class BehaviorEventProducer:
    def __init__(self):
        self._producer: AIOKafkaProducer | None = None

    async def start(self):
        self._producer = AIOKafkaProducer(bootstrap_servers=shared_settings.KAFKA_BOOTSTRAP_SERVERS)
        await self._producer.start()
        logger.info(f"BehaviorEventProducer started, topic={TOPIC_USER_BEHAVIOR}")

    async def stop(self):
        if self._producer:
            await self._producer.stop()
        logger.info("BehaviorEventProducer stopped")

    async def publish_batch(self, events: list[dict]) -> int:
        """Publish từng event trong lô. Trả về số event đã gửi.

        Key Kafka = `session_id` (fallback `user_id`) để mọi event CÙNG MỘT PHIÊN vào cùng partition,
        nhờ đó Kafka giữ nguyên thứ tự trong phiên — điều kiện bắt buộc cho mọi feature theo chuỗi
        (bigram/quỹ đạo). Nếu key theo user thì phiên vẫn cùng partition, nhưng key theo session
        phân tán đều hơn khi 1 user có nhiều phiên.
        """
        if self._producer is None:
            logger.error("BehaviorEventProducer chưa start — bỏ lô event")
            return 0

        sent = 0
        for event in events:
            payload = {
                "eventId": str(uuid.uuid4()),
                "eventType": "UserBehaviorEvent",
                "publishedAt": datetime.now(timezone.utc).isoformat(),
                **event,
            }
            key = (event.get("sessionId") or event.get("userId") or "anonymous").encode("utf-8")
            await self._producer.send(
                TOPIC_USER_BEHAVIOR, value=json.dumps(payload).encode("utf-8"), key=key
            )
            sent += 1
        return sent
