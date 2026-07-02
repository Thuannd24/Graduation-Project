package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.IssueVoucherResult;

import java.math.BigDecimal;

public interface VoucherIssuanceService {

    IssueVoucherResult issuePercent(Long userId, Long campaignId,
                                    BigDecimal discountPercent, BigDecimal maxDiscountAmount, int expireDays);

    IssueVoucherResult issueFixed(Long userId, Long campaignId,
                                  BigDecimal discountAmount, BigDecimal minOrderValue, int expireDays);

    IssueVoucherResult issueFreeship(Long userId, Long campaignId,
                                     BigDecimal maxShippingDiscount, int expireDays);
}
