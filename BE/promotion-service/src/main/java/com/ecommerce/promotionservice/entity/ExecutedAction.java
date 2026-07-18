package com.ecommerce.promotionservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Idempotency record for non-voucher Camunda delegate side effects (email send, loyalty point
 * credit) that have no natural unique row of their own to dedupe against the way
 * IssuedVoucher.idempotencyKey does for voucher issuance. Camunda retries a failed job's
 * delegate.execute() from scratch, so any external call (notification-service, user-service)
 * made without this guard would fire again on every retry.
 */
@Entity
@Table(name = "executed_actions", indexes = {
        @Index(name = "idx_executed_action_key", columnList = "idempotency_key", unique = true)
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExecutedAction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "<processInstanceId>:<activityId>" of the Camunda service task that performed this action. */
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 100)
    private String idempotencyKey;

    @Column(name = "action_type", nullable = false, length = 40)
    private String actionType;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
