package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductReviewDto;
import java.util.List;

public interface ReviewService {
    ProductReviewDto addReview(ProductReviewDto reviewDto);
    List<ProductReviewDto> getReviewsByProduct(Long productId);
    List<ProductReviewDto> getReviewsByUser(String userId);
}
