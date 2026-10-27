package com.ecommerce.inventoryservice.kafka.consumer;

import com.ecommerce.inventoryservice.exception.InsufficientStockException;
import com.ecommerce.inventoryservice.service.InventoryDeductService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.kafka.support.Acknowledgment;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Bug thật ở InventoryKafkaConsumer. Chạy riêng: mvn -pl inventory-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class InventoryKafkaConsumerBugCheck {

    @Mock private InventoryDeductService deductService;
    @Mock private RedisTemplate<String, String> redisTemplate;
    @Mock private ValueOperations<String, String> valueOps;
    @Mock private Acknowledgment ack;

    private InventoryKafkaConsumer consumer;
    private final ObjectMapper mapper = Jackson2ObjectMapperBuilder.json().build();

    @BeforeEach
    void setUp() {
        consumer = new InventoryKafkaConsumer(deductService, mapper, redisTemplate);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_06: Không giành được khóa (instance khác đang xử lý đơn) thì phải ném lỗi để retry và KHÔNG được xóa khóa của instance khác")
    void lockNotAcquired_mustNotDeleteForeignLock() {
        when(valueOps.setIfAbsent(eq("lock:inventory-consumer:400"), eq("locked"), eq(Duration.ofSeconds(10)))).thenReturn(false);

        assertThrows(RuntimeException.class, () -> consumer.consumeOrderEvent(
                "{\"eventType\":\"OrderCancelledEvent\",\"orderId\":400}", ack));

        verifyNoInteractions(deductService);
        verify(redisTemplate, never()).delete("lock:inventory-consumer:400");
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_07: Payload JSON lồng (chuỗi) + hết hàng: phải phát InventoryDeductedEvent FAILED cho đơn trước khi ack (nếu không đơn treo PENDING)")
    void doubleEncodedPayload_insufficientStock_mustPublishFailure() throws Exception {
        when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);
        doThrow(new InsufficientStockException(1L, 5, 2)).when(deductService).processOrderCreated(any());
        String json = "{\"eventType\":\"OrderCreatedEvent\",\"orderId\":401,\"items\":[{\"productId\":1,\"quantity\":5}]}";

        consumer.consumeOrderEvent(mapper.writeValueAsString(json), ack);

        verify(deductService).publishFailureEvent(eq(401L), anyString());
    }
}
