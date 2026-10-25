package com.ecommerce.productservice.service;

import com.ecommerce.productservice.client.OrderClient;
import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductReviewDto;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductReview;
import com.ecommerce.productservice.event.producer.ProductEventProducer;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.ProductReviewRepository;
import com.ecommerce.productservice.service.impl.ReviewServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReviewServiceImplTest {

    @Mock private ProductReviewRepository reviewRepository;
    @Mock private ProductRepository productRepository;
    @Mock private OrderClient orderClient;
    @Mock private ProductEventProducer productEventProducer;

    @InjectMocks
    private ReviewServiceImpl reviewService;

    private ProductReviewDto dto(Long orderId, int rating) {
        return ProductReviewDto.builder().productId(5L).userId("user-1").orderId(orderId)
                .rating(rating).comment("Tốt").imageUrls(List.of("http://img/1.jpg", "http://img/2.jpg")).build();
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_01: Gửi đánh giá thiếu orderId -> IllegalArgumentException (400), không gọi order-service, không lưu")
    void addReview_missingOrderId() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> reviewService.addReview(dto(null, 5)));
        assertTrue(ex.getMessage().contains("orderId"));
        verifyNoInteractions(orderClient);
        verify(reviewRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_02: Đánh giá lần 2 cùng user + sản phẩm + đơn hàng -> IllegalStateException (409) 'đã đánh giá'")
    void addReview_duplicate() {
        when(reviewRepository.findByUserIdAndProductIdAndOrderId("user-1", 5L, 100L))
                .thenReturn(Optional.of(ProductReview.builder().id(1L).build()));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> reviewService.addReview(dto(100L, 5)));
        assertTrue(ex.getMessage().contains("đã đánh giá"));
        verify(reviewRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_03: Chưa mua / đơn chưa giao (order-service trả eligible=false) -> IllegalStateException, không lưu đánh giá")
    void addReview_notEligible() {
        when(reviewRepository.findByUserIdAndProductIdAndOrderId("user-1", 5L, 100L)).thenReturn(Optional.empty());
        when(orderClient.checkEligibleReview("user-1", 5L, 100L)).thenReturn(ApiResponse.success(false));

        assertThrows(IllegalStateException.class, () -> reviewService.addReview(dto(100L, 5)));
        verify(reviewRepository, never()).save(any());
        verifyNoInteractions(productEventProducer);
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_04: Đủ điều kiện -> lưu đánh giá (ảnh nối bằng dấu phẩy), tính lại điểm TB sản phẩm (4 và 5 -> 4.50), phát sự kiện ProductReviewed")
    void addReview_success_recalculatesAverage() {
        Product product = Product.builder().id(5L).name("P").slug("p").ratingAvg(BigDecimal.ZERO).build();
        when(reviewRepository.findByUserIdAndProductIdAndOrderId("user-1", 5L, 100L)).thenReturn(Optional.empty());
        when(orderClient.checkEligibleReview("user-1", 5L, 100L)).thenReturn(ApiResponse.success(true));
        when(reviewRepository.save(any(ProductReview.class))).thenAnswer(inv -> {
            ProductReview r = inv.getArgument(0);
            r.setId(77L);
            return r;
        });
        when(reviewRepository.findByProductId(5L)).thenReturn(List.of(
                ProductReview.builder().rating(4).build(), ProductReview.builder().rating(5).build()));
        when(productRepository.findById(5L)).thenReturn(Optional.of(product));

        ProductReviewDto res = reviewService.addReview(dto(100L, 5));

        ArgumentCaptor<ProductReview> saved = ArgumentCaptor.forClass(ProductReview.class);
        verify(reviewRepository).save(saved.capture());
        assertEquals("http://img/1.jpg,http://img/2.jpg", saved.getValue().getImageUrls());
        assertEquals(new BigDecimal("4.50"), product.getRatingAvg());
        assertEquals(2, product.getReviewCount());
        verify(productRepository).save(product);
        verify(productEventProducer).publishProductReviewed(any(ProductReview.class));
        assertEquals(77L, res.getId());
        assertEquals(2, res.getImageUrls().size());
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_05: Nhân viên phản hồi đánh giá: lần đầu lưu nội dung + người phản hồi + thời gian; phản hồi lần 2 -> IllegalStateException")
    void replyToReview_onlyOnce() {
        ProductReview review = ProductReview.builder().id(1L).productId(5L).userId("user-1").rating(5).build();
        ProductReview replied = ProductReview.builder().id(2L).productId(5L).rating(3).staffReplyContent("Đã xử lý").build();
        when(reviewRepository.findById(1L)).thenReturn(Optional.of(review));
        when(reviewRepository.findById(2L)).thenReturn(Optional.of(replied));
        when(reviewRepository.save(any(ProductReview.class))).thenAnswer(inv -> inv.getArgument(0));

        ProductReviewDto res = reviewService.replyToReview(1L, "staff-9", "Cảm ơn bạn!");
        assertEquals("Cảm ơn bạn!", res.getStaffReplyContent());
        assertEquals("staff-9", res.getStaffReplierId());
        assertNotNull(res.getStaffReplyAt());

        assertThrows(IllegalStateException.class, () -> reviewService.replyToReview(2L, "staff-9", "Lần 2"));
        verify(reviewRepository, times(1)).save(any());
    }
}
