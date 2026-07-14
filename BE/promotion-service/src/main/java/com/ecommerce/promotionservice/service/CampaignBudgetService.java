package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.entity.IssuedVoucher;

import java.math.BigDecimal;

public interface CampaignBudgetService {

    void reserveBudget(Long campaignId, BigDecimal amount);

    void releaseReservedBudget(IssuedVoucher voucher);

    BigDecimal resolveReservedAmount(IssuedVoucher voucher);
}
