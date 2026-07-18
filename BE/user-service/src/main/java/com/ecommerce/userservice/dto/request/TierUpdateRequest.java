package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class TierUpdateRequest {

    @NotBlank(message = "tier is required")
    @Pattern(regexp = "MEMBER|SILVER|GOLD|VIP", message = "tier must be one of MEMBER, SILVER, GOLD, VIP")
    private String tier;
}
