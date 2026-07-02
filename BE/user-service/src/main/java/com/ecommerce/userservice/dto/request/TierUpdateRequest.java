package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class TierUpdateRequest {

    @NotBlank(message = "tier is required")
    private String tier; // MEMBER | SILVER | GOLD | VIP
}
