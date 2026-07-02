package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyTransactionDto {

    private Long id;
    private Integer delta;
    private Integer balanceAfter;
    private String calculationMode;
    private String sourceType;
    private String description;
    private LocalDateTime createdAt;
}
