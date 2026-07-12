package com.ecommerce.promotionservice.service.impl;

import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.CampaignBudgetService;
import com.ecommerce.promotionservice.service.VoucherMaintenanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class VoucherMaintenanceServiceImpl implements VoucherMaintenanceService {

    private final IssuedVoucherRepository voucherRepository;
    private final CampaignBudgetService budgetService;
    private final StringRedisTemplate stringRedisTemplate;

    @Override
    @Transactional
    public int expireStaleVouchers() {
        List<IssuedVoucher> stale = voucherRepository.findByStatusInAndExpiresAtBefore(
                Set.of(VoucherStatus.UNUSED, VoucherStatus.RESERVED), LocalDateTime.now());
        for (IssuedVoucher voucher : stale) {
            expireIfNeeded(voucher);
        }
        if (!stale.isEmpty()) {
            log.info("Expired {} stale unused vouchers and released reserved budgets", stale.size());
        }
        return stale.size();
    }

    @Override
    @Transactional
    public void expireIfNeeded(IssuedVoucher voucher) {
        if (voucher == null) {
            return;
        }
        VoucherStatus status = voucher.getStatus();
        if (status != VoucherStatus.UNUSED && status != VoucherStatus.RESERVED) {
            return;
        }
        if (voucher.getExpiresAt() == null || !voucher.getExpiresAt().isBefore(LocalDateTime.now())) {
            return;
        }
        voucher.setStatus(VoucherStatus.EXPIRED);
        if (status == VoucherStatus.RESERVED) {
            voucher.setUsedOrderId(null);
            voucher.setUsedAt(null);
        }
        voucherRepository.save(voucher);
        budgetService.releaseReservedBudget(voucher);
    }

    // V-14 FIX: Add distributed lock to prevent multiple instances from expiring same vouchers
    @Scheduled(cron = "0 15 * * * *")
    @Transactional
    public void scheduledExpireStaleVouchers() {
        String lockKey = "scheduler:lock:expireStaleVouchers";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofMinutes(5));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running expireStaleVouchers scheduler task. Skipping.");
            return;
        }

        try {
            expireStaleVouchers();
        } catch (Exception e) {
            log.error("Failed to expire stale vouchers: {}", e.getMessage(), e);
        }
    }
}
