package com.ecommerce.paymentservice.controller;

import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.repository.PaymentRepository;
import com.ecommerce.paymentservice.service.PaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private final PaymentService paymentService;
    private final PaymentRepository paymentRepository;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @GetMapping("/api/v1/public/payments/vnpay-callback")
    public ResponseEntity<?> vnpayCallback(
            @RequestParam Map<String, String> queryParams,
            HttpServletRequest request) {

        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }

        log.info("VNPAY IPN Webhook triggered from IP: {} with params: {}", ip, queryParams);
        String rspCode = paymentService.verifyVnPayCallback(queryParams);

        Map<String, String> response = new HashMap<>();
        response.put("RspCode", rspCode);

        switch (rspCode) {
            case "00":
                response.put("Message", "Confirm Success");
                break;
            case "97":
                response.put("Message", "Invalid Signature");
                break;
            case "01":
                response.put("Message", "Order not found");
                break;
            case "02":
                response.put("Message", "Order already paid");
                break;
            default:
                response.put("Message", "Unknown error");
                break;
        }

        // Detect if request came from browser vs VNPAY background IPN
        String acceptHeader = request.getHeader("Accept");
        boolean isBrowser = acceptHeader != null && acceptHeader.contains("text/html");

        if (isBrowser) {
            String txnRef = queryParams.get("vnp_TxnRef");
            Long orderId = null;
            String displayRspCode = rspCode;
            if (txnRef != null) {
                Payment payment = paymentRepository.findByTxnRef(txnRef).orElse(null);
                if (payment != null) {
                    orderId = payment.getOrderId();
                    // If the database has already updated the payment to SUCCESS (e.g. via fast IPN webhook),
                    // we override the redirect code to "00" so the user sees the payment success page.
                    if ("SUCCESS".equalsIgnoreCase(payment.getStatus()) && "02".equals(rspCode)) {
                        log.info("Overriding redirect rspCode from 02 to 00 for user experience, since payment status is SUCCESS in DB");
                        displayRspCode = "00";
                    }
                }
            }

            String targetUrl = frontendUrl + "/profile";
            if (orderId != null) {
                targetUrl = frontendUrl + "/order/" + orderId + "?paymentStatus=" + displayRspCode;
            }

            log.info("Redirecting customer browser to: {}", targetUrl);
            return ResponseEntity.status(HttpStatus.FOUND)
                    .header("Location", targetUrl)
                    .build();
        }

        return ResponseEntity.ok(response);
    }
}
