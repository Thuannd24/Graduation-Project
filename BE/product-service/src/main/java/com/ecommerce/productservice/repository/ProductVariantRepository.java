package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {

    List<ProductVariant> findByProductId(Long productId);

    List<ProductVariant> findByProductIdIn(List<Long> productIds);

    Optional<ProductVariant> findBySku(String sku);

    Optional<ProductVariant> findByProductIdAndId(Long productId, Long id);

    @Modifying
    @Query("delete from ProductVariant pv where pv.productId = :productId")
    void deleteByProductId(Long productId);
}
