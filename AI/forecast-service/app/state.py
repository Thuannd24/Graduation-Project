"""Singleton instances dùng chung giữa app/main.py (lifespan start/stop) và các endpoint (vd
`/risk/trigger-scan` cần gọi `risk_scheduler.run_risk_scan()` tay). Tách riêng module này để
tránh circular import (main.py import router từ endpoints, nếu endpoints lại import ngược từ
main.py sẽ vòng lặp).
"""
from app.kafka.behavior_consumer import BehaviorEventConsumer
from app.kafka.behavior_producer import BehaviorEventProducer
from app.kafka.risk_producer import RiskEventProducer
from app.services.risk_scheduler import RiskScheduler

behavior_consumer = BehaviorEventConsumer()
behavior_producer = BehaviorEventProducer()
risk_producer = RiskEventProducer()
risk_scheduler = RiskScheduler(risk_producer)
