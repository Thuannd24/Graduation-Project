package com.ecommerce.userservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_point_transactions", indexes = {
        @Index(name = "idx_loyalty_tx_user_id", columnList = "user_id"),
        @Index(name = "idx_loyalty_tx_created_at", columnList = "created_at")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoyaltyPointTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Số điểm thay đổi (+ cộng, − trừ). */
    @Column(name = "delta", nullable = false)
    private Integer delta;

    @Column(name = "balance_after", nullable = false)
    private Integer balanceAfter;

    @Column(name = "calculation_mode", length = 30)
    private String calculationMode;

    @Column(name = "source_type", nullable = false, length = 30)
    private String sourceType;

    @Column(name = "reference_id", length = 100)
    private String referenceId;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "campaign_id")
    private Long campaignId;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
