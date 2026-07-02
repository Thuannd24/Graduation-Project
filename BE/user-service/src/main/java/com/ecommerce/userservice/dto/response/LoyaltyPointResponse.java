package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyPointResponse {

    private Long userId;
    private Integer pointsApplied;
    private Integer newPointBalance;
    private String calculationMode;
    private String calculationDetail;
}
