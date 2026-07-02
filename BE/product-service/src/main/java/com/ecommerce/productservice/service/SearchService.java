package com.ecommerce.productservice.service;

import com.ecommerce.productservice.entity.ProductDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface SearchService {
    Page<ProductDocument> searchProducts(String keyword, Pageable pageable);
    void indexProduct(Long productId);
    void removeProductIndex(Long productId);
}
