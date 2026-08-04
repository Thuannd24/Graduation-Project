"""Chạy risk-scan định kỳ: predict (không refit) → lọc user "At Risk" + xác suất churn vượt
ngưỡng → CHỈ publish cho user nào thực sự vừa bỏ giỏ hàng gần đây (rule tầng 2, xem Context trong
docs/canvas/churn-risk-implementation-plan.md — AI quyết định segment/xác suất, rule quyết định
thời điểm). `max_instances=1` bắt buộc để tránh 2 lần scan chồng nhau nếu 1 lần chạy > interval.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import forecast_settings
from app.kafka.risk_producer import RiskEventProducer
from app.services.risk_scoring import ModelNotTrainedError, effective_threshold, risk_scoring_service
from app.training.labels import MIN_DELIVERED_ORDERS_FOR_CHURN
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
        """Thứ tự BẮT BUỘC: lọc đủ điều kiện -> XẾP HẠNG theo tổn thất kỳ vọng -> cắt theo ngân sách.

        Không được cắt ngân sách trước khi lọc: cắt trước thì các suất voucher rơi vào user rồi bị
        rule thời điểm loại, lãng phí ngân sách. Lọc trước rồi mới xếp hạng thì N suất luôn về đúng
        N người đáng cứu nhất trong số thực sự đủ điều kiện.
        """
        try:
            df = risk_scoring_service.predict()
        except ModelNotTrainedError as e:
            logger.warning(f"Risk scan skipped: {e}")
            return {"status": "SKIPPED", "reason": str(e)}

        if df.empty:
            return {
                "status": "SUCCESS",
                "scored_users": 0,
                "in_population": 0,
                "at_risk_candidates": 0,
                "eligible": 0,
                "published": 0,
            }

        # Tầng 0 — dân số hợp lệ: phải KHỚP dân số đã huấn luyện (>= MIN_DELIVERED_ORDERS_FOR_CHURN
        # đơn DELIVERED). Model chỉ học trên nhóm này, chấm điểm nhóm khác là NGOẠI SUY. Cũng đúng về
        # nghĩa kinh doanh: chỉ "cứu" được khách từng mua; khách chưa mua thuộc bài toán onboarding.
        population = df[df["frequency"] >= MIN_DELIVERED_ORDERS_FOR_CHURN]

        # Tầng 1 — AI: segment (KMeans) + xác suất churn (Logistic Regression) vượt ngưỡng.
        # Ngưỡng lấy qua effective_threshold() chứ KHÔNG đọc thẳng config: ngưỡng cấu hình được tune
        # trên thang xác suất đã hiệu chỉnh, gặp model cũ chưa hiệu chỉnh thì phải tự lùi về legacy.
        threshold, calibrated = effective_threshold()
        candidates = population[
            (population["segment"] == AT_RISK_SEGMENT)
            & (population["churn_probability"] >= threshold)
        ]

        # Tầng 2 — rule: chỉ đúng thời điểm (vừa bỏ giỏ hàng gần đây).
        engine = get_engine(shared_settings.DB_NAME)
        eligible_ids = [
            user_id
            for user_id in candidates.index
            if has_recent_abandoned_cart(
                engine, user_id, within_hours=forecast_settings.RISK_ABANDON_GRACE_HOURS
            )
        ]
        eligible = candidates.loc[eligible_ids]

        # Tầng 3 — xếp hạng theo TỔN THẤT KỲ VỌNG rồi cắt theo ngân sách.
        ranked = eligible.sort_values("expected_loss", ascending=False)
        budget = forecast_settings.RISK_MAX_VOUCHERS_PER_SCAN
        selected = ranked.head(budget) if budget > 0 else ranked

        published = 0
        for rank, (user_id, row) in enumerate(selected.iterrows(), start=1):
            await self._risk_producer.publish_churn_risk(
                user_id,
                row["segment"],
                {
                    "churnProbability": float(row["churn_probability"]),
                    "daysSinceLastActivity": float(row["days_since_last_activity"]),
                    "cartAbandonCount": float(row["cart_abandon_count"]),
                    # 3 field dưới để BPMN phân nhánh được theo GIÁ TRỊ khách hàng, không chỉ theo
                    # xác suất (vd tổn thất kỳ vọng cao -> voucher lớn, thấp -> chỉ email nhắc).
                    "monetary": float(row["monetary"]),
                    "expectedLoss": float(row["expected_loss"]),
                    "riskRank": rank,
                },
            )
            published += 1

        skipped_by_budget = int(len(ranked) - len(selected))
        logger.info(
            f"Risk scan done: {len(df)} user chấm điểm -> {len(population)} trong dân số hợp lệ "
            f"(>= {MIN_DELIVERED_ORDERS_FOR_CHURN} đơn DELIVERED) -> {len(candidates)} at-risk "
            f"-> {len(eligible)} đủ điều kiện "
            f"(có bỏ giỏ hàng trong {forecast_settings.RISK_ABANDON_GRACE_HOURS}h) -> {published} published "
            f"(ngân sách {budget or 'không giới hạn'}, bỏ qua {skipped_by_budget} người xếp sau) "
            f"[ngưỡng={threshold}, model đã hiệu chỉnh={calibrated}]"
        )
        return {
            "status": "SUCCESS",
            "scored_users": int(len(df)),
            "in_population": int(len(population)),
            "at_risk_candidates": int(len(candidates)),
            "eligible": int(len(eligible)),
            "published": published,
            "skipped_by_budget": skipped_by_budget,
            "threshold_used": threshold,
            "model_calibrated": calibrated,
        }
