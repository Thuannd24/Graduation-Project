package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InternalUserProfileResponse {
    private Long id;
    private String keycloakUserId;
    private String email;
    private String phoneNumber;
    private String customerTier;
    private Integer loyaltyPoints;
}
