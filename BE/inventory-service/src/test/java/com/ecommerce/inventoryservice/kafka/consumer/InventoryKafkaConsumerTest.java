package com.ecommerce.inventoryservice.kafka.consumer;

import com.ecommerce.inventoryservice.exception.InsufficientStockException;
import com.ecommerce.inventoryservice.kafka.event.OrderCancelledEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCreatedEvent;
import com.ecommerce.inventoryservice.service.InventoryDeductService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.kafka.support.Acknowledgment;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test InventoryKafkaConsumer (PH4): định tuyến sự kiện order-events, khóa theo orderId, ack/retry.
 * Dùng ObjectMapper cấu hình như Spring Boot (bỏ qua field lạ).
 */
@ExtendWith(MockitoExtension.class)
class InventoryKafkaConsumerTest {

    @Mock private InventoryDeductService deductService;
    @Mock private RedisTemplate<String, String> redisTemplate;
    @Mock private ValueOperations<String, String> valueOps;
    @Mock private Acknowledgment ack;

    private InventoryKafkaConsumer consumer;
    private final ObjectMapper mapper = Jackson2ObjectMapperBuilder.json().build();

    @BeforeEach
    void setUp() {
        consumer = new InventoryKafkaConsumer(deductService, mapper, redisTemplate);
    }

    private void lockFree() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        when(valueOps.setIfAbsent(startsWith("lock:inventory-consumer:"), eq("locked"), eq(Duration.ofSeconds(10)))).thenReturn(true);
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_01: OrderCreatedEvent (kể cả payload JSON lồng dạng chuỗi từ outbox) được chuyển cho processOrderCreated, ack và nhả khóa lock:inventory-consumer:{orderId}")
    void orderCreated_routed_acked_lockReleased() throws Exception {
        lockFree();
        String json = "{\"eventType\":\"OrderCreatedEvent\",\"orderId\":300,\"userId\":\"u1\",\"totalAmount\":1000000,"
                + "\"items\":[{\"productId\":1,\"variantId\":null,\"quantity\":2,\"price\":500000}]}";
        String doubleEncoded = mapper.writeValueAsString(json);

        consumer.consumeOrderEvent(json, ack);
        consumer.consumeOrderEvent(doubleEncoded, ack);

        ArgumentCaptor<OrderCreatedEvent> ev = ArgumentCaptor.forClass(OrderCreatedEvent.class);
        verify(deductService, times(2)).processOrderCreated(ev.capture());
        assertEquals(300L, ev.getAllValues().get(1).getOrderId());
        assertEquals(2, ev.getAllValues().get(1).getItems().get(0).getQuantity());
        verify(ack, times(2)).acknowledge();
        verify(redisTemplate, times(2)).delete("lock:inventory-consumer:300");
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_02: OrderCancelledEvent được chuyển cho processOrderCancelled kèm danh sách sản phẩm; ack")
    void orderCancelled_routed() {
        lockFree();
        consumer.consumeOrderEvent("{\"eventType\":\"OrderCancelledEvent\",\"orderId\":301,\"items\":[{\"productId\":5,\"variantId\":51,\"quantity\":1}]}", ack);

        ArgumentCaptor<OrderCancelledEvent> ev = ArgumentCaptor.forClass(OrderCancelledEvent.class);
        verify(deductService).processOrderCancelled(ev.capture());
        assertEquals(301L, ev.getValue().getOrderId());
        assertEquals(51L, ev.getValue().getItems().get(0).getVariantId());
        verify(deductService, never()).processOrderCreated(any());
        verify(ack).acknowledge();
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_03: Payload thiếu orderId thì ack bỏ qua (không lấy khóa, không xử lý); eventType lạ (OrderShippedEvent) được ack và bỏ qua")
    void missingOrderId_or_unknownType_ignored() {
        consumer.consumeOrderEvent("{\"eventType\":\"OrderCreatedEvent\",\"items\":[]}", ack);
        verifyNoInteractions(redisTemplate);

        lockFree();
        consumer.consumeOrderEvent("{\"eventType\":\"OrderShippedEvent\",\"orderId\":302}", ack);

        verifyNoInteractions(deductService);
        verify(ack, times(2)).acknowledge();
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_04: Hết hàng (InsufficientStockException, kể cả bị bọc) thì phát InventoryDeductedEvent FAILED kèm lý do và ack, không ném lỗi để tránh retry vô ích")
    void insufficientStock_publishesFailure_andAcks() {
        lockFree();
        doThrow(new RuntimeException("tx rollback", new InsufficientStockException(1L, 5, 2)))
                .when(deductService).processOrderCreated(any());

        assertDoesNotThrow(() -> consumer.consumeOrderEvent(
                "{\"eventType\":\"OrderCreatedEvent\",\"orderId\":303,\"items\":[{\"productId\":1,\"quantity\":5}]}", ack));

        verify(deductService).publishFailureEvent(eq(303L), contains("requested=5, available=2"));
        verify(ack).acknowledge();
        verify(redisTemplate).delete("lock:inventory-consumer:303");
    }

    @Test
    @DisplayName("TC_PH4_KAFKA_05: Lỗi hệ thống/DB thì ném RuntimeException để Kafka retry/DLT, KHÔNG ack, không phát FAILED; khóa vẫn được nhả")
    void systemError_rethrows_noAck() {
        lockFree();
        doThrow(new RuntimeException("Deadlock found when trying to get lock")).when(deductService).processOrderCancelled(any());

        assertThrows(RuntimeException.class, () -> consumer.consumeOrderEvent(
                "{\"eventType\":\"OrderCancelledEvent\",\"orderId\":304}", ack));

        verify(ack, never()).acknowledge();
        verify(deductService, never()).publishFailureEvent(anyLong(), anyString());
        verify(redisTemplate).delete("lock:inventory-consumer:304");
    }
}
