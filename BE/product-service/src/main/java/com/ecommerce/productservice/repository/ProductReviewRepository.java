package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductReview;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductReviewRepository extends JpaRepository<ProductReview, Long> {

    List<ProductReview> findByProductId(Long productId);

    Page<ProductReview> findByProductId(Long productId, Pageable pageable);

    Optional<ProductReview> findByUserIdAndProductIdAndOrderId(String userId, Long productId, Long orderId);
}
