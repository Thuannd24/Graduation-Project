package com.ecommerce.promotionservice.repository;

import com.ecommerce.promotionservice.entity.IssuedVoucher;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IssuedVoucherRepository extends JpaRepository<IssuedVoucher, Long> {

    Optional<IssuedVoucher> findByCode(String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<IssuedVoucher> findWithLockByCode(String code);

    boolean existsByCode(String code);

    Optional<IssuedVoucher> findByUsedOrderId(Long usedOrderId);

    long countByCampaignId(Long campaignId);
}
