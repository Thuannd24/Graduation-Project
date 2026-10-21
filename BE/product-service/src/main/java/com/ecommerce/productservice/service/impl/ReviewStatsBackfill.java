package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.ProductReviewRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Objects;

/**
 * Đồng bộ lại ratingAvg / reviewCount của sản phẩm từ bảng đánh giá khi khởi động.
 * Cột review_count mới được thêm nên dữ liệu cũ đang null; ngoài ra cache chi tiết sản phẩm
 * trước đây không được làm mới sau khi có đánh giá (UI_PH2_FR02_004). Chỉ ghi khi giá trị lệch.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ReviewStatsBackfill implements ApplicationRunner {

    private final ProductReviewRepository reviewRepository;
    private final ProductRepository productRepository;
    private final CacheManager cacheManager;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int updated = 0;
            List<Object[]> rows = reviewRepository.aggregateRatingsByProduct();
            for (Object[] row : rows) {
                Long productId = ((Number) row[0]).longValue();
                BigDecimal avg = BigDecimal.valueOf(((Number) row[1]).doubleValue()).setScale(2, RoundingMode.HALF_UP);
                int count = ((Number) row[2]).intValue();
                Product product = productRepository.findById(productId).orElse(null);
                if (product == null) {
                    continue;
                }
                boolean sameAvg = product.getRatingAvg() != null && product.getRatingAvg().compareTo(avg) == 0;
                if (sameAvg && Objects.equals(product.getReviewCount(), count)) {
                    continue;
                }
                product.setRatingAvg(avg);
                product.setReviewCount(count);
                productRepository.save(product);
                updated++;
            }
            if (updated > 0) {
                for (String name : List.of("products", "products_slug", "products_list")) {
                    Cache cache = cacheManager.getCache(name);
                    if (cache != null) {
                        cache.clear();
                    }
                }
                log.info("Đồng bộ điểm đánh giá: cập nhật {} sản phẩm, đã xóa cache sản phẩm", updated);
            }
        } catch (Exception e) {
            // Không chặn khởi động service vì bước đồng bộ phụ này
            log.warn("Không đồng bộ được ratingAvg/reviewCount khi khởi động: {}", e.getMessage());
        }
    }
}
