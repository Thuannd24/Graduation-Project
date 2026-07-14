package com.ecommerce.paymentservice.service.impl;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.entity.Refund;
import com.ecommerce.paymentservice.entity.WebhookLog;
import com.ecommerce.paymentservice.entity.OutboxEvent;
import com.ecommerce.paymentservice.repository.PaymentRepository;
import com.ecommerce.paymentservice.repository.RefundRepository;
import com.ecommerce.paymentservice.repository.WebhookLogRepository;
import com.ecommerce.paymentservice.repository.OutboxEventRepository;
import com.ecommerce.paymentservice.service.PaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.client.RestTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentServiceImpl implements PaymentService {

    private final PaymentRepository paymentRepository;
    private final RefundRepository refundRepository;
    private final WebhookLogRepository webhookLogRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final RestTemplate standardRestTemplate;
    private final PlatformTransactionManager transactionManager;
    private final org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;

    private static final java.time.Duration PAYMENT_LOCK_TTL = java.time.Duration.ofSeconds(15);

    @Value("${vnpay.pay-url}")
    private String vnpPayUrl;

    @Value("${vnpay.tmn-code}")
    private String vnpTmnCode;

    @Value("${vnpay.hash-secret}")
    private String vnpHashSecret;

    @Value("${vnpay.return-url}")
    private String vnpReturnUrl;

    @Value("${vnpay.expiry-hours:1}")
    private int vnpayExpiryHours;

    @Value("${vnpay.query-url:https://sandbox.vnpayment.vn/merchant_webapi/api/transaction}")
    private String vnpQueryUrl;

    @Value("${app.order-service-url:http://order-service}")
    private String orderServiceUrlBase;

    @Value("${app.payment-expiry-minutes:15}")
    private int paymentExpiryMinutes;

    @Value("${app.kafka.payment-topic:payment-events}")
    private String paymentTopic;

    private static final String GATEWAY_VNPAY = "VNPAY";
    private static final String METHOD_COD = "COD";
    private static final String DEFAULT_IP_FALLBACK = "127.0.0.1";

    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_SUCCESS = "SUCCESS";
    private static final String STATUS_FAILED = "FAILED";
    private static final String STATUS_REFUNDED = "REFUNDED";
    private static final String STATUS_PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED";
    private static final String STATUS_EXPIRED = "EXPIRED";
    private static final String STATUS_REFUND_PENDING = "REFUND_PENDING";
    // Refund.status: VNPAY rejected the refund or a non-retryable error occurred - needs a human to look at it.
    // Kept distinct from STATUS_PENDING so the automatic scheduler retry loop does not spin on it forever.
    private static final String REFUND_STATUS_PENDING_MANUAL = "PENDING_MANUAL";

    @Override
    public PaymentInitiateResponse initiatePayment(PaymentInitiateRequest request) {
        // BUG-03 FIX: Use Redis distributed lock instead of JVM-local
        // ConcurrentHashMap.
        // ConcurrentHashMap only works within a single JVM; with multiple
        // payment-service
        // instances, two concurrent requests could both pass and create duplicate
        // Payment records.
        String payLockKey = "payment:initiate:lock:" + request.getOrderId();
        String lockValue = UUID.randomUUID().toString();
        Boolean acquired = stringRedisTemplate.opsForValue()
                .setIfAbsent(payLockKey, lockValue, PAYMENT_LOCK_TTL);

        if (!Boolean.TRUE.equals(acquired)) {
            throw new IllegalStateException(
                    "Payment initiation already in progress for order " + request.getOrderId() + ". Please try again.");
        }

        try {
            // STEP 1: Fetch order details from order-service to verify status and retrieve
            // correct payment amount (prevent price tampering). This is a network call and must
            // run OUTSIDE any DB transaction (V-01/V-11 pattern) so a slow/stalled order-service
            // never holds a payment-service DB connection open.
            String orderServiceUrl = orderServiceUrlBase + "/api/internal/orders/" + request.getOrderId()
                    + "/summary";
            try {
                ApiResponse<?> orderApiResponse = restTemplate
                        .getForObject(orderServiceUrl, ApiResponse.class);

                if (orderApiResponse == null || !"SUCCESS".equalsIgnoreCase(orderApiResponse.getCode())
                        || orderApiResponse.getData() == null) {
                    throw new RuntimeException("Failed to retrieve order details from order-service");
                }

                Map<?, ?> orderData = (Map<?, ?>) orderApiResponse.getData();
                String orderStatus = (String) orderData.get("status");
                String orderUserId = (String) orderData.get("userId");

                // SECURITY CHECK: Verify that the order actually belongs to the user initiating
                // the payment
                if (orderUserId != null && !orderUserId.equalsIgnoreCase(request.getUserId())) {
                    throw new IllegalArgumentException(
                            "Access Denied: This order does not belong to the authenticated user.");
                }

                // Only allow payment for PENDING or AWAITING_PAYMENT orders
                if (!"PENDING".equalsIgnoreCase(orderStatus) && !"AWAITING_PAYMENT".equalsIgnoreCase(orderStatus)) {
                    throw new RuntimeException("Cannot pay for order in status: " + orderStatus);
                }

                Object finalAmountObj = orderData.get("finalAmount");
                if (finalAmountObj == null) {
                    throw new RuntimeException("Order final amount is null");
                }

                BigDecimal verifiedAmount;
                if (finalAmountObj instanceof Number) {
                    verifiedAmount = BigDecimal.valueOf(((Number) finalAmountObj).doubleValue());
                } else {
                    verifiedAmount = new BigDecimal(finalAmountObj.toString());
                }

                request.setAmount(verifiedAmount);
            } catch (IllegalArgumentException e) {
                log.error("Security violation for Order ID: {} by User ID: {}", request.getOrderId(),
                        request.getUserId());
                throw e;
            } catch (Exception e) {
                log.error("Failed to verify order with order-service. Order ID: {}", request.getOrderId(), e);
                throw new RuntimeException("Order verification failed: " + e.getMessage());
            }

            // STEP 2: Short DB transaction - idempotency check, persist Payment, build the VNPAY
            // redirect URL (no network calls inside).
            TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
            return transactionTemplate.execute(status -> {
                String txnRef = UUID.randomUUID().toString();

                // IDEMPOTENCY / REUSE CHECK: Check if a payment record already exists for this
                // order
                Payment payment;
                Optional<Payment> existingPaymentOpt = paymentRepository.findByOrderId(request.getOrderId());
                if (existingPaymentOpt.isPresent()) {
                    Payment existingPayment = existingPaymentOpt.get();
                    String currentStatus = existingPayment.getStatus();

                    if (STATUS_SUCCESS.equalsIgnoreCase(currentStatus)) {
                        throw new IllegalStateException(
                                "Payment has already been successfully completed for this order.");
                    }
                    if (STATUS_REFUNDED.equalsIgnoreCase(currentStatus)) {
                        throw new IllegalStateException("Payment has already been refunded for this order.");
                    }

                    // If the payment is PENDING or FAILED, reuse the existing record instead of
                    // creating duplicates
                    payment = existingPayment;
                    payment.setPaymentMethod(request.getPaymentMethod());
                    payment.setAmount(request.getAmount());
                    payment.setTxnRef(txnRef);
                    payment.setStatus(STATUS_PENDING);
                    payment.setFailureCode(null);
                    payment.setGatewayResponse(null);
                    payment.setGatewayTxnId(null);
                } else {
                    payment = Payment.builder()
                            .orderId(request.getOrderId())
                            .userId(request.getUserId())
                            .email(request.getEmail())
                            .txnRef(txnRef)
                            .paymentMethod(request.getPaymentMethod())
                            .amount(request.getAmount())
                            .status(STATUS_PENDING)
                            .build();
                }

                payment = paymentRepository.save(payment);

                if (METHOD_COD.equalsIgnoreCase(request.getPaymentMethod())) {
                    // Cash on delivery - initially pending, will complete on delivery
                    payment.setStatus(STATUS_PENDING);
                    paymentRepository.save(payment);

                    publishPaymentEvent("PaymentCODConfirmedEvent", payment, payment.getAmount(),
                            "COD payment pending delivery");

                    return PaymentInitiateResponse.builder()
                            .paymentId(payment.getId())
                            .txnRef(txnRef)
                            .redirectUrl("")
                            .build();
                }

                // VNPAY Link Construction
                String redirectUrl = buildVnPayUrl(payment, txnRef, request.getIpAddress());

                return PaymentInitiateResponse.builder()
                        .paymentId(payment.getId())
                        .txnRef(txnRef)
                        .redirectUrl(redirectUrl)
                        .build();
            });
        } finally {
            // Release Redis lock — only if we still own it (prevents removing a lock
            // re-acquired by another request after TTL expiry)
            String currentVal = stringRedisTemplate.opsForValue().get(payLockKey);
            if (lockValue.equals(currentVal)) {
                stringRedisTemplate.delete(payLockKey);
            }
        }
    }

    @Override
    @Transactional
    public String verifyVnPayCallback(Map<String, String> queryParams) {
        log.info("Received VNPAY callback parameters: {}", queryParams);

        String rawParamsJson = "";
        try {
            rawParamsJson = objectMapper.writeValueAsString(queryParams);
        } catch (Exception e) {
            log.error("Failed serialization of query params for logging: {}", e.getMessage());
        }

        String secureHash = queryParams.get("vnp_SecureHash");
        if (secureHash == null) {
            saveWebhookLog(rawParamsJson, false, false);
            return "97"; // Signature fail
        }

        // Calculate SecureHash
        Map<String, String> fields = new TreeMap<>();
        for (Map.Entry<String, String> entry : queryParams.entrySet()) {
            if (entry.getKey() != null && entry.getKey().startsWith("vnp_") && !entry.getKey().equals("vnp_SecureHash")
                    && !entry.getKey().equals("vnp_SecureHashType")) {
                if (entry.getValue() != null && !entry.getValue().isEmpty()) {
                    fields.put(entry.getKey(), entry.getValue());
                }
            }
        }

        StringBuilder signData = new StringBuilder();
        Iterator<Map.Entry<String, String>> itr = fields.entrySet().iterator();
        while (itr.hasNext()) {
            Map.Entry<String, String> entry = itr.next();
            signData.append(entry.getKey());
            signData.append('=');
            // Spring URL-decodes params; re-encode to match VNPay's server-side hash computation
            signData.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
            if (itr.hasNext()) {
                signData.append('&');
            }
        }

        String computedHash = hmacSha512(vnpHashSecret, signData.toString());
        boolean signatureValid = computedHash.equalsIgnoreCase(secureHash);

        if (!signatureValid) {
            log.warn("VNPAY signature mismatch. SecureHash={}, Computed={}", secureHash, computedHash);
            saveWebhookLog(rawParamsJson, false, false);
            return "97"; // Signature mismatch
        }

        String txnRef = queryParams.get("vnp_TxnRef");
        Payment payment = paymentRepository.findByTxnRefWithLock(txnRef)
                .orElse(null);

        if (payment == null) {
            saveWebhookLog(rawParamsJson, true, false);
            return "01"; // Order not found
        }

        // Validate amount to prevent price tampering
        String amountStr = queryParams.get("vnp_Amount");
        if (amountStr == null) {
            saveWebhookLog(rawParamsJson, true, false);
            return "04"; // Invalid amount
        }
        try {
            long callbackAmountCents = Long.parseLong(amountStr);
            long expectedAmountCents = payment.getAmount().multiply(BigDecimal.valueOf(100)).longValue();
            if (callbackAmountCents != expectedAmountCents) {
                log.warn("VNPAY payment amount mismatch. Expected (cents): {}, Received: {}", expectedAmountCents,
                        callbackAmountCents);
                saveWebhookLog(rawParamsJson, true, false);
                return "04"; // Invalid amount
            }
        } catch (NumberFormatException e) {
            log.error("Failed to parse vnp_Amount: {}", amountStr);
            saveWebhookLog(rawParamsJson, true, false);
            return "04"; // Invalid amount
        }

        String responseCode = queryParams.get("vnp_ResponseCode");
        payment.setGatewayTxnId(queryParams.get("vnp_TransactionNo"));
        payment.setGatewayResponse(rawParamsJson);

        if (!STATUS_PENDING.equalsIgnoreCase(payment.getStatus())) {
            // Late payment check: if payment status is EXPIRED or FAILED, but VNPAY says
            // transaction was success ("00"),
            // we must change it to REFUND_PENDING and create a Refund record so customer's
            // money is not leaked!
            if ("00".equals(responseCode) && (STATUS_EXPIRED.equalsIgnoreCase(payment.getStatus())
                    || STATUS_FAILED.equalsIgnoreCase(payment.getStatus()))) {
                log.warn(
                        "Late payment received for expired/failed payment txnRef {}. Amount: {}. Initiating auto-refund.",
                        txnRef, payment.getAmount());
                payment.setStatus(STATUS_REFUND_PENDING);
                payment.setPaidAt(LocalDateTime.now());
                paymentRepository.save(payment);

                Refund refund = Refund.builder()
                        .paymentId(payment.getId())
                        .refundAmount(payment.getAmount())
                        .reason("Auto-refund: Late payment received for expired/failed order")
                        .status(STATUS_PENDING)
                        .build();
                refundRepository.save(refund);

                saveWebhookLog(rawParamsJson, true, true);
                return "00";
            }

            saveWebhookLog(rawParamsJson, true, true);
            return "02"; // Order already paid
        }

        if ("00".equals(responseCode)) {
            payment.setStatus(STATUS_SUCCESS);
            payment.setPaidAt(LocalDateTime.now());
            paymentRepository.save(payment);
            saveWebhookLog(rawParamsJson, true, true);

            publishPaymentEvent("PaymentSuccessEvent", payment, payment.getAmount(), "VNPAY callback successful");
            return "00"; // Confirm payment success
        } else {
            payment.setStatus(STATUS_FAILED);
            payment.setFailureCode(responseCode);
            paymentRepository.save(payment);
            saveWebhookLog(rawParamsJson, true, true);

            publishPaymentEvent("PaymentFailedEvent", payment, payment.getAmount(),
                    "VNPAY failed with code: " + responseCode);
            return "00"; // Confirm webhook processed successfully (even though payment itself failed)
        }
    }

    @Override
    public void processRefund(RefundRequest request) {
        // STEP 1: Read-only snapshot (no lock, no transaction) - just enough to validate the
        // request and build the gateway call.
        Payment snapshot = paymentRepository.findById(request.getPaymentId())
                .orElseThrow(() -> new RuntimeException("Payment record not found"));

        // Allow refunding a payment that was already partially refunded (to top it up further)
        if (!STATUS_SUCCESS.equalsIgnoreCase(snapshot.getStatus())
                && !STATUS_PARTIALLY_REFUNDED.equalsIgnoreCase(snapshot.getStatus())) {
            throw new RuntimeException("Cannot refund payment in status: " + snapshot.getStatus());
        }

        // SECURITY CHECK: Validate refund amount
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Refund amount must be greater than zero.");
        }

        BigDecimal alreadyRefundedSnapshot = sumSuccessfulRefunds(snapshot.getId(), null);
        BigDecimal remainingSnapshot = snapshot.getAmount().subtract(alreadyRefundedSnapshot);
        if (request.getAmount().compareTo(remainingSnapshot) > 0) {
            throw new IllegalArgumentException("Security Violation: Refund amount (" + request.getAmount()
                    + ") exceeds remaining refundable amount (" + remainingSnapshot + ").");
        }
        boolean isFullRefundSnapshot = request.getAmount().compareTo(remainingSnapshot) == 0;

        // STEP 2: Call the payment gateway OUTSIDE any DB transaction (V-01/V-11 pattern: never
        // hold a DB connection/lock during an outbound HTTP call).
        VnPayRefundResult gatewayResult = GATEWAY_VNPAY.equalsIgnoreCase(snapshot.getPaymentMethod())
                ? callVnPayRefundApi(snapshot, request.getAmount(), isFullRefundSnapshot, "admin")
                : null; // COD has no gateway call - handled as an offline confirmation

        // STEP 3: Short, fine-grained transaction - re-validate under lock and persist the outcome.
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            Payment payment = paymentRepository.findByIdWithLock(request.getPaymentId())
                    .orElseThrow(() -> new RuntimeException("Payment record not found"));

            if (!STATUS_SUCCESS.equalsIgnoreCase(payment.getStatus())
                    && !STATUS_PARTIALLY_REFUNDED.equalsIgnoreCase(payment.getStatus())) {
                throw new RuntimeException("Cannot refund payment in status: " + payment.getStatus());
            }

            BigDecimal alreadyRefunded = sumSuccessfulRefunds(payment.getId(), null);
            BigDecimal remaining = payment.getAmount().subtract(alreadyRefunded);
            if (request.getAmount().compareTo(remaining) > 0) {
                throw new IllegalArgumentException("Security Violation: Refund amount (" + request.getAmount()
                        + ") exceeds remaining refundable amount (" + remaining + ").");
            }
            boolean isFullRefund = request.getAmount().compareTo(remaining) == 0;

            Refund refund = Refund.builder()
                    .paymentId(payment.getId())
                    .refundAmount(request.getAmount())
                    .reason(request.getReason())
                    .status(STATUS_PENDING)
                    .build();

            applyGatewayResult(payment, refund, isFullRefund, gatewayResult);
        });
    }

    private BigDecimal sumSuccessfulRefunds(Long paymentId, Long excludingRefundId) {
        return refundRepository.findByPaymentId(paymentId).stream()
                .filter(r -> STATUS_SUCCESS.equalsIgnoreCase(r.getStatus()))
                .filter(r -> excludingRefundId == null || !excludingRefundId.equals(r.getId()))
                .map(Refund::getRefundAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Persists the outcome of a refund attempt (gatewayResult == null means COD, which has no
     * gateway call and is treated as an offline cash confirmation). Only publishes
     * RefundCompletedEvent when money has genuinely moved - a failed/rejected gateway call must
     * never be reported to the rest of the system as a completed refund.
     */
    private void applyGatewayResult(Payment payment, Refund refund, boolean isFullRefund,
            VnPayRefundResult gatewayResult) {
        if (gatewayResult == null) {
            refund.setStatus(STATUS_SUCCESS);
            refund.setCompletedAt(LocalDateTime.now());
        } else if (gatewayResult.success()) {
            refund.setStatus(STATUS_SUCCESS);
            refund.setGatewayRefundId(gatewayResult.gatewayTransactionNo());
            refund.setCompletedAt(LocalDateTime.now());
        } else if (gatewayResult.retryable()) {
            // Transient/network failure - leave as PENDING so the processPendingRefunds
            // scheduler retries it automatically on its next run.
            refund.setStatus(STATUS_PENDING);
            refund.setReason(refund.getReason() + " | Retry pending: " + gatewayResult.message());
        } else {
            // VNPAY explicitly rejected the refund - automatic retries would not help.
            refund.setStatus(REFUND_STATUS_PENDING_MANUAL);
            refund.setReason(refund.getReason() + " | Needs manual review: " + gatewayResult.message());
        }
        refundRepository.save(refund);

        if (STATUS_SUCCESS.equalsIgnoreCase(refund.getStatus())) {
            payment.setStatus(isFullRefund ? STATUS_REFUNDED : STATUS_PARTIALLY_REFUNDED);
            paymentRepository.save(payment);
            publishPaymentEvent("RefundCompletedEvent", payment, refund.getRefundAmount(),
                    "Refund completed for: " + refund.getReason());
        }
    }

    private record VnPayRefundResult(boolean success, boolean retryable, String gatewayTransactionNo,
            String message) {
    }

    private VnPayRefundResult callVnPayRefundApi(Payment payment, BigDecimal refundAmount, boolean isFullRefund,
            String createdBy) {
        try {
            String requestId = UUID.randomUUID().toString();
            String version = "2.1.0";
            String command = "refund";
            // VNPAY transaction type: "02" = full refund, "03" = partial refund
            String transactionType = isFullRefund ? "02" : "03";
            String txnRef = payment.getTxnRef();
            BigDecimal vnpAmount = refundAmount.multiply(BigDecimal.valueOf(100));
            String amount = String.valueOf(vnpAmount.longValue());
            String transactionNo = payment.getGatewayTxnId() != null ? payment.getGatewayTxnId() : "";

            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
            LocalDateTime originalTxnDate = payment.getPaidAt() != null ? payment.getPaidAt() : payment.getCreatedAt();
            String transactionDate = originalTxnDate.format(formatter);
            String createDate = LocalDateTime.now().format(formatter);
            String ipAddr = DEFAULT_IP_FALLBACK;
            String orderInfo = "Hoan tien don hang " + payment.getOrderId();

            // Signature per VNPAY "Hoan tra giao dich" (refund) spec:
            // RequestId|Version|Command|TmnCode|TransactionType|TxnRef|Amount|TransactionNo|TransactionDate|CreateBy|CreateDate|IpAddr|OrderInfo
            String hashData = requestId + "|" + version + "|" + command + "|" + vnpTmnCode + "|" + transactionType
                    + "|" + txnRef + "|" + amount + "|" + transactionNo + "|" + transactionDate + "|" + createdBy
                    + "|" + createDate + "|" + ipAddr + "|" + orderInfo;
            String secureHash = hmacSha512(vnpHashSecret, hashData);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("vnp_RequestId", requestId);
            requestBody.put("vnp_Version", version);
            requestBody.put("vnp_Command", command);
            requestBody.put("vnp_TmnCode", vnpTmnCode);
            requestBody.put("vnp_TransactionType", transactionType);
            requestBody.put("vnp_TxnRef", txnRef);
            requestBody.put("vnp_Amount", amount);
            requestBody.put("vnp_TransactionNo", transactionNo);
            requestBody.put("vnp_CreateBy", createdBy);
            requestBody.put("vnp_OrderInfo", orderInfo);
            requestBody.put("vnp_TransactionDate", transactionDate);
            requestBody.put("vnp_CreateDate", createDate);
            requestBody.put("vnp_IpAddr", ipAddr);
            requestBody.put("vnp_SecureHash", secureHash);

            log.info("Sending refund request to VNPAY for txnRef: {}, amount: {}", txnRef, refundAmount);
            Map<?, ?> response = standardRestTemplate.postForObject(vnpQueryUrl, requestBody, Map.class);
            log.info("Received refund response from VNPAY: {}", response);

            if (response == null) {
                return new VnPayRefundResult(false, true, null, "No response from VNPAY");
            }

            String responseCode = String.valueOf(response.get("vnp_ResponseCode"));
            String message = String.valueOf(response.get("vnp_Message"));

            if ("00".equals(responseCode)) {
                String gatewayTxnNo = response.get("vnp_TransactionNo") != null
                        ? String.valueOf(response.get("vnp_TransactionNo"))
                        : null;
                return new VnPayRefundResult(true, false, gatewayTxnNo, message);
            }

            // 91 = transaction not found (can happen on lag/misconfig), 99 = unknown/other error -
            // treat as possibly transient and let the scheduler retry. Everything else (e.g. 94 =
            // request already processed, 95 = txn not eligible) is a definitive rejection.
            boolean retryable = "91".equals(responseCode) || "99".equals(responseCode);
            return new VnPayRefundResult(false, retryable, null,
                    "VNPAY response code " + responseCode + ": " + message);
        } catch (Exception e) {
            log.error("Failed to call VNPAY refund API for txnRef: {}", payment.getTxnRef(), e);
            return new VnPayRefundResult(false, true, null, "Exception calling VNPAY refund API: " + e.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PaymentResponse> getAllPayments(Pageable pageable) {
        return paymentRepository.findAll(pageable)
                .map(p -> PaymentResponse.builder()
                        .id(p.getId())
                        .orderId(p.getOrderId())
                        .amount(p.getAmount())
                        .paymentMethod(p.getPaymentMethod())
                        .status(p.getStatus())
                        .transactionNo(p.getTxnRef())
                        .gatewayResponse(p.getGatewayResponse())
                        .paidAt(p.getPaidAt())
                        .createdAt(p.getCreatedAt())
                        .build());
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponse getPaymentByOrderId(Long orderId, String callerUserId, boolean isAdminOrStaff) {
        Payment p = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found for order ID: " + orderId));

        // SECURITY: Prevent IDOR - only the owning user or an admin/staff may view this payment
        if (!isAdminOrStaff && (callerUserId == null || !callerUserId.equalsIgnoreCase(p.getUserId()))) {
            throw new AccessDeniedException("You do not have permission to view this payment.");
        }

        return PaymentResponse.builder()
                .id(p.getId())
                .orderId(p.getOrderId())
                .amount(p.getAmount())
                .paymentMethod(p.getPaymentMethod())
                .status(p.getStatus())
                .transactionNo(p.getTxnRef())
                .gatewayResponse(p.getGatewayResponse())
                .paidAt(p.getPaidAt())
                .createdAt(p.getCreatedAt())
                .build();
    }

    @Override
    public void cancelExpiredPayments() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(paymentExpiryMinutes);
        List<Payment> expiredPayments = paymentRepository.findAllByStatusAndCreatedAtBefore(STATUS_PENDING, cutoff);

        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        for (Payment p : expiredPayments) {
            // STEP 1: Query VNPAY OUTSIDE transaction to avoid holding DB connection during
            // network call
            String vnpStatus = null;
            if (GATEWAY_VNPAY.equalsIgnoreCase(p.getPaymentMethod())) {
                vnpStatus = checkVnPayTransactionStatus(p);
            }

            final String finalVnpStatus = vnpStatus;

            // STEP 2: Short, fine-grained transaction for DB operations only
            tx.executeWithoutResult(status -> {
                // Re-fetch payment with write lock inside transaction
                Optional<Payment> lockOpt = paymentRepository.findByTxnRefWithLock(p.getTxnRef());
                if (lockOpt.isEmpty()) {
                    return;
                }
                Payment payment = lockOpt.get();

                // Re-verify status under lock
                if (!STATUS_PENDING.equalsIgnoreCase(payment.getStatus())) {
                    log.info("Payment txnRef {} is no longer PENDING (currently {}). Skipping expiration.",
                            payment.getTxnRef(), payment.getStatus());
                    return;
                }

                if (METHOD_COD.equalsIgnoreCase(payment.getPaymentMethod())) {
                    log.info("Payment txnRef {} is COD. Skipping expiration.", payment.getTxnRef());
                    return;
                }

                // Process VNPAY status result
                if (GATEWAY_VNPAY.equalsIgnoreCase(payment.getPaymentMethod())) {
                    if ("00".equals(finalVnpStatus)) {
                        log.info(
                                "VNPAY QueryDR confirmed success for txnRef {}. Updating status to SUCCESS instead of EXPIRED.",
                                payment.getTxnRef());
                        payment.setStatus(STATUS_SUCCESS);
                        payment.setPaidAt(LocalDateTime.now());
                        paymentRepository.save(payment);
                        publishPaymentEvent("PaymentSuccessEvent", payment, payment.getAmount(),
                                "VNPAY QueryDR sync success");
                        return;
                    } else if ("01".equals(finalVnpStatus)) {
                        log.info(
                                "VNPAY QueryDR confirmed transaction incomplete for txnRef {}. Proceeding with cancellation.",
                                payment.getTxnRef());
                    } else if ("02".equals(finalVnpStatus) || "NOT_FOUND".equals(finalVnpStatus)) {
                        log.info(
                                "VNPAY QueryDR confirmed transaction failed or not found ({}) for txnRef {}. Proceeding with cancellation.",
                                finalVnpStatus, payment.getTxnRef());
                    } else {
                        log.warn(
                                "VNPAY QueryDR returned unclear/error status ({}) for txnRef {}. Skipping cancellation to prevent false failures.",
                                finalVnpStatus, payment.getTxnRef());
                        return;
                    }
                }

                // Mark as expired and save PaymentFailedEvent to outbox (atomic with DB update)
                payment.setStatus(STATUS_EXPIRED);
                paymentRepository.save(payment);

                try {
                    publishPaymentEvent("PaymentFailedEvent", payment, payment.getAmount(), "Payment session expired");
                } catch (Exception e) {
                    log.error("Failed to publish PaymentFailedEvent for expired payment {}", payment.getTxnRef(), e);
                    throw new RuntimeException("Failed to publish payment event", e);
                }

                log.info("Payment reference {} has expired and is marked as EXPIRED.", payment.getTxnRef());
            });
        }
    }

    private String checkVnPayTransactionStatus(Payment payment) {
        try {
            String requestId = UUID.randomUUID().toString();
            String version = "2.1.0";
            String command = "querydr";
            String tmnCode = vnpTmnCode;
            String txnRef = payment.getTxnRef();
            String orderInfo = "Query transaction status for txnRef " + txnRef;

            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
            String transDate = payment.getCreatedAt().format(formatter);
            String createDate = LocalDateTime.now().format(formatter);
            String ipAddr = "127.0.0.1";

            // Build signature hashData:
            // RequestId|Version|Command|TmnCode|TxnRef|TransDate|CreateDate|IpAddr|OrderInfo
            String hashData = requestId + "|" + version + "|" + command + "|" + tmnCode + "|" + txnRef + "|" + transDate
                    + "|" + createDate + "|" + ipAddr + "|" + orderInfo;
            String secureHash = hmacSha512(vnpHashSecret, hashData);

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("vnp_RequestId", requestId);
            requestBody.put("vnp_Version", version);
            requestBody.put("vnp_Command", command);
            requestBody.put("vnp_TmnCode", tmnCode);
            requestBody.put("vnp_TxnRef", txnRef);
            requestBody.put("vnp_OrderInfo", orderInfo);
            requestBody.put("vnp_TransDate", transDate);
            requestBody.put("vnp_CreateDate", createDate);
            requestBody.put("vnp_IpAddr", ipAddr);
            requestBody.put("vnp_SecureHash", secureHash);

            log.info("Sending QueryDR request to VNPAY for txnRef: {}", txnRef);
            Map<?, ?> response = standardRestTemplate.postForObject(vnpQueryUrl, requestBody, Map.class);
            log.info("Received QueryDR response from VNPAY: {}", response);

            if (response != null) {
                String responseCode = (String) response.get("vnp_ResponseCode");
                String transactionStatus = (String) response.get("vnp_TransactionStatus");

                if ("00".equals(responseCode)) {
                    return transactionStatus; // returns "00" (success), "01" (incomplete), "02" (failed), etc.
                } else if ("91".equals(responseCode)) {
                    return "NOT_FOUND";
                }
            }
        } catch (Exception e) {
            log.error("Failed to query VNPAY transaction status for txnRef: {}", payment.getTxnRef(), e);
        }
        return null;
    }

    private void saveWebhookLog(String rawPayload, boolean signatureValid, boolean processed) {
        WebhookLog log = WebhookLog.builder()
                .gateway(GATEWAY_VNPAY)
                .rawPayload(rawPayload)
                .signatureValid(signatureValid)
                .processed(processed)
                .build();
        webhookLogRepository.save(log);
    }

    private String buildVnPayUrl(Payment payment, String txnRef, String ipAddress) {
        Map<String, String> vnpParams = new TreeMap<>();
        vnpParams.put("vnp_Version", "2.1.0");
        vnpParams.put("vnp_Command", "pay");
        vnpParams.put("vnp_TmnCode", vnpTmnCode);

        // VNPAY uses amount in cents/VND multiplied by 100
        BigDecimal vnpAmount = payment.getAmount().multiply(BigDecimal.valueOf(100));
        vnpParams.put("vnp_Amount", String.valueOf(vnpAmount.longValue()));

        vnpParams.put("vnp_CurrCode", "VND");
        vnpParams.put("vnp_TxnRef", txnRef);
        vnpParams.put("vnp_OrderInfo", "Thanh toan don hang " + payment.getOrderId());
        vnpParams.put("vnp_OrderType", "other");
        vnpParams.put("vnp_Locale", "vn");
        vnpParams.put("vnp_ReturnUrl", vnpReturnUrl);

        // Sanitize client IP to ensure a valid IPv4 address is used
        String clientIp = ipAddress;
        if (clientIp == null || clientIp.contains(":") || clientIp.equals("0:0:0:0:0:0:0:1")) {
            clientIp = DEFAULT_IP_FALLBACK;
        }
        vnpParams.put("vnp_IpAddr", clientIp);

        LocalDateTime now = LocalDateTime.now();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
        vnpParams.put("vnp_CreateDate", now.format(formatter));
        vnpParams.put("vnp_ExpireDate", now.plusMinutes(paymentExpiryMinutes).format(formatter));

        StringBuilder hashData = new StringBuilder();
        StringBuilder query = new StringBuilder();
        Iterator<Map.Entry<String, String>> itr = vnpParams.entrySet().iterator();
        while (itr.hasNext()) {
            Map.Entry<String, String> entry = itr.next();

            // hashData: raw key + standard URLEncoder value (VNPay official sample spec)
            String encodedValue = URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8);
            hashData.append(entry.getKey());
            hashData.append('=');
            hashData.append(encodedValue);

            // query string: encoded key + encoded value (for URL safety)
            query.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));
            query.append('=');
            query.append(encodedValue);

            if (itr.hasNext()) {
                query.append('&');
                hashData.append('&');
            }
        }

        String secureHash = hmacSha512(vnpHashSecret, hashData.toString());
        return vnpPayUrl + "?" + query.toString() + "&vnp_SecureHash=" + secureHash;
    }

    private String hmacSha512(String key, String data) {
        try {
            Mac sha512Hmac = Mac.getInstance("HmacSHA512");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512");
            sha512Hmac.init(secretKey);
            byte[] bytes = sha512Hmac.doFinal(data.getBytes(StandardCharsets.UTF_8));

            StringBuilder uuid = new StringBuilder();
            for (byte b : bytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1)
                    uuid.append('0');
                uuid.append(hex);
            }
            return uuid.toString();
        } catch (Exception e) {
            log.error("Failed to generate HMAC SHA512 hash: {}", e.getMessage());
            throw new RuntimeException("Hash generation error");
        }
    }

    @Override
    @Transactional
    public void initiateAutoRefund(Long orderId) {
        // Use pessimistic write lock to prevent concurrent duplicate refunds
        Optional<Payment> paymentOpt = paymentRepository.findByOrderIdWithLock(orderId);
        if (paymentOpt.isPresent()) {
            Payment payment = paymentOpt.get();
            if (STATUS_SUCCESS.equalsIgnoreCase(payment.getStatus())) {
                // IDEMPOTENCY: Check if a refund record already exists to prevent duplicates
                // Now safe because we have write lock on payment
                boolean alreadyRefunding = refundRepository.existsByPaymentId(payment.getId());
                if (alreadyRefunding) {
                    log.warn("Refund already exists for Payment ID {}. Skipping duplicate initiateAutoRefund.",
                            payment.getId());
                    return;
                }
                log.info(
                        "Payment for Order ID {} was SUCCESS. Marking payment as REFUND_PENDING and creating Refund record...",
                        orderId);
                payment.setStatus(STATUS_REFUND_PENDING);
                paymentRepository.save(payment);

                Refund refund = Refund.builder()
                        .paymentId(payment.getId())
                        .refundAmount(payment.getAmount())
                        .reason("Auto-refund: Order cancelled by user")
                        .status(STATUS_PENDING)
                        .build();
                refundRepository.save(refund);
            } else if (STATUS_PENDING.equalsIgnoreCase(payment.getStatus())) {
                log.info("Payment for Order ID {} was PENDING. Marking payment as FAILED...", orderId);
                payment.setStatus(STATUS_FAILED);
                payment.setFailureCode("ORDER_CANCELLED");
                paymentRepository.save(payment);
            } else {
                log.info("Payment for Order ID {} is in status {}. Skipping refund/cancellation.", orderId,
                        payment.getStatus());
            }
        } else {
            log.info("No payment record found for Order ID {}. Skipping refund.", orderId);
        }
    }

    @Override
    public void processPendingRefunds() {
        List<Refund> pendingRefunds = refundRepository.findByStatus(STATUS_PENDING);
        if (pendingRefunds.isEmpty()) {
            return;
        }

        log.info("Found {} pending refunds to process", pendingRefunds.size());
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        for (Refund refund : pendingRefunds) {
            try {
                // STEP 1: Read-only snapshot + gateway call OUTSIDE any DB transaction.
                Optional<Payment> paymentOpt = paymentRepository.findById(refund.getPaymentId());
                if (paymentOpt.isEmpty()) {
                    log.warn("Payment {} not found for pending refund {}. Skipping.", refund.getPaymentId(),
                            refund.getId());
                    continue;
                }
                Payment paymentSnapshot = paymentOpt.get();
                BigDecimal alreadyRefundedSnapshot = sumSuccessfulRefunds(paymentSnapshot.getId(), refund.getId());
                boolean isFullRefundSnapshot = refund.getRefundAmount()
                        .compareTo(paymentSnapshot.getAmount().subtract(alreadyRefundedSnapshot)) >= 0;

                VnPayRefundResult gatewayResult = GATEWAY_VNPAY.equalsIgnoreCase(paymentSnapshot.getPaymentMethod())
                        ? callVnPayRefundApi(paymentSnapshot, refund.getRefundAmount(), isFullRefundSnapshot,
                                "system-scheduler")
                        : null;

                // STEP 2: Short, fine-grained transaction for DB writes only.
                tx.executeWithoutResult(status -> {
                    // Re-fetch with pessimistic write lock to serialize access
                    Optional<Refund> freshRefundOpt = refundRepository.findByIdWithLock(refund.getId());
                    if (freshRefundOpt.isEmpty()) {
                        log.info("Refund ID {} not found. Skipping.", refund.getId());
                        return;
                    }

                    Refund freshRefund = freshRefundOpt.get();
                    if (!STATUS_PENDING.equalsIgnoreCase(freshRefund.getStatus())) {
                        log.info("Refund ID {} already processed by another instance (status={}). Skipping.",
                                refund.getId(), freshRefund.getStatus());
                        return;
                    }

                    Payment payment = paymentRepository.findByIdWithLock(freshRefund.getPaymentId())
                            .orElseThrow(() -> new RuntimeException("Payment record not found"));

                    BigDecimal alreadyRefunded = sumSuccessfulRefunds(payment.getId(), freshRefund.getId());
                    boolean isFullRefund = freshRefund.getRefundAmount()
                            .compareTo(payment.getAmount().subtract(alreadyRefunded)) >= 0;

                    applyGatewayResult(payment, freshRefund, isFullRefund, gatewayResult);

                    log.info("Refund ID {} for Payment ID {} processed with result status {}", freshRefund.getId(),
                            payment.getId(), freshRefund.getStatus());
                });
            } catch (Exception e) {
                log.error("Failed to process refund ID: {}", refund.getId(), e);
            }
        }
    }

    private void publishPaymentEvent(String eventType, Payment payment, BigDecimal amount, String info) {
        try {
            Map<String, Object> event = new HashMap<>();
            event.put("eventId", UUID.randomUUID().toString());
            event.put("eventType", eventType);
            event.put("timestamp", LocalDateTime.now().toString());
            event.put("orderId", payment.getOrderId());
            event.put("paymentId", payment.getId());
            event.put("userId", payment.getUserId());
            event.put("email", payment.getEmail());
            event.put("amount", amount);
            event.put("message", info);

            String message = objectMapper.writeValueAsString(event);

            // V-10 FIX: Use Outbox Pattern instead of direct Kafka publish
            // This ensures atomicity between DB write and event publish via Debezium CDC
            OutboxEvent outboxEvent = OutboxEvent.builder()
                    .aggregateId(String.valueOf(payment.getId()))
                    .aggregateType("Payment")
                    .eventType(eventType)
                    .payload(message)
                    .published(false)
                    .build();
            outboxEventRepository.save(outboxEvent);

            log.info("Successfully saved {} to outbox for Debezium CDC", eventType);
        } catch (Exception e) {
            log.error("Failed to save payment event to outbox", e);
            throw new RuntimeException("Failed to save payment event to outbox. Rolling back database transaction.", e);
        }
    }
}
