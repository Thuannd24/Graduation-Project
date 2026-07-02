package com.ecommerce.orderservice.client;

import com.ecommerce.orderservice.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
@Slf4j
public class PromotionClientFallbackFactory implements FallbackFactory<PromotionClient> {

    @Override
    public PromotionClient create(Throwable cause) {
        return new PromotionClient() {
            @Override
            public ApiResponse<VoucherApplyResult> validateVoucher(VoucherApplyRequest request) {
                log.error("promotion-service unavailable for validate: {}", cause.getMessage());
                return ApiResponse.error("SERVICE_UNAVAILABLE", "Không thể kiểm tra mã voucher lúc này.");
            }

            @Override
            public ApiResponse<VoucherApplyResult> applyVoucher(VoucherApplyRequest request) {
                log.error("promotion-service unavailable for apply: {}", cause.getMessage());
                return ApiResponse.error("SERVICE_UNAVAILABLE", "Không thể áp dụng mã voucher lúc này.");
            }

            @Override
            public ApiResponse<Void> redeemVoucher(VoucherOrderActionRequest request) {
                log.error("promotion-service unavailable for redeem orderId={}: {}",
                        request != null ? request.getOrderId() : null, cause.getMessage());
                return ApiResponse.error("SERVICE_UNAVAILABLE", "Không thể xác nhận voucher.");
            }

            @Override
            public ApiResponse<Void> releaseVoucher(VoucherOrderActionRequest request) {
                log.error("promotion-service unavailable for release orderId={}: {}",
                        request != null ? request.getOrderId() : null, cause.getMessage());
                return ApiResponse.error("SERVICE_UNAVAILABLE", "Không thể giải phóng voucher.");
            }
        };
    }
}
