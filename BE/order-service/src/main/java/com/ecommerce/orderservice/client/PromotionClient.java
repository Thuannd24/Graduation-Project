package com.ecommerce.orderservice.client;

import com.ecommerce.orderservice.dto.ApiResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@FeignClient(name = "promotion-service", fallbackFactory = PromotionClientFallbackFactory.class)
public interface PromotionClient {

    @PostMapping("/api/internal/vouchers/validate")
    ApiResponse<VoucherApplyResult> previewVoucher(@RequestBody VoucherApplyRequest request);

    @PostMapping("/api/internal/vouchers/apply")
    ApiResponse<VoucherApplyResult> applyVoucher(@RequestBody VoucherApplyRequest request);

    @PostMapping("/api/internal/vouchers/redeem")
    ApiResponse<Void> redeemVoucher(@RequestBody VoucherOrderActionRequest request);

    @PostMapping("/api/internal/vouchers/release")
    ApiResponse<Void> releaseVoucher(@RequestBody VoucherOrderActionRequest request);

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class VoucherApplyRequest {
        private String code;
        private String userId;
        private Long orderId;
        private BigDecimal orderTotal;
        private BigDecimal shippingFee;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class VoucherApplyResult {
        private boolean applied;
        private String message;
        private String voucherCode;
        private String voucherType;
        private BigDecimal discountAmount;
        private BigDecimal productDiscountAmount;
        private BigDecimal shippingDiscountAmount;
        private BigDecimal finalAmount;
        private Long campaignId;
        private LocalDateTime expiresAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class VoucherOrderActionRequest {
        private Long orderId;
    }
}
