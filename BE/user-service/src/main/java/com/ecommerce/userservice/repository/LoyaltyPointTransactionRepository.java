package com.ecommerce.userservice.repository;

import com.ecommerce.userservice.entity.LoyaltyPointTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LoyaltyPointTransactionRepository extends JpaRepository<LoyaltyPointTransaction, Long> {

    Page<LoyaltyPointTransaction> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    Optional<LoyaltyPointTransaction> findFirstByOrderIdAndSourceType(Long orderId, String sourceType);
}
