package com.ecommerce.promotionservice.repository;

import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface IssuedVoucherRepository extends JpaRepository<IssuedVoucher, Long> {

    Optional<IssuedVoucher> findByCode(String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<IssuedVoucher> findWithLockByCode(String code);

    boolean existsByCode(String code);

    Optional<IssuedVoucher> findByUsedOrderId(Long usedOrderId);

    long countByCampaignId(Long campaignId);

    long countByCampaignIdAndStatus(Long campaignId, VoucherStatus status);

    long countByCampaignIdAndVoucherType(Long campaignId, VoucherType voucherType);

    long countByVoucherType(VoucherType voucherType);

    List<IssuedVoucher> findByStatusAndExpiresAtBefore(VoucherStatus status, LocalDateTime expiresAt);

    List<IssuedVoucher> findByStatusInAndExpiresAtBefore(Collection<VoucherStatus> statuses, LocalDateTime expiresAt);

    List<IssuedVoucher> findByCampaignIdOrderByCreatedAtDesc(Long campaignId);

    List<IssuedVoucher> findByUserIdOrderByCreatedAtDesc(Long userId);
}
