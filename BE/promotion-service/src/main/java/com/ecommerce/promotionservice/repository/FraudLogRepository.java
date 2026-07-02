package com.ecommerce.promotionservice.repository;

import com.ecommerce.promotionservice.entity.FraudLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FraudLogRepository extends JpaRepository<FraudLog, Long> {
    List<FraudLog> findByUserId(String userId);
}
