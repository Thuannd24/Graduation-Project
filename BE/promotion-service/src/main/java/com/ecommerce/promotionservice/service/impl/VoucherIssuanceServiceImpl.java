package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.dto.IssueVoucherResult;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.CampaignBudgetService;
import com.ecommerce.promotionservice.service.VoucherIssuanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Slf4j
public class VoucherIssuanceServiceImpl implements VoucherIssuanceService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final IssuedVoucherRepository voucherRepository;
    private final CampaignBudgetService budgetService;

    @Override
    @Transactional
    public IssueVoucherResult issuePercent(Long userId, Long campaignId,
                                           BigDecimal discountPercent, BigDecimal maxDiscountAmount, int expireDays) {
        validateUserId(userId);
        validateExpireDays(expireDays);
        if (discountPercent == null || discountPercent.compareTo(BigDecimal.ZERO) <= 0
                || discountPercent.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("discountPercent phải trong khoảng (0, 100].");
        }
        BigDecimal maxAmt = maxDiscountAmount != null ? maxDiscountAmount : BigDecimal.ZERO;
        budgetService.reserveBudget(campaignId, maxAmt);

        String prefix = "VPC";
        IssuedVoucher voucher = IssuedVoucher.builder()
                .code(generateUniqueCode(prefix))
                .userId(userId)
                .campaignId(campaignId)
                .voucherType(VoucherType.PERCENT)
                .discountPercent(discountPercent)
                .maxDiscountAmount(maxAmt)
                .expiresAt(LocalDateTime.now().plusDays(expireDays))
                .build();

        voucher = voucherRepository.save(voucher);
        log.info("Issued PERCENT voucher {} userId={} campaignId={} {}% max={}",
                voucher.getCode(), userId, campaignId, discountPercent, maxAmt);

        return toResult(voucher);
    }

    @Override
    @Transactional
    public IssueVoucherResult issueFixed(Long userId, Long campaignId,
                                         BigDecimal discountAmount, BigDecimal minOrderValue, int expireDays) {
        validateUserId(userId);
        validateExpireDays(expireDays);
        if (discountAmount == null || discountAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("discountAmount phải > 0.");
        }
        budgetService.reserveBudget(campaignId, discountAmount);

        IssuedVoucher voucher = IssuedVoucher.builder()
                .code(generateUniqueCode("VPF"))
                .userId(userId)
                .campaignId(campaignId)
                .voucherType(VoucherType.FIXED)
                .discountAmount(discountAmount)
                .minOrderValue(minOrderValue != null ? minOrderValue : BigDecimal.ZERO)
                .expiresAt(LocalDateTime.now().plusDays(expireDays))
                .build();

        voucher = voucherRepository.save(voucher);
        log.info("Issued FIXED voucher {} userId={} campaignId={} amount={}",
                voucher.getCode(), userId, campaignId, discountAmount);

        return toResult(voucher);
    }

    @Override
    @Transactional
    public IssueVoucherResult issueFreeship(Long userId, Long campaignId,
                                            BigDecimal maxShippingDiscount, int expireDays) {
        validateUserId(userId);
        validateExpireDays(expireDays);
        if (maxShippingDiscount == null || maxShippingDiscount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("maxShippingDiscount phải > 0.");
        }
        budgetService.reserveBudget(campaignId, maxShippingDiscount);

        IssuedVoucher voucher = IssuedVoucher.builder()
                .code(generateUniqueCode("VFS"))
                .userId(userId)
                .campaignId(campaignId)
                .voucherType(VoucherType.FREESHIP)
                .maxShippingDiscount(maxShippingDiscount)
                .expiresAt(LocalDateTime.now().plusDays(expireDays))
                .build();

        voucher = voucherRepository.save(voucher);
        log.info("Issued FREESHIP voucher {} userId={} campaignId={} maxShip={}",
                voucher.getCode(), userId, campaignId, maxShippingDiscount);

        return toResult(voucher);
    }

    private String generateUniqueCode(String prefix) {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = (prefix + "-" + randomSuffix()).toUpperCase(Locale.ROOT);
            if (!voucherRepository.existsByCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Không thể sinh mã voucher duy nhất sau nhiều lần thử.");
    }

    private String randomSuffix() {
        int value = RANDOM.nextInt(900_000) + 100_000;
        return Integer.toString(value) + Long.toString(System.currentTimeMillis() % 1000, 36)
                .toUpperCase(Locale.ROOT);
    }

    private void validateUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("userId không hợp lệ.");
        }
    }

    private void validateExpireDays(int expireDays) {
        if (expireDays <= 0) {
            throw new IllegalArgumentException("expireDays phải > 0.");
        }
    }

    private IssueVoucherResult toResult(IssuedVoucher voucher) {
        return IssueVoucherResult.builder()
                .voucherId(voucher.getId())
                .voucherCode(voucher.getCode())
                .voucherType(voucher.getVoucherType())
                .expiresAt(voucher.getExpiresAt())
                .build();
    }
}
