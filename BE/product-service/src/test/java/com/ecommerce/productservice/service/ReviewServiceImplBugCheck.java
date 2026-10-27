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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bug thật trong luồng đánh giá. Chạy riêng: mvn -pl product-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class ReviewServiceImplBugCheck {

    @Mock private ProductReviewRepository reviewRepository;
    @Mock private ProductRepository productRepository;
    @Mock private OrderClient orderClient;
    @Mock private ProductEventProducer productEventProducer;

    @InjectMocks
    private ReviewServiceImpl reviewService;

    private void stubHappyPathLeniently() {
        lenient().when(reviewRepository.findByUserIdAndProductIdAndOrderId(any(), any(), any())).thenReturn(Optional.empty());
        lenient().when(reviewRepository.save(any(ProductReview.class))).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(reviewRepository.findByProductId(5L)).thenReturn(List.of(ProductReview.builder().rating(5).build()));
        lenient().when(productRepository.findById(5L)).thenReturn(Optional.of(Product.builder().id(5L).build()));
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_06: Số sao ngoài thang 1..5 (rating=7) phải bị từ chối IllegalArgumentException, không được lưu và làm sai điểm trung bình")
    void addReview_ratingOutOfRange_mustBeRejected() {
        stubHappyPathLeniently();
        lenient().when(orderClient.checkEligibleReview("user-1", 5L, 100L)).thenReturn(ApiResponse.success(true));
        ProductReviewDto dto = ProductReviewDto.builder().productId(5L).userId("user-1").orderId(100L).rating(7).build();

        assertThrows(IllegalArgumentException.class, () -> reviewService.addReview(dto));
        verify(reviewRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_REVIEW_07: order-service không phản hồi (lỗi kết nối) -> phải từ chối đánh giá (fail-closed), không được bỏ qua bước kiểm tra đã mua hàng")
    void addReview_orderServiceDown_mustFailClosed() {
        stubHappyPathLeniently();
        when(orderClient.checkEligibleReview("user-1", 5L, 100L)).thenThrow(new RuntimeException("Connection refused: order-service"));
        ProductReviewDto dto = ProductReviewDto.builder().productId(5L).userId("user-1").orderId(100L).rating(5).build();

        assertThrows(RuntimeException.class, () -> reviewService.addReview(dto));
        verify(reviewRepository, never()).save(any());
    }
}
