package com.ecommerce.apigateway.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Fallback controller — trả về lỗi thân thiện khi Circuit Breaker mở
 * (service downstream bị down hoặc quá tải).
 */
@RestController
public class FallbackController {

    private Mono<ResponseEntity<Map<String, Object>>> buildFallback(String service) {
        Map<String, Object> body = Map.of(
                "status", HttpStatus.SERVICE_UNAVAILABLE.value(),
                "error", "Service Unavailable",
                "message", "Dịch vụ " + service + " tạm thời không khả dụng. Vui lòng thử lại sau.",
                "service", service
        );
        return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body));
    }

    @RequestMapping("/fallback/user-service")
    public Mono<ResponseEntity<Map<String, Object>>> userServiceFallback() {
        return buildFallback("user-service");
    }

    @RequestMapping("/fallback/product-service")
    public Mono<ResponseEntity<Map<String, Object>>> productServiceFallback() {
        return buildFallback("product-service");
    }

    @RequestMapping("/fallback/order-service")
    public Mono<ResponseEntity<Map<String, Object>>> orderServiceFallback() {
        return buildFallback("order-service");
    }

    @RequestMapping("/fallback/inventory-service")
    public Mono<ResponseEntity<Map<String, Object>>> inventoryServiceFallback() {
        return buildFallback("inventory-service");
    }

    @RequestMapping("/fallback/payment-service")
    public Mono<ResponseEntity<Map<String, Object>>> paymentServiceFallback() {
        return buildFallback("payment-service");
    }

    @RequestMapping("/fallback/notification-service")
    public Mono<ResponseEntity<Map<String, Object>>> notificationServiceFallback() {
        return buildFallback("notification-service");
    }

    @RequestMapping("/fallback/promotion-service")
    public Mono<ResponseEntity<Map<String, Object>>> promotionServiceFallback() {
        return buildFallback("promotion-service");
    }

    @RequestMapping("/fallback/ai-engine")
    public Mono<ResponseEntity<Map<String, Object>>> aiEngineFallback() {
        return buildFallback("ai-engine");
    }
}
