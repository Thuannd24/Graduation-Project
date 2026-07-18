package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.IssueVoucherResult;

import java.math.BigDecimal;
import java.util.List;

public interface VoucherIssuanceService {

    // idempotencyKey: pass "<processInstanceId>:<activityId>" from the calling delegate. Camunda
    // job retries re-run a delegate's execute() from scratch, and since issuance now commits in
    // its own REQUIRES_NEW transaction (see class javadoc), a retry would otherwise issue a SECOND
    // real voucher and debit the campaign budget a second time for one customer action. If a
    // voucher already exists for this key, its existing result is returned instead of issuing
    // again.
    IssueVoucherResult issuePercent(Long userId, Long campaignId,
                                    BigDecimal discountPercent, BigDecimal maxDiscountAmount, int expireDays,
                                    List<Long> restrictedCategoryIds, List<Long> restrictedProductIds,
                                    String idempotencyKey);

    IssueVoucherResult issueFixed(Long userId, Long campaignId,
                                  BigDecimal discountAmount, BigDecimal minOrderValue, int expireDays,
                                  List<Long> restrictedCategoryIds, List<Long> restrictedProductIds,
                                  String idempotencyKey);

    IssueVoucherResult issueFreeship(Long userId, Long campaignId,
                                     BigDecimal maxShippingDiscount, int expireDays,
                                     List<Long> restrictedCategoryIds, List<Long> restrictedProductIds,
                                     String idempotencyKey);
}
