package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherType;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import com.ecommerce.promotionservice.service.CampaignBudgetService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Service
@RequiredArgsConstructor
@Slf4j
public class CampaignBudgetServiceImpl implements CampaignBudgetService {

    private final CampaignRepository campaignRepository;

    @Override
    @Transactional
    public void reserveBudget(Long campaignId, BigDecimal amount) {
        if (campaignId == null || amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        Campaign campaign = campaignRepository.findById(campaignId)
                .orElseThrow(() -> new IllegalArgumentException("Campaign không tồn tại: " + campaignId));

        BigDecimal remaining = campaign.getRemainingBudget() != null
                ? campaign.getRemainingBudget()
                : campaign.getTotalBudget();
        if (remaining == null) {
            remaining = BigDecimal.ZERO;
        }
        if (remaining.compareTo(amount) < 0) {
            throw new IllegalStateException(
                    "Ngân sách chiến dịch không đủ. Còn lại: " + remaining + ", cần: " + amount);
        }
        campaign.setRemainingBudget(remaining.subtract(amount));
        campaignRepository.save(campaign);
        log.debug("Reserved budget {} for campaign id={}, remaining={}", amount, campaignId, campaign.getRemainingBudget());
    }

    @Override
    @Transactional
    public void releaseReservedBudget(IssuedVoucher voucher) {
        if (voucher == null || voucher.getCampaignId() == null) {
            return;
        }
        BigDecimal amount = resolveReservedAmount(voucher);
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        Campaign campaign = campaignRepository.findById(voucher.getCampaignId()).orElse(null);
        if (campaign == null) {
            return;
        }
        BigDecimal remaining = campaign.getRemainingBudget() != null
                ? campaign.getRemainingBudget()
                : BigDecimal.ZERO;
        BigDecimal total = campaign.getTotalBudget() != null ? campaign.getTotalBudget() : remaining;
        BigDecimal restored = remaining.add(amount);
        if (total.compareTo(BigDecimal.ZERO) > 0 && restored.compareTo(total) > 0) {
            restored = total;
        }
        campaign.setRemainingBudget(restored);
        campaignRepository.save(campaign);
        log.info("Released budget {} back to campaign id={} for voucher {}", amount, campaign.getId(), voucher.getCode());
    }

    @Override
    public BigDecimal resolveReservedAmount(IssuedVoucher voucher) {
        if (voucher == null || voucher.getVoucherType() == null) {
            return BigDecimal.ZERO;
        }
        return switch (voucher.getVoucherType()) {
            case PERCENT -> nonNegative(voucher.getMaxDiscountAmount());
            case FIXED -> nonNegative(voucher.getDiscountAmount());
            case FREESHIP -> nonNegative(voucher.getMaxShippingDiscount());
        };
    }

    private BigDecimal nonNegative(BigDecimal value) {
        return value != null && value.compareTo(BigDecimal.ZERO) > 0 ? value : BigDecimal.ZERO;
    }
}
