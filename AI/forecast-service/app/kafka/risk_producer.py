"""Publish sự kiện "phát hiện nguy cơ rời bỏ" lên Kafka để promotion-service tự kích hoạt
campaign (xem docs/canvas/churn-risk-implementation-plan.md Phase 6-7). Consumer:
BE/promotion-service/.../event/consumer/PromotionKafkaConsumer.java.
"""
import json
import uuid
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer

from shared_common.config import shared_settings
from shared_common.contracts import TOPIC_USER_RISK_EVENTS
from shared_common.logger import get_logger

logger = get_logger(__name__)


class RiskEventProducer:
    def __init__(self):
        self._producer: AIOKafkaProducer | None = None

    async def start(self):
        self._producer = AIOKafkaProducer(bootstrap_servers=shared_settings.KAFKA_BOOTSTRAP_SERVERS)
        await self._producer.start()
        logger.info(f"RiskEventProducer started, topic={TOPIC_USER_RISK_EVENTS}")

    async def stop(self):
        if self._producer:
            await self._producer.stop()
        logger.info("RiskEventProducer stopped")

    async def publish_churn_risk(self, user_id: str, segment: str, extra: dict) -> None:
        """`eventUniqueId = "{user_id}:{yyyyMMdd}"` — tận dụng cơ chế dedupe theo businessKey
        đã có sẵn ở CampaignTriggerService.java (bên Java), tránh trigger trùng trong cùng ngày
        nếu risk-scan chạy nhiều lần/ngày."""
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        event_unique_id = f"{user_id}:{today}"

        payload = {
            "eventId": str(uuid.uuid4()),
            "eventType": "ChurnRiskDetectedEvent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "userId": str(user_id),
            "segment": segment,
            "eventUniqueId": event_unique_id,
            **extra,
        }

        await self._producer.send_and_wait(
            TOPIC_USER_RISK_EVENTS,
            key=str(user_id).encode("utf-8"),
            value=json.dumps(payload).encode("utf-8"),
        )
        logger.info(f"Published ChurnRiskDetectedEvent userId={user_id} segment={segment} eventUniqueId={event_unique_id}")
