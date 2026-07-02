package com.ecommerce.paymentservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentInitiateRequest {
    @NotNull(message = "Order ID is required")
    private Long orderId;

    private BigDecimal amount;

    @NotBlank(message = "Payment method is required")
    private String paymentMethod; // e.g. VNPAY, COD

    private String ipAddress;
    private String userId;
    private String email;
}
