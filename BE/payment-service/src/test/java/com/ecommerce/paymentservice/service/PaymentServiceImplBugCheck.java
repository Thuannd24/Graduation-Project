package com.ecommerce.paymentservice.service;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.entity.Refund;
import com.ecommerce.paymentservice.repository.OutboxEventRepository;
import com.ecommerce.paymentservice.repository.PaymentRepository;
import com.ecommerce.paymentservice.repository.RefundRepository;
import com.ecommerce.paymentservice.repository.WebhookLogRepository;
import com.ecommerce.paymentservice.service.impl.PaymentServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.ecommerce.paymentservice.service.PaymentTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Bug thật ở PaymentServiceImpl. Chạy riêng: mvn -pl payment-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceImplBugCheck {

    @Mock private PaymentRepository paymentRepository;
    @Mock private RefundRepository refundRepository;
    @Mock private WebhookLogRepository webhookLogRepository;
    @Mock private OutboxEventRepository outboxEventRepository;
    @Mock private KafkaTemplate<String, String> kafkaTemplate;
    @Mock private RestTemplate restTemplate;
    @Mock private RestTemplate standardRestTemplate;
    @Mock private PlatformTransactionManager transactionManager;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private ValueOperations<String, String> valueOps;

    private PaymentServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new PaymentServiceImpl(paymentRepository, refundRepository, webhookLogRepository, outboxEventRepository,
                kafkaTemplate, new ObjectMapper(), restTemplate, standardRestTemplate, transactionManager, stringRedisTemplate);
        ReflectionTestUtils.setField(service, "vnpPayUrl", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html");
        ReflectionTestUtils.setField(service, "vnpTmnCode", TMN);
        ReflectionTestUtils.setField(service, "vnpHashSecret", SECRET);
        ReflectionTestUtils.setField(service, "vnpReturnUrl", "http://localhost:8080/api/v1/public/payments/vnpay-callback");
        ReflectionTestUtils.setField(service, "vnpQueryUrl", "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction");
        ReflectionTestUtils.setField(service, "orderServiceUrlBase", "http://order-service");
        ReflectionTestUtils.setField(service, "paymentExpiryMinutes", 15);
    }

    private void lockAvailable() {
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOps);
        lenient().when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);
    }

    private static PaymentInitiateRequest req(String method) {
        return PaymentInitiateRequest.builder().orderId(77L).userId("u1").paymentMethod(method).ipAddress("10.0.0.1").build();
    }

    @Test
    @DisplayName("TC_PH5_INIT_07: Thanh toán đơn đã giao/đã hủy (DELIVERED) phải báo lỗi trạng thái (IllegalStateException -> 409), không phải RuntimeException chung -> 500")
    void initiate_orderNotPayable_mustBeStateError() {
        lockAvailable();
        lenient().when(restTemplate.getForObject(anyString(), eq(ApiResponse.class))).thenReturn(orderSummary("DELIVERED", "u1", 500000));

        RuntimeException ex = assertThrows(RuntimeException.class, () -> service.initiatePayment(req("VNPAY")));
        assertInstanceOf(IllegalStateException.class, ex,
                "Lỗi nghiệp vụ bị bọc thành RuntimeException -> GlobalExceptionHandler trả 500: " + ex.getMessage());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH5_INIT_08: Phương thức thanh toán không hỗ trợ (MOMO) phải bị từ chối (IllegalArgumentException), không được tạo Payment và sinh URL VNPay")
    void initiate_unsupportedMethod_mustBeRejected() {
        lockAvailable();
        lenient().when(restTemplate.getForObject(anyString(), eq(ApiResponse.class))).thenReturn(orderSummary("PENDING", "u1", 500000));
        lenient().when(paymentRepository.findByOrderId(77L)).thenReturn(Optional.empty());
        lenient().when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThrows(IllegalArgumentException.class, () -> service.initiatePayment(req("MOMO")));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH5_REFUND_05: VNPay đã hoàn tiền thành công nhưng kiểm tra lại dưới khóa thất bại (admin khác vừa hoàn xong) thì vẫn phải ghi nhận Refund (tiền đã chuyển), không được mất dấu kết quả cổng")
    void refund_gatewaySucceededButRecheckFails_mustStillRecordRefund() {
        Payment snapshot = Payment.builder().id(900L).orderId(77L).userId("u1").txnRef("TXN-1").gatewayTxnId("14250001")
                .paymentMethod("VNPAY").amount(new BigDecimal("500000")).status("SUCCESS")
                .createdAt(LocalDateTime.of(2026, 10, 17, 10, 0)).paidAt(LocalDateTime.of(2026, 10, 17, 10, 5)).build();
        Payment locked = Payment.builder().id(900L).orderId(77L).userId("u1").txnRef("TXN-1")
                .paymentMethod("VNPAY").amount(new BigDecimal("500000")).status("REFUNDED").build();
        when(paymentRepository.findById(900L)).thenReturn(Optional.of(snapshot));
        when(paymentRepository.findByIdWithLock(900L)).thenReturn(Optional.of(locked));
        lenient().when(refundRepository.findByPaymentId(900L)).thenReturn(List.of());
        when(standardRestTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("vnp_ResponseCode", "00", "vnp_Message", "OK", "vnp_TransactionNo", "RF-1"));

        try {
            service.processRefund(RefundRequest.builder().paymentId(900L).amount(new BigDecimal("500000")).reason("Khách hủy").build());
        } catch (RuntimeException ignored) {
            // hành vi hiện tại: ném lỗi và bỏ kết quả cổng
        }

        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository, atLeastOnce()).save(r.capture());
        assertEquals("RF-1", r.getValue().getGatewayRefundId());
    }
}
