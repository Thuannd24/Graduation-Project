from fastapi import APIRouter, HTTPException, Query
from app.models.forecast import ForecastRequest, ForecastResponse, AnomalyRequest, AnomalyResponse, ForecastPoint
from app.services.demand import demand_forecasting_service
from app.services.anomaly import anomaly_detection_service
from app.services.rfm import rfm_segmentation_service
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

import numpy as np

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
            "dates": dates,
            "actual": actual,
            "forecast": forecast
        }
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/analytics/anomalies")
def get_admin_anomalies():
    return [
        { "id": "TX-78391", "timestamp": "2026-07-10 14:23:11", "amount": 154000000, "user": "nguyenvan_a@gmail.com", "riskScore": 92, "reason": "Giá trị đơn hàng cao đột biến & Đặt liên tiếp 3 đơn trong 5 phút" },
        { "id": "TX-78345", "timestamp": "2026-07-10 11:05:44", "amount": 45000000, "user": "ty_le99@yahoo.com", "riskScore": 81, "reason": "Thanh toán khác quốc gia với IP đăng ký ban đầu" },
        { "id": "TX-78102", "timestamp": "2026-07-09 23:51:02", "amount": 3500000, "user": "guest_98271", "riskScore": 78, "reason": "Sử dụng 5 mã giảm giá sai liên tiếp trước khi thanh toán" }
    ]

@router.get("/admin/analytics/segmentation")
def get_admin_segmentation():
    return [
        { "segment": "Khách hàng VIP (Core)", "count": 245, "percentage": 12.5, "color": "#10b981", "spendRatio": 45 },
        { "segment": "Khách hàng mua thường xuyên", "count": 680, "percentage": 34.6, "color": "#3b82f6", "spendRatio": 35 },
        { "segment": "Khách hàng mới / Tiềm năng", "count": 820, "percentage": 41.8, "color": "#f59e0b", "spendRatio": 15 },
        { "segment": "Khách hàng nguy cơ rời bỏ", "count": 220, "percentage": 11.2, "color": "#ef4444", "spendRatio": 5 }
    ]
