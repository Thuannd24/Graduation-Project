package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductSimilarity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ProductSimilarityRepository extends MongoRepository<ProductSimilarity, String> {

    Optional<ProductSimilarity> findByProductId(Long productId);
}
