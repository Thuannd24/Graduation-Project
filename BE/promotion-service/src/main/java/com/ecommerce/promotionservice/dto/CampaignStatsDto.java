package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignStatsDto {
    private Long campaignId;
    private String campaignName;
    private String bpmnProcessDefinitionKey;
    private String triggerType;
    private Boolean active;
    private LocalDateTime startDate;
    private LocalDateTime endDate;
    private BigDecimal totalBudget;
    private BigDecimal remainingBudget;
    private BigDecimal committedBudget;
    private long totalIssued;
    private long totalUnused;
    private long totalUsed;
    private long totalExpired;
    private long totalReserved;
    private long totalPercent;
    private long totalFixed;
    private long totalFreeship;
    private double conversionRate;
    private long activeProcessInstances;
}
