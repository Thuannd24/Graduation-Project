package com.ecommerce.paymentservice.service;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.entity.OutboxEvent;
import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.entity.Refund;
import com.ecommerce.paymentservice.entity.WebhookLog;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

import static com.ecommerce.paymentservice.service.PaymentTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test PaymentServiceImpl (PH5 - Thanh toán): khởi tạo thanh toán (giá từ order-service, chủ đơn, idempotent, COD),
 * IPN VNPay (chữ ký HMAC-SHA512, số tiền, trùng lặp, thanh toán muộn), hoàn tiền, tự hoàn khi hủy đơn, xem thanh toán.
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceImplTest {

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
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new PaymentServiceImpl(paymentRepository, refundRepository, webhookLogRepository, outboxEventRepository,
                kafkaTemplate, objectMapper, restTemplate, standardRestTemplate, transactionManager, stringRedisTemplate);
        ReflectionTestUtils.setField(service, "vnpPayUrl", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html");
        ReflectionTestUtils.setField(service, "vnpTmnCode", TMN);
        ReflectionTestUtils.setField(service, "vnpHashSecret", SECRET);
        ReflectionTestUtils.setField(service, "vnpReturnUrl", "http://localhost:8080/api/v1/public/payments/vnpay-callback");
        ReflectionTestUtils.setField(service, "vnpQueryUrl", "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction");
        ReflectionTestUtils.setField(service, "orderServiceUrlBase", "http://order-service");
        ReflectionTestUtils.setField(service, "paymentExpiryMinutes", 15);
    }

    /** Giả lập khóa Redis: setIfAbsent thành công và get trả lại đúng giá trị đã đặt. */
    private void lockAvailable() {
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOps);
        final String[] holder = new String[1];
        when(valueOps.setIfAbsent(eq("payment:initiate:lock:77"), anyString(), eq(Duration.ofSeconds(15)))).thenAnswer(inv -> {
            holder[0] = inv.getArgument(1);
            return true;
        });
        when(valueOps.get("payment:initiate:lock:77")).thenAnswer(inv -> holder[0]);
    }

    private void orderReturns(ApiResponse<Object> resp) {
        when(restTemplate.getForObject(eq("http://order-service/api/internal/orders/77/summary"), eq(ApiResponse.class))).thenReturn(resp);
    }

    private static PaymentInitiateRequest req(String method) {
        return PaymentInitiateRequest.builder().orderId(77L).userId("u1").email("u1@mail.com")
                .paymentMethod(method).amount(new BigDecimal("1")).ipAddress("0:0:0:0:0:0:0:1").build();
    }

    private void saveAssignsId() {
        when(paymentRepository.save(any(Payment.class))).thenAnswer(inv -> {
            Payment p = inv.getArgument(0);
            if (p.getId() == null) p.setId(900L);
            return p;
        });
    }

    private static Payment payment(String status, String method, String amount) {
        return Payment.builder().id(900L).orderId(77L).userId("u1").email("u1@mail.com").txnRef("TXN-1")
                .paymentMethod(method).amount(new BigDecimal(amount)).status(status)
                .createdAt(LocalDateTime.of(2026, 10, 17, 10, 0)).paidAt(LocalDateTime.of(2026, 10, 17, 10, 5)).build();
    }

    private List<String> outboxTypes() {
        ArgumentCaptor<OutboxEvent> c = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository, atLeast(0)).save(c.capture());
        return c.getAllValues().stream().map(OutboxEvent::getEventType).toList();
    }

    private static Map<String, String> parseQuery(String url) {
        Map<String, String> m = new LinkedHashMap<>();
        String q = url.substring(url.indexOf('?') + 1);
        for (String kv : q.split("&")) {
            int i = kv.indexOf('=');
            m.put(kv.substring(0, i), URLDecoder.decode(kv.substring(i + 1), StandardCharsets.UTF_8));
        }
        return m;
    }

    // ───────────────────────────── initiatePayment ─────────────────────────────

    @Test
    @DisplayName("TC_PH5_INIT_01: Khởi tạo VNPay: số tiền lấy từ order-service (bỏ qua số tiền client gửi), URL có vnp_Amount x100, IP IPv6 thay bằng 127.0.0.1, chữ ký HMAC-SHA512 đúng; nhả khóa Redis")
    void initiate_vnpay_success_signedUrl() throws Exception {
        lockAvailable();
        orderReturns(orderSummary("PENDING", "U1", 1130000));
        when(paymentRepository.findByOrderId(77L)).thenReturn(Optional.empty());
        saveAssignsId();

        PaymentInitiateResponse res = service.initiatePayment(req("VNPAY"));

        assertEquals(900L, res.getPaymentId());
        ArgumentCaptor<Payment> saved = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(saved.capture());
        assertEquals(0, new BigDecimal("1130000").compareTo(saved.getValue().getAmount()));
        assertEquals("PENDING", saved.getValue().getStatus());
        assertEquals(res.getTxnRef(), saved.getValue().getTxnRef());

        Map<String, String> q = parseQuery(res.getRedirectUrl());
        assertTrue(res.getRedirectUrl().startsWith("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?"));
        assertEquals("113000000", q.get("vnp_Amount"));
        assertEquals(res.getTxnRef(), q.get("vnp_TxnRef"));
        assertEquals("127.0.0.1", q.get("vnp_IpAddr"));
        assertEquals(TMN, q.get("vnp_TmnCode"));
        assertEquals("Thanh toan don hang 77", q.get("vnp_OrderInfo"));
        assertEquals(hmacSha512(SECRET, signData(q)), q.get("vnp_SecureHash"));
        verify(stringRedisTemplate).delete("payment:initiate:lock:77");
        verifyNoInteractions(outboxEventRepository);
    }

    @Test
    @DisplayName("TC_PH5_INIT_02: Đang có yêu cầu khởi tạo khác cho cùng đơn (khóa Redis bị giữ) -> IllegalStateException, không gọi order-service")
    void initiate_lockHeld_rejected() {
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOps);
        when(valueOps.setIfAbsent(eq("payment:initiate:lock:77"), anyString(), any(Duration.class))).thenReturn(false);

        assertThrows(IllegalStateException.class, () -> service.initiatePayment(req("VNPAY")));
        verifyNoInteractions(restTemplate, paymentRepository);
        verify(stringRedisTemplate, never()).delete(anyString());
    }

    @Test
    @DisplayName("TC_PH5_INIT_03: Thanh toán đơn của người khác -> IllegalArgumentException 'Access Denied', không tạo Payment; khóa vẫn được nhả")
    void initiate_otherUsersOrder_denied() {
        lockAvailable();
        orderReturns(orderSummary("PENDING", "owner-9", 500000));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.initiatePayment(req("VNPAY")));
        assertTrue(ex.getMessage().contains("Access Denied"));
        verify(paymentRepository, never()).save(any());
        verify(stringRedisTemplate).delete("payment:initiate:lock:77");
    }

    @Test
    @DisplayName("TC_PH5_INIT_04: order-service lỗi/trả code khác SUCCESS hoặc thiếu finalAmount -> 'Order verification failed', không tạo Payment")
    void initiate_orderServiceErrors() {
        lockAvailable();
        when(restTemplate.getForObject(anyString(), eq(ApiResponse.class)))
                .thenReturn(ApiResponse.error("NOT_FOUND", "x"))
                .thenReturn(orderSummary("PENDING", "u1", null))
                .thenThrow(new org.springframework.web.client.ResourceAccessException("timeout"));

        for (int i = 0; i < 3; i++) {
            RuntimeException ex = assertThrows(RuntimeException.class, () -> service.initiatePayment(req("VNPAY")));
            assertTrue(ex.getMessage().startsWith("Order verification failed"));
        }
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH5_INIT_05: Đơn đã có Payment SUCCESS hoặc REFUNDED thì không cho thanh toán lại (IllegalStateException)")
    void initiate_alreadyPaidOrRefunded() {
        lockAvailable();
        orderReturns(orderSummary("AWAITING_PAYMENT", "u1", 500000));
        when(paymentRepository.findByOrderId(77L))
                .thenReturn(Optional.of(payment("SUCCESS", "VNPAY", "500000")))
                .thenReturn(Optional.of(payment("REFUNDED", "VNPAY", "500000")));

        IllegalStateException e1 = assertThrows(IllegalStateException.class, () -> service.initiatePayment(req("VNPAY")));
        IllegalStateException e2 = assertThrows(IllegalStateException.class, () -> service.initiatePayment(req("VNPAY")));
        assertTrue(e1.getMessage().contains("already been successfully completed"));
        assertTrue(e2.getMessage().contains("refunded"));
        verify(paymentRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH5_INIT_06: Payment cũ FAILED được tái sử dụng (không tạo bản ghi trùng): đổi txnRef mới, về PENDING, xóa failureCode/gatewayTxnId, cập nhật số tiền")
    void initiate_reusesFailedPayment() {
        lockAvailable();
        orderReturns(orderSummary("PENDING", "u1", "750000"));
        Payment old = payment("FAILED", "VNPAY", "700000");
        old.setFailureCode("24");
        old.setGatewayTxnId("OLD-1");
        when(paymentRepository.findByOrderId(77L)).thenReturn(Optional.of(old));
        // Trong transaction, bản ghi được đọc lại có khóa để không ghi đè SUCCESS do IPN vừa ghi.
        when(paymentRepository.findByOrderIdWithLock(77L)).thenReturn(Optional.of(old));
        saveAssignsId();

        PaymentInitiateResponse res = service.initiatePayment(req("VNPAY"));

        assertEquals(900L, res.getPaymentId());
        assertSame(old, captureSaved());
        assertEquals("PENDING", old.getStatus());
        assertNotEquals("TXN-1", old.getTxnRef());
        assertEquals(res.getTxnRef(), old.getTxnRef());
        assertNull(old.getFailureCode());
        assertNull(old.getGatewayTxnId());
        assertEquals(0, new BigDecimal("750000").compareTo(old.getAmount()));
    }

    private Payment captureSaved() {
        ArgumentCaptor<Payment> c = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository, atLeastOnce()).save(c.capture());
        return c.getValue();
    }

    @Test
    @DisplayName("TC_PH5_COD_01: Thanh toán COD: không có URL chuyển hướng, Payment PENDING chờ giao hàng, ghi outbox PaymentCODConfirmedEvent")
    void initiate_cod() throws Exception {
        lockAvailable();
        orderReturns(orderSummary("PENDING", "u1", 300000));
        when(paymentRepository.findByOrderId(77L)).thenReturn(Optional.empty());
        saveAssignsId();

        PaymentInitiateResponse res = service.initiatePayment(req("cod"));

        assertEquals("", res.getRedirectUrl());
        assertEquals("PENDING", captureSaved().getStatus());
        ArgumentCaptor<OutboxEvent> ob = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(ob.capture());
        assertEquals("PaymentCODConfirmedEvent", ob.getValue().getEventType());
        assertEquals("Payment", ob.getValue().getAggregateType());
        Map<?, ?> payload = objectMapper.readValue(ob.getValue().getPayload(), Map.class);
        assertEquals(77, payload.get("orderId"));
        assertEquals("u1", payload.get("userId"));
    }

    // ───────────────────────────── VNPay callback (IPN) ─────────────────────────────

    @Test
    @DisplayName("TC_PH5_IPN_01: IPN hợp lệ (chữ ký đúng, số tiền khớp, mã 00) -> Payment SUCCESS, lưu mã GD VNPay, ghi webhook log hợp lệ, outbox PaymentSuccessEvent, trả RspCode 00")
    void callback_success() throws Exception {
        Payment p = payment("PENDING", "VNPAY", "1130000");
        p.setPaidAt(null);
        when(paymentRepository.findByTxnRefWithLock("TXN-1")).thenReturn(Optional.of(p));

        String rsp = service.verifyVnPayCallback(signedCallback("TXN-1", 1130000, "00"));

        assertEquals("00", rsp);
        assertEquals("SUCCESS", p.getStatus());
        assertNotNull(p.getPaidAt());
        assertEquals("14250001", p.getGatewayTxnId());
        assertEquals(List.of("PaymentSuccessEvent"), outboxTypes());
        ArgumentCaptor<WebhookLog> wl = ArgumentCaptor.forClass(WebhookLog.class);
        verify(webhookLogRepository).save(wl.capture());
        assertTrue(wl.getValue().getSignatureValid());
        assertTrue(wl.getValue().getProcessed());
    }

    @Test
    @DisplayName("TC_PH5_IPN_02: Thiếu chữ ký, chữ ký sai secret, hoặc tham số bị sửa sau khi ký -> RspCode 97, không đọc/cập nhật Payment, log signatureValid=false")
    void callback_badSignature() throws Exception {
        Map<String, String> noHash = signedCallback("TXN-1", 100000, "00");
        noHash.remove("vnp_SecureHash");
        Map<String, String> wrongSecret = signedCallback("TXN-1", 100000, "00");
        wrongSecret.put("vnp_SecureHash", hmacSha512("OTHER-SECRET", signData(wrongSecret)));
        Map<String, String> tampered = signedCallback("TXN-1", 100000, "00");
        tampered.put("vnp_Amount", "100");

        assertEquals("97", service.verifyVnPayCallback(noHash));
        assertEquals("97", service.verifyVnPayCallback(wrongSecret));
        assertEquals("97", service.verifyVnPayCallback(tampered));

        verifyNoInteractions(paymentRepository, outboxEventRepository);
        ArgumentCaptor<WebhookLog> wl = ArgumentCaptor.forClass(WebhookLog.class);
        verify(webhookLogRepository, times(3)).save(wl.capture());
        assertTrue(wl.getAllValues().stream().noneMatch(WebhookLog::getSignatureValid));
    }

    @Test
    @DisplayName("TC_PH5_IPN_03: Chữ ký đúng nhưng txnRef không tồn tại -> RspCode 01 (Order not found)")
    void callback_unknownTxnRef() throws Exception {
        when(paymentRepository.findByTxnRefWithLock("NOPE")).thenReturn(Optional.empty());

        assertEquals("01", service.verifyVnPayCallback(signedCallback("NOPE", 100000, "00")));
        verify(paymentRepository, never()).save(any());
        verifyNoInteractions(outboxEventRepository);
    }

    @Test
    @DisplayName("TC_PH5_IPN_06: Khách đã bấm thanh toán lại (txnRef mới) nhưng vẫn trả ở trang VNPay cũ -> IPN mã cũ được nhận là giao dịch thành công, không bị bỏ qua")
    void callback_supersededAttemptPaid_isAdopted() throws Exception {
        Payment p = payment("PENDING", "VNPAY", "1130000");
        p.setTxnRef("TXN-NEW");
        p.setPreviousTxnRefs("TXN-OLD");
        p.setPaidAt(null);
        when(paymentRepository.findByTxnRefWithLock("TXN-OLD")).thenReturn(Optional.empty());
        when(paymentRepository.findBySupersededTxnRefWithLock("TXN-OLD")).thenReturn(Optional.of(p));

        assertEquals("00", service.verifyVnPayCallback(signedCallback("TXN-OLD", 1130000, "00")));

        assertEquals("SUCCESS", p.getStatus());
        assertEquals("TXN-OLD", p.getTxnRef());
        assertEquals("TXN-NEW", p.getPreviousTxnRefs());
        assertEquals(List.of("PaymentSuccessEvent"), outboxTypes());
    }

    @Test
    @DisplayName("TC_PH5_IPN_07: Đơn đã thanh toán bằng lượt khác mà lượt VNPay cũ cũng bị trừ tiền -> tạo yêu cầu hoàn tiền thủ công, không đổi trạng thái thanh toán")
    void callback_supersededAttemptPaidTwice_createsManualRefund() throws Exception {
        Payment p = payment("SUCCESS", "VNPAY", "1130000");
        p.setTxnRef("TXN-NEW");
        p.setPreviousTxnRefs("TXN-OLD");
        when(paymentRepository.findByTxnRefWithLock("TXN-OLD")).thenReturn(Optional.empty());
        when(paymentRepository.findBySupersededTxnRefWithLock("TXN-OLD")).thenReturn(Optional.of(p));

        assertEquals("00", service.verifyVnPayCallback(signedCallback("TXN-OLD", 1130000, "00")));

        assertEquals("SUCCESS", p.getStatus());
        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository).save(r.capture());
        assertEquals("PENDING_MANUAL", r.getValue().getStatus());
        assertEquals(0, new BigDecimal("1130000").compareTo(r.getValue().getRefundAmount()));
        verifyNoInteractions(outboxEventRepository);
    }

    @Test
    @DisplayName("TC_PH5_IPN_04:Số tiền IPN lệch với Payment (thiếu 1đ) -> RspCode 04, trạng thái giữ PENDING, không phát sự kiện")
    void callback_amountMismatch() throws Exception {
        Payment p = payment("PENDING", "VNPAY", "1130000");
        when(paymentRepository.findByTxnRefWithLock("TXN-1")).thenReturn(Optional.of(p));

        assertEquals("04", service.verifyVnPayCallback(signedCallback("TXN-1", 1129999, "00")));
        assertEquals("PENDING", p.getStatus());
        verify(paymentRepository, never()).save(any());
        verifyNoInteractions(outboxEventRepository);
    }

    @Test
    @DisplayName("TC_PH5_IPN_05: VNPay báo giao dịch thất bại (mã 24 - khách hủy) -> Payment FAILED, failureCode=24, outbox PaymentFailedEvent, vẫn trả RspCode 00 (đã xử lý)")
    void callback_paymentFailed() throws Exception {
        Payment p = payment("PENDING", "VNPAY", "500000");
        when(paymentRepository.findByTxnRefWithLock("TXN-1")).thenReturn(Optional.of(p));

        assertEquals("00", service.verifyVnPayCallback(signedCallback("TXN-1", 500000, "24")));
        assertEquals("FAILED", p.getStatus());
        assertEquals("24", p.getFailureCode());
        assertEquals(List.of("PaymentFailedEvent"), outboxTypes());
    }

    @Test
    @DisplayName("TC_PH5_IPN_06: IPN lặp lại cho Payment đã SUCCESS -> RspCode 02, không đổi trạng thái, không phát sự kiện lần 2")
    void callback_duplicate() throws Exception {
        Payment p = payment("SUCCESS", "VNPAY", "500000");
        when(paymentRepository.findByTxnRefWithLock("TXN-1")).thenReturn(Optional.of(p));

        assertEquals("02", service.verifyVnPayCallback(signedCallback("TXN-1", 500000, "00")));
        assertEquals("SUCCESS", p.getStatus());
        verify(paymentRepository, never()).save(any());
        verifyNoInteractions(outboxEventRepository, refundRepository);
    }

    @Test
    @DisplayName("TC_PH5_IPN_07: Tiền về muộn (mã 00) cho Payment đã EXPIRED -> REFUND_PENDING và tạo Refund PENDING đủ số tiền để hoàn cho khách; trả 00")
    void callback_latePayment_autoRefund() throws Exception {
        Payment p = payment("EXPIRED", "VNPAY", "500000");
        when(paymentRepository.findByTxnRefWithLock("TXN-1")).thenReturn(Optional.of(p));

        assertEquals("00", service.verifyVnPayCallback(signedCallback("TXN-1", 500000, "00")));
        assertEquals("REFUND_PENDING", p.getStatus());
        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository).save(r.capture());
        assertEquals(0, new BigDecimal("500000").compareTo(r.getValue().getRefundAmount()));
        assertEquals("PENDING", r.getValue().getStatus());
        assertEquals(900L, r.getValue().getPaymentId());
        verifyNoInteractions(outboxEventRepository);
    }

    // ───────────────────────────── processRefund ─────────────────────────────

    @Test
    @DisplayName("TC_PH5_REFUND_01: Hoàn một phần đơn COD (đã hoàn 300.000/1.000.000, hoàn thêm 200.000) -> Refund SUCCESS, Payment PARTIALLY_REFUNDED, outbox RefundCompletedEvent; không gọi cổng")
    void refund_cod_partial() {
        Payment p = payment("SUCCESS", "COD", "1000000");
        when(paymentRepository.findById(900L)).thenReturn(Optional.of(p));
        when(paymentRepository.findByIdWithLock(900L)).thenReturn(Optional.of(p));
        when(refundRepository.findByPaymentId(900L)).thenReturn(List.of(
                Refund.builder().id(1L).paymentId(900L).refundAmount(new BigDecimal("300000")).status("SUCCESS").build(),
                Refund.builder().id(2L).paymentId(900L).refundAmount(new BigDecimal("999999")).status("PENDING_MANUAL").build()));

        service.processRefund(RefundRequest.builder().paymentId(900L).amount(new BigDecimal("200000")).reason("Thiếu phụ kiện").build());

        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository).save(r.capture());
        assertEquals("SUCCESS", r.getValue().getStatus());
        assertNotNull(r.getValue().getCompletedAt());
        assertEquals("PARTIALLY_REFUNDED", p.getStatus());
        assertEquals(List.of("RefundCompletedEvent"), outboxTypes());
        verifyNoInteractions(standardRestTemplate);
    }

    @Test
    @DisplayName("TC_PH5_REFUND_02: Từ chối hoàn tiền: vượt số còn lại (còn 700.000, yêu cầu 700.001), số tiền 0/âm/null, Payment chưa SUCCESS (PENDING) hoặc không tồn tại")
    void refund_validation() {
        Payment p = payment("SUCCESS", "VNPAY", "1000000");
        when(paymentRepository.findById(900L)).thenReturn(Optional.of(p));
        when(paymentRepository.findById(901L)).thenReturn(Optional.of(payment("PENDING", "VNPAY", "1000000")));
        when(paymentRepository.findById(902L)).thenReturn(Optional.empty());
        when(refundRepository.findByPaymentId(900L)).thenReturn(List.of(
                Refund.builder().id(1L).refundAmount(new BigDecimal("300000")).status("SUCCESS").build()));

        IllegalArgumentException over = assertThrows(IllegalArgumentException.class, () -> service.processRefund(
                RefundRequest.builder().paymentId(900L).amount(new BigDecimal("700001")).reason("x").build()));
        assertTrue(over.getMessage().contains("exceeds remaining refundable amount (700000)"));
        assertThrows(IllegalArgumentException.class, () -> service.processRefund(
                RefundRequest.builder().paymentId(900L).amount(BigDecimal.ZERO).reason("x").build()));
        assertThrows(IllegalArgumentException.class, () -> service.processRefund(
                RefundRequest.builder().paymentId(900L).amount(new BigDecimal("-5")).reason("x").build()));
        assertThrows(IllegalArgumentException.class, () -> service.processRefund(
                RefundRequest.builder().paymentId(900L).amount(null).reason("x").build()));
        RuntimeException st = assertThrows(RuntimeException.class, () -> service.processRefund(
                RefundRequest.builder().paymentId(901L).amount(BigDecimal.TEN).reason("x").build()));
        assertTrue(st.getMessage().contains("Cannot refund payment in status: PENDING"));
        assertThrows(RuntimeException.class, () -> service.processRefund(
                RefundRequest.builder().paymentId(902L).amount(BigDecimal.TEN).reason("x").build()));

        verifyNoInteractions(standardRestTemplate);
        verify(refundRepository, never()).save(any());
        assertEquals("SUCCESS", p.getStatus());
    }

    @Test
    @DisplayName("TC_PH5_REFUND_03: Hoàn toàn bộ đơn VNPay thành công: gửi transactionType=02, số tiền x100, chữ ký; Refund SUCCESS lưu mã GD hoàn, Payment REFUNDED")
    @SuppressWarnings("unchecked")
    void refund_vnpay_full_success() throws Exception {
        Payment p = payment("SUCCESS", "VNPAY", "500000");
        p.setGatewayTxnId("14250001");
        when(paymentRepository.findById(900L)).thenReturn(Optional.of(p));
        when(paymentRepository.findByIdWithLock(900L)).thenReturn(Optional.of(p));
        when(refundRepository.findByPaymentId(900L)).thenReturn(List.of());
        when(standardRestTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("vnp_ResponseCode", "00", "vnp_Message", "OK", "vnp_TransactionNo", "RF-778"));

        service.processRefund(RefundRequest.builder().paymentId(900L).amount(new BigDecimal("500000")).reason("Khách hủy").build());

        ArgumentCaptor<Object> body = ArgumentCaptor.forClass(Object.class);
        verify(standardRestTemplate).postForObject(anyString(), body.capture(), eq(Map.class));
        Map<String, Object> b = (Map<String, Object>) body.getValue();
        assertEquals("02", b.get("vnp_TransactionType"));
        assertEquals("50000000", b.get("vnp_Amount"));
        assertEquals("14250001", b.get("vnp_TransactionNo"));
        assertEquals("20261017100500", b.get("vnp_TransactionDate"));
        String hashData = b.get("vnp_RequestId") + "|2.1.0|refund|" + TMN + "|02|TXN-1|50000000|14250001|20261017100500|admin|"
                + b.get("vnp_CreateDate") + "|127.0.0.1|Hoan tien don hang 77";
        assertEquals(hmacSha512(SECRET, hashData), b.get("vnp_SecureHash"));

        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository).save(r.capture());
        assertEquals("SUCCESS", r.getValue().getStatus());
        assertEquals("RF-778", r.getValue().getGatewayRefundId());
        assertEquals("REFUNDED", p.getStatus());
        assertEquals(List.of("RefundCompletedEvent"), outboxTypes());
    }

    @Test
    @DisplayName("TC_PH5_REFUND_04: VNPay từ chối hoàn (94) -> Refund PENDING_MANUAL; lỗi tạm thời (99) hoặc exception mạng -> Refund PENDING để scheduler thử lại; Payment giữ SUCCESS, không phát RefundCompleted")
    void refund_vnpay_rejected_or_retryable() {
        Payment p = payment("SUCCESS", "VNPAY", "500000");
        when(paymentRepository.findById(900L)).thenReturn(Optional.of(p));
        when(paymentRepository.findByIdWithLock(900L)).thenReturn(Optional.of(p));
        when(refundRepository.findByPaymentId(900L)).thenReturn(List.of());
        when(standardRestTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("vnp_ResponseCode", "94", "vnp_Message", "Duplicate request"))
                .thenReturn(Map.of("vnp_ResponseCode", "99", "vnp_Message", "Unknown"))
                .thenThrow(new org.springframework.web.client.ResourceAccessException("Read timed out"));

        RefundRequest rq = RefundRequest.builder().paymentId(900L).amount(new BigDecimal("100000")).reason("Lỗi SP").build();
        service.processRefund(rq);
        service.processRefund(rq);
        service.processRefund(rq);

        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository, times(3)).save(r.capture());
        assertEquals("PENDING_MANUAL", r.getAllValues().get(0).getStatus());
        assertTrue(r.getAllValues().get(0).getReason().contains("Needs manual review"));
        assertEquals("PENDING", r.getAllValues().get(1).getStatus());
        assertEquals("PENDING", r.getAllValues().get(2).getStatus());
        assertEquals("SUCCESS", p.getStatus());
        verifyNoInteractions(outboxEventRepository);
    }

    // ───────────────────────────── initiateAutoRefund / xem thanh toán ─────────────────────────────

    @Test
    @DisplayName("TC_PH5_AUTO_01: Hủy đơn đã thanh toán (SUCCESS) -> REFUND_PENDING + Refund PENDING đủ tiền; gọi lặp lại khi đã có Refund thì bỏ qua (không tạo trùng)")
    void autoRefund_successPayment_idempotent() {
        Payment p = payment("SUCCESS", "VNPAY", "650000");
        when(paymentRepository.findByOrderIdWithLock(77L)).thenReturn(Optional.of(p));

        service.initiateAutoRefund(77L);

        assertEquals("REFUND_PENDING", p.getStatus());
        ArgumentCaptor<Refund> r = ArgumentCaptor.forClass(Refund.class);
        verify(refundRepository).save(r.capture());
        assertEquals(0, new BigDecimal("650000").compareTo(r.getValue().getRefundAmount()));
        assertEquals("PENDING", r.getValue().getStatus());

        // lần 2: đã có yêu cầu hoàn đủ số tiền -> không tạo thêm
        Payment again = payment("SUCCESS", "VNPAY", "650000");
        when(paymentRepository.findByOrderIdWithLock(78L)).thenReturn(Optional.of(again));
        when(refundRepository.findByPaymentId(900L)).thenReturn(java.util.List.of(
                Refund.builder().paymentId(900L).refundAmount(new BigDecimal("650000")).status("PENDING").build()));
        service.initiateAutoRefund(78L);
        assertEquals("SUCCESS", again.getStatus());
        verify(refundRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("TC_PH5_AUTO_02: Hủy đơn chưa thanh toán (PENDING) -> Payment FAILED mã ORDER_CANCELLED; Payment REFUNDED giữ nguyên; không có Payment thì bỏ qua")
    void autoRefund_otherStatuses() {
        Payment pending = payment("PENDING", "VNPAY", "100000");
        Payment refunded = payment("REFUNDED", "VNPAY", "100000");
        when(paymentRepository.findByOrderIdWithLock(1L)).thenReturn(Optional.of(pending));
        when(paymentRepository.findByOrderIdWithLock(2L)).thenReturn(Optional.of(refunded));
        when(paymentRepository.findByOrderIdWithLock(3L)).thenReturn(Optional.empty());

        service.initiateAutoRefund(1L);
        service.initiateAutoRefund(2L);
        service.initiateAutoRefund(3L);

        assertEquals("FAILED", pending.getStatus());
        assertEquals("ORDER_CANCELLED", pending.getFailureCode());
        assertEquals("REFUNDED", refunded.getStatus());
        verify(paymentRepository, times(1)).save(any());
        verifyNoInteractions(refundRepository);
    }

    @Test
    @DisplayName("TC_PH5_OWNER_01: Xem thanh toán theo đơn: khách khác -> AccessDeniedException (chống IDOR); chủ đơn (không phân biệt hoa thường) và admin xem được; đơn chưa có Payment -> IllegalArgumentException")
    void getPaymentByOrderId_ownership() {
        when(paymentRepository.findByOrderId(77L)).thenReturn(Optional.of(payment("SUCCESS", "VNPAY", "100000")));
        when(paymentRepository.findByOrderId(404L)).thenReturn(Optional.empty());

        assertThrows(AccessDeniedException.class, () -> service.getPaymentByOrderId(77L, "intruder", false));
        assertThrows(AccessDeniedException.class, () -> service.getPaymentByOrderId(77L, null, false));
        PaymentResponse own = service.getPaymentByOrderId(77L, "U1", false);
        assertEquals("TXN-1", own.getTransactionNo());
        assertEquals("SUCCESS", service.getPaymentByOrderId(77L, "admin-1", true).getStatus());
        assertThrows(IllegalArgumentException.class, () -> service.getPaymentByOrderId(404L, "u1", false));
    }
}
