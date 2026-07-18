package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class UpdateUserAdminRequest {

    private String fullName;

    @Email(message = "Invalid email format")
    private String email;

    private String phoneNumber;

    @Pattern(regexp = "MEMBER|SILVER|GOLD|VIP", message = "customerTier must be one of MEMBER, SILVER, GOLD, VIP")
    private String customerTier;

    private String avatarUrl;
}
