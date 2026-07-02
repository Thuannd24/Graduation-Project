package com.ecommerce.inventoryservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "restock_requests")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RestockRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "variant_id", nullable = false)
    @Builder.Default
    private Long variantId = 0L;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @Column(name = "supplier")
    private String supplier;

    @Column(name = "status")
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "requested_by", nullable = false)
    private String requestedBy;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) this.status = "PENDING";
    }
}
