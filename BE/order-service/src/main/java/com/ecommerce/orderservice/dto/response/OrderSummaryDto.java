package com.ecommerce.orderservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderSummaryDto {
    private Long orderId;
    private String userId;
    private BigDecimal totalAmount;
    private BigDecimal finalAmount;
    private String status;
    private String shippingAddress;
    private String phoneNumber;
    private List<Long> productIds;
}
