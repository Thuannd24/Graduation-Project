package com.ecommerce.inventoryservice.service;

import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.entity.InventoryTransaction;
import com.ecommerce.inventoryservice.exception.InsufficientStockException;
import com.ecommerce.inventoryservice.kafka.event.InventoryDeductedEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCancelledEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCreatedEvent;
import com.ecommerce.inventoryservice.kafka.producer.InventoryKafkaProducer;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.repository.InventoryTransactionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test InventoryDeductService (PH4): trừ kho theo đơn (idempotent theo orderId), hoàn kho khi hủy, tombstone hủy-trước-tạo.
 */
@ExtendWith(MockitoExtension.class)
class InventoryDeductServiceTest {

    @Mock private InventoryRepository inventoryRepository;
    @Mock private InventoryTransactionRepository transactionRepository;
    @Mock private InventoryKafkaProducer kafkaProducer;
    @Mock private RedisTemplate<String, String> redisTemplate;
    @Mock private DefaultRedisScript<Long> stockIncrementScript;

    @InjectMocks
    private InventoryDeductService deductService;

    private static OrderCreatedEvent.OrderItem item(Long p, Long v, int q) {
        return OrderCreatedEvent.OrderItem.builder().productId(p).variantId(v).quantity(q).build();
    }

    private static InventoryTransaction tx(Long orderId, Long p, Long v, String type, int q) {
        return InventoryTransaction.builder().orderId(orderId).productId(p).variantId(v).transactionType(type).quantityChanged(q).build();
    }

    private Inventory stock(Long p, Long v, int q) {
        Inventory inv = Inventory.builder().productId(p).variantId(v).quantity(q).build();
        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(p, v)).thenReturn(Optional.of(inv));
        return inv;
    }

    @Test
    @DisplayName("TC_PH4_DEDUCT_01: Đơn nhiều sản phẩm: khóa dòng theo thứ tự (productId, variantId) để tránh deadlock, trừ đúng số lượng, ghi DEDUCT và phát InventoryDeductedEvent CONFIRMED")
    void processOrderCreated_success_sortedAndPublished() {
        when(transactionRepository.findByOrderIdAndTransactionType(eq(100L), anyString())).thenReturn(Optional.empty());
        Inventory p2 = stock(2L, 0L, 10);
        Inventory p1v5 = stock(1L, 5L, 4);
        Inventory p1 = stock(1L, 0L, 6);
        OrderCreatedEvent ev = OrderCreatedEvent.builder().eventType("OrderCreatedEvent").orderId(100L).userId("u1")
                .items(List.of(item(2L, null, 1), item(1L, 5L, 2), item(1L, null, 3))).build();

        deductService.processOrderCreated(ev);

        InOrder order = inOrder(inventoryRepository);
        order.verify(inventoryRepository).findByProductIdAndVariantIdForUpdate(1L, 0L);
        order.verify(inventoryRepository).findByProductIdAndVariantIdForUpdate(1L, 5L);
        order.verify(inventoryRepository).findByProductIdAndVariantIdForUpdate(2L, 0L);
        assertEquals(3, p1.getQuantity());
        assertEquals(2, p1v5.getQuantity());
        assertEquals(9, p2.getQuantity());

        ArgumentCaptor<InventoryTransaction> txs = ArgumentCaptor.forClass(InventoryTransaction.class);
        verify(transactionRepository, times(3)).save(txs.capture());
        assertTrue(txs.getAllValues().stream().allMatch(t -> "DEDUCT".equals(t.getTransactionType()) && "ORDER-100".equals(t.getReferenceId())));

        ArgumentCaptor<InventoryDeductedEvent> evt = ArgumentCaptor.forClass(InventoryDeductedEvent.class);
        verify(kafkaProducer).publishInventoryEvent(evt.capture());
        assertEquals(100L, evt.getValue().getOrderId());
        assertEquals("CONFIRMED", evt.getValue().getStatus());
        assertNull(evt.getValue().getFailReason());
    }

    @Test
    @DisplayName("TC_PH4_DEDUCT_02: Sự kiện OrderCreated lặp lại (đã có DEDUCT cho đơn) không trừ kho lần 2, chỉ phát lại CONFIRMED")
    void processOrderCreated_duplicate_isIdempotent() {
        when(transactionRepository.findByOrderIdAndTransactionType(101L, "DEDUCT"))
                .thenReturn(Optional.of(tx(101L, 1L, 0L, "DEDUCT", 2)));
        OrderCreatedEvent ev = OrderCreatedEvent.builder().orderId(101L).items(List.of(item(1L, null, 2))).build();

        deductService.processOrderCreated(ev);

        verify(inventoryRepository, never()).findByProductIdAndVariantIdForUpdate(anyLong(), anyLong());
        verify(inventoryRepository, never()).save(any());
        verify(transactionRepository, never()).save(any());
        verify(kafkaProducer).publishInventoryEvent(argThat(e -> e.getOrderId() == 101L && "CONFIRMED".equals(e.getStatus())));
    }

    @Test
    @DisplayName("TC_PH4_DEDUCT_03: Đơn đã bị hủy trước khi OrderCreated tới (có tombstone CANCEL_RECEIVED) thì bỏ qua, không trừ kho, không phát sự kiện")
    void processOrderCreated_cancelledBefore_skips() {
        when(transactionRepository.findByOrderIdAndTransactionType(102L, "DEDUCT")).thenReturn(Optional.empty());
        when(transactionRepository.findByOrderIdAndTransactionType(102L, "CANCEL_RECEIVED"))
                .thenReturn(Optional.of(tx(102L, 0L, 0L, "CANCEL_RECEIVED", 0)));

        deductService.processOrderCreated(OrderCreatedEvent.builder().orderId(102L).items(List.of(item(1L, null, 1))).build());

        verify(inventoryRepository, never()).findByProductIdAndVariantIdForUpdate(anyLong(), anyLong());
        verifyNoInteractions(kafkaProducer);
    }

    @Test
    @DisplayName("TC_PH4_DEDUCT_04: Biên tồn kho: còn 2 đặt 5 hoặc SP không có bản ghi kho -> InsufficientStockException, không trừ/không ghi/không phát CONFIRMED; đặt đúng bằng tồn (5/5) thì trừ về 0")
    void processOrderCreated_insufficientStock() {
        when(transactionRepository.findByOrderIdAndTransactionType(eq(103L), anyString())).thenReturn(Optional.empty());
        Inventory inv = stock(1L, 0L, 2);

        InsufficientStockException ex = assertThrows(InsufficientStockException.class, () -> deductService.processOrderCreated(
                OrderCreatedEvent.builder().orderId(103L).items(List.of(item(1L, null, 5))).build()));
        assertTrue(ex.getMessage().contains("requested=5, available=2"));
        assertEquals(2, inv.getQuantity());

        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(77L, 0L)).thenReturn(Optional.empty());
        assertThrows(InsufficientStockException.class, () -> deductService.deductInventory(77L, null, 1, 104L));

        verify(inventoryRepository, never()).save(any());
        verify(transactionRepository, never()).save(any());
        verifyNoInteractions(kafkaProducer);

        // biên: đặt đúng bằng số tồn
        Inventory exact = stock(6L, 0L, 5);
        deductService.deductInventory(6L, null, 5, 105L);
        assertEquals(0, exact.getQuantity());
        ArgumentCaptor<InventoryTransaction> t = ArgumentCaptor.forClass(InventoryTransaction.class);
        verify(transactionRepository).save(t.capture());
        assertEquals(5, t.getValue().getQuantityBefore());
        assertEquals(0, t.getValue().getQuantityAfter());
        verifyNoInteractions(redisTemplate);
    }

    @Test
    @DisplayName("TC_PH4_RELEASE_01: Hủy đơn đã trừ kho: hoàn đúng số lượng các dòng DEDUCT (bỏ qua giao dịch loại khác), ghi RELEASE và tăng kho Redis")
    void processOrderCancelled_releasesDeducted() {
        when(transactionRepository.findByOrderIdAndTransactionType(200L, "RELEASE")).thenReturn(Optional.empty());
        when(transactionRepository.findByOrderId(200L)).thenReturn(List.of(
                tx(200L, 3L, 0L, "DEDUCT", 1), tx(200L, 1L, 0L, "DEDUCT", 2), tx(200L, 9L, 0L, "RESTOCK", 50)));
        Inventory p1 = stock(1L, 0L, 8);
        Inventory p3 = stock(3L, 0L, 0);
        when(redisTemplate.execute(eq(stockIncrementScript), anyList(), any())).thenReturn(5L);

        deductService.processOrderCancelled(OrderCancelledEvent.builder().orderId(200L).build());

        assertEquals(10, p1.getQuantity());
        assertEquals(1, p3.getQuantity());
        InOrder order = inOrder(inventoryRepository);
        order.verify(inventoryRepository).findByProductIdAndVariantIdForUpdate(1L, 0L);
        order.verify(inventoryRepository).findByProductIdAndVariantIdForUpdate(3L, 0L);
        verify(inventoryRepository, never()).findByProductIdAndVariantIdForUpdate(9L, 0L);
        verify(transactionRepository, times(2)).save(argThat(t -> "RELEASE".equals(t.getTransactionType())));
        verify(redisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("2"));
        verify(redisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:3:0")), eq("1"));
    }

    @Test
    @DisplayName("TC_PH4_RELEASE_02: Sự kiện hủy lặp lại (đã có RELEASE) không hoàn kho lần 2")
    void processOrderCancelled_duplicate_isIdempotent() {
        when(transactionRepository.findByOrderIdAndTransactionType(201L, "RELEASE"))
                .thenReturn(Optional.of(tx(201L, 1L, 0L, "RELEASE", 2)));

        deductService.processOrderCancelled(OrderCancelledEvent.builder().orderId(201L).build());

        verify(transactionRepository, never()).findByOrderId(anyLong());
        verify(inventoryRepository, never()).findByProductIdAndVariantIdForUpdate(anyLong(), anyLong());
        verify(transactionRepository, never()).save(any());
        verifyNoInteractions(redisTemplate);
    }

    @Test
    @DisplayName("TC_PH4_RELEASE_03: Hủy trước khi trừ kho: ghi tombstone CANCEL_RECEIVED và trả lại kho Redis đã giữ lúc checkout; hủy lặp lại khi đã có tombstone thì không trả Redis lần 2")
    void processOrderCancelled_beforeDeduct_tombstone() {
        when(transactionRepository.findByOrderIdAndTransactionType(eq(202L), anyString())).thenReturn(Optional.empty());
        when(transactionRepository.findByOrderId(202L)).thenReturn(List.of());
        when(redisTemplate.execute(eq(stockIncrementScript), anyList(), any())).thenReturn(3L);
        OrderCancelledEvent ev = OrderCancelledEvent.builder().orderId(202L)
                .items(List.of(new OrderCancelledEvent.OrderItemInfo(1L, null, 2), new OrderCancelledEvent.OrderItemInfo(4L, 41L, 1))).build();

        deductService.processOrderCancelled(ev);

        ArgumentCaptor<InventoryTransaction> t = ArgumentCaptor.forClass(InventoryTransaction.class);
        verify(transactionRepository).save(t.capture());
        assertEquals("CANCEL_RECEIVED", t.getValue().getTransactionType());
        assertEquals(202L, t.getValue().getOrderId());
        assertEquals(0, t.getValue().getQuantityChanged());
        verify(redisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("2"));
        verify(redisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:4:41")), eq("1"));
        verify(inventoryRepository, never()).save(any());

        // lần 2: đã có tombstone
        clearInvocations(transactionRepository, redisTemplate);
        when(transactionRepository.findByOrderIdAndTransactionType(202L, "CANCEL_RECEIVED")).thenReturn(Optional.of(t.getValue()));
        deductService.processOrderCancelled(ev);
        verify(transactionRepository, never()).save(any());
        verifyNoInteractions(redisTemplate);
    }

    @Test
    @DisplayName("TC_PH4_RELEASE_04: releaseInventory: không có bản ghi kho -> lỗi; khi có transaction thì Redis chỉ tăng sau commit")
    void releaseInventory_missing_and_afterCommit() {
        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(88L, 0L)).thenReturn(Optional.empty());
        assertThrows(RuntimeException.class, () -> deductService.releaseInventory(88L, null, 1, 203L));

        Inventory inv = stock(1L, 0L, 0);
        TransactionSynchronizationManager.initSynchronization();
        try {
            deductService.releaseInventory(1L, null, 3, 203L);
            assertEquals(3, inv.getQuantity());
            verifyNoInteractions(redisTemplate);

            when(redisTemplate.execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("3"))).thenReturn(3L);
            TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
            verify(redisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("3"));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
