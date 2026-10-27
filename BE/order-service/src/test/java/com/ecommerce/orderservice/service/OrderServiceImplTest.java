package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.client.PromotionClient;
import com.ecommerce.orderservice.client.UserClient;
import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.request.CheckoutPreviewRequest;
import com.ecommerce.orderservice.dto.request.CheckoutRequest;
import com.ecommerce.orderservice.dto.response.CartItemResponse;
import com.ecommerce.orderservice.dto.response.CartResponse;
import com.ecommerce.orderservice.dto.response.CheckoutPreviewResponse;
import com.ecommerce.orderservice.dto.response.OrderResponse;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.entity.OrderItem;
import com.ecommerce.orderservice.entity.OutboxEvent;
import com.ecommerce.orderservice.exception.DuplicateRequestException;
import com.ecommerce.orderservice.exception.InsufficientStockException;
import com.ecommerce.orderservice.exception.InvalidOrderStateException;
import com.ecommerce.orderservice.exception.ResourceNotFoundException;
import com.ecommerce.orderservice.grpc.InventoryGrpcClient;
import com.ecommerce.orderservice.repository.CompensationTaskRepository;
import com.ecommerce.orderservice.repository.OrderItemRepository;
import com.ecommerce.orderservice.repository.OrderRepository;
import com.ecommerce.orderservice.repository.OutboxEventRepository;
import com.ecommerce.orderservice.service.impl.OrderServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceImplTest {

    @Mock private OrderRepository orderRepository;
    @Mock private OrderItemRepository orderItemRepository;
    @Mock private OutboxEventRepository outboxEventRepository;
    @Mock private CompensationTaskRepository compensationTaskRepository;
    @Mock private CartService cartService;
    @Mock private InventoryGrpcClient inventoryGrpcClient;
    @Mock private RedisTemplate<String, String> stringRedisTemplate;
    @Mock private ValueOperations<String, String> valueOps;
    @Mock private TransactionTemplate transactionTemplate;
    @Mock private PromotionClient promotionClient;
    @Mock private UserClient userClient;
    @Mock private DiscoveryClient discoveryClient;
    @Mock private DefaultRedisScript<Long> stockDecrementScript;
    @Mock private DefaultRedisScript<Long> stockIncrementScript;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private OrderServiceImpl orderService;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        // Khởi tạo thủ công vì có 2 DefaultRedisScript cùng kiểu (giảm / tăng tồn kho).
        orderService = new OrderServiceImpl(orderRepository, orderItemRepository, outboxEventRepository,
                compensationTaskRepository, cartService, inventoryGrpcClient, objectMapper, stringRedisTemplate,
                transactionTemplate, promotionClient, userClient, discoveryClient,
                stockDecrementScript, stockIncrementScript);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOps);
        lenient().when(transactionTemplate.execute(any())).thenAnswer(inv ->
                ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(mock(TransactionStatus.class)));
        lenient().doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(mock(TransactionStatus.class));
            return null;
        }).when(transactionTemplate).executeWithoutResult(any());
    }

    private static CheckoutRequest checkout() {
        return CheckoutRequest.builder().shippingAddress("1 Xuân Thủy, Cầu Giấy, Hà Nội").phoneNumber("0912345678").build();
    }

    private static CartItemResponse cartItem(long productId, int qty, String unitPrice) {
        BigDecimal price = new BigDecimal(unitPrice);
        return CartItemResponse.builder().productId(productId).productName("SP" + productId)
                .unitPrice(price).quantity(qty).subtotal(price.multiply(BigDecimal.valueOf(qty)))
                .weight(new BigDecimal("0.5")).build();
    }

    private static Order order(long id, String userId, String status) {
        return Order.builder().id(id).userId(userId).email(userId + "@mail.com").status(status)
                .totalAmount(new BigDecimal("1000000")).finalAmount(new BigDecimal("1130000")).build();
    }

    private void stubProfileAndRefund(String keycloakId, long dbId) {
        lenient().when(userClient.getProfileByKeycloakId(keycloakId)).thenReturn(ApiResponse.success(
                UserClient.InternalUserProfile.builder().id(dbId).keycloakUserId(keycloakId).build()));
    }

    // ───────────────────────────── Checkout ─────────────────────────────

    @Test
    @DisplayName("TC_PH3_CHECKOUT_01: Gửi lại checkout cùng Idempotency-Key khi lần trước đang xử lý -> DuplicateRequestException (409), không đọc giỏ, không tạo đơn")
    void createOrder_idempotencyKeyInProgress() {
        when(valueOps.setIfAbsent("checkout:lock:u1:key-1", "PROCESSING", Duration.ofMinutes(15))).thenReturn(false);
        when(valueOps.get("checkout:lock:u1:key-1")).thenReturn("PROCESSING");

        assertThrows(DuplicateRequestException.class,
                () -> orderService.createOrder("u1", checkout(), "key-1", "u1@mail.com"));
        verifyNoInteractions(cartService);
        verify(orderRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH3_CHECKOUT_02: Gửi lại checkout cùng Idempotency-Key sau khi đã xong -> trả lại đúng đơn cũ đã cache, không tạo đơn mới")
    void createOrder_idempotencyKeyReturnsCachedResponse() throws Exception {
        String cached = objectMapper.writeValueAsString(OrderResponse.builder().id(99L).userId("u1").status("PENDING").build());
        when(valueOps.setIfAbsent("checkout:lock:u1:key-2", "PROCESSING", Duration.ofMinutes(15))).thenReturn(false);
        when(valueOps.get("checkout:lock:u1:key-2")).thenReturn(cached);

        OrderResponse res = orderService.createOrder("u1", checkout(), "key-2", "u1@mail.com");

        assertEquals(99L, res.getId());
        verifyNoInteractions(cartService);
        verify(orderRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH3_CHECKOUT_03: Checkout khi giỏ hàng trống -> InvalidOrderStateException 'Cart is empty', giải phóng khóa idempotency")
    void createOrder_emptyCart() {
        when(valueOps.setIfAbsent("checkout:lock:u1:key-3", "PROCESSING", Duration.ofMinutes(15))).thenReturn(true);
        when(cartService.getCart("cart:u1")).thenReturn(CartResponse.builder().userId("u1").items(List.of())
                .totalAmount(BigDecimal.ZERO).build());

        InvalidOrderStateException ex = assertThrows(InvalidOrderStateException.class,
                () -> orderService.createOrder("u1", checkout(), "key-3", "u1@mail.com"));
        assertEquals("Cart is empty", ex.getMessage());
        verify(stringRedisTemplate).delete("checkout:lock:u1:key-3");
        verify(orderRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH3_CHECKOUT_04: Sản phẩm thứ 2 hết hàng (Lua script trả -2) -> InsufficientStockException, hoàn lại tồn kho Redis đã trừ của sản phẩm 1, không tạo đơn")
    void createOrder_outOfStock_rollsBackReservedStock() {
        CartResponse cart = CartResponse.builder().userId("u1")
                .items(List.of(cartItem(1L, 1, "100000"), cartItem(2L, 3, "200000")))
                .totalAmount(new BigDecimal("700000")).build();
        when(cartService.getCart("cart:u1")).thenReturn(cart);
        when(valueOps.get("product:stock:1:0")).thenReturn("10");
        when(valueOps.get("product:stock:2:0")).thenReturn("1");
        when(stringRedisTemplate.execute(eq(stockDecrementScript), eq(List.of("product:stock:1:0")), eq("1"))).thenReturn(9L);
        when(stringRedisTemplate.execute(eq(stockDecrementScript), eq(List.of("product:stock:2:0")), eq("3"))).thenReturn(-2L);

        assertThrows(InsufficientStockException.class,
                () -> orderService.createOrder("u1", checkout(), null, "u1@mail.com"));

        verify(stringRedisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("1"));
        verify(stringRedisTemplate, never()).execute(eq(stockIncrementScript), eq(List.of("product:stock:2:0")), any());
        verify(orderRepository, never()).save(any());
        verify(cartService, never()).clearCart(any(), any());
    }

    @Test
    // Quy tắc đổi: giá đã gồm VAT (VAT chỉ tách ra để hiển thị) và miễn phí ship từ 500.000đ.
    @DisplayName("TC_PH3_CHECKOUT_05: Checkout hợp lệ (2 x 500.000, không voucher/điểm) -> đơn PENDING, thành tiền 1.000.000 (giá đã gồm VAT 90.909, freeship), lưu outbox OrderCreatedEvent, xóa giỏ, cache response theo Idempotency-Key")
    void createOrder_success() {
        when(valueOps.setIfAbsent("checkout:lock:u1:key-5", "PROCESSING", Duration.ofMinutes(15))).thenReturn(true);
        CartResponse cart = CartResponse.builder().userId("u1").items(List.of(cartItem(1L, 2, "500000")))
                .totalAmount(new BigDecimal("1000000")).build();
        when(cartService.getCart("cart:u1")).thenReturn(cart);
        when(valueOps.get("product:stock:1:0")).thenReturn("10");
        when(stringRedisTemplate.execute(eq(stockDecrementScript), eq(List.of("product:stock:1:0")), eq("2"))).thenReturn(8L);
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order o = inv.getArgument(0);
            if (o.getId() == null) o.setId(1000L);
            return o;
        });

        CheckoutRequest req = checkout();
        req.setShippingFee(BigDecimal.ZERO); // client gửi phí ship 0 -> server phải tự tính
        OrderResponse res = orderService.createOrder("u1", req, "key-5", "u1@mail.com");

        assertEquals(1000L, res.getId());
        assertEquals("PENDING", res.getStatus());
        assertEquals(0, new BigDecimal("1000000").compareTo(res.getTotalAmount()));
        assertEquals(0, new BigDecimal("90909").compareTo(res.getVatAmount()));
        assertEquals(0, BigDecimal.ZERO.compareTo(res.getShippingFee()));
        assertEquals(0, new BigDecimal("1000000").compareTo(res.getFinalAmount()));
        assertEquals(1, res.getItems().size());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<OrderItem>> items = ArgumentCaptor.forClass(List.class);
        verify(orderItemRepository).saveAll(items.capture());
        assertEquals(1000L, items.getValue().get(0).getOrderId());
        ArgumentCaptor<OutboxEvent> outbox = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(outbox.capture());
        assertEquals("OrderCreatedEvent", outbox.getValue().getEventType());
        assertEquals("1000", outbox.getValue().getAggregateId());
        verify(cartService).clearCart("cart:u1", null);
        verify(valueOps).set(eq("checkout:lock:u1:key-5"), contains("\"id\":1000"), eq(Duration.ofMinutes(15)));
        verify(stringRedisTemplate, never()).delete("checkout:lock:u1:key-5");
    }

    @Test
    // Quy tắc đổi: giá đã gồm VAT; hàng sau giảm 900.000 >= 500.000 nên phí ship 0 -> giảm ship bị chặn về 0.
    @DisplayName("TC_PH3_PREVIEW_01: Xem trước thanh toán: tạm tính 1.000.000, voucher giảm 100.000 + freeship 30.000, dùng 50 điểm -> freeship sẵn (giảm ship = 0), VAT tách ra 77.273, thành tiền 850.000, tổng giảm 150.000")
    void previewCheckout_voucherAndPoints() {
        when(cartService.getCart("cart:u1")).thenReturn(CartResponse.builder().userId("u1")
                .items(List.of(cartItem(1L, 2, "500000"))).totalAmount(new BigDecimal("1000000")).build());
        when(promotionClient.previewVoucher(any())).thenReturn(ApiResponse.success(
                PromotionClient.VoucherApplyResult.builder().applied(true).message("OK")
                        .productDiscountAmount(new BigDecimal("100000"))
                        .shippingDiscountAmount(new BigDecimal("30000")).build()));

        CheckoutPreviewResponse res = orderService.previewCheckout("u1",
                CheckoutPreviewRequest.builder().couponCode(" sale10 ").pointsToRedeem(50).build());

        assertEquals("SALE10", res.getCouponCode());
        assertTrue(res.isVoucherApplied());
        assertEquals(0, new BigDecimal("50000").compareTo(res.getPointDiscount()));
        assertEquals(0, new BigDecimal("77273").compareTo(res.getVatAmount()));
        assertEquals(0, new BigDecimal("150000").compareTo(res.getTotalDiscount()));
        assertEquals(0, new BigDecimal("850000").compareTo(res.getFinalAmount()));
        assertTrue(res.isCodAvailable());
        verify(promotionClient).previewVoucher(argThat(r -> "SALE10".equals(r.getCode())
                && BigDecimal.ZERO.compareTo(r.getShippingFee()) == 0));
        verify(promotionClient, never()).applyVoucher(any());
    }

    // ───────────────────────────── Owner / phân quyền ─────────────────────────────

    @Test
    @DisplayName("TC_PH3_OWNER_01: Khách hàng xem đơn của người khác -> AccessDeniedException, không tải chi tiết đơn")
    void getOrder_otherCustomer_denied() {
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order(10L, "owner-1", "PENDING")));

        assertThrows(AccessDeniedException.class, () -> orderService.getOrder(10L, "intruder-2", "ROLE_CUSTOMER"));
        verify(orderItemRepository, never()).findByOrderId(anyLong());
    }

    @Test
    @DisplayName("TC_PH3_OWNER_02: ADMIN/STAFF xem được đơn của khách; chủ đơn xem được đơn mình; đơn không tồn tại -> ResourceNotFoundException")
    void getOrder_adminOrOwnerAllowed() {
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order(10L, "owner-1", "PENDING")));
        when(orderRepository.findById(404L)).thenReturn(Optional.empty());
        when(orderItemRepository.findByOrderId(10L)).thenReturn(List.of());

        assertEquals(10L, orderService.getOrder(10L, "staff-9", "ROLE_CUSTOMER, ROLE_STAFF").getId());
        assertEquals(10L, orderService.getOrder(10L, "owner-1", "").getId());
        assertThrows(ResourceNotFoundException.class, () -> orderService.getOrder(404L, "owner-1", null));
    }

    // ───────────────────────────── Hủy đơn ─────────────────────────────

    @Test
    @DisplayName("TC_PH3_CANCEL_01: Chủ đơn hủy đơn PENDING -> trạng thái CANCELLED, lưu outbox OrderCancelledEvent (để hoàn kho), hoàn voucher và hoàn điểm")
    void cancelOrder_pending_success() {
        Order o = order(20L, "owner-1", "PENDING");
        when(orderRepository.findById(20L)).thenReturn(Optional.of(o));
        when(orderRepository.findByIdForUpdate(20L)).thenReturn(Optional.of(o));
        when(orderItemRepository.findByOrderId(20L)).thenReturn(List.of(
                OrderItem.builder().orderId(20L).productId(1L).quantity(2).unitPrice(new BigDecimal("500000")).build()));
        stubProfileAndRefund("owner-1", 7L);

        orderService.cancelOrder(20L, "owner-1", "owner-1@mail.com", "ROLE_CUSTOMER");

        assertEquals("CANCELLED", o.getStatus());
        ArgumentCaptor<OutboxEvent> outbox = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(outbox.capture());
        assertEquals("OrderCancelledEvent", outbox.getValue().getEventType());
        assertTrue(outbox.getValue().getPayload().contains("\"productId\":1"));
        verify(promotionClient).releaseVoucher(argThat(r -> r.getOrderId() == 20L));
        verify(userClient).refundPoints(eq(7L), argThat(r -> r.getOrderId() == 20L));
    }

    @Test
    @DisplayName("TC_PH3_CANCEL_02: Hủy đơn đang SHIPPED / DELIVERED / CANCELLED -> InvalidOrderStateException 'Cannot cancel order in status', không lưu, không hoàn voucher")
    void cancelOrder_invalidStatuses() {
        for (String status : List.of("SHIPPED", "DELIVERED", "CANCELLED")) {
            Order o = order(21L, "owner-1", status);
            when(orderRepository.findById(21L)).thenReturn(Optional.of(o));
            when(orderRepository.findByIdForUpdate(21L)).thenReturn(Optional.of(o));

            InvalidOrderStateException ex = assertThrows(InvalidOrderStateException.class,
                    () -> orderService.cancelOrder(21L, "owner-1", "e", "ROLE_CUSTOMER"));
            assertTrue(ex.getMessage().contains("Cannot cancel order in status: " + status));
            assertEquals(status, o.getStatus());
        }
        verify(orderRepository, never()).save(any());
        verify(outboxEventRepository, never()).save(any());
        verifyNoInteractions(promotionClient);
    }

    @Test
    @DisplayName("TC_PH3_CANCEL_03: Khách khác hủy đơn -> AccessDeniedException; STAFF hủy hộ -> sự kiện hủy mang userId/email của CHỦ ĐƠN, không phải nhân viên")
    void cancelOrder_ownership() throws Exception {
        Order o = order(22L, "owner-1", "CONFIRMED");
        when(orderRepository.findById(22L)).thenReturn(Optional.of(o));

        assertThrows(AccessDeniedException.class,
                () -> orderService.cancelOrder(22L, "intruder-2", "x@mail.com", "ROLE_CUSTOMER"));
        verify(orderRepository, never()).findByIdForUpdate(anyLong());

        when(orderRepository.findByIdForUpdate(22L)).thenReturn(Optional.of(o));
        stubProfileAndRefund("owner-1", 7L);
        orderService.cancelOrder(22L, "staff-9", "staff@shop.vn", "ROLE_STAFF");

        assertEquals("CANCELLED", o.getStatus());
        ArgumentCaptor<OutboxEvent> outbox = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(outbox.capture());
        var payload = objectMapper.readTree(outbox.getValue().getPayload());
        assertEquals("owner-1", payload.get("userId").asText());
        assertEquals("owner-1@mail.com", payload.get("email").asText());
    }

    // ───────────────────────────── Giao hàng ─────────────────────────────

    @Test
    @DisplayName("TC_PH3_SHIP_01: Giao đơn CONFIRMED -> SHIPPED, sinh mã vận đơn MOCK-GHTK-xxxxxxxx, lưu outbox OrderShippedEvent; đơn PENDING (chưa thanh toán) -> InvalidOrderStateException")
    void shipOrder_rules() {
        Order confirmed = order(30L, "owner-1", "CONFIRMED");
        Order pending = order(31L, "owner-1", "PENDING");
        when(orderRepository.findByIdForUpdate(30L)).thenReturn(Optional.of(confirmed));
        when(orderRepository.findByIdForUpdate(31L)).thenReturn(Optional.of(pending));
        when(orderItemRepository.findByOrderId(30L)).thenReturn(List.of());

        OrderResponse res = orderService.shipOrder(30L);

        assertEquals("SHIPPED", res.getStatus());
        assertTrue(res.getTrackingCode().matches("MOCK-GHTK-[0-9A-F]{8}"));
        verify(outboxEventRepository).save(argThat(e -> "OrderShippedEvent".equals(e.getEventType())));

        assertThrows(InvalidOrderStateException.class, () -> orderService.shipOrder(31L));
        assertEquals("PENDING", pending.getStatus());
        assertNull(pending.getTrackingCode());
    }

    @Test
    @DisplayName("TC_PH3_DELIV_01: Admin cập nhật SHIPPED -> DELIVERED (không phân biệt hoa thường) -> lưu trạng thái, outbox OrderDeliveredEvent, không hoàn voucher")
    void updateDeliveryStatus_shippedToDelivered() {
        Order o = order(40L, "owner-1", "SHIPPED");
        o.setTrackingCode("MOCK-GHTK-AAAA1111");
        when(orderRepository.findByIdForUpdate(40L)).thenReturn(Optional.of(o));
        when(orderItemRepository.findByOrderId(40L)).thenReturn(List.of());

        OrderResponse res = orderService.updateDeliveryStatusByAdmin(40L, "delivered");

        assertEquals("DELIVERED", res.getStatus());
        verify(orderRepository).save(o);
        verify(outboxEventRepository).save(argThat(e -> "OrderDeliveredEvent".equals(e.getEventType())));
        verifyNoInteractions(promotionClient);
    }

    @Test
    @DisplayName("TC_PH3_DELIV_02: Chuyển trạng thái không hợp lệ: từ DELIVERED (trạng thái cuối) -> lỗi; lùi DELIVERED->SHIPPED -> lỗi; trạng thái lạ 'RETURNED' -> IllegalArgumentException; trùng trạng thái -> bỏ qua")
    void updateDeliveryStatus_invalidTransitions() {
        Order delivered = order(41L, "owner-1", "DELIVERED");
        Order shipped = order(42L, "owner-1", "SHIPPED");
        when(orderRepository.findByIdForUpdate(41L)).thenReturn(Optional.of(delivered));
        when(orderRepository.findByIdForUpdate(42L)).thenReturn(Optional.of(shipped));
        when(orderItemRepository.findByOrderId(42L)).thenReturn(List.of());

        assertThrows(InvalidOrderStateException.class, () -> orderService.updateDeliveryStatusByAdmin(41L, "CANCELLED"));
        assertThrows(InvalidOrderStateException.class, () -> orderService.updateDeliveryStatusByAdmin(41L, "SHIPPED"));
        assertThrows(IllegalArgumentException.class, () -> orderService.updateDeliveryStatusByAdmin(42L, "RETURNED"));
        assertEquals("SHIPPED", orderService.updateDeliveryStatusByAdmin(42L, "SHIPPED").getStatus());

        assertEquals("DELIVERED", delivered.getStatus());
        verify(orderRepository, never()).save(any());
        verify(outboxEventRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH3_WEBHOOK_02: Webhook vận chuyển: mã vận đơn không tồn tại -> ResourceNotFoundException; sự kiện lùi trạng thái (DELIVERED -> SHIPPED) bị bỏ qua, không ghi DB; SHIPPED -> DELIVERED được cập nhật")
    void handleShippingWebhook_rules() {
        Order delivered = order(50L, "owner-1", "DELIVERED");
        Order shipped = order(51L, "owner-1", "SHIPPED");
        when(orderRepository.findByTrackingCodeForUpdate("UNKNOWN")).thenReturn(Optional.empty());
        when(orderRepository.findByTrackingCodeForUpdate("TRK-50")).thenReturn(Optional.of(delivered));
        when(orderRepository.findByTrackingCodeForUpdate("TRK-51")).thenReturn(Optional.of(shipped));

        assertThrows(ResourceNotFoundException.class, () -> orderService.handleShippingWebhook("UNKNOWN", "DELIVERED"));

        orderService.handleShippingWebhook("TRK-50", "SHIPPED");
        assertEquals("DELIVERED", delivered.getStatus());
        verify(orderRepository, never()).save(delivered);

        orderService.handleShippingWebhook("TRK-51", "DELIVERED");
        assertEquals("DELIVERED", shipped.getStatus());
        verify(orderRepository).save(shipped);
        verify(outboxEventRepository).save(argThat(e -> "OrderDeliveredEvent".equals(e.getEventType())));
    }
}
