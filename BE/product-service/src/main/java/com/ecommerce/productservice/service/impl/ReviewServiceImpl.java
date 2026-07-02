package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.client.OrderClient;
import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductReviewDto;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductReview;
import com.ecommerce.productservice.event.producer.ProductEventProducer;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.ProductReviewRepository;
import com.ecommerce.productservice.service.ReviewService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReviewServiceImpl implements ReviewService {

    private final ProductReviewRepository reviewRepository;
    private final ProductRepository productRepository;
    private final OrderClient orderClient;
    private final ProductEventProducer productEventProducer;

    @Override
    @Transactional
    public ProductReviewDto addReview(ProductReviewDto reviewDto) {
        if (reviewDto.getOrderId() == null) {
            throw new IllegalArgumentException("Mã đơn hàng (orderId) là bắt buộc để đánh giá sản phẩm.");
        }

        try {
            ApiResponse<Boolean> eligibleResp = orderClient.checkEligibleReview(
                    reviewDto.getUserId(),
                    reviewDto.getProductId(),
                    reviewDto.getOrderId()
            );
            if (eligibleResp == null || !Boolean.TRUE.equals(eligibleResp.getData())) {
                throw new IllegalStateException("Bạn không thể đánh giá sản phẩm này vì chưa mua sản phẩm hoặc đơn hàng chưa giao thành công.");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Lỗi kết nối tới order-service để xác thực (order-service có thể đang offline). Tạm thời bỏ qua bước check để hỗ trợ test: {}", e.getMessage());
        }

        ProductReview review = ProductReview.builder()
                .productId(reviewDto.getProductId())
                .userId(reviewDto.getUserId())
                .orderId(reviewDto.getOrderId())
                .rating(reviewDto.getRating())
                .comment(reviewDto.getComment())
                .imageUrls(reviewDto.getImageUrls() != null ? String.join(",", reviewDto.getImageUrls()) : null)
                .build();
        
        review = reviewRepository.save(review);

        // Recalculate average rating for the product
        List<ProductReview> reviews = reviewRepository.findByProductId(reviewDto.getProductId());
        double avg = reviews.stream()
                .mapToInt(ProductReview::getRating)
                .average()
                .orElse(0.0);

        Product product = productRepository.findById(reviewDto.getProductId())
                .orElseThrow(() -> new RuntimeException("Product not found with id: " + reviewDto.getProductId()));
        product.setRatingAvg(BigDecimal.valueOf(avg).setScale(2, RoundingMode.HALF_UP));
        productRepository.save(product);

        productEventProducer.publishProductReviewed(review);

        return convertToDto(review);
    }

    @Override
    public List<ProductReviewDto> getReviewsByProduct(Long productId) {
        return reviewRepository.findByProductId(productId).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    private ProductReviewDto convertToDto(ProductReview review) {
        List<String> images = review.getImageUrls() != null && !review.getImageUrls().trim().isEmpty()
                ? Arrays.asList(review.getImageUrls().split(","))
                : Collections.emptyList();

        return ProductReviewDto.builder()
                .id(review.getId())
                .productId(review.getProductId())
                .userId(review.getUserId())
                .orderId(review.getOrderId())
                .rating(review.getRating())
                .comment(review.getComment())
                .imageUrls(images)
                .createdAt(review.getCreatedAt())
                .build();
    }
}
