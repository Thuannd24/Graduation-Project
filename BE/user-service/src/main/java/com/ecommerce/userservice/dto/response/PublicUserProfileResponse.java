package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Hồ sơ công khai (GET /api/v1/users/public/{keycloakUserId}, không cần đăng nhập): chỉ tên hiển thị + ảnh,
 * dùng cho tên người đánh giá trên trang sản phẩm. Tách DTO riêng để không bao giờ lỡ trả email/SĐT/hạng/điểm
 * như {@link UserProfileResponse}. {@code username} luôn là bản đã che.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PublicUserProfileResponse {

    private String keycloakUserId;
    private String username;
    private String fullName;
    private String avatarUrl;
}
