package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Kết quả 1 trang danh sách sản phẩm, dùng riêng để lưu Redis cache.
 * KHÔNG chứa Pageable (SliceImpl gốc không có constructor mặc định nên
 * Jackson không deserialize lại được) - Pageable luôn có sẵn từ tham số
 * request nên được tái tạo lại ở tầng service, không cần cache.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProductListCacheEntry {
    private List<ProductDto> content;
    private boolean hasNext;
}
