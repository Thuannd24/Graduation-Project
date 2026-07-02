package com.ecommerce.inventoryservice.repository;

import com.ecommerce.inventoryservice.entity.InventoryDailySnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface InventoryDailySnapshotRepository extends JpaRepository<InventoryDailySnapshot, Long> {

    Optional<InventoryDailySnapshot> findByProductIdAndVariantIdAndSnapshotDate(Long productId, Long variantId, LocalDate snapshotDate);
    
    List<InventoryDailySnapshot> findBySnapshotDate(LocalDate snapshotDate);
}
