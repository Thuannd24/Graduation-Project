package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RedeemPreviewResponse {

    private Integer currentBalance;
    private Integer maxRedeemablePoints;
    private BigDecimal maxDiscountAmount;
    private BigDecimal vndPerPoint;
}
