package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.repository.*;
import com.ecommerce.productservice.service.impl.ProductServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bug thật khi tạo sản phẩm. Chạy riêng: mvn -pl product-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class ProductServiceImplBugCheck {

    @Mock private ProductRepository productRepository;
    @Mock private CategoryRepository categoryRepository;
    @Mock private ProductVariantRepository productVariantRepository;
    @Mock private ProductTagRepository productTagRepository;
    @Mock private ProductImageRepository productImageRepository;
    @Mock private BrandRepository brandRepository;
    @Mock private AttributeRepository attributeRepository;
    @Mock private ProductAttributeValueRepository productAttributeValueRepository;
    @Mock private VariantOptionValueRepository variantOptionValueRepository;
    @Mock private CacheManager cacheManager;
    @Spy private ObjectMapper objectMapper = new ObjectMapper();
    @Mock private SearchService searchService;

    @InjectMocks
    private ProductServiceImpl productService;

    @Test
    @DisplayName("TC_PH2_PROD_08: Tạo sản phẩm với categoryId không tồn tại (999) phải bị từ chối, không lưu sản phẩm không thuộc danh mục nào")
    void createProduct_nonExistentCategory_mustBeRejected() {
        lenient().when(productRepository.findBySlug("ghost")).thenReturn(Optional.empty());
        lenient().when(categoryRepository.findById(999L)).thenReturn(Optional.empty());
        lenient().when(categoryRepository.existsById(999L)).thenReturn(false);
        lenient().when(productRepository.save(any(Product.class))).thenAnswer(inv -> {
            Product p = inv.getArgument(0);
            p.setId(1L);
            return p;
        });

        ProductDto dto = ProductDto.builder().name("Ghost").slug("ghost")
                .price(new BigDecimal("100000")).categoryId(999L).build();

        assertThrows(RuntimeException.class, () -> productService.createProduct(dto));
        verify(productRepository, never()).save(any());
    }
}
