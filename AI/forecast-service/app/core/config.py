import os
from pydantic import BaseModel

class ForecastSettings(BaseModel):
    PROJECT_NAME: str = "Forecast & Analytics Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8004
    
    # Internal services URLs
    USER_SERVICE_URL: str = os.getenv("USER_SERVICE_URL", "http://localhost:8085")

    # Churn-risk scan (Phase 6) — xem docs/canvas/churn-risk-implementation-plan.md
    RISK_SCAN_INTERVAL_HOURS: float = float(os.getenv("RISK_SCAN_INTERVAL_HOURS", "1"))
    RISK_ABANDON_GRACE_HOURS: int = int(os.getenv("RISK_ABANDON_GRACE_HOURS", "24"))
    # Ngưỡng xác suất churn. Bình thường KHÔNG đọc trực tiếp giá trị này — dùng
    # `risk_scoring.effective_threshold()`, hàm đó đọc ngưỡng đề xuất từ metadata của chính model đang
    # chạy. Lý do: ngưỡng tối ưu đổi theo định nghĩa nhãn và theo mỗi lần train (đo được: nhãn v1 ->
    # 0.24, nhãn v2 -> 0.26), nên hardcode ở đây sẽ âm thầm lạc hậu.
    # Giá trị dưới chỉ là DỰ PHÒNG khi metadata không đọc được.
    RISK_CHURN_PROBABILITY_THRESHOLD: float = float(os.getenv("RISK_CHURN_PROBABILITY_THRESHOLD", "0.25"))
    # Đặt env này để ép một ngưỡng cố định, bỏ qua giá trị trong metadata (dành cho vận hành can thiệp).
    RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE: float | None = (
        float(os.environ["RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE"])
        if os.getenv("RISK_CHURN_PROBABILITY_THRESHOLD_OVERRIDE")
        else None
    )
    # Ngưỡng dùng khi model đang chạy CHƯA được hiệu chỉnh (bundle cũ, hoặc hiệu chỉnh thất bại).
    # Mọi ngưỡng tune cho thang đã hiệu chỉnh đều SAI trên thang thô -> phải có đường lùi an toàn.
    RISK_CHURN_PROBABILITY_THRESHOLD_LEGACY: float = float(
        os.getenv("RISK_CHURN_PROBABILITY_THRESHOLD_LEGACY", "0.5")
    )
    # Ngân sách voucher mỗi lần scan: chỉ phát cho N user có TỔN THẤT KỲ VỌNG cao nhất
    # (churn_probability x monetary), không phát cho mọi người vượt ngưỡng. 0 = không giới hạn.
    RISK_MAX_VOUCHERS_PER_SCAN: int = int(os.getenv("RISK_MAX_VOUCHERS_PER_SCAN", "50"))

forecast_settings = ForecastSettings()
