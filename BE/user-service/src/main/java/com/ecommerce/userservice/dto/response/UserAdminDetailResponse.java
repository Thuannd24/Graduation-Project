package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserAdminDetailResponse {
    private Long id;
    private String keycloakUserId;
    private String username;
    private String email;
    private String fullName;
    private String phoneNumber;
    private String avatarUrl;
    private String customerTier;
    private String segmentationLabel;
    private boolean isBlacklisted;
    private boolean active;
    private int loyaltyPoints;
    private String createdAt;
    private String updatedAt;
    private List<String> roles;
    private boolean keycloakEnabled;
}
