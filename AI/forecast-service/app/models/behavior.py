"""Schema request cho endpoint nhận vi hành vi từ FE.

Validate ở tầng schema (Pydantic) thay vì tin FE: endpoint này là **public** (khách chưa đăng nhập
vẫn duyệt hàng và vẫn cần ghi nhận hành vi), nên phải coi mọi field là dữ liệu không tin cậy.
"""
from pydantic import BaseModel, Field, field_validator

from shared_common.contracts import FE_BEHAVIOR_ACTIONS

# Chặn client gửi lô khổng lồ làm nghẽn Kafka/DB. 200 đủ rộng cho 1 phiên duyệt dài giữa 2 lần flush
# (FE flush mỗi 10s hoặc khi rời tab), nhưng vẫn có chặn trên rõ ràng.
MAX_BATCH_SIZE = 200


class BehaviorEvent(BaseModel):
    actionType: str
    itemId: int | None = None
    categoryId: int | None = None
    # Payload số cho action có định lượng: SCROLL_DEPTH -> % đã cuộn, PAGE_DWELL -> số giây.
    weight: float | None = None
    # FE gửi thời điểm xảy ra THẬT (không dùng thời điểm server nhận), vì lô được gom rồi mới gửi —
    # dùng giờ server sẽ dồn mọi event trong lô vào cùng một mốc và phá vỡ THỨ TỰ, mà thứ tự chính
    # là thứ ta cần đo (xem app/training/experiments/README.md).
    timestamp: str
    sessionId: str | None = None

    @field_validator("actionType")
    @classmethod
    def _known_action(cls, v: str) -> str:
        if v not in FE_BEHAVIOR_ACTIONS:
            raise ValueError(f"actionType không hợp lệ: {v}")
        return v

    @field_validator("weight")
    @classmethod
    def _sane_weight(cls, v: float | None) -> float | None:
        # Chặn giá trị vô lý (âm, hoặc dwell hàng năm) để không làm lệch feature thống kê sau này.
        if v is not None and (v < 0 or v > 86400):
            raise ValueError("weight phải trong [0, 86400]")
        return v


class BehaviorBatchRequest(BaseModel):
    events: list[BehaviorEvent] = Field(..., max_length=MAX_BATCH_SIZE)
