package com.ecommerce.orderservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShippingWebhookRequest {

    @NotBlank
    private String trackingCode;

    @NotBlank
    private String status;
}
