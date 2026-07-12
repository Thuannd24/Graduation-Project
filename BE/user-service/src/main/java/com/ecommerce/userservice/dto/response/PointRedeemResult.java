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
public class PointRedeemResult {

    private Long userId;
    private Integer pointsRedeemed;
    private BigDecimal discountAmount;
    private Integer newPointBalance;
}
