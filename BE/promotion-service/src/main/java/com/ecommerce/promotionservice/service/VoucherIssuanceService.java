package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.IssueVoucherResult;

import java.math.BigDecimal;
import java.util.List;

public interface VoucherIssuanceService {

    IssueVoucherResult issuePercent(Long userId, Long campaignId,
                                    BigDecimal discountPercent, BigDecimal maxDiscountAmount, int expireDays,
                                    List<Long> restrictedCategoryIds, List<Long> restrictedProductIds);

    IssueVoucherResult issueFixed(Long userId, Long campaignId,
                                  BigDecimal discountAmount, BigDecimal minOrderValue, int expireDays,
                                  List<Long> restrictedCategoryIds, List<Long> restrictedProductIds);

    IssueVoucherResult issueFreeship(Long userId, Long campaignId,
                                     BigDecimal maxShippingDiscount, int expireDays,
                                     List<Long> restrictedCategoryIds, List<Long> restrictedProductIds);
}
