package com.ecommerce.paymentservice.controller;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.service.PaymentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
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

        // Resolve client IP address
        String ip = servletRequest.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = servletRequest.getRemoteAddr();
        }
        request.setIpAddress(ip);
        request.setUserId(userId);
        request.setEmail(userEmail);

        return ApiResponse.success(paymentService.initiatePayment(request));
    }

    @GetMapping("/order/{orderId}")
    public ApiResponse<PaymentResponse> getPaymentByOrderId(@PathVariable Long orderId, Authentication authentication) {
        // SECURITY: Derive identity from the validated JWT (not the spoofable X-User-Id
        // header) so this endpoint is safe even if a caller bypasses the API gateway and
        // hits this service directly with a forged header.
        String callerUserId = null;
        boolean isAdminOrStaff = false;
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
            callerUserId = jwt.getSubject();
            isAdminOrStaff = authentication.getAuthorities().stream()
                    .map(GrantedAuthority::getAuthority)
                    .anyMatch(a -> a.equals("ROLE_ADMIN") || a.equals("ROLE_STAFF"));
        }
        return ApiResponse.success(paymentService.getPaymentByOrderId(orderId, callerUserId, isAdminOrStaff));
    }
}
