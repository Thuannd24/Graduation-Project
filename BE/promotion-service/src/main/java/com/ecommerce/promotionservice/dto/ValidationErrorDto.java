package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ValidationErrorDto {
    private String nodeId;       // null for global-level errors
    private String errorType;    // "missing_parameter" | "wrong_data_type" | "invalid_connectivity" | "global_rule"
    private String field;        // which property / attribute failed
    private String message;      // human-readable Vietnamese message
}
