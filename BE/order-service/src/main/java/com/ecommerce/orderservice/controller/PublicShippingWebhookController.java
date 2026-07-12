package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.request.ShippingWebhookRequest;
import com.ecommerce.orderservice.service.OrderService;
import com.ecommerce.orderservice.support.ShippingWebhookSigner;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/public/orders")
@RequiredArgsConstructor
public class PublicShippingWebhookController {

    private final OrderService orderService;

    @Value("${app.shipping.webhook-secret:}")
    private String webhookSecret;

    /**
     * POST /api/v1/public/orders/shipping-webhook
     * Header: X-Shipping-Signature = HMAC-SHA256(secret, trackingCode|status)
     */
    @PostMapping("/shipping-webhook")
    public ApiResponse<Void> shippingWebhook(
            @RequestHeader(value = "X-Shipping-Signature", required = false) String signature,
            @Valid @RequestBody ShippingWebhookRequest payload) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Shipping webhook secret chưa được cấu hình.");
        }
        if (!ShippingWebhookSigner.verify(webhookSecret, payload.getTrackingCode(), payload.getStatus(), signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chữ ký webhook không hợp lệ.");
        }
        orderService.handleShippingWebhook(payload.getTrackingCode(), payload.getStatus());
        return ApiResponse.success(null);
    }
}
