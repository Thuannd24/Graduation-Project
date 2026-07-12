package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

    @Transactional
    void deleteByCreatedAtBefore(LocalDateTime dateTime);
}
