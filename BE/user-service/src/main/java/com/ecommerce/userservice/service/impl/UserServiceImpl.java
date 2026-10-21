package com.ecommerce.userservice.service.impl;

import com.ecommerce.userservice.client.KeycloakAdminClient;
import com.ecommerce.userservice.dto.request.*;
import com.ecommerce.userservice.dto.response.*;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.exception.KeycloakSyncException;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.UserRepository;
import com.ecommerce.userservice.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final KeycloakAdminClient keycloakAdminClient;
    private final com.ecommerce.userservice.service.StorageService storageService;
    private final com.ecommerce.userservice.event.producer.UserEventProducer userEventProducer;

    @Override
    @Transactional // Cần transaction vì có thể gọi save() khi auto-provision
    public UserProfileResponse getCurrentUser(String keycloakUserId, String email, String username, String fullName, String avatarUrl) {
        log.info("Getting current user profile: {}", keycloakUserId);
        User user;
        synchronized (keycloakUserId.intern()) {
            user = userRepository.findByKeycloakUserId(keycloakUserId)
                    .orElseGet(() -> {
                        // Cùng 1 người có thể đăng nhập qua nhiều phương thức khác nhau (password, Google...)
                        // → Keycloak sinh ra keycloakUserId khác nhau cho mỗi identity nhưng chung email.
                        // Nếu email đã tồn tại dưới keycloakUserId khác, liên kết lại bản ghi cũ sang
                        // keycloakUserId hiện tại thay vì tạo mới (sẽ vi phạm UNIQUE constraint trên email).
                        if (email != null && !email.isEmpty()) {
                            Optional<User> existingByEmail = userRepository.findByEmail(email);
                            if (existingByEmail.isPresent()) {
                                User existing = existingByEmail.get();
                                log.info("Phát hiện đăng nhập bằng phương thức khác cho email {}: liên kết keycloakUserId {} → {}",
                                        email, existing.getKeycloakUserId(), keycloakUserId);
                                existing.setKeycloakUserId(keycloakUserId);
                                return userRepository.save(existing);
                            }
                        }
                        log.info("User profile not found. Auto-provisioning profile for: {}", keycloakUserId);
                        return createUserFromKeycloak(keycloakUserId, email, username, fullName, avatarUrl);
                    });
        }
        
        // ──────────────────────────────────────────────────────────────────────
        // Đồng bộ thông tin từ Keycloak JWT → DB mỗi lần gọi /users/me
        // Fix: Trường hợp user được tạo trước đó bởi getUserByKeycloakId()
        // với dữ liệu placeholder (UUID@placeholder.com, "Keycloak User")
        // → Khi đăng nhập lại, cần cập nhật lại từ JWT token thực tế.
        // ──────────────────────────────────────────────────────────────────────
        boolean changed = false;

        // Sync email: cập nhật nếu JWT khác DB
        if (email != null && !email.isEmpty() && !email.equals(user.getEmail())) {
            log.info("Auto-syncing email for user {}: {} → {}", keycloakUserId, user.getEmail(), email);
            user.setEmail(email);
            changed = true;
        }

        // Sync fullName: CHỈ điền từ JWT khi DB còn trống / placeholder ("Keycloak User").
        // Họ tên là dữ liệu khách tự quản lý: nếu luôn ghi đè bằng claim của token thì tên khách vừa
        // sửa ở trang hồ sơ sẽ bị trả về tên cũ ở lần tải hồ sơ sau (UI_PH1_FR02_002).
        if (fullName != null && !fullName.isEmpty() && isPlaceholderFullName(user.getFullName())
                && !fullName.equals(user.getFullName())) {
            log.info("Auto-filling fullName for user {}: {} → {}", keycloakUserId, user.getFullName(), fullName);
            user.setFullName(fullName);
            changed = true;
        }

        // Sync username: cập nhật nếu JWT khác DB
        if (username != null && !username.isEmpty() && !username.equals(user.getUsername())) {
            log.info("Auto-syncing username for user {}: {} → {}", keycloakUserId, user.getUsername(), username);
            user.setUsername(username);
            changed = true;
        }

        // Sync avatar: chỉ điền từ JWT (VD: ảnh Google) khi DB chưa có avatar — không ghi đè ảnh khách tự tải lên
        if (avatarUrl != null && !avatarUrl.isEmpty()
                && (user.getAvatarUrl() == null || user.getAvatarUrl().isBlank())) {
            log.info("Auto-filling avatar for user {}: {}", keycloakUserId, avatarUrl);
            user.setAvatarUrl(avatarUrl);
            changed = true;
        }

        // Tự động đồng bộ Số điện thoại từ Username nếu DB đang trống số điện thoại
        // và Username lại là số điện thoại hợp lệ (do đăng ký qua form)
        if ((user.getPhoneNumber() == null || user.getPhoneNumber().isEmpty())
                && user.getUsername() != null && user.getUsername().matches("^0[0-9]{9,10}$")) {
            log.info("Auto-syncing phoneNumber from username for user {}: {}", keycloakUserId, user.getUsername());
            user.setPhoneNumber(user.getUsername());
            changed = true;
        }

        if (changed) {
            user = userRepository.save(user);
        }

        return mapToProfileResponse(user);
    }

    @Override
    @Transactional
    public UserProfileResponse updateProfile(String keycloakUserId, UpdateProfileRequest request) {
        log.info("Updating profile for user: {}", keycloakUserId);
        User user = userRepository.findByKeycloakUserId(keycloakUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "keycloakUserId", keycloakUserId));

        String newFullName = null;
        if (request.getFullName() != null) {
            newFullName = request.getFullName().trim();
            if (newFullName.isEmpty()) {
                throw new IllegalArgumentException("Họ tên không được để trống.");
            }
            user.setFullName(newFullName);
        }
        if (request.getPhoneNumber() != null) {
            user.setPhoneNumber(request.getPhoneNumber());
        }
        if (request.getAvatarUrl() != null) {
            user.setAvatarUrl(request.getAvatarUrl());
        }

        user = userRepository.save(user);

        // Đồng bộ tên lên Keycloak (best-effort) để trang tài khoản Keycloak hiển thị khớp.
        // DB là nguồn dữ liệu chính: getCurrentUser không còn ghi đè tên bằng claim của token,
        // nên dù Keycloak lỗi thì tên khách vừa sửa vẫn được giữ.
        if (newFullName != null) {
            try {
                keycloakAdminClient.updateUser(keycloakUserId, null, newFullName);
            } catch (Exception e) {
                log.warn("Cannot sync fullName to Keycloak for user {}: {}", keycloakUserId, e.getMessage());
            }
        }
        return mapToProfileResponse(user);
    }

    @Override
    @Transactional
    public UserProfileResponse updateAvatar(String keycloakUserId, org.springframework.web.multipart.MultipartFile file) {
        log.info("Uploading avatar for user: {}", keycloakUserId);
        User user = userRepository.findByKeycloakUserId(keycloakUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "keycloakUserId", keycloakUserId));

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File upload không được trống.");
        }

        // Upload file lên MinIO trong thư mục "avatars"
        String avatarUrl = storageService.uploadFile(file, "avatars");

        // Lưu URL vào database
        user.setAvatarUrl(avatarUrl);
        user = userRepository.save(user);

        return mapToProfileResponse(user);
    }

    @Override
    @Transactional
    public User findOrCreateUser(String keycloakUserId, String email, String username) {
        log.info("Finding or creating user: {}", keycloakUserId);
        synchronized (keycloakUserId.intern()) {
            return userRepository.findByKeycloakUserId(keycloakUserId)
                    .orElseGet(() -> {
                        log.info("Creating new user: {}", keycloakUserId);
                        return createUserFromKeycloak(keycloakUserId, email, username, null, null);
                    });
        }
    }

    @Override
    @Transactional(readOnly = true)
    public User getUserByKeycloakId(String keycloakUserId) {
        return userRepository.findByKeycloakUserId(keycloakUserId)
                .orElseThrow(() -> {
                    log.warn("User profile not found for keycloakId={}. "
                           + "Client must call GET /users/me first to provision the profile.", keycloakUserId);
                    return new ResourceNotFoundException("User", "keycloakUserId", keycloakUserId);
                });
    }

    @Override
    @Transactional
    public void updateSegmentationLabel(Long userId, String label) {
        log.info("Updating segmentation label for user {}: {}", userId, label);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setSegmentationLabel(label);
        userRepository.save(user);
    }

    @Override
    @Transactional(readOnly = true)
    public UserAiProfileResponse getAiProfile(Long userId) {
        log.info("Getting AI profile for user: {}", userId);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        return UserAiProfileResponse.builder()
                .userId(user.getId())
                .keycloakUserId(user.getKeycloakUserId())
                .customerTier(user.getCustomerTier())
                .segmentationLabel(user.getSegmentationLabel())
                .isBlacklisted(user.getIsBlacklisted())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public InternalUserProfileResponse getInternalProfileByKeycloakId(String keycloakUserId) {
        User user = userRepository.findByKeycloakUserId(keycloakUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "keycloakUserId", keycloakUserId));
        return InternalUserProfileResponse.builder()
                .id(user.getId())
                .keycloakUserId(user.getKeycloakUserId())
                .email(user.getEmail())
                .phoneNumber(user.getPhoneNumber())
                .customerTier(user.getCustomerTier())
                .loyaltyPoints(user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public InternalUserProfileResponse getInternalProfileById(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return InternalUserProfileResponse.builder()
                .id(user.getId())
                .keycloakUserId(user.getKeycloakUserId())
                .email(user.getEmail())
                .phoneNumber(user.getPhoneNumber())
                .customerTier(user.getCustomerTier())
                .loyaltyPoints(user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Page<UserProfileResponse> getAllUsers(Pageable pageable) {
        log.info("Getting all users - page: {}, size: {}", pageable.getPageNumber(), pageable.getPageSize());
        return userRepository.findByActiveTrue(pageable)
                .map(this::mapToProfileResponse);
    }

    @Override
    @Transactional
    public void updateBlacklist(Long userId, Boolean blacklisted) {
        log.info("Updating blacklist status for user {}: {}", userId, blacklisted);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setIsBlacklisted(blacklisted);
        userRepository.save(user);

        // Đồng bộ lên Keycloak: khóa = vô hiệu hóa đăng nhập thật sự. Nếu Keycloak lỗi thì báo lỗi
        // (transaction rollback cờ trong DB), không được báo "đã khóa" khi khách vẫn đăng nhập được.
        try {
            keycloakAdminClient.setEnabled(user.getKeycloakUserId(), !Boolean.TRUE.equals(blacklisted));
        } catch (Exception e) {
            log.error("Cannot sync enabled status to Keycloak for user {}: {}", userId, e.getMessage());
            throw new KeycloakSyncException((Boolean.TRUE.equals(blacklisted)
                    ? "Không thể khóa tài khoản trên Keycloak: "
                    : "Không thể mở khóa tài khoản trên Keycloak: ") + e.getMessage());
        }
    }

    @Override
    @Transactional
    public void updateCustomerTier(Long userId, String tier) {
        log.info("Updating customer tier for user {}: {}", userId, tier);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setCustomerTier(tier);
        userRepository.save(user);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Admin User Management
    // ──────────────────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public UserAdminDetailResponse adminCreateUser(CreateUserRequest request) {
        log.info("Admin creating user: username={}, email={}", request.getUsername(), request.getEmail());

        // 1. Tạo user trong Keycloak
        String keycloakUserId = keycloakAdminClient.createUser(
                request.getUsername(),
                request.getEmail(),
                request.getFullName(),
                request.getPassword()
        );

        // 2. Tạo user trong DB — nếu lỗi (VD: trùng email) thì xóa user vừa tạo trên Keycloak (bù trừ),
        //    tránh tài khoản Keycloak mồ côi đăng nhập được nhưng không có hồ sơ.
        User user = User.builder()
                .keycloakUserId(keycloakUserId)
                .username(request.getUsername())
                .email(request.getEmail())
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .avatarUrl(request.getAvatarUrl())
                .customerTier(request.getCustomerTier() != null ? request.getCustomerTier() : "MEMBER")
                .isBlacklisted(false)
                .active(true)
                .build();
        try {
            user = userRepository.save(user);
        } catch (RuntimeException e) {
            log.error("Saving user {} to DB failed, rolling back Keycloak user {}: {}",
                    request.getUsername(), keycloakUserId, e.getMessage());
            try {
                keycloakAdminClient.deleteUser(keycloakUserId);
            } catch (Exception compensationError) {
                log.error("Compensation failed: cannot delete Keycloak user {}: {}",
                        keycloakUserId, compensationError.getMessage());
            }
            throw e;
        }

        // 3. Publish event
        userEventProducer.publishUserRegistered(user);

        // 4. Lấy roles mặc định (lỗi đọc roles không được làm hỏng việc tạo user đã thành công)
        List<String> roles;
        try {
            roles = keycloakAdminClient.getUserRealmRoles(keycloakUserId)
                    .stream().map(r -> r.getName()).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("Cannot fetch roles for new user {}: {}", keycloakUserId, e.getMessage());
            roles = List.of();
        }

        return mapToAdminDetail(user, roles, true);
    }

    @Override
    @Transactional(readOnly = true)
    public UserAdminDetailResponse adminGetUserDetail(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        boolean keycloakEnabled = true;
        List<String> roles = new ArrayList<>();
        try {
            var kcUser = keycloakAdminClient.getUserById(user.getKeycloakUserId());
            if (kcUser != null) {
                keycloakEnabled = kcUser.isEnabled();
                roles = keycloakAdminClient.getUserRealmRoles(user.getKeycloakUserId())
                        .stream().map(r -> r.getName()).collect(Collectors.toList());
            } else {
                keycloakEnabled = false;
            }
        } catch (Exception e) {
            log.warn("Cannot fetch Keycloak data for user {}: {}", userId, e.getMessage());
            keycloakEnabled = false;
        }

        return mapToAdminDetail(user, roles, keycloakEnabled);
    }

    @Override
    @Transactional
    public UserAdminDetailResponse adminUpdateUser(Long userId, UpdateUserAdminRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        boolean changed = false;

        if (request.getFullName() != null) {
            user.setFullName(request.getFullName());
            changed = true;
        }
        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            userRepository.findByEmail(request.getEmail()).ifPresent(existing -> {
                if (!existing.getId().equals(userId)) {
                    throw new IllegalArgumentException("Email đã được sử dụng bởi tài khoản khác");
                }
            });
            user.setEmail(request.getEmail());
            changed = true;
        }
        if (request.getPhoneNumber() != null) {
            user.setPhoneNumber(request.getPhoneNumber());
            changed = true;
        }
        if (request.getCustomerTier() != null) {
            user.setCustomerTier(request.getCustomerTier());
            changed = true;
        }
        if (request.getAvatarUrl() != null) {
            user.setAvatarUrl(request.getAvatarUrl());
            changed = true;
        }

        if (changed) {
            user = userRepository.save(user);
        }

        // Đồng bộ lên Keycloak
        try {
            if (request.getEmail() != null || request.getFullName() != null) {
                keycloakAdminClient.updateUser(user.getKeycloakUserId(),
                        request.getEmail(), request.getFullName());
            }
        } catch (Exception e) {
            log.warn("Cannot sync to Keycloak for user {}: {}", userId, e.getMessage());
        }

        List<String> roles = keycloakAdminClient.getUserRealmRoles(user.getKeycloakUserId())
                .stream().map(r -> r.getName()).collect(Collectors.toList());

        return mapToAdminDetail(user, roles, true);
    }

    @Override
    @Transactional
    public void adminDeleteUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // Xóa trong Keycloak
        try {
            keycloakAdminClient.deleteUser(user.getKeycloakUserId());
        } catch (Exception e) {
            log.warn("Cannot delete Keycloak user {}: {}", user.getKeycloakUserId(), e.getMessage());
        }

        // Soft-delete trong DB
        user.setActive(false);
        userRepository.save(user);

        log.info("Admin deleted user: id={}, keycloakId={}", userId, user.getKeycloakUserId());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<UserProfileResponse> adminSearchUsers(String search, String tier,
                                                       Boolean blacklisted, Boolean active,
                                                       Pageable pageable) {
        log.info("Admin searching users: search={}, tier={}, blacklisted={}, active={}",
                search, tier, blacklisted, active);
        return userRepository.searchUsers(search, tier, blacklisted, active, pageable)
                .map(this::mapToProfileResponse);
    }

    @Override
    @Transactional
    public void adminResetPassword(Long userId, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        try {
            keycloakAdminClient.setPassword(user.getKeycloakUserId(), newPassword);
            log.info("Password reset for user: {}", userId);
        } catch (Exception e) {
            log.error("Failed to reset password for user {}: {}", userId, e.getMessage());
            throw new KeycloakSyncException("Không thể đặt lại mật khẩu trên Keycloak: " + e.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<RoleResponse> adminGetAllRoles() {
        return keycloakAdminClient.getAllRealmRoles().stream()
                .map(r -> RoleResponse.builder()
                        .id(r.getId())
                        .name(r.getName())
                        .description(r.getDescription())
                        .composite(r.isComposite())
                        .build())
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> adminGetUserRoles(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        try {
            return keycloakAdminClient.getUserRealmRoles(user.getKeycloakUserId())
                    .stream().map(r -> r.getName()).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("Cannot fetch roles for user {}: {}", userId, e.getMessage());
            return List.of();
        }
    }

    @Override
    @Transactional
    public void adminSetUserRoles(Long userId, List<String> roles) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        try {
            keycloakAdminClient.setUserRoles(user.getKeycloakUserId(), roles);
            log.info("Roles updated for user {}: {}", userId, roles);
        } catch (Exception e) {
            log.error("Failed to set roles for user {}: {}", userId, e.getMessage());
            throw new KeycloakSyncException("Không thể gán quyền trên Keycloak: " + e.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public UserStatsResponse adminGetUserStats() {
        long totalUsers = userRepository.count();
        long blacklistedUsers = userRepository.countByIsBlacklistedTrue();

        Map<String, Long> tierDistribution = new LinkedHashMap<>();
        tierDistribution.put("VIP", userRepository.countByCustomerTier("VIP"));
        tierDistribution.put("GOLD", userRepository.countByCustomerTier("GOLD"));
        tierDistribution.put("SILVER", userRepository.countByCustomerTier("SILVER"));
        tierDistribution.put("MEMBER", userRepository.countByCustomerTier("MEMBER"));

        return UserStatsResponse.builder()
                .totalUsers(totalUsers)
                .blacklistedUsers(blacklistedUsers)
                .activeUsers(totalUsers - blacklistedUsers)
                .tierDistribution(tierDistribution)
                .newUsersThisWeek(0)
                .newUsersThisMonth(0)
                .build();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────────

    private User createUserFromKeycloak(String keycloakUserId, String email, String username, String fullName, String avatarUrl) {
        String safeEmail    = (email != null && !email.isEmpty())
                ? email : keycloakUserId + "@placeholder.com";
        String safeUsername = (username != null && !username.isEmpty())
                ? username : "user_" + keycloakUserId.substring(0, Math.min(8, keycloakUserId.length()));
        String safeFullName = (fullName != null && !fullName.isEmpty())
                ? fullName : "Keycloak User";

        User newUser = User.builder()
                .keycloakUserId(keycloakUserId)
                .email(safeEmail)
                .username(safeUsername)
                .fullName(safeFullName)
                .avatarUrl(avatarUrl)
                .customerTier("MEMBER")
                .isBlacklisted(false)
                .active(true)
                .build();

        User saved = userRepository.save(newUser);
        userEventProducer.publishUserRegistered(saved);
        return saved;
    }

    private static boolean isPlaceholderFullName(String fullName) {
        return fullName == null || fullName.isBlank() || "Keycloak User".equals(fullName);
    }

    private UserProfileResponse mapToProfileResponse(User user) {
        return UserProfileResponse.builder()
                .id(user.getId())
                .keycloakUserId(user.getKeycloakUserId())
                .username(user.getUsername())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .phoneNumber(user.getPhoneNumber())
                .avatarUrl(user.getAvatarUrl())
                .customerTier(user.getCustomerTier())
                .segmentationLabel(user.getSegmentationLabel())
                .isBlacklisted(user.getIsBlacklisted())
                .loyaltyPoints(user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0)
                .build();
    }

    private UserAdminDetailResponse mapToAdminDetail(User user, List<String> roles, boolean keycloakEnabled) {
        return UserAdminDetailResponse.builder()
                .id(user.getId())
                .keycloakUserId(user.getKeycloakUserId())
                .username(user.getUsername())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .phoneNumber(user.getPhoneNumber())
                .avatarUrl(user.getAvatarUrl())
                .customerTier(user.getCustomerTier())
                .segmentationLabel(user.getSegmentationLabel())
                .isBlacklisted(user.getIsBlacklisted() != null && user.getIsBlacklisted())
                .active(user.getActive() != null && user.getActive())
                .loyaltyPoints(user.getLoyaltyPoints() != null ? user.getLoyaltyPoints() : 0)
                .createdAt(user.getCreatedAt() != null ? user.getCreatedAt().toString() : null)
                .updatedAt(user.getUpdatedAt() != null ? user.getUpdatedAt().toString() : null)
                .roles(roles)
                .keycloakEnabled(keycloakEnabled)
                .build();
    }
}
