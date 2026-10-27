package com.ecommerce.inventoryservice.service;

import com.ecommerce.inventoryservice.kafka.event.OrderCancelledEvent;
import com.ecommerce.inventoryservice.kafka.producer.InventoryKafkaProducer;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.repository.InventoryTransactionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Bug thật ở InventoryDeductService. Chạy riêng: mvn -pl inventory-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class InventoryDeductServiceBugCheck {

    @Mock private InventoryRepository inventoryRepository;
    @Mock private InventoryTransactionRepository transactionRepository;
    @Mock private InventoryKafkaProducer kafkaProducer;
    @Mock private RedisTemplate<String, String> redisTemplate;
    @Mock private DefaultRedisScript<Long> stockIncrementScript;

    @InjectMocks
    private InventoryDeductService deductService;

    @Test
    @DisplayName("TC_PH4_RELEASE_05: Nhánh tombstone (hủy trước khi trừ kho) chỉ được trả kho Redis SAU KHI commit, giống các nhánh restock/release; nếu transaction rollback thì Redis không được tăng")
    void tombstoneBranch_redisIncrementMustWaitForCommit() {
        lenient().when(transactionRepository.findByOrderIdAndTransactionType(eq(500L), anyString())).thenReturn(Optional.empty());
        lenient().when(transactionRepository.findByOrderId(500L)).thenReturn(List.of());
        OrderCancelledEvent ev = OrderCancelledEvent.builder().orderId(500L)
                .items(List.of(new OrderCancelledEvent.OrderItemInfo(1L, null, 2))).build();

        TransactionSynchronizationManager.initSynchronization();
        try {
            deductService.processOrderCancelled(ev);
            // transaction chưa commit (giả lập rollback): Redis không được bị đụng tới
            verifyNoInteractions(redisTemplate);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
