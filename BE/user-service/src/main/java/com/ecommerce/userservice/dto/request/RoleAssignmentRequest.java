package com.ecommerce.userservice.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class RoleAssignmentRequest {

    @NotEmpty(message = "At least one role is required")
    private List<String> roles;
}
