"""Chạy risk-scan định kỳ: predict (không refit) → lọc user "At Risk" + xác suất churn vượt
ngưỡng → CHỈ publish cho user nào thực sự vừa bỏ giỏ hàng gần đây (rule tầng 2, xem Context trong
docs/canvas/churn-risk-implementation-plan.md — AI quyết định segment/xác suất, rule quyết định
thời điểm). `max_instances=1` bắt buộc để tránh 2 lần scan chồng nhau nếu 1 lần chạy > interval.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import forecast_settings
from app.kafka.risk_producer import RiskEventProducer
from app.services.risk_scoring import ModelNotTrainedError, risk_scoring_service
from shared_common.config import shared_settings
from shared_common.features.behavior import has_recent_abandoned_cart
from shared_common.logger import get_logger
from shared_common.pool import get_engine

logger = get_logger(__name__)

AT_RISK_SEGMENT = "At Risk"


class RiskScheduler:
    def __init__(self, risk_producer: RiskEventProducer):
        self._scheduler = AsyncIOScheduler()
        self._risk_producer = risk_producer

    def start(self):
        self._scheduler.add_job(
            self.run_risk_scan,
            "interval",
            hours=forecast_settings.RISK_SCAN_INTERVAL_HOURS,
            id="risk_scan_job",
            max_instances=1,
        )
        self._scheduler.start()
        logger.info(
            f"RiskScheduler started, interval={forecast_settings.RISK_SCAN_INTERVAL_HOURS}h"
        )

    def shutdown(self):
        self._scheduler.shutdown(wait=False)

    async def run_risk_scan(self) -> dict:
        try:
            df = risk_scoring_service.predict()
        except ModelNotTrainedError as e:
            logger.warning(f"Risk scan skipped: {e}")
            return {"status": "SKIPPED", "reason": str(e)}

        if df.empty:
            return {"status": "SUCCESS", "at_risk_candidates": 0, "published": 0}

        candidates = df[
            (df["segment"] == AT_RISK_SEGMENT)
            & (df["churn_probability"] >= forecast_settings.RISK_CHURN_PROBABILITY_THRESHOLD)
        ]

        engine = get_engine(shared_settings.DB_NAME)
        published = 0
        for user_id, row in candidates.iterrows():
            if has_recent_abandoned_cart(
                engine, user_id, within_hours=forecast_settings.RISK_ABANDON_GRACE_HOURS
            ):
                await self._risk_producer.publish_churn_risk(
                    user_id,
                    row["segment"],
                    {
                        "churnProbability": float(row["churn_probability"]),
                        "daysSinceLastActivity": float(row["days_since_last_activity"]),
                        "cartAbandonCount": float(row["cart_abandon_count"]),
                    },
                )
                published += 1

        logger.info(
            f"Risk scan done: {len(candidates)} at-risk candidates, {published} published "
            f"(có bỏ giỏ hàng trong {forecast_settings.RISK_ABANDON_GRACE_HOURS}h gần đây)"
        )
        return {"status": "SUCCESS", "at_risk_candidates": int(len(candidates)), "published": published}
