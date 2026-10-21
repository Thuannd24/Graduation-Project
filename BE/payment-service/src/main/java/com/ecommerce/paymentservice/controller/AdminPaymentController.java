package com.ecommerce.paymentservice.controller;

import com.ecommerce.paymentservice.dto.ApiResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.dto.RefundResponse;
import com.ecommerce.paymentservice.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/payments")
@RequiredArgsConstructor
public class AdminPaymentController {

    private final PaymentService paymentService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<Page<PaymentResponse>> listPayments(
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return ApiResponse.success(paymentService.getAllPayments(pageable));
    }

    @PostMapping("/refund")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<RefundResponse> processRefund(@Valid @RequestBody RefundRequest request) {
        // Phản ánh đúng kết quả cổng: chỉ báo "thành công" khi VNPay xác nhận ngay; còn lại là
        // "đã gửi yêu cầu hoàn tiền" (REFUND_PENDING) hoặc "cần xử lý thủ công" (PENDING_MANUAL).
        RefundResponse result = paymentService.processRefund(request);
        return ApiResponse.<RefundResponse>builder()
                .code("SUCCESS")
                .message(result.getMessage())
                .data(result)
                .build();
    }
}
