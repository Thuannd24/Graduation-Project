package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.Email;
import lombok.Data;

@Data
public class UpdateUserAdminRequest {

    private String fullName;

    @Email(message = "Invalid email format")
    private String email;

    private String phoneNumber;

    private String customerTier;

    private String avatarUrl;
}
