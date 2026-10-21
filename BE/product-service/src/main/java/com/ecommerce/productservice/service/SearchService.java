package com.ecommerce.productservice.service;

import com.ecommerce.productservice.entity.ProductDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface SearchService {
    /** Tìm kiếm công khai: chỉ sản phẩm đang bán (active = true). */
    Page<ProductDocument> searchProducts(String keyword, Pageable pageable);

    /** Tìm kiếm cho trang quản trị: gồm cả sản phẩm đã ẩn / ngừng bán. */
    Page<ProductDocument> searchAllProducts(String keyword, Pageable pageable);
    void indexProduct(Long productId);
    void removeProductIndex(Long productId);
}
