package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.VariantOptionValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VariantOptionValueRepository extends JpaRepository<VariantOptionValue, Long> {
    List<VariantOptionValue> findByVariantId(Long variantId);
    List<VariantOptionValue> findByVariantIdIn(List<Long> variantIds);

    @Modifying
    @Query("delete from VariantOptionValue vov where vov.variantId = :variantId")
    void deleteByVariantId(Long variantId);

    @Modifying
    @Query("delete from VariantOptionValue vov where vov.variantId in :variantIds")
    void deleteByVariantIdIn(List<Long> variantIds);
}
