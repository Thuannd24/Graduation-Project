package com.ecommerce.userservice.controller;

import com.ecommerce.userservice.dto.ApiResponse;
import com.ecommerce.userservice.dto.request.AddressRequest;
import com.ecommerce.userservice.dto.request.RedeemPreviewRequest;
import com.ecommerce.userservice.dto.request.UpdateProfileRequest;
import com.ecommerce.userservice.dto.response.AddressResponse;
import com.ecommerce.userservice.dto.response.LoyaltyTransactionDto;
import com.ecommerce.userservice.dto.response.RedeemPreviewResponse;
import com.ecommerce.userservice.dto.response.UserProfileResponse;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.service.AddressService;
import com.ecommerce.userservice.service.LoyaltyPointService;
import com.ecommerce.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final AddressService addressService;
    private final LoyaltyPointService loyaltyPointService;

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserProfileResponse>> getCurrentUser(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @RequestHeader(value = "X-User-Email", required = false) String email,
            @RequestHeader(value = "X-User-Username", required = false) String username,
            @RequestHeader(value = "X-User-Name", required = false) String fullName,
            @RequestHeader(value = "X-User-Avatar", required = false) String avatarUrl) {
        
        log.info("GET /api/v1/users/me - userId: {}, email: {}, name: {}, avatarUrl: {}", 
                keycloakUserId, email, fullName, avatarUrl);
        String decodedName = fullName;
        if (fullName != null && !fullName.isEmpty()) {
            try {
                decodedName = java.net.URLDecoder.decode(fullName, java.nio.charset.StandardCharsets.UTF_8.name());
            } catch (Exception e) {
                log.warn("Failed to decode X-User-Name header: {}", fullName, e);
            }
        }
        
        UserProfileResponse profile = userService.getCurrentUser(keycloakUserId, email, username, decodedName, avatarUrl);
        return ResponseEntity.ok(ApiResponse.success(profile));
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponse<UserProfileResponse>> updateProfile(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @Valid @RequestBody UpdateProfileRequest request) {
        
        log.info("PUT /api/v1/users/me - userId: {}", keycloakUserId);
        UserProfileResponse profile = userService.updateProfile(keycloakUserId, request);
        return ResponseEntity.ok(ApiResponse.success("Profile updated successfully", profile));
    }

    @PostMapping(value = "/me/avatar", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<UserProfileResponse>> uploadAvatar(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @RequestParam("file") MultipartFile file) {

        log.info("POST /api/v1/users/me/avatar - userId: {}", keycloakUserId);
        UserProfileResponse profile = userService.updateAvatar(keycloakUserId, file);
        return ResponseEntity.ok(ApiResponse.success("Avatar updated successfully", profile));
    }

    @GetMapping("/me/addresses")
    public ResponseEntity<ApiResponse<List<AddressResponse>>> getAddresses(
            @RequestHeader("X-User-Id") String keycloakUserId) {
        
        log.info("GET /api/v1/users/me/addresses - userId: {}", keycloakUserId);
        User user = userService.getUserByKeycloakId(keycloakUserId);
        List<AddressResponse> addresses = addressService.getAddresses(user.getId());
        return ResponseEntity.ok(ApiResponse.success(addresses));
    }

    @PostMapping("/me/addresses")
    public ResponseEntity<ApiResponse<AddressResponse>> addAddress(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @Valid @RequestBody AddressRequest request) {

        log.info("POST /api/v1/users/me/addresses - userId: {}", keycloakUserId);
        User user = userService.getUserByKeycloakId(keycloakUserId);
        AddressResponse address = addressService.addAddress(user.getId(), request);
        return ResponseEntity.ok(ApiResponse.success("Address added successfully", address));
    }

    @DeleteMapping("/me/addresses/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteAddress(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @PathVariable Long id) {

        log.info("DELETE /api/v1/users/me/addresses/{} - userId: {}", id, keycloakUserId);
        User user = userService.getUserByKeycloakId(keycloakUserId);
        addressService.deleteAddress(user.getId(), id);
        return ResponseEntity.ok(ApiResponse.success("Address deleted successfully", null));
    }

    @GetMapping("/me/loyalty/points")
    public ResponseEntity<ApiResponse<Integer>> getMyLoyaltyPoints(
            @RequestHeader("X-User-Id") String keycloakUserId) {
        User user = userService.getUserByKeycloakId(keycloakUserId);
        return ResponseEntity.ok(ApiResponse.success(loyaltyPointService.getBalance(user.getId())));
    }

    @GetMapping("/me/loyalty/history")
    public ResponseEntity<ApiResponse<Page<LoyaltyTransactionDto>>> getMyLoyaltyHistory(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = userService.getUserByKeycloakId(keycloakUserId);
        Page<LoyaltyTransactionDto> history = loyaltyPointService.getTransactionHistory(
                user.getId(), PageRequest.of(page, size));
        return ResponseEntity.ok(ApiResponse.success(history));
    }

    @PostMapping("/me/loyalty/redeem-preview")
    public ResponseEntity<ApiResponse<RedeemPreviewResponse>> previewRedeem(
            @RequestHeader("X-User-Id") String keycloakUserId,
            @Valid @RequestBody RedeemPreviewRequest request) {
        User user = userService.getUserByKeycloakId(keycloakUserId);
        RedeemPreviewResponse preview = loyaltyPointService.redeemPreview(user.getId(), request.getOrderAmount());
        return ResponseEntity.ok(ApiResponse.success(preview));
    }

    @GetMapping("/public/{keycloakUserId}")
    public ResponseEntity<ApiResponse<UserProfileResponse>> getPublicUserProfile(@PathVariable String keycloakUserId) {
        log.info("GET /api/v1/users/public/{}", keycloakUserId);
        User user = userService.getUserByKeycloakId(keycloakUserId);
        UserProfileResponse profile = UserProfileResponse.builder()
                .id(user.getId())
                .keycloakUserId(user.getKeycloakUserId())
                .username(user.getUsername())
                .fullName(user.getFullName())
                .avatarUrl(user.getAvatarUrl())
                .build();
        return ResponseEntity.ok(ApiResponse.success(profile));
    }
}
