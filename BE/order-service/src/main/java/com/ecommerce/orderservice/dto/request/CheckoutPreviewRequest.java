package com.ecommerce.orderservice.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutPreviewRequest {
    private String couponCode;
    private Integer pointsToRedeem;
}
