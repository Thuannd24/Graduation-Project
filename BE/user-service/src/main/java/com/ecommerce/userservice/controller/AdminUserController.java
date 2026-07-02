package com.ecommerce.userservice.controller;

import com.ecommerce.userservice.dto.ApiResponse;
import com.ecommerce.userservice.dto.request.*;
import com.ecommerce.userservice.dto.response.*;
import com.ecommerce.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Admin API — Quản lý người dùng toàn diện.
 * Phân quyền thô tại Gateway: hasAnyRole ADMIN, STAFF.
 * Phân quyền tinh tại @PreAuthorize.
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
@Slf4j
public class AdminUserController {

    private final UserService userService;

    // ──────────────────────────────────────────────────────────────────────────
    // LIST & SEARCH
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [STAFF + ADMIN] Lấy danh sách user có phân trang & filter.
     * GET /api/v1/admin/users?search=&tier=&blacklisted=&active=&page=0&size=20
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<Page<UserProfileResponse>>> getAllUsers(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String tier,
            @RequestParam(required = false) Boolean blacklisted,
            @RequestParam(required = false) Boolean active,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {

        log.info("GET /api/v1/admin/users - search: {}, tier: {}, blacklisted: {}, page: {}",
                search, tier, blacklisted, pageable.getPageNumber());

        Page<UserProfileResponse> users;
        if (search != null || tier != null || blacklisted != null || active != null) {
            users = userService.adminSearchUsers(search, tier, blacklisted, active, pageable);
        } else {
            users = userService.getAllUsers(pageable);
        }
        return ResponseEntity.ok(ApiResponse.success(users));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CRUD
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [ADMIN only] Tạo user mới (Keycloak + DB).
     */
    @PostMapping
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<UserAdminDetailResponse>> createUser(
            @Valid @RequestBody CreateUserRequest request) {
        log.info("POST /api/v1/admin/users - username: {}, email: {}", request.getUsername(), request.getEmail());
        UserAdminDetailResponse user = userService.adminCreateUser(request);
        return ResponseEntity.ok(ApiResponse.success("Tạo người dùng thành công", user));
    }

    /**
     * [STAFF + ADMIN] Lấy chi tiết user.
     */
    @GetMapping("/{userId}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<UserAdminDetailResponse>> getUserDetail(
            @PathVariable Long userId) {
        log.info("GET /api/v1/admin/users/{}", userId);
        UserAdminDetailResponse user = userService.adminGetUserDetail(userId);
        return ResponseEntity.ok(ApiResponse.success(user));
    }

    /**
     * [ADMIN only] Cập nhật thông tin user.
     */
    @PutMapping("/{userId}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<UserAdminDetailResponse>> updateUser(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateUserAdminRequest request) {
        log.info("PUT /api/v1/admin/users/{}", userId);
        UserAdminDetailResponse user = userService.adminUpdateUser(userId, request);
        return ResponseEntity.ok(ApiResponse.success("Cập nhật người dùng thành công", user));
    }

    /**
     * [ADMIN only] Xóa user.
     */
    @DeleteMapping("/{userId}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable Long userId) {
        log.info("DELETE /api/v1/admin/users/{}", userId);
        userService.adminDeleteUser(userId);
        return ResponseEntity.ok(ApiResponse.success("Đã xóa người dùng", null));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // BLACKLIST
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [ADMIN only] Khóa/mở khóa tài khoản.
     */
    @PutMapping("/{userId}/blacklist")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> updateBlacklist(
            @PathVariable Long userId,
            @Valid @RequestBody BlacklistRequest request) {

        log.info("PUT /api/v1/admin/users/{}/blacklist - blacklisted: {}", userId, request.getBlacklisted());
        userService.updateBlacklist(userId, request.getBlacklisted());

        // Đồng bộ trạng thái lên Keycloak
        userService.adminGetUserDetail(userId); // refresh

        String message = Boolean.TRUE.equals(request.getBlacklisted())
                ? "Tài khoản đã bị khóa" : "Tài khoản đã được mở khóa";
        return ResponseEntity.ok(ApiResponse.success(message, null));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TIER
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [ADMIN only] Thay đổi hạng thành viên.
     */
    @PutMapping("/{userId}/tier")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> updateTier(
            @PathVariable Long userId,
            @Valid @RequestBody TierUpdateRequest request) {
        log.info("PUT /api/v1/admin/users/{}/tier - tier: {}", userId, request.getTier());
        userService.updateCustomerTier(userId, request.getTier());
        return ResponseEntity.ok(ApiResponse.success("Cập nhật hạng thành viên thành công", null));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PASSWORD
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [ADMIN only] Reset mật khẩu user.
     */
    @PutMapping("/{userId}/reset-password")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @PathVariable Long userId,
            @Valid @RequestBody ResetPasswordRequest request) {
        log.info("PUT /api/v1/admin/users/{}/reset-password", userId);
        userService.adminResetPassword(userId, request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Đặt lại mật khẩu thành công", null));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ROLES
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [ADMIN only] Lấy danh sách roles trong hệ thống.
     */
    @GetMapping("/roles")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<List<RoleResponse>>> getAllRoles() {
        log.info("GET /api/v1/admin/users/roles");
        List<RoleResponse> roles = userService.adminGetAllRoles();
        return ResponseEntity.ok(ApiResponse.success(roles));
    }

    /**
     * [STAFF + ADMIN] Lấy roles của user.
     */
    @GetMapping("/{userId}/roles")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<List<String>>> getUserRoles(@PathVariable Long userId) {
        List<String> roles = userService.adminGetUserRoles(userId);
        return ResponseEntity.ok(ApiResponse.success(roles));
    }

    /**
     * [ADMIN only] Gán roles cho user.
     */
    @PutMapping("/{userId}/roles")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> setUserRoles(
            @PathVariable Long userId,
            @Valid @RequestBody RoleAssignmentRequest request) {
        log.info("PUT /api/v1/admin/users/{}/roles - roles: {}", userId, request.getRoles());
        userService.adminSetUserRoles(userId, request.getRoles());
        return ResponseEntity.ok(ApiResponse.success("Cập nhật phân quyền thành công", null));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STATISTICS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * [STAFF + ADMIN] Thống kê user dashboard.
     */
    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<UserStatsResponse>> getUserStats() {
        log.info("GET /api/v1/admin/users/stats");
        UserStatsResponse stats = userService.adminGetUserStats();
        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}
