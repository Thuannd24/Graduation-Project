package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.client.OrderClient;
import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductReviewDto;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductReview;
import com.ecommerce.productservice.event.producer.ProductEventProducer;
import com.ecommerce.productservice.exception.ResourceNotFoundException;
import com.ecommerce.productservice.exception.ServiceUnavailableException;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.ProductReviewRepository;
import com.ecommerce.productservice.service.ReviewService;
import com.ecommerce.productservice.service.SearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
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
    // Dùng để làm mới cache/ES sau khi điểm đánh giá thay đổi (có thể null trong unit test)
    private final CacheManager cacheManager;
    private final SearchService searchService;

    private static final int MIN_RATING = 1;
    private static final int MAX_RATING = 5;

    @Override
    @Transactional
    public ProductReviewDto addReview(ProductReviewDto reviewDto) {
        if (reviewDto.getOrderId() == null) {
            throw new IllegalArgumentException("Mã đơn hàng (orderId) là bắt buộc để đánh giá sản phẩm.");
        }
        if (reviewDto.getUserId() == null || reviewDto.getUserId().isBlank()) {
            throw new IllegalArgumentException("Yêu cầu đăng nhập để đánh giá sản phẩm.");
        }
        if (reviewDto.getProductId() == null) {
            throw new IllegalArgumentException("Mã sản phẩm (productId) là bắt buộc để đánh giá.");
        }
        if (reviewDto.getRating() == null
                || reviewDto.getRating() < MIN_RATING || reviewDto.getRating() > MAX_RATING) {
            throw new IllegalArgumentException("Số sao đánh giá phải từ 1 đến 5.");
        }

        reviewRepository.findByUserIdAndProductIdAndOrderId(
                reviewDto.getUserId(),
                reviewDto.getProductId(),
                reviewDto.getOrderId()
        ).ifPresent(existing -> {
            throw new IllegalStateException("Bạn đã đánh giá sản phẩm này cho đơn hàng này rồi.");
        });

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
            // Fail-closed: không xác minh được đơn hàng thì KHÔNG cho đánh giá (chống đánh giá ảo)
            log.warn("Không kết nối được order-service để xác minh quyền đánh giá (userId={}, productId={}, orderId={}): {}",
                    reviewDto.getUserId(), reviewDto.getProductId(), reviewDto.getOrderId(), e.getMessage());
            throw new ServiceUnavailableException(
                    "Không thể xác minh đơn hàng lúc này, vui lòng thử lại sau.", e);
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

        // Recalculate average rating + review count for the product
        List<ProductReview> reviews = reviewRepository.findByProductId(reviewDto.getProductId());
        double avg = reviews.stream()
                .filter(r -> r.getRating() != null)
                .mapToInt(ProductReview::getRating)
                .average()
                .orElse(0.0);

        Product product = productRepository.findById(reviewDto.getProductId())
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", reviewDto.getProductId()));
        product.setRatingAvg(BigDecimal.valueOf(avg).setScale(2, RoundingMode.HALF_UP));
        product.setReviewCount(reviews.size());
        productRepository.save(product);

        productEventProducer.publishProductReviewed(review);
        refreshProductViewsAfterCommit(product.getId(), product.getSlug());

        return convertToDto(review);
    }

    @Override
    public List<ProductReviewDto> getReviewsByProduct(Long productId) {
        return reviewRepository.findByProductId(productId).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Override
    public List<ProductReviewDto> getReviewsByUser(String userId) {
        return reviewRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Override
    public Page<ProductReviewDto> getAllReviews(Pageable pageable) {
        return reviewRepository.findAll(pageable).map(this::convertToDto);
    }

    @Override
    @Transactional
    public ProductReviewDto replyToReview(Long reviewId, String staffUserId, String content) {
        ProductReview review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResourceNotFoundException("ProductReview", "id", reviewId));

        if (review.getStaffReplyContent() != null) {
            throw new IllegalStateException("Đánh giá này đã được phản hồi rồi.");
        }

        review.setStaffReplyContent(content);
        review.setStaffReplierId(staffUserId);
        review.setStaffReplyAt(LocalDateTime.now());

        review = reviewRepository.save(review);
        return convertToDto(review);
    }

    // Chi tiết/danh sách sản phẩm được cache 24h (Redis) và index ES: phải làm mới sau khi điểm
    // đánh giá thay đổi, nếu không trang sản phẩm vẫn hiện điểm cũ (UI_PH2_FR02_004: luôn 0 sao).
    private void refreshProductViewsAfterCommit(Long productId, String slug) {
        Runnable refresh = () -> {
            try {
                if (cacheManager != null) {
                    Cache products = cacheManager.getCache("products");
                    if (products != null) products.evict(productId);
                    Cache slugs = cacheManager.getCache("products_slug");
                    if (slugs != null && slug != null) slugs.evict(slug);
                    Cache lists = cacheManager.getCache("products_list");
                    if (lists != null) lists.clear();
                }
            } catch (Exception e) {
                log.error("Failed to evict product cache after review for product {}", productId, e);
            }
            try {
                if (searchService != null) {
                    searchService.indexProduct(productId);
                }
            } catch (Exception e) {
                log.error("Failed to re-index product {} after review", productId, e);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    refresh.run();
                }
            });
        } else {
            refresh.run();
        }
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
                .staffReplyContent(review.getStaffReplyContent())
                .staffReplyAt(review.getStaffReplyAt())
                .staffReplierId(review.getStaffReplierId())
                .build();
    }
}
