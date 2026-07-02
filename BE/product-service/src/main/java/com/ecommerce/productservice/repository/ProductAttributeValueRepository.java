package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductAttributeValue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProductAttributeValueRepository extends JpaRepository<ProductAttributeValue, Long> {
    List<ProductAttributeValue> findByProductId(Long productId);
    List<ProductAttributeValue> findByProductIdIn(List<Long> productIds);
    void deleteByProductId(Long productId);
}
