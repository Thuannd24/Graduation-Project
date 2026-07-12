package com.ecommerce.paymentservice.repository;

import com.ecommerce.paymentservice.entity.OutboxEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

    List<OutboxEvent> findByPublishedFalseOrderByCreatedAtAsc();

    @Modifying
    @Query("DELETE FROM OutboxEvent o WHERE o.createdAt < :threshold")
    void deleteByCreatedAtBefore(LocalDateTime threshold);
}
