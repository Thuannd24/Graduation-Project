package com.ecommerce.paymentservice.controller;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentConfigResponse;
import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.PaymentStatusResponse;
import com.ecommerce.paymentservice.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping("/initiate")
    public ApiResponse<PaymentInitiateResponse> initiatePayment(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @RequestHeader(value = "X-User-Email", defaultValue = "anonymous@ecommerce.com") String userEmail,
            @Valid @RequestBody PaymentInitiateRequest request,
            HttpServletRequest servletRequest,
            Authentication authentication) {

        // SECURITY: Prefer the identity from the validated JWT over the X-User-Id/Email
        // headers. The gateway strips and re-injects these headers from the JWT, but if this
        // service is ever reached directly (bypassing the gateway), a caller with their own
        // valid JWT could still forge these headers to impersonate another user.
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
            userId = jwt.getSubject();
            String email = jwt.getClaimAsString("email");
            if (email != null && !email.isEmpty()) {
                userEmail = email;
            }
        }

        request.setIpAddress(resolveClientIp(servletRequest));
        request.setUserId(userId);
        request.setEmail(userEmail);

        return ApiResponse.success(paymentService.initiatePayment(request));
    }

    /**
     * Thanh toán lại (VNPay, tạo URL mới cho cùng đơn) hoặc đổi sang COD sau khi lượt VNPay thất bại/bị hủy.
     * Tương đương POST /initiate với orderId trên đường dẫn; vẫn kiểm tra chủ đơn, trạng thái đơn và hạn mức COD.
     */
    @PostMapping("/order/{orderId}/retry")
    public ApiResponse<PaymentInitiateResponse> retryPayment(
            @PathVariable Long orderId,
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @RequestHeader(value = "X-User-Email", defaultValue = "anonymous@ecommerce.com") String userEmail,
            @Valid @RequestBody RetryPaymentRequest body,
            HttpServletRequest servletRequest,
            Authentication authentication) {
        PaymentInitiateRequest request = PaymentInitiateRequest.builder()
                .orderId(orderId)
                .paymentMethod(body.getPaymentMethod())
                .build();
        return initiatePayment(userId, userEmail, request, servletRequest, authentication);
    }

    @GetMapping("/order/{orderId}")
    public ApiResponse<PaymentResponse> getPaymentByOrderId(@PathVariable Long orderId, Authentication authentication) {
        // SECURITY: Derive identity from the validated JWT (not the spoofable X-User-Id
        // header) so this endpoint is safe even if a caller bypasses the API gateway and
        // hits this service directly with a forged header.
        return ApiResponse.success(paymentService.getPaymentByOrderId(orderId, callerUserId(authentication),
                isAdminOrStaff(authentication)));
    }

    /**
     * Trạng thái thanh toán thật của đơn (theo DB) cho trang kết quả thanh toán - không tin tham số trên URL.
     * Chỉ chủ đơn hoặc admin/staff.
     */
    @GetMapping("/order/{orderId}/status")
    public ApiResponse<PaymentStatusResponse> getPaymentStatus(@PathVariable Long orderId,
            Authentication authentication) {
        return ApiResponse.success(paymentService.getPaymentStatus(orderId, callerUserId(authentication),
                isAdminOrStaff(authentication)));
    }

    /** Cấu hình thanh toán cho giao diện: phương thức hỗ trợ và hạn mức COD. */
    @GetMapping("/config")
    public ApiResponse<PaymentConfigResponse> getPaymentConfig() {
        return ApiResponse.success(paymentService.getPaymentConfig());
    }

    private static String callerUserId(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
            return jwt.getSubject();
        }
        return null;
    }

    private static boolean isAdminOrStaff(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof Jwt) {
            return authentication.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority)
                    .anyMatch(a -> a.equals("ROLE_ADMIN") || a.equals("ROLE_STAFF"));
        }
        return false;
    }

    private static String resolveClientIp(HttpServletRequest servletRequest) {
        String ip = servletRequest.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = servletRequest.getRemoteAddr();
        }
        return ip;
    }

    @Data
    public static class RetryPaymentRequest {
        @jakarta.validation.constraints.NotBlank(message = "Vui lòng chọn phương thức thanh toán (VNPAY hoặc COD).")
        private String paymentMethod;
    }
}
