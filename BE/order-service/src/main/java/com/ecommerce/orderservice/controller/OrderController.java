package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.request.CheckoutRequest;
import com.ecommerce.orderservice.dto.response.OrderResponse;
import com.ecommerce.orderservice.dto.response.WarrantyItemResponse;
import com.ecommerce.orderservice.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/checkout")
    public ApiResponse<OrderResponse> checkout(
            @RequestHeader(value = "X-User-Id") String userId,
            @RequestHeader(value = "X-User-Email", required = false) String userEmail,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CheckoutRequest request) {
        return ApiResponse.success(orderService.createOrder(userId, request, idempotencyKey, userEmail));
    }

    @GetMapping("/{id}")
    public ApiResponse<OrderResponse> getOrder(
            @RequestHeader(value = "X-User-Id") String userId,
            @RequestHeader(value = "X-User-Roles", required = false) String rolesHeader,
            @PathVariable Long id) {
        return ApiResponse.success(orderService.getOrder(id, userId, rolesHeader));
    }

    @GetMapping
    public ApiResponse<List<OrderResponse>> getUserOrders(
            @RequestHeader(value = "X-User-Id") String userId,
            @RequestHeader(value = "X-User-Roles", required = false) String rolesHeader) {
        return ApiResponse.success(orderService.getOrdersByUser(userId, rolesHeader));
    }

    @PostMapping("/{id}/cancel")
    public ApiResponse<Void> cancelOrder(
            @RequestHeader(value = "X-User-Id") String userId,
            @RequestHeader(value = "X-User-Email", required = false) String userEmail,
            @RequestHeader(value = "X-User-Roles", required = false) String rolesHeader,
            @PathVariable Long id) {
        orderService.cancelOrder(id, userId, userEmail, rolesHeader);
        return ApiResponse.success(null);
    }

    @PutMapping("/{id}/ship")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<OrderResponse> shipOrder(@PathVariable Long id) {
        return ApiResponse.success(orderService.shipOrder(id));
    }

    @PutMapping("/{id}/delivery-status")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<OrderResponse> updateDeliveryStatus(
            @PathVariable Long id,
            @RequestParam("status") String status) {
        return ApiResponse.success(orderService.updateDeliveryStatusByAdmin(id, status));
    }

    @PostMapping("/public/webhook/shipping")
    public ApiResponse<Void> shippingWebhook(@RequestBody Map<String, String> payload) {
        String trackingCode = payload.get("trackingCode");
        String status = payload.get("status");
        orderService.handleShippingWebhook(trackingCode, status);
        return ApiResponse.success(null);
    }
}
