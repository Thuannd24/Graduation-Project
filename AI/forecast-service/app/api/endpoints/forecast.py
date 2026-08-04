from fastapi import APIRouter, Header, HTTPException, Query
from app.models.behavior import BehaviorBatchRequest
from app.models.forecast import ForecastRequest, ForecastResponse, AnomalyRequest, AnomalyResponse, ForecastPoint
from app.services.demand import demand_forecasting_service
from app.services.anomaly import anomaly_detection_service
from app.services.rfm import rfm_segmentation_service
from app.services.risk_scoring import ModelNotTrainedError, risk_scoring_service
from app.training.labels import MIN_DELIVERED_ORDERS_FOR_CHURN
from app.training.train import train_and_evaluate
from app.training.ablation import run_ablation
from app.training.calibration import run_calibration_study
from app.training.label_diagnostics import run_label_diagnostics
from app.training.rule_benchmark import run_rule_benchmark
from app.training.model_card import build_model_card
from app.state import behavior_producer, risk_scheduler
from shared_common.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()

@router.get("/forecast", response_model=ForecastResponse)
def get_demand_forecast(
    productId: int = Query(..., description="Product ID to forecast"),
    days: int = Query(30, description="Forecast horizon in days")
):
    try:
        predictions = demand_forecasting_service.forecast_demand(productId, days)
        points = [
            ForecastPoint(
                date=p['date'],
                predicted_quantity=p['predicted_quantity'],
                lower_bound=p['lower_bound'],
                upper_bound=p['upper_bound']
            ) for p in predictions
        ]
        return ForecastResponse(
            productId=productId,
            predictions=points,
            model_used="LightGBM"
        )
    except Exception as e:
        logger.error(f"Error in demand forecast endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/anomaly", response_model=AnomalyResponse)
def detect_metric_anomaly(request: AnomalyRequest):
    try:
        res = anomaly_detection_service.detect_anomaly(request.historical_data)
        return AnomalyResponse(
            is_anomaly=res['is_anomaly'],
            confidence_score=res['confidence_score'],
            threshold_value=res['threshold_value'],
            actual_value=res['actual_value']
        )
    except Exception as e:
        logger.error(f"Error in anomaly detection endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rfm/trigger")
def trigger_rfm_clustering():
    try:
        res = rfm_segmentation_service.run_rfm_clustering()
        return res
    except Exception as e:
        logger.error(f"Error triggering RFM: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/train")
def train_churn_models():
    """Train (fit) lại KMeans segmentation + Logistic Regression churn classifier, lưu artifact
    qua shared_common.registry. Đây là nơi DUY NHẤT model được fit — mọi endpoint/scan định kỳ
    khác chỉ predict bằng model đã lưu (xem docs/canvas/churn-risk-implementation-plan.md Phase 5).
    Chạy tay khi demo/cần cập nhật model; có thể lên lịch chạy định kỳ (vd hàng ngày) sau này."""
    try:
        metrics = train_and_evaluate()
        return {"status": "SUCCESS", "metrics": metrics}
    except Exception as e:
        logger.error(f"Error training churn models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/ablation")
def run_feature_ablation():
    """Thí nghiệm mở rộng feature (bước 3): so baseline 11 feature với baseline + từng block ứng
    viên, kết luận GIỮ/LOẠI bằng cách so delta AUC với sàn nhiễu (std của grouped CV) — không phải
    cứ AUC cao hơn là tốt hơn. Kèm permutation importance (bền với đa cộng tuyến, dùng để SỬA bảng
    hệ số LR) và L1 path (bỏ được bao nhiêu feature mà AUC không giảm).

    KHÔNG lưu model, không ảnh hưởng model đang chạy — chỉ phân tích. Xem app/training/ablation.py.
    """
    try:
        return {"status": "SUCCESS", "result": run_ablation()}
    except Exception as e:
        logger.error(f"Error running feature ablation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/calibration")
def run_calibration():
    """Kiểm định & hiệu chỉnh xác suất churn (Tầng 0.1). `class_weight='balanced'` làm model ước
    lượng hậu nghiệm dưới tiên nghiệm 50/50 thay vì base rate thật ⇒ xác suất bị thổi phồng hệ thống.
    So 4 phương án (raw / prior_shift / platt / isotonic) bằng Brier + ECE + reliability curve, và
    tính LẠI bảng xếp hạng theo tổn thất kỳ vọng — đại lượng duy nhất bị hiệu chỉnh làm thay đổi
    (AUC và xếp-theo-P thuần thì không, vì hiệu chỉnh là biến đổi đơn điệu).

    KHÔNG lưu model, KHÔNG đổi hành vi phát voucher. Xem app/training/calibration.py.
    """
    try:
        return {"status": "SUCCESS", "result": run_calibration_study()}
    except Exception as e:
        logger.error(f"Error running calibration study: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/label-diagnostics")
def run_label_diag():
    """Chẩn đoán định nghĩa nhãn churn (Tầng 0.2). Nhãn hiện tại ("không hoạt động 30 ngày tới", từ
    orders ∪ user_events) cùng nguồn với feature mạnh nhất (số category XEM 30 ngày qua) ⇒ bài toán
    gần như thành "user đang hoạt động có tiếp tục hoạt động không", nên mọi việc mở rộng feature đều
    thất bại. Quét lưới (cửa sổ 60/90/120 × nguồn nhãn × lọc dân số), báo base_rate + AUC ± std +
    permutation importance của feature mạnh nhất để biết tautology đã bị phá chưa.

    KHÔNG lưu model, KHÔNG đổi labels.py production. Xem app/training/label_diagnostics.py.
    """
    try:
        return {"status": "SUCCESS", "result": run_label_diagnostics()}
    except Exception as e:
        logger.error(f"Error running label diagnostics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/rule-benchmark")
def run_rule_bench():
    """Benchmark Rule-based vs AI (Tầng 2.2) — trả lời "sao không viết vài câu IF/SQL cho xong?".

    So model với baseline rule ở nhiều mức phức tạp: rule 1 biến, rule 2 điều kiện AND (đều QUÉT LƯỚI
    để lấy rule TỐT NHẤT, chọn trên train và đo trên test), và cây quyết định giới hạn độ sâu 1/2/3 —
    tức tập rule tối ưu do máy tìm, baseline rule-based mạnh nhất có thể dựng. Tất cả trên CÙNG bộ
    fold grouped CV. Trả kèm chính rule đã chọn để trích vào báo cáo.

    KHÔNG lưu model, không đổi production. Xem app/training/rule_benchmark.py.
    """
    try:
        return {"status": "SUCCESS", "result": run_rule_benchmark()}
    except Exception as e:
        logger.error(f"Error running rule benchmark: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/card")
def get_model_card():
    """Model card (Tầng 5) — trả lời "model nào, version nào, train lúc nào, feature/nhãn gì, metric
    bao nhiêu, giới hạn gì" trong 1 lần gọi, thay vì phải lục nhiều endpoint khi bảo vệ.

    Chỉ ĐỌC LẠI những gì `train_and_evaluate()` đã lưu qua `shared_common/registry.py` — không tính
    toán gì mới, không lưu model, không đổi production. Xem app/training/model_card.py.
    """
    try:
        return {"status": "SUCCESS", "result": build_model_card()}
    except Exception as e:
        logger.error(f"Error building model card: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/risk/trigger-scan")
async def trigger_risk_scan():
    """Chạy risk-scan ngay (không đợi lịch APScheduler) — phục vụ test/demo. Cần đã train model
    qua POST /models/train trước, nếu không sẽ trả status=SKIPPED kèm lý do rõ ràng."""
    try:
        result = await risk_scheduler.run_risk_scan()
        return result
    except Exception as e:
        logger.error(f"Error triggering risk scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

import numpy as np

# Tầng 5 (dọn dẹp) — 3 endpoint dưới đây từng trả dữ liệu HARDCODE/np.random như thể là kết quả AI
# thật, không kèm cảnh báo gì (rủi ro trình bày số giả như số thật khi demo). Quyết định xử lý:
#   - segmentation: NỐI VÀO SỐ THẬT — tái dùng risk_scoring_service.predict(), đúng model/dân số mà
#     risk_scheduler dùng để phát voucher, không phải model riêng.
#   - anomaly-detection / demand-forecasting: dựng bản thật là MỘT DỰ ÁN RIÊNG ngoài phạm vi
#     churn-risk (cần feature engineering + temporal split + đánh giá y hệt khối lượng đã làm cho
#     churn). Giữ nguyên mock nhưng đổi shape response để mang cờ `is_demo_data` + `note` tường minh
#     — FE (AnalyticsAITab.jsx) đọc cờ này để hiển thị banner "dữ liệu minh họa", không im lặng nữa.

DEMAND_FORECASTING_DEMO_NOTE = (
    "Dữ liệu minh họa (sinh ngẫu nhiên) — demand forecasting theo sản phẩm là hướng phát triển "
    "riêng, chưa có model thật train trên lịch sử tồn kho. Không dùng số này để ra quyết định."
)
ANOMALY_DETECTION_DEMO_NOTE = (
    "Dữ liệu minh họa (hardcode) — phát hiện giao dịch bất thường là hướng phát triển riêng, chưa "
    "có model thật chấm trên giao dịch thật. Không dùng số này để khoá tài khoản hay cảnh báo rủi ro."
)

SEGMENT_COLORS = {
    "At Risk": "#ef4444",
    "Lapsed": "#f59e0b",
    "Loyal Regulars": "#3b82f6",
    "VIP Champions": "#10b981",
}


@router.get("/admin/analytics/demand-forecasting")
def get_admin_demand_forecasting():
    try:
        from datetime import datetime, timedelta
        dates = []
        actual = []
        forecast = []
        start_date = datetime.now() - timedelta(days=14)
        for i in range(10):
            d = start_date + timedelta(days=i*2)
            dates.append(d.strftime("%d/%m"))
            if i < 8:
                actual.append(int(120 + i * 15 + np.random.randint(-10, 10)))
            else:
                actual.append(None)
            forecast.append(int(115 + i * 14 + np.random.randint(-5, 5)))

        return {
            "data": {"dates": dates, "actual": actual, "forecast": forecast},
            "is_demo_data": True,
            "note": DEMAND_FORECASTING_DEMO_NOTE,
        }
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/analytics/anomalies")
def get_admin_anomalies():
    demo_rows = [
        { "id": "TX-78391", "timestamp": "2026-07-10 14:23:11", "amount": 154000000, "user": "nguyenvan_a@gmail.com", "riskScore": 92, "reason": "Giá trị đơn hàng cao đột biến & Đặt liên tiếp 3 đơn trong 5 phút" },
        { "id": "TX-78345", "timestamp": "2026-07-10 11:05:44", "amount": 45000000, "user": "ty_le99@yahoo.com", "riskScore": 81, "reason": "Thanh toán khác quốc gia với IP đăng ký ban đầu" },
        { "id": "TX-78102", "timestamp": "2026-07-09 23:51:02", "amount": 3500000, "user": "guest_98271", "riskScore": 78, "reason": "Sử dụng 5 mã giảm giá sai liên tiếp trước khi thanh toán" }
    ]
    return {"data": demo_rows, "is_demo_data": True, "note": ANOMALY_DETECTION_DEMO_NOTE}


@router.get("/admin/analytics/segmentation")
def get_admin_segmentation():
    """Phân bố 4 phân khúc THẬT từ model churn đang chạy (KMeans, xem app/training/train.py::
    _assign_cluster_labels — gán `At Risk` theo tỉ lệ churn đo được, không phải archetype tự vẽ).
    Chỉ tính trên dân số >= MIN_DELIVERED_ORDERS_FOR_CHURN đơn DELIVERED, khớp đúng dân số model đã
    học (chấm điểm ngoài dân số này là ngoại suy — xem risk_scoring.predict())."""
    try:
        df = risk_scoring_service.predict()
    except ModelNotTrainedError as e:
        return {"data": [], "is_demo_data": False, "note": f"Chưa có model nào được train: {e}"}
    except Exception as e:
        logger.error(f"Error computing segmentation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    population = df[df["frequency"] >= MIN_DELIVERED_ORDERS_FOR_CHURN]
    if population.empty:
        return {"data": [], "is_demo_data": False, "note": "Không có user nào trong dân số hợp lệ."}

    total_users = len(population)
    total_monetary = float(population["monetary"].sum()) or 1.0

    rows = []
    for segment, group in population.groupby("segment"):
        rows.append(
            {
                "segment": segment,
                "count": int(len(group)),
                "percentage": round(len(group) / total_users * 100, 1),
                "color": SEGMENT_COLORS.get(segment, "#94a3b8"),
                "spendRatio": round(float(group["monetary"].sum()) / total_monetary * 100, 1),
            }
        )
    rows.sort(key=lambda r: -r["count"])

    return {"data": rows, "is_demo_data": False, "note": None}


@router.post("/public/behavior/events")
async def ingest_behavior_events(request: BehaviorBatchRequest, x_user_id: str | None = Header(None)):
    """Nhận lô vi hành vi từ FE rồi publish lên Kafka (`BehaviorEventConsumer` ghi vào `user_events`).

    **Public có chủ đích**: khách chưa đăng nhập vẫn duyệt hàng và vẫn cần ghi nhận hành vi — chặn
    họ lại sẽ mất đúng nhóm dữ liệu quan trọng nhất cho bài toán bỏ giỏ hàng. Danh tính lấy theo thứ
    tự: `X-User-Id` (do api-gateway inject từ JWT, KHÔNG tin header client tự gửi — gateway đã strip
    mọi `X-User-*` từ client, xem UserHeaderFilter.java) -> nếu không có thì chỉ có `sessionId`.

    Luôn trả 200 kể cả khi publish lỗi: đây là đường ghi nhận phụ trợ, không được để nó làm FE báo
    lỗi cho người dùng. Số thực sự gửi được trả về trong `accepted` để debug.
    """
    events = []
    for e in request.events:
        events.append(
            {
                "userId": x_user_id or None,
                "sessionId": e.sessionId,
                "itemId": e.itemId,
                "categoryId": e.categoryId,
                "actionType": e.actionType,
                "weight": e.weight,
                "timestamp": e.timestamp,
            }
        )

    try:
        accepted = await behavior_producer.publish_batch(events)
    except Exception as exc:
        logger.error(f"Không publish được lô vi hành vi ({len(events)} event): {exc}")
        return {"received": len(events), "accepted": 0}

    return {"received": len(events), "accepted": accepted}
