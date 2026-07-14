package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateProfileRequest {

    @Size(max = 100, message = "Full name must not exceed 100 characters")
    private String fullName;

    @Size(max = 20, message = "Phone number must not exceed 20 characters")
    @Pattern(regexp = "^(0[0-9]{9,10}|)$", message = "Số điện thoại không hợp lệ")
    private String phoneNumber;

    @Size(max = 500, message = "Avatar URL must not exceed 500 characters")
    @Pattern(regexp = "^(https?://.*|)$", message = "Avatar URL must be a valid HTTP/HTTPS URL")
    private String avatarUrl;
}
