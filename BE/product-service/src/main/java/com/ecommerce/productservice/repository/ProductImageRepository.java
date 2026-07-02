package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductImageRepository extends JpaRepository<ProductImage, Long> {

    List<ProductImage> findByProductId(Long productId);

    List<ProductImage> findByProductIdIn(List<Long> productIds);

    Optional<ProductImage> findByProductIdAndId(Long productId, Long id);

    @Modifying
    @Query("delete from ProductImage pi where pi.productId = :productId")
    void deleteByProductId(Long productId);
}
