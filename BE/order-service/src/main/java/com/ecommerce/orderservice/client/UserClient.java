package com.ecommerce.orderservice.client;

import com.ecommerce.orderservice.dto.ApiResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.math.BigDecimal;

@FeignClient(name = "user-service", fallbackFactory = UserClientFallbackFactory.class)
public interface UserClient {

    @GetMapping("/api/internal/users/keycloak/{keycloakUserId}")
    ApiResponse<InternalUserProfile> getProfileByKeycloakId(@PathVariable("keycloakUserId") String keycloakUserId);

    @PostMapping("/api/internal/users/{userId}/points/redeem")
    ApiResponse<PointRedeemResult> redeemPoints(
            @PathVariable("userId") Long userId,
            @RequestBody PointRedeemRequest request);

    @PostMapping("/api/internal/users/{userId}/points/refund")
    ApiResponse<PointRefundResult> refundPoints(
            @PathVariable("userId") Long userId,
            @RequestBody PointRefundRequest request);

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class InternalUserProfile {
        private Long id;
        private String keycloakUserId;
        private Integer loyaltyPoints;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class PointRedeemRequest {
        private Integer pointsToRedeem;
        private Long orderId;
        private BigDecimal orderAmount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class PointRedeemResult {
        private Long userId;
        private Integer pointsRedeemed;
        private BigDecimal discountAmount;
        private Integer newPointBalance;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class PointRefundRequest {
        private Long orderId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    class PointRefundResult {
        private Long userId;
        private Integer pointsApplied;
        private Integer newPointBalance;
    }
}
