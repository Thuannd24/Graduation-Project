package com.ecommerce.orderservice.service.impl;

import com.ecommerce.grpc.inventory.InventoryGrpcResponse;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.client.RestTemplate;
import com.ecommerce.orderservice.grpc.InventoryGrpcClient;
import com.ecommerce.orderservice.dto.request.CheckoutRequest;
import com.ecommerce.orderservice.dto.response.CartItemResponse;
import com.ecommerce.orderservice.dto.response.CartResponse;
import com.ecommerce.orderservice.dto.response.OrderItemResponse;
import com.ecommerce.orderservice.dto.response.OrderResponse;
import com.ecommerce.orderservice.dto.response.WarrantyItemResponse;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.entity.OrderItem;
import com.ecommerce.orderservice.entity.OutboxEvent;
import com.ecommerce.orderservice.event.OrderCancelledEvent;
import com.ecommerce.orderservice.event.OrderCreatedEvent;
import com.ecommerce.orderservice.event.OrderConfirmedEvent;
import com.ecommerce.orderservice.client.PromotionClient;
import com.ecommerce.orderservice.exception.DuplicateRequestException;
import com.ecommerce.orderservice.exception.InvalidCouponException;
import com.ecommerce.orderservice.exception.InvalidOrderStateException;
import com.ecommerce.orderservice.exception.InsufficientStockException;
import com.ecommerce.orderservice.exception.ResourceNotFoundException;
import com.ecommerce.orderservice.exception.ServiceUnavailableException;
import com.ecommerce.orderservice.repository.OrderItemRepository;
import com.ecommerce.orderservice.repository.OrderRepository;
import com.ecommerce.orderservice.repository.OutboxEventRepository;
import com.ecommerce.orderservice.service.CartService;
import com.ecommerce.orderservice.service.OrderService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.data.domain.Sort;

import java.time.Duration;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final CartService cartService;
    private final InventoryGrpcClient inventoryGrpcClient;
    private final ObjectMapper objectMapper;
    private final RedisTemplate<String, String> stringRedisTemplate;
    private final TransactionTemplate transactionTemplate;
    private final PromotionClient promotionClient;
    private final DiscoveryClient discoveryClient;

    @Override
    public OrderResponse createOrder(String userId, CheckoutRequest checkoutRequest, String idempotencyKey,
            String email) {
        String lockKey = null;
        if (idempotencyKey != null && !idempotencyKey.trim().isEmpty()) {
            lockKey = "checkout:lock:" + userId + ":" + idempotencyKey;
            Boolean success = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "PROCESSING",
                    Duration.ofMinutes(15));
            if (Boolean.FALSE.equals(success)) {
                String existingValue = stringRedisTemplate.opsForValue().get(lockKey);
                if ("PROCESSING".equals(existingValue)) {
                    throw new DuplicateRequestException("Request is already being processed");
                } else if (existingValue != null) {
                    try {
                        return objectMapper.readValue(existingValue, OrderResponse.class);
                    } catch (Exception e) {
                        throw new DuplicateRequestException(
                                "Request is already being processed, but failed to read previous response");
                    }
                }
                throw new DuplicateRequestException("Request is already being processed");
            }
        }

        List<CartItemResponse> successfullyDecrementedItems = new ArrayList<>();
        try {
            String cartKey = "cart:" + userId;
            CartResponse cart = cartService.getCart(cartKey);

            if (cart.getItems() == null || cart.getItems().isEmpty()) {
                throw new InvalidOrderStateException("Cart is empty");
            }

            // Early stock check/reservation via Redis DECRBY
            for (CartItemResponse item : cart.getItems()) {
                Long vId = item.getVariantId() != null ? item.getVariantId() : 0L;
                String stockKey = "product:stock:" + item.getProductId() + ":" + vId;

                // Fetch stock value first to ensure the key is initialized
                String stockStr = stringRedisTemplate.opsForValue().get(stockKey);
                if (stockStr == null) {
                    log.warn(
                            "Stock cache is missing for product: {}, variant: {}. Initializing from inventory-service.",
                            item.getProductId(), vId);

                    String stockLockKey = "product:stock:lock:" + item.getProductId() + ":" + vId;
                    String lockValue = UUID.randomUUID().toString();
                    boolean acquired = false;
                    int maxRetries = 10;
                    int retryCount = 0;

                    while (stockStr == null && retryCount < maxRetries) {
                        Boolean success = stringRedisTemplate.opsForValue().setIfAbsent(stockLockKey, lockValue,
                                Duration.ofSeconds(5));
                        if (Boolean.TRUE.equals(success)) {
                            acquired = true;
                            break;
                        }

                        try {
                            Thread.sleep(100);
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            break;
                        }
                        stockStr = stringRedisTemplate.opsForValue().get(stockKey);
                        retryCount++;
                    }

                    if (acquired) {
                        try {
                            stockStr = stringRedisTemplate.opsForValue().get(stockKey);
                            if (stockStr == null) {
                                // Gọi inventory-service qua gRPC thay vì Feign
                                InventoryGrpcResponse grpcResponse = inventoryGrpcClient
                                        .getInventory(item.getProductId(), item.getVariantId());
                                if (grpcResponse.getFound()) {
                                    int actualStock = grpcResponse.getQuantity();
                                    stringRedisTemplate.opsForValue().set(stockKey, String.valueOf(actualStock));
                                    stockStr = String.valueOf(actualStock);
                                } else {
                                    log.warn(
                                            "[gRPC] Inventory not found for product {}, variant {}. Caching stock as 0.",
                                            item.getProductId(), vId);
                                    stringRedisTemplate.opsForValue().set(stockKey, "0");
                                    stockStr = "0";
                                }
                            }
                        } catch (Exception e) {
                            log.error("[gRPC] Failed to fetch stock from inventory-service for product {}, variant {}",
                                    item.getProductId(), vId, e);
                            throw new ServiceUnavailableException(
                                    "Hệ thống kiểm tra tồn kho đang bận. Vui lòng thử lại sau.");
                        } finally {
                            String currentLockVal = stringRedisTemplate.opsForValue().get(stockLockKey);
                            if (lockValue.equals(currentLockVal)) {
                                stringRedisTemplate.delete(stockLockKey);
                            }
                        }
                    } else if (stockStr == null) {
                        throw new ServiceUnavailableException(
                                "Hệ thống đang bận xử lý tồn kho. Vui lòng thử lại sau.");
                    }
                }

                Long remaining = stringRedisTemplate.opsForValue().decrement(stockKey, item.getQuantity());
                if (remaining == null || remaining < 0) {
                    // Rollback current decrement
                    stringRedisTemplate.opsForValue().increment(stockKey, item.getQuantity());
                    throw new InsufficientStockException(
                            "Sản phẩm " + item.getProductName() + " đã hết hàng trên hệ thống (Redis check)");
                }
                successfullyDecrementedItems.add(item);
            }

            BigDecimal totalAmount = cart.getTotalAmount();
            BigDecimal discountAmount = BigDecimal.ZERO;
            BigDecimal finalAmount = totalAmount;
            String couponCode = normalizeCouponCode(checkoutRequest.getCouponCode());
            String appliedCampaignId = null;

            // Calculate total order weight using the weights loaded in the cart response
            BigDecimal totalWeight = BigDecimal.ZERO;
            for (CartItemResponse item : cart.getItems()) {
                BigDecimal unitWeight = item.getWeight() != null ? item.getWeight() : BigDecimal.ZERO;
                totalWeight = totalWeight.add(unitWeight.multiply(BigDecimal.valueOf(item.getQuantity())));
            }

            // Save order
            Order order = Order.builder()
                    .userId(userId)
                    .status("PENDING")
                    .totalAmount(totalAmount)
                    .discountAmount(discountAmount)
                    .finalAmount(finalAmount)
                    .totalWeight(totalWeight)
                    .couponCode(couponCode)
                    .appliedCampaignId(appliedCampaignId)
                    .shippingAddress(checkoutRequest.getShippingAddress())
                    .phoneNumber(checkoutRequest.getPhoneNumber())
                    .note(checkoutRequest.getNote())
                    .build();

            // Prepare order items
            List<OrderItem> orderItems = new ArrayList<>();
            for (CartItemResponse item : cart.getItems()) {
                OrderItem orderItem = OrderItem.builder()
                        .productId(item.getProductId())
                        .variantId(item.getVariantId())
                        .productName(item.getProductName())
                        .variantAttr(item.getVariantAttr())
                        .unitPrice(item.getUnitPrice())
                        .quantity(item.getQuantity())
                        .subtotal(item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))
                        .build();
                orderItems.add(orderItem);
            }

            final Order finalOrder = order;
            final List<OrderItem> finalOrderItems = orderItems;

            // Execute DB writes outside/inside transactions to protect pool
            Order savedOrder;
            try {
                if (couponCode != null) {
                    // Transaction 1: Save Order and OrderItems (fast local DB commit)
                    savedOrder = transactionTemplate.execute(status -> {
                        Order saved = orderRepository.save(finalOrder);
                        for (OrderItem item : finalOrderItems) {
                            item.setOrderId(saved.getId());
                        }
                        orderItemRepository.saveAll(finalOrderItems);
                        return saved;
                    });

                    // Call Feign client OUTSIDE the database transaction
                    try {
                        applyCouponToOrder(savedOrder, userId, couponCode, totalAmount, checkoutRequest.getShippingFee());
                    } catch (Exception ex) {
                        log.error("Failed to apply voucher for Order ID {}: {}. Cancelling order.", savedOrder.getId(), ex.getMessage());
                        
                        // Compensation: Update order status to CANCELLED
                        transactionTemplate.executeWithoutResult(status -> {
                            Order orderToCancel = orderRepository.findById(savedOrder.getId())
                                    .orElseThrow(() -> new RuntimeException("Order not found: " + savedOrder.getId()));
                            orderToCancel.setStatus("CANCELLED");
                            orderRepository.save(orderToCancel);
                        });

                        throw new InvalidCouponException("Không thể áp dụng mã voucher: " + ex.getMessage());
                    }

                    // Transaction 2: Save the OutboxEvent since Voucher was applied successfully
                    final Order finalSavedOrder = savedOrder;
                    transactionTemplate.executeWithoutResult(status -> {
                        saveOrderCreatedOutboxEvent(finalSavedOrder, finalOrderItems, userId, email);
                    });

                } else {
                    // No coupon, save Order, OrderItems and OutboxEvent in a single transaction
                    savedOrder = transactionTemplate.execute(status -> {
                        Order saved = orderRepository.save(finalOrder);
                        for (OrderItem item : finalOrderItems) {
                            item.setOrderId(saved.getId());
                        }
                        orderItemRepository.saveAll(finalOrderItems);
                        saveOrderCreatedOutboxEvent(saved, finalOrderItems, userId, email);
                        return saved;
                    });
                }
            } catch (RuntimeException ex) {
                throw ex;
            }

            // Clear Cart
            cartService.clearCart(cartKey);

            OrderResponse response = convertToResponse(savedOrder, finalOrderItems);

            // Cache the final response under the Idempotency Lock key
            if (lockKey != null) {
                try {
                    String responseJson = objectMapper.writeValueAsString(response);
                    stringRedisTemplate.opsForValue().set(lockKey, responseJson, Duration.ofMinutes(15));
                } catch (Exception e) {
                    log.error("Failed to cache idempotency response", e);
                }
            }

            return response;

        } catch (Exception e) {
            log.error("Error during checkout process: {}", e.getMessage());

            // Rollback all decremented stocks in Redis
            for (CartItemResponse item : successfullyDecrementedItems) {
                try {
                    Long vId = item.getVariantId() != null ? item.getVariantId() : 0L;
                    String stockKey = "product:stock:" + item.getProductId() + ":" + vId;
                    stringRedisTemplate.opsForValue().increment(stockKey, item.getQuantity());
                } catch (Exception ex) {
                    log.error("Failed to rollback Redis stock for product: {}, variant: {}", item.getProductId(),
                            item.getVariantId(), ex);
                }
            }

            // Release Idempotency Lock
            if (lockKey != null) {
                stringRedisTemplate.delete(lockKey);
            }

            throw e instanceof RuntimeException ? (RuntimeException) e : new RuntimeException(e.getMessage(), e);
        }
    }

    @Override
    public OrderResponse getOrder(Long orderId, String userId, String rolesHeader) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        // Verify owner or Admin/Staff role
        if (!order.getUserId().equals(userId) && !isAdminOrStaff(rolesHeader)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "You are not authorized to view this order");
        }

        List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
        return convertToResponse(order, items);
    }

    @Override
    public List<OrderResponse> getOrdersByUser(String userId, String rolesHeader) {
        List<Order> orders;
        if (isAdminOrStaff(rolesHeader)) {
            orders = orderRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt"));
        } else {
            orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
        }
        return orders.stream()
                .map(o -> {
                    List<OrderItem> items = orderItemRepository.findByOrderId(o.getId());
                    return convertToResponse(o, items);
                })
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void cancelOrder(Long orderId, String userId, String email) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        if (!"PENDING".equalsIgnoreCase(order.getStatus())
                && !"AWAITING_PAYMENT".equalsIgnoreCase(order.getStatus())
                && !"CONFIRMED".equalsIgnoreCase(order.getStatus())) {
            throw new InvalidOrderStateException("Cannot cancel order in status: " + order.getStatus());
        }

        order.setStatus("CANCELLED");
        orderRepository.save(order);
        releaseVoucherForOrder(orderId);

        // Save Cancel Outbox Event
        try {
            OrderCancelledEvent cancelledEvent = OrderCancelledEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("OrderCancelledEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .orderId(orderId)
                    .userId(userId)
                    .email(email)
                    .build();

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateId(String.valueOf(orderId))
                    .aggregateType("Order")
                    .eventType("OrderCancelledEvent")
                    .payload(objectMapper.writeValueAsString(cancelledEvent))
                    .status("PENDING")
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for OrderCancelledEvent: {}", e.getMessage());
        }
    }

    @Override
    @Transactional
    public void cancelOrder(Long orderId, String userId, String email, String rolesHeader) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        // Verify owner or Admin/Staff role
        if (!order.getUserId().equals(userId) && !isAdminOrStaff(rolesHeader)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "You are not authorized to cancel this order");
        }

        cancelOrder(orderId, userId, email);
    }

    private boolean isAdminOrStaff(String rolesHeader) {
        if (rolesHeader == null || rolesHeader.trim().isEmpty()) {
            return false;
        }
        String lower = rolesHeader.toLowerCase();
        return lower.contains("admin") || lower.contains("staff");
    }

    private int getStatusRank(String status) {
        if (status == null) return 0;
        switch (status.toUpperCase()) {
            case "PENDING": return 1;
            case "AWAITING_PAYMENT": return 2;
            case "CONFIRMED": return 3;
            case "SHIPPED": return 4;
            case "DELIVERED": return 5;
            case "CANCELLED": return 6;
            default: return 0;
        }
    }

    @Override
    @Transactional
    public void updateOrderStatus(Long orderId, String status) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        // Idempotency check: if status is already matching, skip processing
        if (status.equalsIgnoreCase(order.getStatus())) {
            log.info("Order ID {} is already in status {}. Skipping update.", orderId, status);
            return;
        }

        // Prevent transition downgrades
        if (getStatusRank(status) <= getStatusRank(order.getStatus())) {
            log.warn("Invalid status transition: cannot update Order ID {} from {} to {}", orderId, order.getStatus(), status);
            return;
        }

        // Guard check: if order is already CANCELLED, we should not transition it to AWAITING_PAYMENT or CONFIRMED
        if ("CANCELLED".equalsIgnoreCase(order.getStatus())) {
            log.warn("Order ID {} is already CANCELLED. Cannot update status to {}.", orderId, status);
            return;
        }

        order.setStatus(status);
        orderRepository.save(order);
        log.info("Order ID {} status updated to {}", orderId, status);

        if ("CONFIRMED".equalsIgnoreCase(status)) {
            java.util.concurrent.CompletableFuture.runAsync(() -> redeemVoucherForOrder(orderId));
        }
        if ("CANCELLED".equalsIgnoreCase(status)) {
            java.util.concurrent.CompletableFuture.runAsync(() -> releaseVoucherForOrder(orderId));
        }

        // If order gets CANCELLED (e.g. inventory allocation failed), rollback the
        // stock in Redis and publish OrderCancelledEvent
        if ("CANCELLED".equalsIgnoreCase(status)) {
            List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
            for (OrderItem item : items) {
                Long vId = item.getVariantId() != null ? item.getVariantId() : 0L;
                String stockKey = "product:stock:" + item.getProductId() + ":" + vId;
                try {
                    stringRedisTemplate.opsForValue().increment(stockKey, item.getQuantity());
                    log.info(
                            "Rolled back Redis stock for product {} variant {} by quantity {} due to order cancellation",
                            item.getProductId(), vId, item.getQuantity());
                } catch (Exception e) {
                    log.error("Failed to rollback Redis stock for product: {}, variant: {}", item.getProductId(), vId,
                            e);
                }
            }

            try {
                OrderCancelledEvent cancelledEvent = OrderCancelledEvent.builder()
                        .eventId(UUID.randomUUID().toString())
                        .eventType("OrderCancelledEvent")
                        .timestamp(LocalDateTime.now().toString())
                        .orderId(orderId)
                        .userId(order.getUserId())
                        .email("") // fallback handled by notification-service
                        .build();

                OutboxEvent outboxEvent = OutboxEvent.builder()
                        .aggregateId(String.valueOf(orderId))
                        .aggregateType("Order")
                        .eventType("OrderCancelledEvent")
                        .payload(objectMapper.writeValueAsString(cancelledEvent))
                        .status("PENDING")
                        .build();
                outboxEventRepository.save(outboxEvent);
            } catch (Exception e) {
                log.error("Failed to construct and save outbox event for OrderCancelledEvent in updateOrderStatus: {}",
                        e.getMessage());
            }
        } else if ("CONFIRMED".equalsIgnoreCase(status)) {
            try {
                OrderConfirmedEvent confirmedEvent = OrderConfirmedEvent
                        .builder()
                        .eventId(UUID.randomUUID().toString())
                        .eventType("OrderConfirmedEvent")
                        .timestamp(LocalDateTime.now().toString())
                        .orderId(orderId)
                        .userId(order.getUserId())
                        .email("") // fallback handled by notification-service
                        .build();

                OutboxEvent outboxEvent = OutboxEvent.builder()
                        .aggregateId(String.valueOf(orderId))
                        .aggregateType("Order")
                        .eventType("OrderConfirmedEvent")
                        .payload(objectMapper.writeValueAsString(confirmedEvent))
                        .status("PENDING")
                        .build();
                outboxEventRepository.save(outboxEvent);
            } catch (Exception e) {
                log.error("Failed to construct and save outbox event for OrderConfirmedEvent in updateOrderStatus: {}",
                        e.getMessage());
            }
        }
    }

    @Override
    @Transactional
    public OrderResponse shipOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        if (!"CONFIRMED".equalsIgnoreCase(order.getStatus())) {
            throw new InvalidOrderStateException("Cannot ship order in current status: " + order.getStatus());
        }

        String trackingCode = "MOCK-GHTK-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        order.setStatus("SHIPPED");
        order.setTrackingCode(trackingCode);
        orderRepository.save(order);

        List<OrderItem> items = orderItemRepository.findByOrderId(orderId);

        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("eventId", UUID.randomUUID().toString());
            payload.put("eventType", "OrderShippedEvent");
            payload.put("timestamp", LocalDateTime.now().toString());
            payload.put("orderId", orderId);
            payload.put("userId", order.getUserId());
            payload.put("trackingCode", trackingCode);

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateId(String.valueOf(orderId))
                    .aggregateType("Order")
                    .eventType("OrderShippedEvent")
                    .payload(objectMapper.writeValueAsString(payload))
                    .status("PENDING")
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for OrderShippedEvent", e);
        }

        log.info("Order ID {} successfully sent to mock shipping provider. Tracking: {}", orderId, trackingCode);
        return convertToResponse(order, items);
    }

    @Override
    @Transactional
    public void handleShippingWebhook(String trackingCode, String status) {
        Order order = orderRepository.findByTrackingCode(trackingCode)
                .orElseThrow(
                        () -> new ResourceNotFoundException("Order not found with tracking code: " + trackingCode));

        String targetStatus = status.toUpperCase();
        if (!"DELIVERED".equals(targetStatus) && !"SHIPPED".equals(targetStatus) && !"CANCELLED".equals(targetStatus)) {
            throw new IllegalArgumentException("Unsupported shipping status update: " + status);
        }

        if (targetStatus.equalsIgnoreCase(order.getStatus())) {
            log.info("Order ID {} is already in status {}. Skipping update.", order.getId(), targetStatus);
            return;
        }

        if (getStatusRank(targetStatus) <= getStatusRank(order.getStatus())) {
            log.warn("Invalid shipping webhook status transition: cannot update Order ID {} from {} to {}", order.getId(), order.getStatus(), targetStatus);
            return;
        }

        order.setStatus(targetStatus);
        orderRepository.save(order);

        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("eventId", UUID.randomUUID().toString());
            payload.put("eventType", "DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent");
            payload.put("timestamp", LocalDateTime.now().toString());
            payload.put("orderId", order.getId());
            payload.put("userId", order.getUserId());
            payload.put("trackingCode", trackingCode);

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateId(String.valueOf(order.getId()))
                    .aggregateType("Order")
                    .eventType("DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent")
                    .payload(objectMapper.writeValueAsString(payload))
                    .status("PENDING")
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for shipping status change: {}", targetStatus, e);
        }

        log.info("Processed mock shipping webhook for tracking code {}: status updated to {}", trackingCode,
                targetStatus);
    }

    @Override
    @Transactional
    public OrderResponse updateDeliveryStatusByAdmin(Long orderId, String status) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with ID: " + orderId));

        String targetStatus = status.toUpperCase();
        if (!"DELIVERED".equals(targetStatus) && !"SHIPPED".equals(targetStatus) && !"CANCELLED".equals(targetStatus)) {
            throw new IllegalArgumentException("Unsupported shipping status update: " + status);
        }

        if (targetStatus.equalsIgnoreCase(order.getStatus())) {
            log.info("Order ID {} is already in status {}. Skipping update.", order.getId(), targetStatus);
            return convertToResponse(order, orderItemRepository.findByOrderId(orderId));
        }

        if (getStatusRank(targetStatus) <= getStatusRank(order.getStatus())) {
            throw new InvalidOrderStateException("Invalid status transition: cannot update Order ID " + orderId + " from " + order.getStatus() + " to " + targetStatus);
        }

        order.setStatus(targetStatus);
        orderRepository.save(order);

        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("eventId", UUID.randomUUID().toString());
            payload.put("eventType", "DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent");
            payload.put("timestamp", LocalDateTime.now().toString());
            payload.put("orderId", order.getId());
            payload.put("userId", order.getUserId());
            payload.put("trackingCode", order.getTrackingCode());

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateId(String.valueOf(order.getId()))
                    .aggregateType("Order")
                    .eventType("DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent")
                    .payload(objectMapper.writeValueAsString(payload))
                    .status("PENDING")
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for admin shipping status change: {}", targetStatus, e);
        }

        log.info("Processed admin shipping status update for order ID {}: status updated to {}", order.getId(),
                targetStatus);

        List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
        return convertToResponse(order, items);
    }

    private void applyCouponToOrder(Order order, String userId, String couponCode,
                                    BigDecimal totalAmount, BigDecimal shippingFee) {
        PromotionClient.VoucherApplyRequest request = PromotionClient.VoucherApplyRequest.builder()
                .code(couponCode)
                .userId(userId)
                .orderId(order.getId())
                .orderTotal(totalAmount)
                .shippingFee(shippingFee)
                .build();

        var response = promotionClient.applyVoucher(request);
        if (response == null || response.getData() == null) {
            throw new InvalidCouponException("Không thể áp dụng mã voucher.");
        }
        if (!"SUCCESS".equalsIgnoreCase(response.getCode()) || !response.getData().isApplied()) {
            String message = response.getData().getMessage() != null
                    ? response.getData().getMessage()
                    : (response.getMessage() != null ? response.getMessage() : "Mã voucher không hợp lệ.");
            throw new InvalidCouponException(message);
        }

        PromotionClient.VoucherApplyResult result = response.getData();
        order.setDiscountAmount(result.getDiscountAmount());
        order.setFinalAmount(result.getFinalAmount());
        order.setCouponCode(result.getVoucherCode());
        if (result.getCampaignId() != null) {
            order.setAppliedCampaignId(String.valueOf(result.getCampaignId()));
        }
        orderRepository.save(order);
        log.info("Applied voucher {} to order {} discount={}", couponCode, order.getId(), result.getDiscountAmount());
    }

    private void markOrderCancelledAndReleaseVoucher(Long orderId) {
        orderRepository.findById(orderId).ifPresent(order -> {
            order.setStatus("CANCELLED");
            orderRepository.save(order);
        });
        releaseVoucherForOrder(orderId);
    }

    private void releaseVoucherForOrder(Long orderId) {
        try {
            promotionClient.releaseVoucher(
                    PromotionClient.VoucherOrderActionRequest.builder().orderId(orderId).build());
        } catch (Exception ex) {
            log.warn("Failed to release voucher for order {}: {}", orderId, ex.getMessage());
        }
    }

    private void redeemVoucherForOrder(Long orderId) {
        try {
            promotionClient.redeemVoucher(
                    PromotionClient.VoucherOrderActionRequest.builder().orderId(orderId).build());
        } catch (Exception ex) {
            log.warn("Failed to redeem voucher for order {}: {}", orderId, ex.getMessage());
        }
    }

    private String normalizeCouponCode(String code) {
        if (code == null || code.trim().isEmpty()) {
            return null;
        }
        return code.trim().toUpperCase();
    }

    @Override
    public java.util.List<WarrantyItemResponse> lookupWarrantyByPhone(String phoneNumber) {
        // 1. Lấy các đơn hàng đã DELIVERED theo số điện thoại
        java.util.List<Order> deliveredOrders = orderRepository.findByPhoneNumberAndStatus(phoneNumber, "DELIVERED");

        if (deliveredOrders.isEmpty()) {
            return java.util.Collections.emptyList();
        }

        // 2. Thu thập tất cả productId cần tra cứu warrantyPeriod
        java.util.Set<Long> productIds = new java.util.HashSet<>();
        java.util.Map<Long, java.util.List<OrderItem>> orderItemsMap = new java.util.HashMap<>();

        for (Order order : deliveredOrders) {
            java.util.List<OrderItem> items = orderItemRepository.findByOrderId(order.getId());
            orderItemsMap.put(order.getId(), items);
            items.forEach(item -> productIds.add(item.getProductId()));
        }

        // 3. Lấy warrantyPeriod từ product-service (REST via DiscoveryClient & RestTemplate)
        java.util.Map<Long, Integer> warrantyMap = new java.util.HashMap<>();
        java.util.Map<Long, String> imageMap = new java.util.HashMap<>();
        try {
            var instances = discoveryClient.getInstances("product-service");
            if (instances != null && !instances.isEmpty()) {
                String baseUrl = instances.get(0).getUri().toString();
                String idsParam = productIds.stream().map(String::valueOf).collect(Collectors.joining(","));
                String url = baseUrl + "/api/internal/products/price-info?ids=" + idsParam;
                
                RestTemplate restTemplate = new RestTemplate();
                var response = restTemplate.getForObject(url, java.util.Map.class);
                if (response != null && "SUCCESS".equals(response.get("code"))) {
                    List<java.util.Map<String, Object>> data = (List<java.util.Map<String, Object>>) response.get("data");
                    if (data != null) {
                        for (var info : data) {
                            Long id = ((Number) info.get("id")).longValue();
                            Integer period = (Integer) info.get("warrantyPeriod");
                            String img = (String) info.get("imageUrl");
                            
                            warrantyMap.put(id, period != null ? period : 12);
                            imageMap.put(id, img);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not fetch warranty info from product-service via RestTemplate: {}", e.getMessage());
        }

        // 4. Build response
        java.time.LocalDate today = java.time.LocalDate.now();
        java.util.List<WarrantyItemResponse> result = new java.util.ArrayList<>();

        for (Order order : deliveredOrders) {
            java.time.LocalDate purchaseDate = order.getCreatedAt().toLocalDate();
            java.util.List<OrderItem> items = orderItemsMap.getOrDefault(order.getId(), java.util.Collections.emptyList());

            for (OrderItem item : items) {
                int months = warrantyMap.getOrDefault(item.getProductId(), 12);
                java.time.LocalDate expiry = purchaseDate.plusMonths(months);
                long daysRemaining = java.time.temporal.ChronoUnit.DAYS.between(today, expiry);

                result.add(WarrantyItemResponse.builder()
                        .orderId(order.getId())
                        .productId(item.getProductId())
                        .productName(item.getProductName())
                        .variantAttr(item.getVariantAttr())
                        .productImage(imageMap.getOrDefault(item.getProductId(), item.getProductImage()))
                        .purchaseDate(purchaseDate)
                        .warrantyMonths(months)
                        .warrantyExpiry(expiry)
                        .active(daysRemaining > 0)
                        .daysRemaining(daysRemaining)
                        .build());
            }
        }

        return result;
    }

    private OrderResponse convertToResponse(Order order, List<OrderItem> items) {
        List<OrderItemResponse> itemResponses = items.stream()
                .map(i -> OrderItemResponse.builder()
                        .id(i.getId())
                        .productId(i.getProductId())
                        .variantId(i.getVariantId())
                        .productName(i.getProductName())
                        .productImage(i.getProductImage())
                        .variantAttr(i.getVariantAttr())
                        .unitPrice(i.getUnitPrice())
                        .quantity(i.getQuantity())
                        .subtotal(i.getSubtotal())
                        .build())
                .collect(Collectors.toList());

        return OrderResponse.builder()
                .id(order.getId())
                .userId(order.getUserId())
                .status(order.getStatus())
                .totalAmount(order.getTotalAmount())
                .discountAmount(order.getDiscountAmount())
                .finalAmount(order.getFinalAmount())
                .couponCode(order.getCouponCode())
                .appliedCampaignId(order.getAppliedCampaignId())
                .trackingCode(order.getTrackingCode())
                .shippingAddress(order.getShippingAddress())
                .phoneNumber(order.getPhoneNumber())
                .note(order.getNote())
                .items(itemResponses)
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .build();
    }

    private void saveOrderCreatedOutboxEvent(Order order, List<OrderItem> orderItems, String userId, String email) {
        try {
            List<OrderCreatedEvent.OrderItem> eventItems = orderItems.stream()
                    .map(item -> OrderCreatedEvent.OrderItem.builder()
                            .productId(item.getProductId())
                            .variantId(item.getVariantId())
                            .quantity(item.getQuantity())
                            .build())
                    .collect(Collectors.toList());

            OrderCreatedEvent createdEvent = OrderCreatedEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("OrderCreatedEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .orderId(order.getId())
                    .userId(userId)
                    .email(email)
                    .items(eventItems)
                    .build();

            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateId(String.valueOf(order.getId()))
                    .aggregateType("Order")
                    .eventType("OrderCreatedEvent")
                    .payload(objectMapper.writeValueAsString(createdEvent))
                    .status("PENDING")
                    .build();
            outboxEventRepository.save(outboxEvent);
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for OrderCreatedEvent: {}", e.getMessage());
            throw new RuntimeException("Order creation failed due to outbox error", e);
        }
    }
}
