package com.ecommerce.notificationservice.event.consumer;

import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.service.NotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test NotificationKafkaConsumer (PH7): ánh xạ sự kiện order/payment -> template email, chống gửi trùng, ack.
 */
@ExtendWith(MockitoExtension.class)
class NotificationKafkaConsumerTest {

    @Mock private NotificationService notificationService;
    @Mock private NotificationRepository notificationRepository;
    @Mock private Acknowledgment ack;

    private final ObjectMapper mapper = new ObjectMapper();
    private NotificationKafkaConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new NotificationKafkaConsumer(notificationService, notificationRepository, mapper);
    }

    private static String ev(String type, long orderId) {
        return "{\"eventType\":\"" + type + "\",\"orderId\":" + orderId + ",\"userId\":\"u1\",\"email\":\"a@mail.com\"}";
    }

    @Test
    @DisplayName("TC_PH7_KAFKA_01: Sự kiện đơn hàng -> đúng template: OrderConfirmed->order_confirmed_template, OrderCancelled->order_cancelled_template, OrderShipped->order_shipped_template, OrderDelivered->order_delivered_template; kèm userId/email/orderId; ack từng message")
    void orderEvents_mapToTemplates() {
        when(notificationRepository.existsByOrderIdAndEventType(anyLong(), anyString())).thenReturn(false);

        consumer.consumeOrderEvent(ev("OrderConfirmedEvent", 1), ack);
        consumer.consumeOrderEvent(ev("OrderCancelledEvent", 2), ack);
        consumer.consumeOrderEvent(ev("OrderShippedEvent", 3), ack);
        consumer.consumeOrderEvent(ev("OrderDeliveredEvent", 4), ack);

        ArgumentCaptor<SendNotificationRequest> c = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService, times(4)).sendNotification(c.capture());
        assertEquals(List.of("order_confirmed_template", "order_cancelled_template", "order_shipped_template", "order_delivered_template"),
                c.getAllValues().stream().map(SendNotificationRequest::getTemplateId).toList());
        SendNotificationRequest first = c.getAllValues().get(0);
        assertEquals("u1", first.getUserId());
        assertEquals("a@mail.com", first.getEmail());
        assertEquals(1L, first.getOrderId());
        assertEquals("OrderConfirmedEvent", first.getEventType());
        verify(ack, times(4)).acknowledge();
    }

    @Test
    @DisplayName("TC_PH7_KAFKA_02: Sự kiện thanh toán (payload JSON lồng từ outbox/Debezium) -> PaymentSuccess dùng payment_success_template, PaymentFailed dùng payment_failed_template; RefundCompleted dùng refund_completed_template (email xác nhận hoàn tiền)")
    void paymentEvents_mapToTemplates() throws Exception {
        when(notificationRepository.existsByOrderIdAndEventType(anyLong(), anyString())).thenReturn(false);

        consumer.consumePaymentEvent(mapper.writeValueAsString(ev("PaymentSuccessEvent", 10)), ack);
        consumer.consumePaymentEvent(ev("PaymentFailedEvent", 11), ack);
        consumer.consumePaymentEvent(ev("RefundCompletedEvent", 12), ack);

        ArgumentCaptor<SendNotificationRequest> c = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService, times(3)).sendNotification(c.capture());
        assertEquals("payment_success_template", c.getAllValues().get(0).getTemplateId());
        assertEquals(10L, c.getAllValues().get(0).getOrderId());
        assertEquals("payment_failed_template", c.getAllValues().get(1).getTemplateId());
        assertEquals("refund_completed_template", c.getAllValues().get(2).getTemplateId());
        verify(ack, times(3)).acknowledge();
    }

    @Test
    @DisplayName("TC_PH7_KAFKA_03: Chống gửi trùng: (orderId, eventType) đã có thông báo -> bỏ qua, không gửi email lần 2, vẫn ack")
    void duplicateEvent_skipped() {
        when(notificationRepository.existsByOrderIdAndEventType(20L, "OrderConfirmedEvent")).thenReturn(true);
        when(notificationRepository.existsByOrderIdAndEventType(21L, "PaymentSuccessEvent")).thenReturn(true);

        consumer.consumeOrderEvent(ev("OrderConfirmedEvent", 20), ack);
        consumer.consumePaymentEvent(ev("PaymentSuccessEvent", 21), ack);

        verifyNoInteractions(notificationService);
        verify(ack, times(2)).acknowledge();
    }

    @Test
    @DisplayName("TC_PH7_KAFKA_04: Payload thiếu userId/email -> dùng 'anonymous'/''; sự kiện không cần email (OrderCreatedEvent) bỏ qua; JSON hỏng hoặc thiếu eventType -> không ném lỗi, vẫn ack")
    void defaults_unknownType_malformed() {
        when(notificationRepository.existsByOrderIdAndEventType(anyLong(), anyString())).thenReturn(false);

        consumer.consumeOrderEvent("{\"eventType\":\"OrderCancelledEvent\",\"orderId\":30}", ack);
        consumer.consumeOrderEvent(ev("OrderCreatedEvent", 31), ack);
        assertDoesNotThrow(() -> consumer.consumeOrderEvent("{not json", ack));
        assertDoesNotThrow(() -> consumer.consumePaymentEvent("{\"orderId\":32}", ack));

        ArgumentCaptor<SendNotificationRequest> c = ArgumentCaptor.forClass(SendNotificationRequest.class);
        verify(notificationService, times(1)).sendNotification(c.capture());
        assertEquals("anonymous", c.getValue().getUserId());
        assertEquals("", c.getValue().getEmail());
        verify(ack, times(4)).acknowledge();
    }

    @Test
    @DisplayName("TC_PH7_KAFKA_05: Gửi thông báo lỗi (template không tồn tại...) -> consumer nuốt lỗi và ack để không lặp vô hạn message độc")
    void sendFailure_stillAcks() {
        when(notificationRepository.existsByOrderIdAndEventType(40L, "OrderShippedEvent")).thenReturn(false);
        doThrow(new IllegalArgumentException("Notification template not found: order_shipped_template"))
                .when(notificationService).sendNotification(any(SendNotificationRequest.class));

        assertDoesNotThrow(() -> consumer.consumeOrderEvent(ev("OrderShippedEvent", 40), ack));
        verify(ack).acknowledge();
    }
}
