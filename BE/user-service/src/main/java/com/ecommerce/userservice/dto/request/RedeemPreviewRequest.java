package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class RedeemPreviewRequest {

    /** Giá trị đơn sau giảm voucher (trước khi trừ điểm). */
    @NotNull
    @Positive
    private BigDecimal orderAmount;
}
