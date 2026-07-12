package com.ecommerce.promotionservice.controller;

import com.ecommerce.promotionservice.dto.ApiResponse;
import com.ecommerce.promotionservice.dto.UserVoucherDto;
import com.ecommerce.promotionservice.dto.VoucherApplyRequest;
import com.ecommerce.promotionservice.dto.VoucherApplyResult;
import com.ecommerce.promotionservice.service.VoucherQueryService;
import com.ecommerce.promotionservice.service.VoucherRedemptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/promotions/vouchers")
@RequiredArgsConstructor
public class VoucherController {

    private final VoucherQueryService voucherQueryService;
    private final VoucherRedemptionService voucherRedemptionService;

    @GetMapping("/me")
    public ApiResponse<List<UserVoucherDto>> getMyVouchers(
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("Yêu cầu đăng nhập để xem voucher.");
        }
        return ApiResponse.success(voucherQueryService.getVouchersForUser(userId));
    }

    @PostMapping("/preview")
    public ApiResponse<VoucherApplyResult> preview(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody VoucherApplyRequest request) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("Yêu cầu đăng nhập để kiểm tra voucher.");
        }
        request.setUserId(userId);
        request.setOrderId(null);
        return ApiResponse.success(voucherRedemptionService.preview(request));
    }
}
