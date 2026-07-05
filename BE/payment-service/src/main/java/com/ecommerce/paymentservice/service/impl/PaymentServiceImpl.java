package com.ecommerce.paymentservice.service.impl;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.entity.Refund;
import com.ecommerce.paymentservice.entity.WebhookLog;
import com.ecommerce.paymentservice.repository.PaymentRepository;
import com.ecommerce.paymentservice.repository.RefundRepository;
import com.ecommerce.paymentservice.repository.WebhookLogRepository;
import com.ecommerce.paymentservice.service.PaymentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.client.RestTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.concurrent.ConcurrentHashMap;

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
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final RestTemplate standardRestTemplate;
    private final PlatformTransactionManager transactionManager;

    private final ConcurrentHashMap<Long, Object> orderLocks = new ConcurrentHashMap<>();

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
    private static final String STATUS_EXPIRED = "EXPIRED";
    private static final String STATUS_REFUND_PENDING = "REFUND_PENDING";

    @Override
    public PaymentInitiateResponse initiatePayment(PaymentInitiateRequest request) {
        Object lock = orderLocks.computeIfAbsent(request.getOrderId(), k -> new Object());
        synchronized (lock) {
            try {
                TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
                return transactionTemplate.execute(status -> {
                    // Fetch order details from order-service to verify status and retrieve correct
                    // payment amount (prevent price tampering)
                    String orderServiceUrl = orderServiceUrlBase + "/api/internal/orders/" + request.getOrderId() + "/summary";
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

                        // LỖI 1 FIX: Only allow payment for PENDING or AWAITING_PAYMENT orders
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
                        log.error("Security violation for Order ID: {} by User ID: {}", request.getOrderId(), request.getUserId());
                        throw e;
                    } catch (Exception e) {
                        log.error("Failed to verify order with order-service. Order ID: {}", request.getOrderId(), e);
                        throw new RuntimeException("Order verification failed: " + e.getMessage());
                    }

                    String txnRef = UUID.randomUUID().toString();

                    // IDEMPOTENCY / REUSE CHECK: Check if a payment record already exists for this
                    // order
                    Payment payment;
                    Optional<Payment> existingPaymentOpt = paymentRepository.findByOrderId(request.getOrderId());
                    if (existingPaymentOpt.isPresent()) {
                        Payment existingPayment = existingPaymentOpt.get();
                        String currentStatus = existingPayment.getStatus();

                        if (STATUS_SUCCESS.equalsIgnoreCase(currentStatus)) {
                            throw new IllegalStateException("Payment has already been successfully completed for this order.");
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

                        publishPaymentEvent("PaymentCODConfirmedEvent", payment, payment.getAmount(), "COD payment pending delivery");

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
                orderLocks.remove(request.getOrderId(), lock);
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

        if (!STATUS_PENDING.equalsIgnoreCase(payment.getStatus())) {
            saveWebhookLog(rawParamsJson, true, true);
            return "02"; // Order already paid
        }

        String responseCode = queryParams.get("vnp_ResponseCode");
        payment.setGatewayTxnId(queryParams.get("vnp_TransactionNo"));
        payment.setGatewayResponse(rawParamsJson);

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
    @Transactional
    public void processRefund(RefundRequest request) {
        Payment payment = paymentRepository.findById(request.getPaymentId())
                .orElseThrow(() -> new RuntimeException("Payment record not found"));

        if (!STATUS_SUCCESS.equalsIgnoreCase(payment.getStatus())) {
            throw new RuntimeException("Cannot refund payment in status: " + payment.getStatus());
        }

        // SECURITY CHECK: Validate refund amount
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Refund amount must be greater than zero.");
        }

        if (request.getAmount().compareTo(payment.getAmount()) > 0) {
            throw new IllegalArgumentException("Security Violation: Refund amount (" + request.getAmount()
                    + ") cannot exceed original payment amount (" + payment.getAmount() + ").");
        }

        Refund refund = Refund.builder()
                .paymentId(payment.getId())
                .refundAmount(request.getAmount())
                .reason(request.getReason())
                .status(STATUS_SUCCESS) // For simulation, approve refund instantly
                .completedAt(LocalDateTime.now())
                .build();
        refundRepository.save(refund);

        payment.setStatus(STATUS_REFUNDED);
        paymentRepository.save(payment);

        publishPaymentEvent("RefundCompletedEvent", payment, request.getAmount(),
                "Refund completed for: " + request.getReason());
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
    public PaymentResponse getPaymentByOrderId(Long orderId) {
        Payment p = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found for order ID: " + orderId));
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
    @Transactional
    public void cancelExpiredPayments() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(paymentExpiryMinutes);
        List<Payment> expiredPayments = paymentRepository.findAllByStatusAndCreatedAtBefore(STATUS_PENDING, cutoff);
        for (Payment payment : expiredPayments) {
            if (GATEWAY_VNPAY.equalsIgnoreCase(payment.getPaymentMethod())) {
                // Before cancelling VNPAY, query VNPAY QueryDR API to verify actual status
                String vnpStatus = checkVnPayTransactionStatus(payment);
                if ("00".equals(vnpStatus)) {
                    log.info("VNPAY QueryDR confirmed success for txnRef {}. Updating status to SUCCESS instead of EXPIRED.", payment.getTxnRef());
                    payment.setStatus(STATUS_SUCCESS);
                    payment.setPaidAt(LocalDateTime.now());
                    paymentRepository.save(payment);
                    publishPaymentEvent("PaymentSuccessEvent", payment, payment.getAmount(), "VNPAY QueryDR sync success");
                    continue;
                } else if ("01".equals(vnpStatus)) {
                    // Transaction incomplete (user hasn't paid). Safe to expire.
                    log.info("VNPAY QueryDR confirmed transaction incomplete for txnRef {}. Proceeding with cancellation.", payment.getTxnRef());
                } else if ("02".equals(vnpStatus)) {
                    // Transaction failed. Safe to fail/expire.
                    log.info("VNPAY QueryDR confirmed transaction failed for txnRef {}. Proceeding with cancellation.", payment.getTxnRef());
                } else {
                    // API error or unknown status. Skip expiring for safety.
                    log.warn("VNPAY QueryDR returned unclear/error status ({}) for txnRef {}. Skipping cancellation to prevent false failures.", vnpStatus, payment.getTxnRef());
                    continue;
                }
            }

            payment.setStatus(STATUS_EXPIRED);
            paymentRepository.save(payment);
            log.info("Payment reference {} has expired and is marked as EXPIRED.", payment.getTxnRef());

            publishPaymentEvent("PaymentFailedEvent", payment, payment.getAmount(), "Payment session expired");
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

            // Build signature hashData: RequestId|Version|Command|TmnCode|TxnRef|TransDate|CreateDate|IpAddr|OrderInfo
            String hashData = requestId + "|" + version + "|" + command + "|" + tmnCode + "|" + txnRef + "|" + transDate + "|" + createDate + "|" + ipAddr + "|" + orderInfo;
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
        vnpParams.put("vnp_OrderInfo", "Thanh toan don hang #" + payment.getOrderId());
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
        vnpParams.put("vnp_ExpireDate", now.plusHours(vnpayExpiryHours).format(formatter));

        StringBuilder hashData = new StringBuilder();
        StringBuilder query = new StringBuilder();
        Iterator<Map.Entry<String, String>> itr = vnpParams.entrySet().iterator();
        while (itr.hasNext()) {
            Map.Entry<String, String> entry = itr.next();

            String encodedKey = URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8);
            String encodedValue = URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8);

            hashData.append(entry.getKey());
            hashData.append('=');
            hashData.append(encodedValue);

            query.append(encodedKey);
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
        Optional<Payment> paymentOpt = paymentRepository.findByOrderId(orderId);
        if (paymentOpt.isPresent()) {
            Payment payment = paymentOpt.get();
            if (STATUS_SUCCESS.equalsIgnoreCase(payment.getStatus())) {
                log.info("Payment for Order ID {} was SUCCESS. Marking payment as REFUND_PENDING and creating Refund record...", orderId);
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
                log.info("Payment for Order ID {} is in status {}. Skipping refund/cancellation.", orderId, payment.getStatus());
            }
        } else {
            log.info("No payment record found for Order ID {}. Skipping refund.", orderId);
        }
    }

    @Override
    @Transactional
    public void processPendingRefunds() {
        List<Refund> pendingRefunds = refundRepository.findByStatus(STATUS_PENDING);
        if (pendingRefunds.isEmpty()) {
            return;
        }

        log.info("Found {} pending refunds to process", pendingRefunds.size());
        for (Refund refund : pendingRefunds) {
            try {
                Payment payment = paymentRepository.findById(refund.getPaymentId())
                        .orElseThrow(() -> new RuntimeException("Payment record not found"));

                // In a real VNPAY integration, we would invoke the VNPAY refund API here.
                // Since this is mock/simulation, we will approve the refund instantly.
                // However, doing it here in the scheduler keeps the Kafka Consumer responsive.
                refund.setStatus(STATUS_SUCCESS);
                refund.setCompletedAt(LocalDateTime.now());
                refundRepository.save(refund);

                payment.setStatus(STATUS_REFUNDED);
                paymentRepository.save(payment);

                publishPaymentEvent("RefundCompletedEvent", payment, refund.getRefundAmount(),
                        "Refund completed for: " + refund.getReason());
                
                log.info("Refund ID {} for Payment ID {} completed successfully", refund.getId(), payment.getId());
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
            kafkaTemplate.send(paymentTopic, String.valueOf(payment.getOrderId()), message);
            log.info("Successfully published {} to Kafka topic: {}", eventType, paymentTopic);
        } catch (Exception e) {
            log.error("Failed to publish payment event to Kafka", e);
        }
    }
}
