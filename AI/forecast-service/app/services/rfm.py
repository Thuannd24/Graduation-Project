from typing import Any, Dict

from app.services.risk_scoring import risk_scoring_service
from shared_common.logger import get_logger

logger = get_logger(__name__)


class RfmSegmentationService:
    """Giữ tên class/method để không phải sửa `app/api/endpoints/forecast.py` (endpoint
    `/rfm/trigger` đã có từ trước, FE admin đang gọi). Nội dung bên trong đã viết lại hoàn toàn:

    TRƯỚC ĐÂY: fit KMeans lại TỪ ĐẦU mỗi lần endpoint được gọi, và khi query DB lỗi thì ÂM THẦM
    sinh 100 user giả rồi trả về như thể thành công — bug nghiêm trọng, không ai biết model đang
    chạy trên dữ liệu thật hay giả.

    BÂY GIỜ: chỉ PREDICT bằng model đã train và lưu qua `app/training/train.py` (endpoint
    `POST /api/v1/models/train`, xem Phase 5 trong docs/canvas/churn-risk-implementation-plan.md).
    Nếu chưa train lần nào, hoặc query dữ liệu lỗi, sẽ RAISE lỗi rõ ràng (endpoint trả 500 kèm
    thông báo cụ thể) thay vì âm thầm trả kết quả giả.
    """

    def run_rfm_clustering(self) -> Dict[str, Any]:
        logger.info("Chạy RFM/segmentation (predict bằng model đã train, không refit)...")

        df = risk_scoring_service.predict()

        if df.empty:
            return {"status": "SUCCESS", "users_processed": 0, "segments_distribution": {}}

        return {
            "status": "SUCCESS",
            "users_processed": len(df),
            "segments_distribution": df["segment"].value_counts().to_dict(),
        }


rfm_segmentation_service = RfmSegmentationService()
