package com.ecommerce.userservice.controller;

import com.ecommerce.userservice.dto.ApiResponse;
import com.ecommerce.userservice.dto.request.PointUpdateRequest;
import com.ecommerce.userservice.dto.request.SegmentationUpdateRequest;
import com.ecommerce.userservice.dto.request.TierUpdateRequest;
import com.ecommerce.userservice.dto.response.InternalUserProfileResponse;
import com.ecommerce.userservice.dto.response.LoyaltyPointResponse;
import com.ecommerce.userservice.dto.response.UserAiProfileResponse;
import com.ecommerce.userservice.service.LoyaltyPointService;
import com.ecommerce.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/internal/users")
@RequiredArgsConstructor
@Slf4j
public class InternalUserController {

    private final UserService userService;
    private final LoyaltyPointService loyaltyPointService;

    @PutMapping("/{userId}/segmentation")
    public ResponseEntity<ApiResponse<String>> updateSegmentation(
            @PathVariable Long userId,
            @Valid @RequestBody SegmentationUpdateRequest request) {
        
        log.info("PUT /api/internal/users/{}/segmentation - label: {}", userId, request.getSegmentationLabel());
        userService.updateSegmentationLabel(userId, request.getSegmentationLabel());
        return ResponseEntity.ok(ApiResponse.success("Segmentation label updated successfully", null));
    }

    @GetMapping("/{userId}/profile-ai")
    public ResponseEntity<ApiResponse<UserAiProfileResponse>> getAiProfile(@PathVariable Long userId) {
        log.info("GET /api/internal/users/{}/profile-ai", userId);
        UserAiProfileResponse profile = userService.getAiProfile(userId);
        return ResponseEntity.ok(ApiResponse.success(profile));
    }

    @GetMapping("/keycloak/{keycloakUserId}")
    public ResponseEntity<ApiResponse<InternalUserProfileResponse>> getProfileByKeycloakId(
            @PathVariable String keycloakUserId) {
        log.info("GET /api/internal/users/keycloak/{}", keycloakUserId);
        return ResponseEntity.ok(ApiResponse.success(
                userService.getInternalProfileByKeycloakId(keycloakUserId)));
    }

    /**
     * [Order Service] Cập nhật hạng thành viên sau khi đơn hàng hoàn thành.
     * PUT /api/internal/users/{userId}/tier { "tier": "GOLD" }
     */
    @PutMapping("/{userId}/tier")
    public ResponseEntity<ApiResponse<Void>> updateTier(
            @PathVariable Long userId,
            @Valid @RequestBody TierUpdateRequest request) {

        log.info("PUT /api/internal/users/{}/tier - tier: {}", userId, request.getTier());
        userService.updateCustomerTier(userId, request.getTier());
        return ResponseEntity.ok(ApiResponse.success("Customer tier updated successfully", null));
    }

    /**
     * [Promotion Service] Cộng/trừ điểm thưởng từ chiến dịch Camunda.
     * PUT /api/internal/users/{userId}/points
     */
    @PutMapping("/{userId}/points")
    public ResponseEntity<ApiResponse<LoyaltyPointResponse>> updatePoints(
            @PathVariable Long userId,
            @Valid @RequestBody PointUpdateRequest request) {

        log.info("PUT /api/internal/users/{}/points mode={} amount={}",
                userId, request.getCalculationMode(), request.getPointAmount());
        LoyaltyPointResponse result = loyaltyPointService.adjustPoints(userId, request);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/{userId}/points")
    public ResponseEntity<ApiResponse<Integer>> getPointBalance(@PathVariable Long userId) {
        return ResponseEntity.ok(ApiResponse.success(loyaltyPointService.getBalance(userId)));
    }
}
