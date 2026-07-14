package com.ecommerce.orderservice.client;

import com.ecommerce.orderservice.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class UserClientFallbackFactory implements FallbackFactory<UserClient> {

    @Override
    public UserClient create(Throwable cause) {
        return new UserClient() {
            @Override
            public ApiResponse<InternalUserProfile> getProfileByKeycloakId(String keycloakUserId) {
                log.error("user-service unavailable for keycloak profile {}: {}", keycloakUserId, cause.getMessage());
                return ApiResponse.error("FALLBACK", "user-service unavailable");
            }

            @Override
            public ApiResponse<PointRedeemResult> redeemPoints(Long userId, PointRedeemRequest request) {
                log.error("user-service unavailable for redeem userId={} orderId={}: {}",
                        userId, request != null ? request.getOrderId() : null, cause.getMessage());
                return ApiResponse.error("FALLBACK", "Không thể đổi điểm lúc này.");
            }

            @Override
            public ApiResponse<PointRefundResult> refundPoints(Long userId, PointRefundRequest request) {
                log.error("user-service unavailable for refund userId={} orderId={}: {}",
                        userId, request != null ? request.getOrderId() : null, cause.getMessage());
                return ApiResponse.error("FALLBACK", "Không thể hoàn điểm lúc này.");
            }
        };
    }
}
