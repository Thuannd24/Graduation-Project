package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductDto;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Pageable;
import java.util.List;

public interface ProductService {
    // Bản đầy đủ (gồm giá vốn) — dùng nội bộ / quản trị
    Slice<ProductDto> getAllProducts(Boolean active, Pageable pageable);
    /** Chỉ sản phẩm đang bán của danh mục (gồm danh mục con), bản đầy đủ. */
    Slice<ProductDto> getProductsByCategory(Long categoryId, Pageable pageable);
    ProductDto getProductById(Long id);
    ProductDto getProductBySlug(String slug);

    /** Danh sách cho trang quản trị: gồm cả sản phẩm đã ẩn, có giá vốn, không qua cache. */
    Slice<ProductDto> getAdminProducts(Long categoryId, Boolean active, Pageable pageable);

    // API công khai: chỉ sản phẩm đang bán, không lộ giá vốn
    Slice<ProductDto> getPublicProducts(Pageable pageable);
    Slice<ProductDto> getPublicProductsByCategory(Long categoryId, Pageable pageable);
    /** Chi tiết công khai: 404 nếu không tồn tại; sản phẩm ngừng bán vẫn trả về với active=false để hiện "Ngừng kinh doanh". */
    ProductDto getPublicProductById(Long id);
    ProductDto getPublicProductBySlug(String slug);
    /** Sản phẩm liên quan: cùng danh mục, rồi cùng thương hiệu / gần giá; loại trừ chính nó và sản phẩm ngừng bán. */
    List<ProductDto> getRelatedProducts(Long productId, int limit);

    ProductDto createProduct(ProductDto productDto);
    ProductDto updateProduct(Long id, ProductDto productDto);
    void deleteProduct(Long id);
    List<ProductDto> getProductsByIds(List<Long> ids);
}
