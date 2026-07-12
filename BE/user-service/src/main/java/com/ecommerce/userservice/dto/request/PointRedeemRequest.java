package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class PointRedeemRequest {

    @NotNull
    @Positive
    private Integer pointsToRedeem;

    @NotNull
    @Positive
    private Long orderId;

    /** Giá trị đơn sau voucher — dùng validate số điểm tối đa. */
    @NotNull
    @Positive
    private BigDecimal orderAmount;
}
