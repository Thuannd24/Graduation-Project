package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class BlacklistRequest {

    @NotNull(message = "blacklisted status is required")
    private Boolean blacklisted;

    private String reason; // Lý do khóa — ghi log, không lưu DB hiện tại
}
