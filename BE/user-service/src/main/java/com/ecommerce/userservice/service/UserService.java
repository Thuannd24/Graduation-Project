package com.ecommerce.userservice.service;

import com.ecommerce.userservice.dto.request.*;
import com.ecommerce.userservice.dto.response.*;
import com.ecommerce.userservice.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface UserService {

    /**
     * Lấy profile user hiện tại. Nếu chưa tồn tại trong DB → tự động tạo (on-the-fly provisioning).
     */
    UserProfileResponse getCurrentUser(String keycloakUserId, String email, String username, String fullName, String avatarUrl);

    /**
     * Cập nhật thông tin profile (fullName, phoneNumber).
     */
    UserProfileResponse updateProfile(String keycloakUserId, UpdateProfileRequest request);

    /**
     * Cập nhật avatar thủ công bằng cách upload file lên MinIO.
     */
    UserProfileResponse updateAvatar(String keycloakUserId, org.springframework.web.multipart.MultipartFile file);

    /**
     * Tìm hoặc tạo user theo keycloakUserId. Dùng cho các service nội bộ cần resolve userId.
     */
    User findOrCreateUser(String keycloakUserId, String email, String username);

    /**
     * Lấy User entity theo keycloakUserId — dùng nội bộ trong service layer.
     */
    User getUserByKeycloakId(String keycloakUserId);

    /**
     * Cập nhật nhãn phân khúc khách hàng (từ AI K-Means job).
     */
    void updateSegmentationLabel(Long userId, String label);

    /**
     * Lấy thông tin user phục vụ AI Engine (RAG, Dynamic Pricing).
     */
    UserAiProfileResponse getAiProfile(Long userId);

    InternalUserProfileResponse getInternalProfileByKeycloakId(String keycloakUserId);

    /**
     * Lấy danh sách toàn bộ users có phân trang (dành cho Admin/Staff).
     */
    Page<UserProfileResponse> getAllUsers(Pageable pageable);

    /**
     * Khóa / Mở khóa tài khoản user (chỉ Admin).
     */
    void updateBlacklist(Long userId, Boolean blacklisted);

    /**
     * Cập nhật hạng thành viên (gọi bởi Order Service sau khi đơn hàng hoàn thành).
     */
    void updateCustomerTier(Long userId, String tier);

    // ──────────────────────────────────────────────────────────────────────────
    // Admin User Management Methods
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Tạo user mới (Keycloak + DB).
     */
    UserAdminDetailResponse adminCreateUser(CreateUserRequest request);

    /**
     * Lấy chi tiết user (kèm roles từ Keycloak).
     */
    UserAdminDetailResponse adminGetUserDetail(Long userId);

    /**
     * Admin cập nhật thông tin user.
     */
    UserAdminDetailResponse adminUpdateUser(Long userId, UpdateUserAdminRequest request);

    /**
     * Admin xóa user (Keycloak + DB soft-delete).
     */
    void adminDeleteUser(Long userId);

    /**
     * Tìm kiếm user với filter.
     */
    Page<UserProfileResponse> adminSearchUsers(String search, String tier, Boolean blacklisted, Boolean active, Pageable pageable);

    /**
     * Đổi mật khẩu user.
     */
    void adminResetPassword(Long userId, String newPassword);

    /**
     * Lấy danh sách roles hiện có trong Keycloak realm.
     */
    List<RoleResponse> adminGetAllRoles();

    /**
     * Lấy roles hiện tại của user.
     */
    List<String> adminGetUserRoles(Long userId);

    /**
     * Gán roles cho user.
     */
    void adminSetUserRoles(Long userId, List<String> roles);

    /**
     * Lấy thống kê user dashboard.
     */
    UserStatsResponse adminGetUserStats();
}
