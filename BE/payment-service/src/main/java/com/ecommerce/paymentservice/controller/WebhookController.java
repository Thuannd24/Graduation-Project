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
            // Trước đây paymentStatus = RspCode của IPN ("00" = "đã xử lý webhook", kể cả khi khách HỦY ở VNPay)
            // nên trang kết quả báo "thành công" sai (UI_PH5_FR02_007). Giờ mã hiển thị lấy theo trạng thái
            // Payment thật trong DB sau khi xử lý (idempotent: IPN và trình duyệt cùng gọi cũng không sao):
            //   "00" chỉ khi Payment SUCCESS; còn lại là vnp_ResponseCode của VNPay (vd. 24 = khách hủy) hoặc 99.
            // paymentResult = SUCCESS | FAILED | PENDING để FE hiển thị; FE nên gọi
            // GET /api/v1/payments/order/{orderId}/status để lấy kết quả chính thức.
            String txnRef = queryParams.get("vnp_TxnRef");
            Long orderId = null;
            String displayRspCode = "99";
            String paymentResult = "FAILED";
            if (txnRef != null) {
                Payment payment = paymentRepository.findByTxnRef(txnRef).orElse(null);
                if (payment != null) {
                    orderId = payment.getOrderId();
                    String status = payment.getStatus() == null ? "" : payment.getStatus().toUpperCase();
                    String vnpCode = queryParams.get("vnp_ResponseCode");
                    if ("SUCCESS".equals(status)) {
                        displayRspCode = "00";
                        paymentResult = "SUCCESS";
                    } else if ("PENDING".equals(status)) {
                        displayRspCode = vnpCode != null && !"00".equals(vnpCode) ? vnpCode : "99";
                        paymentResult = "PENDING";
                    } else {
                        displayRspCode = vnpCode != null && !"00".equals(vnpCode) ? vnpCode : "99";
                        paymentResult = "FAILED";
                    }
                }
            }

            String targetUrl = frontendUrl + "/profile";
            if (orderId != null) {
                targetUrl = frontendUrl + "/order/" + orderId + "?paymentStatus=" + displayRspCode
                        + "&paymentResult=" + paymentResult;
            }

            log.info("Redirecting customer browser to: {}", targetUrl);
            return ResponseEntity.status(HttpStatus.FOUND)
                    .header("Location", targetUrl)
                    .build();
        }

        return ResponseEntity.ok(response);
    }
}
