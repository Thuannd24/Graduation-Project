from pydantic import BaseModel, Field, field_validator

# Hợp đồng hạng khách. MEMBER là hạng mặc định thật của user-service (CreateUserRequest,
# UpdateUserAdminRequest: MEMBER|SILVER|GOLD|VIP) — tương đương REGULAR, nên cũng được nhận.
CUSTOMER_TIERS = frozenset({"VIP", "GOLD", "SILVER", "REGULAR", "MEMBER"})


class PricingRequest(BaseModel):
    userId: int
    productId: int
    customerTier: str  # VIP, GOLD, SILVER, REGULAR (MEMBER = REGULAR)
    segmentationLabel: str  # Champions, Loyalist, At Risk, New
    # Giá trị giỏ không thể âm (TC_PH9_PRICE_04): trước đây -5.000.000 được chấm như "giỏ nhỏ".
    cartTotal: float = Field(..., ge=0, allow_inf_nan=False)

    @field_validator("customerTier")
    @classmethod
    def _known_tier(cls, v: str) -> str:
        # TC_PH9_PRICE_05: hạng lạ (vd "PLATINUM_HACK") trước đây âm thầm bị xử lý như REGULAR.
        tier = v.strip().upper()
        if tier not in CUSTOMER_TIERS:
            raise ValueError(f"customerTier phải thuộc {sorted(CUSTOMER_TIERS)}")
        return tier


class PricingResponse(BaseModel):
    aiPriceScore: float  # 0.0 to 1.0 representing sensitivity
    recommendedAction: str  # GIVE_HIGH_DISCOUNT, GIVE_LOW_DISCOUNT, NO_DISCOUNT
