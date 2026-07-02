package com.ecommerce.inventoryservice.repository;

import com.ecommerce.inventoryservice.entity.Inventory;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InventoryRepository extends JpaRepository<Inventory, Long> {

    Optional<Inventory> findByProductIdAndVariantId(Long productId, Long variantId);

    List<Inventory> findByProductIdIn(List<Long> productIds);

    List<Inventory> findByVariantIdIn(List<Long> variantIds);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Inventory i WHERE i.productId = :productId AND i.variantId = :variantId")
    Optional<Inventory> findByProductIdAndVariantIdForUpdate(@Param("productId") Long productId, @Param("variantId") Long variantId);

    @Query("SELECT i FROM Inventory i WHERE i.quantity < :threshold")
    List<Inventory> findLowStock(@Param("threshold") int threshold);
}
