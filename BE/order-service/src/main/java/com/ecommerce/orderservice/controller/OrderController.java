package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.request.CancelOrderRequest;
import com.ecommerce.orderservice.dto.request.CheckoutPreviewRequest;
import com.ecommerce.orderservice.dto.request.CheckoutRequest;
import com.ecommerce.orderservice.dto.response.CheckoutPreviewResponse;
import com.ecommerce.orderservice.dto.response.OrderResponse;
import com.ecommerce.orderservice.dto.response.WarrantyItemResponse;
import com.ecommerce.orderservice.service.OrderService;
import com.ecommerce.orderservice.scheduler.OrderExpiryScheduler;
import com.ecommerce.orderservice.support.AuthenticatedUserResolver;
import com.ecommerce.orderservice.support.OrderPolicy;
import com.ecommerce.orderservice.support.OrderPricingHelper;
import com.ecommerce.orderservice.support.OrderStatusMachine;
import com.ecommerce.orderservice.support.ShippingFeeCalculator;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;
    private final AuthenticatedUserResolver userResolver;

    @PostMapping("/checkout/preview")
    public ApiResponse<CheckoutPreviewResponse> previewCheckout(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody CheckoutPreviewRequest request) {
        return ApiResponse.success(orderService.previewCheckout(userResolver.resolveUserId(userId), request));
    }

    @PostMapping("/checkout")
    public ApiResponse<OrderResponse> checkout(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Email", required = false) String userEmail,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CheckoutRequest request) {
        String resolvedUserId = userResolver.resolveUserId(userId);
        return ApiResponse.success(orderService.createOrder(resolvedUserId, request, idempotencyKey, userEmail));
    }

    @GetMapping("/{id}")
    public ApiResponse<OrderResponse> getOrder(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Roles", required = false) String rolesHeader,
            @PathVariable Long id) {
        return ApiResponse.success(orderService.getOrder(id, userResolver.resolveUserId(userId),
                userResolver.resolveRolesHeader(rolesHeader)));
    }

    @GetMapping
    public ApiResponse<List<OrderResponse>> getUserOrders(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Roles", required = false) String rolesHeader) {
        return ApiResponse.success(orderService.getOrdersByUser(userResolver.resolveUserId(userId),
                userResolver.resolveRolesHeader(rolesHeader)));
    }

    @GetMapping("/warranty/me")
    public ApiResponse<List<WarrantyItemResponse>> getMyWarranty(
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        return ApiResponse.success(orderService.getMyWarranty(userResolver.resolveUserId(userId)));
    }

    /**
     * Hủy đơn. Body bắt buộc: {"reasonCode": "CHANGED_MIND" | ... | "OTHER", "reason": "..."} (OTHER cần reason).
     * Khách chỉ hủy được khi đơn chưa giao vận (PENDING / AWAITING_PAYMENT / CONFIRMED). Admin/staff hủy đơn
     * SHIPPED -> RETURNING (chờ hoàn hàng). Trả về đơn sau khi hủy.
     */
    @PostMapping("/{id}/cancel")
    public ApiResponse<OrderResponse> cancelOrder(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-User-Email", required = false) String userEmail,
            @RequestHeader(value = "X-User-Roles", required = false) String rolesHeader,
            @PathVariable Long id,
            @RequestBody(required = false) CancelOrderRequest request) {
        String reasonCode = request != null ? request.getReasonCode() : null;
        String reason = request != null ? request.getReason() : null;
        return ApiResponse.success(orderService.cancelOrder(id, userResolver.resolveUserId(userId), userEmail,
                userResolver.resolveRolesHeader(rolesHeader), reasonCode, reason));
    }

    /** Chính sách đặt hàng cho giao diện: phí ship, ngưỡng freeship, hạn mức COD, giới hạn số lượng, lý do hủy. */
    @GetMapping("/policy")
    public ApiResponse<Map<String, Object>> getOrderPolicy() {
        Map<String, Object> policy = new LinkedHashMap<>();
        policy.put("shippingFee", ShippingFeeCalculator.DEFAULT_SHIPPING_FEE);
        policy.put("freeShippingThreshold", ShippingFeeCalculator.FREE_SHIPPING_THRESHOLD);
        policy.put("codMaxAmount", OrderPricingHelper.COD_MAX_AMOUNT);
        policy.put("vatIncluded", true);
        policy.put("vatRate", OrderPricingHelper.VAT_RATE);
        policy.put("maxQuantityPerItem", OrderPolicy.MAX_QUANTITY_PER_ITEM);
        policy.put("maxPendingUnpaidOrders", OrderPolicy.MAX_PENDING_UNPAID_ORDERS);
        policy.put("paymentWindowMinutes", OrderExpiryScheduler.PAYMENT_WINDOW_MINUTES);
        policy.put("customerCancellableStatuses", OrderStatusMachine.CUSTOMER_CANCELLABLE);
        policy.put("cancelReasons", OrderPolicy.CANCEL_REASONS);
        return ApiResponse.success(policy);
    }

    /** Admin/staff xác nhận đã nhận hàng hoàn về kho: RETURNING -> RETURNED, hoàn kho + hoàn tiền nếu đã trả. */
    @PutMapping("/{id}/return-received")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<OrderResponse> confirmReturnReceived(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body) {
        String note = body != null ? body.get("note") : null;
        return ApiResponse.success(orderService.confirmReturnReceived(id, note));
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
            @RequestParam("status") String status,
            @RequestParam(value = "reason", required = false) String reason) {
        return ApiResponse.success(orderService.updateDeliveryStatusByAdmin(id, status, reason));
    }
}
