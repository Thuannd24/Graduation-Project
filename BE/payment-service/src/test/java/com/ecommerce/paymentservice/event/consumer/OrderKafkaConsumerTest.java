package com.ecommerce.paymentservice.event.consumer;

import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.repository.PaymentRepository;
import com.ecommerce.paymentservice.service.PaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.Acknowledgment;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit test OrderKafkaConsumer (PH5): hoàn tiền tự động khi hủy đơn, chốt COD khi giao hàng thành công.
 */
@ExtendWith(MockitoExtension.class)
class OrderKafkaConsumerTest {

    @Mock private PaymentService paymentService;
    @Mock private PaymentRepository paymentRepository;
    @Mock private Acknowledgment ack;

    @Test
    @DisplayName("TC_PH5_COD_02: Sự kiện đơn hàng: OrderDelivered + COD PENDING -> Payment SUCCESS có paidAt; OrderDelivered với VNPay giữ nguyên; OrderCancelled (payload JSON lồng) gọi initiateAutoRefund; payload hỏng/thiếu orderId được ack bỏ qua")
    void orderEvents_codAndCancel() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        OrderKafkaConsumer consumer = new OrderKafkaConsumer(paymentService, paymentRepository, mapper);
        Payment cod = Payment.builder().id(1L).orderId(10L).paymentMethod("COD").status("PENDING").amount(new BigDecimal("300000")).build();
        Payment vnpay = Payment.builder().id(2L).orderId(11L).paymentMethod("VNPAY").status("SUCCESS").amount(new BigDecimal("300000")).build();
        when(paymentRepository.findByOrderId(10L)).thenReturn(Optional.of(cod));
        when(paymentRepository.findByOrderId(11L)).thenReturn(Optional.of(vnpay));

        consumer.consumeOrderEvent("{\"eventType\":\"OrderDeliveredEvent\",\"orderId\":10}", ack);
        consumer.consumeOrderEvent("{\"eventType\":\"OrderDeliveredEvent\",\"orderId\":11}", ack);
        consumer.consumeOrderEvent(mapper.writeValueAsString("{\"eventType\":\"OrderCancelledEvent\",\"orderId\":12}"), ack);
        consumer.consumeOrderEvent("not-json{", ack);
        consumer.consumeOrderEvent("{\"eventType\":\"OrderCancelledEvent\"}", ack);

        assertEquals("SUCCESS", cod.getStatus());
        assertNotNull(cod.getPaidAt());
        assertEquals("SUCCESS", vnpay.getStatus());
        verify(paymentRepository, times(1)).save(any());
        verify(paymentService, times(1)).initiateAutoRefund(12L);
        verify(ack, times(5)).acknowledge();
    }
}
