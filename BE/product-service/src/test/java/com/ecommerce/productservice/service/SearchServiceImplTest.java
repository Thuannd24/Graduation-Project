package com.ecommerce.productservice.service;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductDocument;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.ProductSearchRepository;
import com.ecommerce.productservice.service.impl.SearchServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.SliceImpl;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SearchServiceImplTest {

    @Mock
    private ProductSearchRepository productSearchRepository;

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private SearchServiceImpl searchService;

    private final Pageable pageable = PageRequest.of(0, 10);

    @Test
    @DisplayName("TC_PH2_SEARCH_01: Elasticsearch hoạt động -> trả kết quả từ ES theo tên/mô tả (chỉ sản phẩm đang bán), không truy vấn DB")
    void search_usesElasticsearchWhenAvailable() {
        Page<ProductDocument> esPage = new PageImpl<>(List.of(ProductDocument.builder().id(1L).name("iPhone 15").build()));
        when(productSearchRepository.findByActiveTrueAndNameContainingOrActiveTrueAndDescriptionContaining("iphone", "iphone", pageable)).thenReturn(esPage);

        Page<ProductDocument> res = searchService.searchProducts("iphone", pageable);

        assertSame(esPage, res);
        verifyNoInteractions(productRepository);
    }

    @Test
    @DisplayName("TC_PH2_SEARCH_02: Elasticsearch lỗi -> fallback tìm trong DB, map sang ProductDocument với effectivePrice = giá KM hợp lệ; từ khóa rỗng -> lấy sản phẩm active")
    void search_fallbackToDatabase() {
        when(productSearchRepository.findByActiveTrueAndNameContainingOrActiveTrueAndDescriptionContaining(any(), any(), any()))
                .thenThrow(new RuntimeException("Connection refused"));
        when(productSearchRepository.findByActiveTrue(pageable)).thenThrow(new RuntimeException("Connection refused"));
        Product p = Product.builder().id(7L).name("iPhone 15").price(new BigDecimal("20000000"))
                .salePrice(new BigDecimal("18000000")).categoryId(3L).active(true).build();
        when(productRepository.findByActiveTrueAndNameContainingOrActiveTrueAndDescriptionContaining("iphone", "iphone", pageable))
                .thenReturn(new SliceImpl<>(List.of(p), pageable, false));
        when(productRepository.findByActive(true, pageable)).thenReturn(new SliceImpl<>(List.of(p), pageable, false));

        Page<ProductDocument> res = searchService.searchProducts("iphone", pageable);
        assertEquals(1, res.getTotalElements());
        ProductDocument doc = res.getContent().get(0);
        assertEquals(7L, doc.getId());
        assertEquals(18000000d, doc.getEffectivePrice());
        assertEquals("3", doc.getCategoryId());

        Page<ProductDocument> all = searchService.searchProducts("  ", pageable);
        assertEquals(1, all.getContent().size());
        verify(productRepository).findByActive(true, pageable);
    }

    @Test
    @DisplayName("TC_PH2_SEARCH_03: Tìm kiếm trang quản trị -> gồm cả sản phẩm đã ẩn (không lọc active)")
    void searchAll_includesInactive() {
        Page<ProductDocument> esPage = new PageImpl<>(List.of(ProductDocument.builder().id(2L).name("iPhone 12").active(false).build()));
        when(productSearchRepository.findByNameContainingOrDescriptionContaining("iphone", "iphone", pageable)).thenReturn(esPage);

        assertSame(esPage, searchService.searchAllProducts("iphone", pageable));
        verify(productSearchRepository, never()).findByActiveTrueAndNameContainingOrActiveTrueAndDescriptionContaining(any(), any(), any());
    }
}
