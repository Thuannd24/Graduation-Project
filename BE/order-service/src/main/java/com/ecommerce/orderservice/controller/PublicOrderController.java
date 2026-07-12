package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.request.WarrantyOtpRequest;
import com.ecommerce.orderservice.dto.response.WarrantyItemResponse;
import com.ecommerce.orderservice.dto.response.WarrantyOtpResponse;
import com.ecommerce.orderservice.service.OrderService;
import com.ecommerce.orderservice.service.WarrantyOtpService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/orders")
@RequiredArgsConstructor
public class PublicOrderController {

    private final OrderService orderService;
    private final WarrantyOtpService warrantyOtpService;

    /**
     * POST /api/v1/public/orders/warranty/otp
     * Gửi OTP tra cứu bảo hành — rate limit theo SĐT và IP.
     */
    @PostMapping("/warranty/otp")
    public ApiResponse<WarrantyOtpResponse> requestWarrantyOtp(
            @Valid @RequestBody WarrantyOtpRequest request,
            HttpServletRequest httpRequest) {
        String clientIp = resolveClientIp(httpRequest);
        return ApiResponse.success(warrantyOtpService.requestOtp(request.getPhone(), clientIp));
    }

    /**
     * GET /api/v1/public/orders/warranty?phone=...&otp=...
     * Tra cứu bảo hành — bắt buộc OTP hợp lệ.
     */
    @GetMapping("/warranty")
    public ApiResponse<List<WarrantyItemResponse>> lookupWarranty(
            @RequestParam("phone") String phone,
            @RequestParam("otp") String otp) {
        warrantyOtpService.verifyOtpOrThrow(phone, otp);
        return ApiResponse.success(orderService.lookupWarrantyByPhone(phone.trim()));
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
