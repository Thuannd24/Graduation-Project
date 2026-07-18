package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductReviewDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface ReviewService {
    ProductReviewDto addReview(ProductReviewDto reviewDto);
    List<ProductReviewDto> getReviewsByProduct(Long productId);
    List<ProductReviewDto> getReviewsByUser(String userId);
    Page<ProductReviewDto> getAllReviews(Pageable pageable);
    ProductReviewDto replyToReview(Long reviewId, String staffUserId, String content);
}
