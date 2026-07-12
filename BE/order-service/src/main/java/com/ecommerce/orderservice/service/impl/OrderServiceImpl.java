package com.ecommerce.orderservice.service.impl;

import com.ecommerce.grpc.inventory.InventoryGrpcResponse;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.client.RestTemplate;
import com.ecommerce.orderservice.grpc.InventoryGrpcClient;
import com.ecommerce.orderservice.dto.request.CheckoutPreviewRequest;
import com.ecommerce.orderservice.dto.request.CheckoutRequest;
import com.ecommerce.orderservice.dto.response.CartItemResponse;
import com.ecommerce.orderservice.dto.response.CartResponse;
import com.ecommerce.orderservice.dto.response.CheckoutPreviewResponse;
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
import com.ecommerce.orderservice.client.UserClient;
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
import com.ecommerce.orderservice.support.OrderPricingHelper;
import com.ecommerce.orderservice.support.ShippingFeeCalculator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.data.domain.Sort;

import java.time.Duration;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
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
    private final UserClient userClient;
    private final DiscoveryClient discoveryClient;
    private final RestTemplate restTemplate = new RestTemplate();
    private final DefaultRedisScript<Long> stockDecrementScript;
    private final DefaultRedisScript<Long> stockIncrementScript;

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
        Order savedOrder = null;
        boolean transaction1Committed = false;
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

                // Use atomic Lua script to decrement stock (prevents race conditions)
                Long remaining = stringRedisTemplate.execute(
                        stockDecrementScript,
                        Collections.singletonList(stockKey),
                        String.valueOf(item.getQuantity()));

                if (remaining == null) {
                    throw new ServiceUnavailableException(
                            "Redis script execution failed for product " + item.getProductId());
                }

                if (remaining == -1) {
                    // Cache miss during decrement - key was evicted between check and decrement
                    throw new ServiceUnavailableException(
                            "Hệ thống tồn kho đang được cập nhật. Vui lòng thử lại sau.");
                }

                if (remaining == -2) {
                    // Insufficient stock
                    throw new InsufficientStockException(
                            "Sản phẩm " + item.getProductName() + " đã hết hàng trên hệ thống (Redis check)");
                }

                // Success: remaining >= 0
                successfullyDecrementedItems.add(item);
            }

            BigDecimal totalAmount = cart.getTotalAmount();
            BigDecimal discountAmount = BigDecimal.ZERO;
            BigDecimal finalAmount = totalAmount;
            String couponCode = normalizeCouponCode(checkoutRequest.getCouponCode());
            String appliedCampaignId = null;
            Integer pointsToRedeem = checkoutRequest.getPointsToRedeem();

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
                    transaction1Committed = true;
                    final Order finalSavedOrder = savedOrder;

                    // Call Feign client OUTSIDE the database transaction
                    try {
                        BigDecimal serverShippingFee = ShippingFeeCalculator.calculate(totalAmount);
                        applyCouponToOrder(finalSavedOrder, userId, couponCode, totalAmount, serverShippingFee);
                    } catch (Exception ex) {
                        log.error("Failed to apply voucher for Order ID {}: {}. Cancelling order.",
                                finalSavedOrder.getId(), ex.getMessage());

                        // Compensation: Update order status to CANCELLED
                        transactionTemplate.executeWithoutResult(status -> {
                            Order orderToCancel = orderRepository.findById(finalSavedOrder.getId())
                                    .orElseThrow(
                                            () -> new RuntimeException("Order not found: " + finalSavedOrder.getId()));
                            orderToCancel.setStatus("CANCELLED");
                            orderRepository.save(orderToCancel);
                        });

                        throw new InvalidCouponException("Không thể áp dụng mã voucher: " + ex.getMessage());
                    }

                    if (pointsToRedeem != null && pointsToRedeem > 0) {
                        try {
                            applyPointsToOrder(finalSavedOrder, userId, pointsToRedeem);
                        } catch (Exception ex) {
                            log.error("Failed to redeem points for Order ID {}: {}. Cancelling order.",
                                    finalSavedOrder.getId(), ex.getMessage());
                            markOrderCancelledAndReleaseVoucher(finalSavedOrder.getId());
                            throw new InvalidOrderStateException("Không thể sử dụng điểm: " + ex.getMessage());
                        }
                    }

                    // Transaction 2: Save the OutboxEvent since Voucher was applied successfully
                    transactionTemplate.executeWithoutResult(status -> {
                        saveOrderCreatedOutboxEvent(finalSavedOrder, finalOrderItems, userId, email);
                    });

                } else {
                    // No coupon, save Order and OrderItems first
                    savedOrder = transactionTemplate.execute(status -> {
                        Order saved = orderRepository.save(finalOrder);
                        for (OrderItem item : finalOrderItems) {
                            item.setOrderId(saved.getId());
                        }
                        orderItemRepository.saveAll(finalOrderItems);
                        return saved;
                    });
                    transaction1Committed = true;
                    final Order finalSavedOrder = savedOrder;

                    if (pointsToRedeem != null && pointsToRedeem > 0) {
                        try {
                            applyPointsToOrder(finalSavedOrder, userId, pointsToRedeem);
                        } catch (Exception ex) {
                            log.error("Failed to redeem points for Order ID {}: {}. Cancelling order.",
                                    finalSavedOrder.getId(), ex.getMessage());
                            markOrderCancelledAndReleaseVoucher(finalSavedOrder.getId());
                            throw new InvalidOrderStateException("Không thể sử dụng điểm: " + ex.getMessage());
                        }
                    } else {
                        applyPricingToOrder(finalSavedOrder, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
                        orderRepository.save(finalSavedOrder);
                    }

                    transactionTemplate.executeWithoutResult(status -> {
                        saveOrderCreatedOutboxEvent(finalSavedOrder, finalOrderItems, userId, email);
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

            // HIGH-01 FIX: Compensation for failed post-checkout steps (e.g. outbox save
            // failure, network timeouts, etc.)
            // If Transaction 1 succeeded but checkout failed afterward, we MUST cancel the
            // order in DB, release voucher, and refund points.
            if (transaction1Committed && savedOrder != null) {
                try {
                    final Long orderIdToCancel = savedOrder.getId();
                    final Order finalSavedOrder = savedOrder;
                    transactionTemplate.executeWithoutResult(status -> {
                        orderRepository.findById(orderIdToCancel).ifPresent(o -> {
                            boolean alreadyCancelled = "CANCELLED".equalsIgnoreCase(o.getStatus());
                            if (!alreadyCancelled) {
                                o.setStatus("CANCELLED");
                                orderRepository.save(o);
                                log.info("Compensated: Order ID {} marked as CANCELLED due to checkout failure.",
                                        orderIdToCancel);
                            }

                            // Always publish the OrderCancelledEvent to ensure inventory-service can
                            // release stock
                            try {
                                List<OrderCancelledEvent.OrderItemInfo> itemInfos = successfullyDecrementedItems
                                        .stream()
                                        .map(item -> OrderCancelledEvent.OrderItemInfo.builder()
                                                .productId(item.getProductId())
                                                .variantId(item.getVariantId())
                                                .quantity(item.getQuantity())
                                                .build())
                                        .collect(Collectors.toList());

                                OrderCancelledEvent cancelledEvent = OrderCancelledEvent.builder()
                                        .eventId(UUID.randomUUID().toString())
                                        .eventType("OrderCancelledEvent")
                                        .timestamp(LocalDateTime.now().toString())
                                        .orderId(orderIdToCancel)
                                        .userId(userId)
                                        .email(email)
                                        .items(itemInfos)
                                        .build();
                                saveOutboxEvent(String.valueOf(orderIdToCancel), "OrderCancelledEvent",
                                        objectMapper.writeValueAsString(cancelledEvent));
                                log.info("Compensated: Saved OrderCancelledEvent to outbox for Order ID {}",
                                        orderIdToCancel);
                            } catch (Exception exOutbox) {
                                log.error(
                                        "Failed to construct and save outbox event for OrderCancelledEvent during compensation: {}",
                                        exOutbox.getMessage());
                            }
                        });
                    });
                    releaseVoucherForOrder(orderIdToCancel);
                    refundPointsForOrder(finalSavedOrder);
                } catch (Exception ex) {
                    log.error("Failed to run compensation logic for Order ID {}", savedOrder.getId(), ex);
                }
            }

            // Rollback all decremented stocks in Redis ONLY if Transaction 1 didn't commit.
            // If Transaction 1 did commit, we published OrderCancelledEvent, which will
            // trigger
            // the inventory-service to release/increment the Redis stock. Doing both would
            // cause double-rollback.
            if (!transaction1Committed) {
                for (CartItemResponse item : successfullyDecrementedItems) {
                    try {
                        Long vId = item.getVariantId() != null ? item.getVariantId() : 0L;
                        String stockKey = "product:stock:" + item.getProductId() + ":" + vId;

                        // Use atomic Lua script for increment (safe against eviction race)
                        Long result = stringRedisTemplate.execute(
                                stockIncrementScript,
                                Collections.singletonList(stockKey),
                                String.valueOf(item.getQuantity()));

                        if (result != null && result == -1) {
                            log.warn(
                                    "Redis key {} was evicted during rollback. Stock will be loaded from DB on next checkout.",
                                    stockKey);
                        }
                    } catch (Exception ex) {
                        log.error("Failed to rollback Redis stock for product: {}, variant: {}", item.getProductId(),
                                item.getVariantId(), ex);
                    }
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
    public CheckoutPreviewResponse previewCheckout(String userId, CheckoutPreviewRequest request) {
        CartResponse cart = cartService.getCart("cart:" + userId);
        if (cart.getItems() == null || cart.getItems().isEmpty()) {
            throw new InvalidOrderStateException("Cart is empty");
        }

        BigDecimal subtotal = cart.getTotalAmount();
        BigDecimal productDiscount = BigDecimal.ZERO;
        BigDecimal shippingDiscount = BigDecimal.ZERO;
        String couponCode = normalizeCouponCode(request != null ? request.getCouponCode() : null);
        String voucherMessage = null;
        boolean voucherApplied = false;

        if (couponCode != null) {
            BigDecimal serverShippingFee = ShippingFeeCalculator.calculate(subtotal);
            var response = promotionClient.previewVoucher(PromotionClient.VoucherApplyRequest.builder()
                    .code(couponCode)
                    .userId(userId)
                    .orderTotal(subtotal)
                    .shippingFee(serverShippingFee)
                    .build());
            if (response != null && response.getData() != null && response.getData().isApplied()) {
                PromotionClient.VoucherApplyResult result = response.getData();
                productDiscount = OrderPricingHelper.extractProductDiscount(result);
                shippingDiscount = OrderPricingHelper.extractShippingDiscount(result);
                voucherApplied = true;
                voucherMessage = result.getMessage();
            } else if (response != null && response.getData() != null) {
                voucherMessage = response.getData().getMessage();
            }
        }

        int pointsToRedeem = request != null && request.getPointsToRedeem() != null ? request.getPointsToRedeem() : 0;
        BigDecimal payableAfterProduct = subtotal.subtract(productDiscount).max(BigDecimal.ZERO);
        BigDecimal pointDiscount = OrderPricingHelper.calculatePointDiscount(pointsToRedeem, payableAfterProduct);
        OrderPricingHelper.PricingBreakdown pricing = OrderPricingHelper.calculate(
                subtotal, productDiscount, shippingDiscount, pointDiscount);

        return CheckoutPreviewResponse.builder()
                .subtotal(pricing.getSubtotal())
                .productDiscount(pricing.getProductDiscount())
                .shippingDiscount(pricing.getShippingDiscount())
                .pointDiscount(pricing.getPointDiscount())
                .shippingFee(pricing.getShippingFee())
                .vatAmount(pricing.getVatAmount())
                .totalDiscount(pricing.getTotalDiscount())
                .finalAmount(pricing.getFinalAmount())
                .couponCode(couponCode)
                .voucherApplied(voucherApplied)
                .voucherMessage(voucherMessage)
                .build();
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

        if (orders.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> orderIds = orders.stream().map(Order::getId).collect(Collectors.toList());
        List<OrderItem> allItems = orderItemRepository.findByOrderIdIn(orderIds);
        Map<Long, List<OrderItem>> itemsByOrderId = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        return orders.stream()
                .map(o -> {
                    List<OrderItem> items = itemsByOrderId.getOrDefault(o.getId(), Collections.emptyList());
                    return convertToResponse(o, items);
                })
                .collect(Collectors.toList());
    }

    @Override
    public void cancelOrder(Long orderId, String userId, String email) {
        // ── Phase 1: DB writes only (short transaction, releases connection fast) ──
        final String[] originalStatus = new String[1];
        final Order order = transactionTemplate.execute(status -> {
            // Use pessimistic write lock to prevent concurrent status updates
            Order o = orderRepository.findByIdForUpdate(orderId)
                    .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

            if (!"PENDING".equalsIgnoreCase(o.getStatus())
                    && !"AWAITING_PAYMENT".equalsIgnoreCase(o.getStatus())
                    && !"CONFIRMED".equalsIgnoreCase(o.getStatus())) {
                throw new InvalidOrderStateException("Cannot cancel order in status: " + o.getStatus());
            }

            originalStatus[0] = o.getStatus();
            o.setStatus("CANCELLED");
            orderRepository.save(o);

            // Save Cancel Outbox Event inside the same transaction
            try {
                List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
                List<OrderCancelledEvent.OrderItemInfo> itemInfos = items.stream()
                        .map(item -> OrderCancelledEvent.OrderItemInfo.builder()
                                .productId(item.getProductId())
                                .variantId(item.getVariantId())
                                .quantity(item.getQuantity())
                                .build())
                        .collect(Collectors.toList());

                OrderCancelledEvent cancelledEvent = OrderCancelledEvent.builder()
                        .eventId(UUID.randomUUID().toString())
                        .eventType("OrderCancelledEvent")
                        .timestamp(LocalDateTime.now().toString())
                        .orderId(orderId)
                        .userId(userId)
                        .email(email)
                        .items(itemInfos)
                        .build();
                saveOutboxEvent(String.valueOf(orderId), "OrderCancelledEvent",
                        objectMapper.writeValueAsString(cancelledEvent));
            } catch (Exception e) {
                log.error("Failed to construct and save outbox event for OrderCancelledEvent: {}", e.getMessage());
                throw new RuntimeException(
                        "Không thể lưu sự kiện hủy đơn vào Outbox. Hủy đơn thất bại để đảm bảo tính nhất quán kho.", e);
            }
            return o;
        });

        // ── Phase 2: External Feign calls — AFTER DB transaction committed ──
        // DB connection is already released here, so these slow calls are safe
        // NOTE: Redis stock rollback is handled asynchronously by inventory-service via
        // OrderCancelledEvent.
        if (order != null) {
            releaseVoucherForOrder(orderId);
            refundPointsForOrder(order);
        }
    }

    @Override
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
        return Arrays.stream(rolesHeader.split(","))
                .map(String::trim)
                .map(r -> r.toUpperCase(Locale.ROOT))
                .anyMatch(r -> "ROLE_ADMIN".equals(r) || "ADMIN".equals(r)
                        || "ROLE_STAFF".equals(r) || "STAFF".equals(r));
    }

    private int getStatusRank(String status) {
        if (status == null)
            return 0;
        switch (status.toUpperCase()) {
            case "PENDING":
                return 1;
            case "AWAITING_PAYMENT":
                return 2;
            case "CONFIRMED":
                return 3;
            case "SHIPPED":
                return 4;
            case "DELIVERED":
                return 5;
            case "CANCELLED":
                return 6;
            default:
                return 0;
        }
    }

    @Override
    @Transactional
    public void expireOrder(Long orderId) {
        log.info("System expiring order due to payment timeout: orderId={}", orderId);
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        String status = order.getStatus();
        if (!"PENDING".equalsIgnoreCase(status) && !"AWAITING_PAYMENT".equalsIgnoreCase(status)) {
            log.info("Order {} is already in status {}. Skipping expiration.", orderId, status);
            return;
        }

        order.setStatus("CANCELLED");
        orderRepository.save(order);

        // Release Voucher & Points asynchronously AFTER transaction commits successfully
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    CompletableFuture.runAsync(() -> releaseVoucherForOrder(orderId))
                            .exceptionally(ex -> {
                                log.error("Async releaseVoucher failed for expired order {}: {}", orderId, ex.getMessage());
                                return null;
                            });
                    CompletableFuture.runAsync(() -> refundPointsForOrder(order))
                            .exceptionally(ex -> {
                                log.error("Async refundPoints failed for expired order {}: {}", order.getId(), ex.getMessage());
                                return null;
                            });
                }
            });
        } else {
            CompletableFuture.runAsync(() -> releaseVoucherForOrder(orderId))
                    .exceptionally(ex -> {
                        log.error("Async releaseVoucher failed for expired order {}: {}", orderId, ex.getMessage());
                        return null;
                    });
            CompletableFuture.runAsync(() -> refundPointsForOrder(order))
                    .exceptionally(ex -> {
                        log.error("Async refundPoints failed for expired order {}: {}", order.getId(), ex.getMessage());
                        return null;
                    });
        }

        // Publish OrderCancelledEvent
        try {
            List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
            List<OrderCancelledEvent.OrderItemInfo> itemInfos = items.stream()
                    .map(item -> OrderCancelledEvent.OrderItemInfo.builder()
                            .productId(item.getProductId())
                            .variantId(item.getVariantId())
                            .quantity(item.getQuantity())
                            .build())
                    .collect(Collectors.toList());

            OrderCancelledEvent cancelledEvent = OrderCancelledEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("OrderCancelledEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .orderId(orderId)
                    .userId(order.getUserId())
                    .email(order.getPhoneNumber())
                    .items(itemInfos)
                    .build();

            saveOutboxEvent(String.valueOf(orderId), "OrderCancelledEvent",
                    objectMapper.writeValueAsString(cancelledEvent));
            log.info("Successfully registered OrderCancelledEvent in outbox for expired Order ID {}", orderId);
        } catch (Exception e) {
            log.error("Failed to publish OrderCancelledEvent for expired Order ID {}", orderId, e);
            throw new RuntimeException("Failed to register OrderCancelledEvent", e);
        }
    }

    @Override
    @Transactional
    public void updateOrderStatus(Long orderId, String status) {
        // Use pessimistic write lock to prevent concurrent status updates (e.g.,
        // webhook vs user cancel)
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found: " + orderId));

        // Idempotency check: if status is already matching, skip processing
        if (status.equalsIgnoreCase(order.getStatus())) {
            log.info("Order ID {} is already in status {}. Skipping update.", orderId, status);
            return;
        }

        // Prevent transition downgrades
        if (getStatusRank(status) <= getStatusRank(order.getStatus())) {
            log.warn("Invalid status transition: cannot update Order ID {} from {} to {}", orderId, order.getStatus(),
                    status);
            return;
        }

        // Guard check: if order is already in a final state, we should block all
        // modifications
        if ("DELIVERED".equalsIgnoreCase(order.getStatus()) || "CANCELLED".equalsIgnoreCase(order.getStatus())) {
            log.warn("Order ID {} is in final state {}. Cannot update status to {}.", orderId, order.getStatus(),
                    status);
            return;
        }

        String originalStatus = order.getStatus();
        order.setStatus(status);
        orderRepository.save(order);
        log.info("Order ID {} status updated to {}", orderId, status);

        // Register side-effects to run AFTER transaction commits successfully
        if ("CONFIRMED".equalsIgnoreCase(status)) {
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        CompletableFuture.runAsync(() -> redeemVoucherForOrder(orderId))
                                .exceptionally(ex -> {
                                    log.error("Async redeemVoucher failed for order {}: {}", orderId, ex.getMessage());
                                    return null;
                                });
                    }
                });
            } else {
                // Fallback if no active transaction (shouldn't happen with @Transactional)
                CompletableFuture.runAsync(() -> redeemVoucherForOrder(orderId))
                        .exceptionally(ex -> {
                            log.error("Async redeemVoucher failed for order {}: {}", orderId, ex.getMessage());
                            return null;
                        });
            }
        }

        if ("CANCELLED".equalsIgnoreCase(status)) {
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        CompletableFuture.runAsync(() -> releaseVoucherForOrder(orderId))
                                .exceptionally(ex -> {
                                    log.error("Async releaseVoucher failed for order {}: {}", orderId, ex.getMessage());
                                    return null;
                                });
                        CompletableFuture
                                .runAsync(
                                        () -> orderRepository.findById(orderId).ifPresent(o -> refundPointsForOrder(o)))
                                .exceptionally(ex -> {
                                    log.error("Async refundPoints failed for order {}: {}", orderId, ex.getMessage());
                                    return null;
                                });
                    }
                });
            } else {
                CompletableFuture.runAsync(() -> releaseVoucherForOrder(orderId))
                        .exceptionally(ex -> {
                            log.error("Async releaseVoucher failed for order {}: {}", orderId, ex.getMessage());
                            return null;
                        });
                CompletableFuture
                        .runAsync(() -> orderRepository.findById(orderId).ifPresent(o -> refundPointsForOrder(o)))
                        .exceptionally(ex -> {
                            log.error("Async refundPoints failed for order {}: {}", orderId, ex.getMessage());
                            return null;
                        });
            }
        }

        // When order is CANCELLED: publish OrderCancelledEvent via Outbox pattern.
        // NOTE: Redis stock rollback is handled asynchronously by inventory-service via
        // OrderCancelledEvent.
        if ("CANCELLED".equalsIgnoreCase(status)) {
            try {
                List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
                List<OrderCancelledEvent.OrderItemInfo> itemInfos = items.stream()
                        .map(item -> OrderCancelledEvent.OrderItemInfo.builder()
                                .productId(item.getProductId())
                                .variantId(item.getVariantId())
                                .quantity(item.getQuantity())
                                .build())
                        .collect(Collectors.toList());

                OrderCancelledEvent cancelledEvent = OrderCancelledEvent.builder()
                        .eventId(UUID.randomUUID().toString())
                        .eventType("OrderCancelledEvent")
                        .timestamp(LocalDateTime.now().toString())
                        .orderId(orderId)
                        .userId(order.getUserId())
                        .email("") // fallback handled by notification-service
                        .items(itemInfos)
                        .build();

                saveOutboxEvent(String.valueOf(orderId), "OrderCancelledEvent",
                        objectMapper.writeValueAsString(cancelledEvent));
            } catch (Exception e) {
                log.error("Failed to construct and save outbox event for OrderCancelledEvent in updateOrderStatus: {}",
                        e.getMessage());
                throw new RuntimeException("Lỗi lưu outbox event cho trạng thái CANCELLED", e);
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

                saveOutboxEvent(String.valueOf(orderId), "OrderConfirmedEvent",
                        objectMapper.writeValueAsString(confirmedEvent));
            } catch (Exception e) {
                log.error("Failed to construct and save outbox event for OrderConfirmedEvent in updateOrderStatus: {}",
                        e.getMessage());
                throw new RuntimeException("Lỗi lưu outbox event cho trạng thái CONFIRMED", e);
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

            saveOutboxEvent(String.valueOf(orderId), "OrderShippedEvent",
                    objectMapper.writeValueAsString(payload));
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

        // Guard check: cannot transition from final state DELIVERED or CANCELLED
        if ("DELIVERED".equalsIgnoreCase(order.getStatus()) || "CANCELLED".equalsIgnoreCase(order.getStatus())) {
            log.warn(
                    "Invalid shipping webhook status transition: Order ID {} is in final state {}. Cannot update to {}.",
                    order.getId(), order.getStatus(), targetStatus);
            return;
        }

        if (getStatusRank(targetStatus) <= getStatusRank(order.getStatus())) {
            log.warn("Invalid shipping webhook status transition: cannot update Order ID {} from {} to {}",
                    order.getId(), order.getStatus(), targetStatus);
            return;
        }

        order.setStatus(targetStatus);
        orderRepository.save(order);

        // Register side-effects to run AFTER transaction commits
        if ("CANCELLED".equals(targetStatus)) {
            final Long orderId = order.getId();
            final Order finalOrder = order;
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        // Release voucher and refund points for carrier-initiated cancellations
                        releaseVoucherForOrder(orderId);
                        refundPointsForOrder(finalOrder);
                    }
                });
            } else {
                releaseVoucherForOrder(orderId);
                refundPointsForOrder(finalOrder);
            }
        }

        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("eventId", UUID.randomUUID().toString());
            payload.put("eventType", "DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent");
            payload.put("timestamp", LocalDateTime.now().toString());
            payload.put("orderId", order.getId());
            payload.put("userId", order.getUserId());
            payload.put("trackingCode", trackingCode);

            saveOutboxEvent(String.valueOf(order.getId()),
                    "DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent",
                    objectMapper.writeValueAsString(payload));
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

        // Guard check: cannot transition from final state DELIVERED or CANCELLED
        if ("DELIVERED".equalsIgnoreCase(order.getStatus()) || "CANCELLED".equalsIgnoreCase(order.getStatus())) {
            throw new InvalidOrderStateException("Order ID " + orderId + " is in final state " + order.getStatus()
                    + ". Cannot update status to " + targetStatus);
        }

        if (getStatusRank(targetStatus) <= getStatusRank(order.getStatus())) {
            throw new InvalidOrderStateException("Invalid status transition: cannot update Order ID " + orderId
                    + " from " + order.getStatus() + " to " + targetStatus);
        }

        order.setStatus(targetStatus);
        orderRepository.save(order);

        // Register side-effects to run AFTER transaction commits
        if ("CANCELLED".equals(targetStatus)) {
            final Long finalOrderId = orderId;
            final Order finalOrder = order;
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        // Release voucher and refund points for admin-initiated cancellations
                        releaseVoucherForOrder(finalOrderId);
                        refundPointsForOrder(finalOrder);
                    }
                });
            } else {
                releaseVoucherForOrder(finalOrderId);
                refundPointsForOrder(finalOrder);
            }
        }

        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("eventId", UUID.randomUUID().toString());
            payload.put("eventType", "DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent");
            payload.put("timestamp", LocalDateTime.now().toString());
            payload.put("orderId", order.getId());
            payload.put("userId", order.getUserId());
            payload.put("trackingCode", order.getTrackingCode());

            saveOutboxEvent(String.valueOf(order.getId()),
                    "DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent",
                    objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for admin shipping status change: {}", targetStatus,
                    e);
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
        BigDecimal productDiscount = OrderPricingHelper.extractProductDiscount(result);
        BigDecimal shippingDiscount = OrderPricingHelper.extractShippingDiscount(result);

        order.setCouponCode(result.getVoucherCode());
        if (result.getCampaignId() != null) {
            order.setAppliedCampaignId(String.valueOf(result.getCampaignId()));
        }
        applyPricingToOrder(order, productDiscount, shippingDiscount, BigDecimal.ZERO);
        orderRepository.save(order);
        log.info("Applied voucher {} to order {} totalDiscount={}", couponCode, order.getId(),
                order.getDiscountAmount());
    }

    private void applyPricingToOrder(Order order, BigDecimal productDiscount, BigDecimal shippingDiscount,
            BigDecimal pointDiscount) {
        OrderPricingHelper.PricingBreakdown pricing = OrderPricingHelper.calculate(
                order.getTotalAmount(), productDiscount, shippingDiscount, pointDiscount);
        order.setDiscountAmount(pricing.getTotalDiscount());
        order.setShippingFee(pricing.getShippingFee());
        order.setShippingDiscountAmount(pricing.getShippingDiscount());
        order.setVatAmount(pricing.getVatAmount());
        order.setPointDiscountAmount(pointDiscount);
        order.setFinalAmount(pricing.getFinalAmount());
    }

    private BigDecimal resolveProductDiscount(Order order) {
        BigDecimal totalDisc = order.getDiscountAmount() != null ? order.getDiscountAmount() : BigDecimal.ZERO;
        BigDecimal shipDisc = order.getShippingDiscountAmount() != null ? order.getShippingDiscountAmount()
                : BigDecimal.ZERO;
        BigDecimal pointDisc = order.getPointDiscountAmount() != null ? order.getPointDiscountAmount()
                : BigDecimal.ZERO;
        return totalDisc.subtract(shipDisc).subtract(pointDisc).max(BigDecimal.ZERO);
    }

    private void applyPointsToOrder(Order order, String keycloakUserId, int pointsToRedeem) {
        var profileResponse = userClient.getProfileByKeycloakId(keycloakUserId);
        if (profileResponse == null || profileResponse.getData() == null
                || !"SUCCESS".equalsIgnoreCase(profileResponse.getCode())) {
            throw new InvalidOrderStateException("Không thể xác thực tài khoản để đổi điểm.");
        }

        Long userDbId = profileResponse.getData().getId();
        BigDecimal productDiscount = resolveProductDiscount(order);
        BigDecimal shippingDiscount = order.getShippingDiscountAmount() != null
                ? order.getShippingDiscountAmount()
                : BigDecimal.ZERO;
        BigDecimal payableAmount = order.getTotalAmount().subtract(productDiscount).subtract(shippingDiscount)
                .max(BigDecimal.ZERO);

        var redeemRequest = UserClient.PointRedeemRequest.builder()
                .pointsToRedeem(pointsToRedeem)
                .orderId(order.getId())
                .orderAmount(payableAmount)
                .build();

        var response = userClient.redeemPoints(userDbId, redeemRequest);
        if (response == null || response.getData() == null
                || !"SUCCESS".equalsIgnoreCase(response.getCode())) {
            String message = response != null && response.getMessage() != null
                    ? response.getMessage()
                    : "Không thể đổi điểm thưởng.";
            throw new InvalidOrderStateException(message);
        }

        UserClient.PointRedeemResult result = response.getData();
        BigDecimal pointDiscount = result.getDiscountAmount() != null
                ? result.getDiscountAmount()
                : BigDecimal.ZERO;

        order.setPointsRedeemed(result.getPointsRedeemed());
        applyPricingToOrder(order, productDiscount, shippingDiscount, pointDiscount);
        orderRepository.save(order);
        log.info("Applied {} loyalty points to order {} discount={}", result.getPointsRedeemed(), order.getId(),
                pointDiscount);
    }

    private void refundPointsForOrder(Order order) {
        // ALWAYS attempt refund using orderId (idempotent) - do not rely on
        // order.getPointsRedeemed()
        // This prevents point leakage when applyPointsToOrder() succeeded but timed out
        // on response
        try {
            var profileResponse = userClient.getProfileByKeycloakId(order.getUserId());
            if (profileResponse == null || profileResponse.getData() == null) {
                log.warn("Failed to retrieve user profile for userId {} to refund points", order.getUserId());
                return;
            }
            // User-service refundPoints API MUST be idempotent by orderId
            userClient.refundPoints(
                    profileResponse.getData().getId(),
                    UserClient.PointRefundRequest.builder().orderId(order.getId()).build());
            log.info("Refunded loyalty points for cancelled order {}", order.getId());
        } catch (Exception ex) {
            log.error("Failed to refund points for order {}: {}", order.getId(), ex.getMessage());
        }
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

        // 3. Lấy warrantyPeriod từ product-service (REST via DiscoveryClient &
        // RestTemplate)
        java.util.Map<Long, Integer> warrantyMap = new java.util.HashMap<>();
        java.util.Map<Long, String> imageMap = new java.util.HashMap<>();
        try {
            var instances = discoveryClient.getInstances("product-service");
            if (instances != null && !instances.isEmpty()) {
                String baseUrl = instances.get(0).getUri().toString();
                String idsParam = productIds.stream().map(String::valueOf).collect(Collectors.joining(","));
                String url = baseUrl + "/api/internal/products/price-info?ids=" + idsParam;
                var response = restTemplate.getForObject(url, java.util.Map.class);
                if (response != null && "SUCCESS".equals(response.get("code"))) {
                    List<java.util.Map<String, Object>> data = (List<java.util.Map<String, Object>>) response
                            .get("data");
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
            java.util.List<OrderItem> items = orderItemsMap.getOrDefault(order.getId(),
                    java.util.Collections.emptyList());

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
                .pointsRedeemed(order.getPointsRedeemed())
                .pointDiscountAmount(order.getPointDiscountAmount())
                .shippingFee(order.getShippingFee())
                .shippingDiscountAmount(order.getShippingDiscountAmount())
                .vatAmount(order.getVatAmount())
                .trackingCode(order.getTrackingCode())
                .shippingAddress(order.getShippingAddress())
                .phoneNumber(order.getPhoneNumber())
                .note(order.getNote())
                .items(itemResponses)
                .createdAt(order.getCreatedAt())
                .updatedAt(order.getUpdatedAt())
                .build();
    }

    private void saveOutboxEvent(String aggregateId, String eventType, String payload) {
        outboxEventRepository.save(OutboxEvent.builder()
                .aggregateId(aggregateId)
                .aggregateType("Order")
                .eventType(eventType)
                .payload(payload)
                .build());
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

            saveOutboxEvent(String.valueOf(order.getId()), "OrderCreatedEvent",
                    objectMapper.writeValueAsString(createdEvent));
        } catch (Exception e) {
            log.error("Failed to construct and save outbox event for OrderCreatedEvent: {}", e.getMessage());
            throw new RuntimeException("Order creation failed due to outbox error", e);
        }
    }
}
