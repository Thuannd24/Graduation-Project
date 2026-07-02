package com.ecommerce.inventoryservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "inventory_daily_snapshots",
    uniqueConstraints = @UniqueConstraint(columnNames = {"product_id", "variant_id", "snapshot_date"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryDailySnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "variant_id", nullable = false)
    @Builder.Default
    private Long variantId = 0L;
// stock_level lưu số lượng tồn kho của sả phẩm tại mốc thời gian cụ thể của từng ngày 
    @Column(name = "stock_level", nullable = false)
    private Integer stockLevel;

    @Column(name = "snapshot_date", nullable = false)
    private LocalDate snapshotDate;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
