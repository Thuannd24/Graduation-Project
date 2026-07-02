package com.ecommerce.promotionservice.controller;

import com.ecommerce.promotionservice.dto.ApiResponse;
import com.ecommerce.promotionservice.dto.VoucherApplyRequest;
import com.ecommerce.promotionservice.dto.VoucherApplyResult;
import com.ecommerce.promotionservice.dto.VoucherOrderActionRequest;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.VoucherRedemptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/internal/vouchers")
@RequiredArgsConstructor
public class InternalVoucherController {

    private final IssuedVoucherRepository voucherRepository;
    private final VoucherRedemptionService voucherRedemptionService;

    @GetMapping("/{code}")
    public ApiResponse<Map<String, Object>> getByCode(@PathVariable String code) {
        IssuedVoucher voucher = voucherRepository.findByCode(code.trim().toUpperCase())
                .orElseThrow(() -> new IllegalArgumentException("Voucher not found: " + code));

        Map<String, Object> body = new HashMap<>();
        body.put("id", voucher.getId());
        body.put("code", voucher.getCode());
        body.put("userId", voucher.getUserId());
        body.put("campaignId", voucher.getCampaignId());
        body.put("voucherType", voucher.getVoucherType());
        body.put("status", voucher.getStatus());
        body.put("discountPercent", voucher.getDiscountPercent());
        body.put("maxDiscountAmount", voucher.getMaxDiscountAmount());
        body.put("discountAmount", voucher.getDiscountAmount());
        body.put("minOrderValue", voucher.getMinOrderValue());
        body.put("maxShippingDiscount", voucher.getMaxShippingDiscount());
        body.put("expiresAt", voucher.getExpiresAt());
        body.put("usedOrderId", voucher.getUsedOrderId());
        return ApiResponse.success(body);
    }

    /** Preview — không đổi DB (dùng cho nút "Kiểm tra mã" trên FE). */
    @PostMapping("/validate")
    public ApiResponse<VoucherApplyResult> validate(@RequestBody VoucherApplyRequest request) {
        return ApiResponse.success(voucherRedemptionService.preview(request));
    }

    /** Checkout: reserve voucher gắn orderId. */
    @PostMapping("/apply")
    public ApiResponse<VoucherApplyResult> apply(@RequestBody VoucherApplyRequest request) {
        return ApiResponse.success(voucherRedemptionService.apply(request));
    }

    @PostMapping("/redeem")
    public ApiResponse<Void> redeem(@RequestBody VoucherOrderActionRequest request) {
        voucherRedemptionService.redeemByOrderId(request.getOrderId());
        return ApiResponse.success(null);
    }

    @PostMapping("/release")
    public ApiResponse<Void> release(@RequestBody VoucherOrderActionRequest request) {
        voucherRedemptionService.releaseByOrderId(request.getOrderId());
        return ApiResponse.success(null);
    }
}
