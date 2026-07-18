package com.ecommerce.promotionservice.repository;

import com.ecommerce.promotionservice.entity.ExecutedAction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExecutedActionRepository extends JpaRepository<ExecutedAction, Long> {

    boolean existsByIdempotencyKey(String idempotencyKey);
}
