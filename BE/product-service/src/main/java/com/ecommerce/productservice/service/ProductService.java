package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductDto;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Pageable;
import java.util.List;

public interface ProductService {
    Slice<ProductDto> getAllProducts(Boolean active, Pageable pageable);
    Slice<ProductDto> getProductsByCategory(Long categoryId, Pageable pageable);
    ProductDto getProductById(Long id);
    ProductDto getProductBySlug(String slug);
    ProductDto createProduct(ProductDto productDto);
    ProductDto updateProduct(Long id, ProductDto productDto);
    void deleteProduct(Long id);
    List<ProductDto> getProductsByIds(List<Long> ids);
}
