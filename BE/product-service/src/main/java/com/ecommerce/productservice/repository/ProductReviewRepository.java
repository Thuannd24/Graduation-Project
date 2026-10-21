package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductReview;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductReviewRepository extends JpaRepository<ProductReview, Long> {

    List<ProductReview> findByProductId(Long productId);

    Page<ProductReview> findByProductId(Long productId, Pageable pageable);

    Optional<ProductReview> findByUserIdAndProductIdAndOrderId(String userId, Long productId, Long orderId);

    List<ProductReview> findByUserIdOrderByCreatedAtDesc(String userId);

    // [productId, AVG(rating), COUNT(*)] cho mọi sản phẩm có đánh giá — dùng để đồng bộ lại ratingAvg/reviewCount
    @Query("SELECT r.productId, AVG(r.rating), COUNT(r) FROM ProductReview r WHERE r.rating IS NOT NULL GROUP BY r.productId")
    List<Object[]> aggregateRatingsByProduct();
}
