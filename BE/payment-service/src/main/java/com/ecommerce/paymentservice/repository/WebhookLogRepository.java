package com.ecommerce.paymentservice.repository;

import com.ecommerce.paymentservice.entity.WebhookLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface WebhookLogRepository extends JpaRepository<WebhookLog, Long> {
}
