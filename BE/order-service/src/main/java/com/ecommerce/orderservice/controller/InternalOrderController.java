package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.response.OrderSummaryDto;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.entity.OrderItem;
import com.ecommerce.orderservice.repository.OrderItemRepository;
import com.ecommerce.orderservice.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/internal/orders")
@RequiredArgsConstructor
@Slf4j
public class InternalOrderController {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;

    @GetMapping("/check-eligible")
    public ApiResponse<Boolean> checkEligibleReview(
            @RequestParam("userId") String userId,
            @RequestParam("productId") Long productId,
            @RequestParam("orderId") Long orderId) {
        log.info("Internal check eligible review - userId: {}, productId: {}, orderId: {}", userId, productId, orderId);
        
        Order order = orderRepository.findById(orderId).orElse(null);
        if (order == null) {
            log.warn("Order not found: {}", orderId);
            return ApiResponse.success(false);
        }
        
        if (!order.getUserId().equals(userId)) {
            log.warn("Order {} does not belong to user {}", orderId, userId);
            return ApiResponse.success(false);
        }
        
        // Trạng thái đơn hàng phải là SHIPPED hoặc DELIVERED
        String status = order.getStatus();
        if (!"DELIVERED".equalsIgnoreCase(status) && !"SHIPPED".equalsIgnoreCase(status) && !"COMPLETED".equalsIgnoreCase(status)) {
            log.warn("Order {} is in status {}, not eligible for review", orderId, status);
            return ApiResponse.success(false);
        }
        
        List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
        boolean containsProduct = items.stream().anyMatch(item -> item.getProductId().equals(productId));
        if (!containsProduct) {
            log.warn("Order {} does not contain product {}", orderId, productId);
            return ApiResponse.success(false);
        }
        
        return ApiResponse.success(true);
    }

    @GetMapping("/total-spending")
    public ApiResponse<BigDecimal> getTotalSpending(
            @RequestParam("userId") String userId,
            @RequestParam(value = "days", defaultValue = "30") int days) {
        log.info("Internal get total spending - userId: {}, days: {}", userId, days);
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        BigDecimal total = orderRepository.sumFinalAmountByUserIdAndCreatedAtAfter(userId, startDate);
        return ApiResponse.success(total);
    }

    @GetMapping("/{orderId}/summary")
    public ApiResponse<OrderSummaryDto> getOrderSummary(
            @PathVariable Long orderId) {
        log.info("Internal get order summary - orderId: {}", orderId);
        Order order = orderRepository.findById(orderId).orElse(null);
        if (order == null) {
            return ApiResponse.success(null);
        }
        List<Long> productIds = orderItemRepository.findByOrderId(orderId).stream()
                .map(OrderItem::getProductId)
                .distinct()
                .toList();
        OrderSummaryDto summary =
                OrderSummaryDto.builder()
                        .orderId(order.getId())
                        .userId(order.getUserId())
                        .status(order.getStatus())
                        .totalAmount(order.getTotalAmount())
                        .finalAmount(order.getFinalAmount())
                        .shippingAddress(order.getShippingAddress())
                        .phoneNumber(order.getPhoneNumber())
                        .productIds(productIds)
                        .build();
        return ApiResponse.success(summary);
    }
}
