package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserAiProfileResponse {

    private Long userId;
    private String keycloakUserId;
    private String customerTier;
    private String segmentationLabel;
    private Boolean isBlacklisted;
}
