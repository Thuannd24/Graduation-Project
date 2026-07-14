package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PromotionDashboardDto {
    private long totalCampaigns;
    private long activeCampaigns;
    private long totalIssued;
    private long totalUsed;
    private long totalUnused;
    private long totalExpired;
    private long totalReserved;
    private long totalPercent;
    private long totalFixed;
    private long totalFreeship;
    private BigDecimal totalBudget;
    private BigDecimal remainingBudget;
    private BigDecimal committedBudget;
    private double averageConversionRate;
    private List<CampaignStatsDto> campaigns;
}
