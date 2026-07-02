package com.ecommerce.inventoryservice.repository;

import com.ecommerce.inventoryservice.entity.InventoryTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InventoryTransactionRepository extends JpaRepository<InventoryTransaction, Long> {

    Page<InventoryTransaction> findByProductId(Long productId, Pageable pageable);

    Page<InventoryTransaction> findByProductIdAndVariantId(Long productId, Long variantId, Pageable pageable);

    Optional<InventoryTransaction> findByOrderIdAndTransactionType(Long orderId, String transactionType);

    List<InventoryTransaction> findByOrderId(Long orderId);
}
