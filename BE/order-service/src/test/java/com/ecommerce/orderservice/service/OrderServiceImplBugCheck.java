package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.client.PromotionClient;
import com.ecommerce.orderservice.client.UserClient;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.exception.InvalidOrderStateException;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Bug thật trong chuyển trạng thái đơn. Chạy riêng: mvn -pl order-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class OrderServiceImplBugCheck {

    @Mock private OrderRepository orderRepository;
    @Mock private OrderItemRepository orderItemRepository;
    @Mock private OutboxEventRepository outboxEventRepository;
    @Mock private CompensationTaskRepository compensationTaskRepository;
    @Mock private CartService cartService;
    @Mock private InventoryGrpcClient inventoryGrpcClient;
    @Mock private RedisTemplate<String, String> stringRedisTemplate;
    @Mock private TransactionTemplate transactionTemplate;
    @Mock private PromotionClient promotionClient;
    @Mock private UserClient userClient;
    @Mock private DiscoveryClient discoveryClient;
    @Mock private DefaultRedisScript<Long> stockDecrementScript;
    @Mock private DefaultRedisScript<Long> stockIncrementScript;

    private OrderServiceImpl orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderServiceImpl(orderRepository, orderItemRepository, outboxEventRepository,
                compensationTaskRepository, cartService, inventoryGrpcClient, new ObjectMapper(), stringRedisTemplate,
                transactionTemplate, promotionClient, userClient, discoveryClient,
                stockDecrementScript, stockIncrementScript);
        lenient().when(orderItemRepository.findByOrderId(anyLong())).thenReturn(List.of());
    }

    @Test
    @DisplayName("TC_PH3_DELIV_03: Admin đặt DELIVERED cho đơn PENDING (chưa thanh toán, chưa giao vận) phải bị từ chối; chỉ đơn SHIPPED mới được chuyển DELIVERED")
    void pendingOrder_cannotJumpToDelivered() {
        Order pending = Order.builder().id(60L).userId("owner-1").status("PENDING")
                .totalAmount(new BigDecimal("1000000")).build();
        when(orderRepository.findByIdForUpdate(60L)).thenReturn(Optional.of(pending));

        assertThrows(InvalidOrderStateException.class, () -> orderService.updateDeliveryStatusByAdmin(60L, "DELIVERED"));
        assertEquals("PENDING", pending.getStatus());
    }
}
