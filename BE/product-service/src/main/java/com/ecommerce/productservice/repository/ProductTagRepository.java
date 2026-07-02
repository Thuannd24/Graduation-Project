package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductTag;
import com.ecommerce.productservice.entity.ProductTagId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProductTagRepository extends JpaRepository<ProductTag, ProductTagId> {

    List<ProductTag> findByProductId(Long productId);

    List<ProductTag> findByProductIdIn(List<Long> productIds);

    @Modifying
    @Query("delete from ProductTag pt where pt.productId = :productId")
    void deleteByProductId(Long productId);
}
