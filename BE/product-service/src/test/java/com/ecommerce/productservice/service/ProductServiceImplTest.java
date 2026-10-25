package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.dto.ProductListCacheEntry;
import com.ecommerce.productservice.dto.ProductVariantDto;
import com.ecommerce.productservice.entity.*;
import com.ecommerce.productservice.exception.ResourceNotFoundException;
import com.ecommerce.productservice.repository.*;
import com.ecommerce.productservice.service.impl.ProductServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.SliceImpl;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductServiceImplTest {

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

    private ProductDto.ProductDtoBuilder baseDto() {
        return ProductDto.builder()
                .name("iPhone 15").slug("iphone-15")
                .price(new BigDecimal("20000000"))
                .categoryId(3L);
    }

    private void saveReturnsWithId(long id) {
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> {
            Product p = inv.getArgument(0);
            if (p.getId() == null) p.setId(id);
            return p;
        });
    }

    @Test
    @DisplayName("TC_PH2_PROD_01: Tạo sản phẩm với slug đã tồn tại -> IllegalArgumentException 'Slug sản phẩm đã tồn tại', không lưu DB")
    void createProduct_duplicateSlug() {
        when(productRepository.findBySlug("iphone-15")).thenReturn(Optional.of(Product.builder().id(1L).build()));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> productService.createProduct(baseDto().build()));
        assertTrue(ex.getMessage().contains("Slug sản phẩm đã tồn tại"));
        verify(productRepository, never()).save(any());
        verifyNoInteractions(searchService);
    }

    @Test
    @DisplayName("TC_PH2_PROD_02: Tạo sản phẩm có giá KM >= giá niêm yết -> giá KM bị chuẩn hóa về null; tên brand lấy theo brandId; mặc định active=true, kích thước = 0; index ES + xóa cache slug")
    void createProduct_normalizesPriceAndDefaults() {
        Cache slugCache = mock(Cache.class);
        when(productRepository.findBySlug("iphone-15")).thenReturn(Optional.empty());
        when(categoryRepository.existsById(3L)).thenReturn(true);
        when(brandRepository.findById(9L)).thenReturn(Optional.of(Brand.builder().id(9L).name("Apple").slug("apple").build()));
        when(cacheManager.getCache("products_slug")).thenReturn(slugCache);
        saveReturnsWithId(50L);

        ProductDto dto = baseDto().salePrice(new BigDecimal("25000000")).brandId(9L).brand("sai-ten").build();
        ProductDto res = productService.createProduct(dto);

        ArgumentCaptor<Product> saved = ArgumentCaptor.forClass(Product.class);
        verify(productRepository).save(saved.capture());
        Product p = saved.getValue();
        assertNull(p.getSalePrice());
        assertEquals("Apple", p.getBrand());
        assertTrue(p.getActive());
        assertEquals(0, BigDecimal.ZERO.compareTo(p.getLength()));
        assertEquals(50L, res.getId());
        verify(searchService).indexProduct(50L);
        verify(slugCache).evict("iphone-15");
    }

    @Test
    @DisplayName("TC_PH2_PROD_03: Tạo sản phẩm kèm ảnh, tag, biến thể -> ảnh lưu theo thứ tự 0..n, lưu tag, biến thể mặc định active, thuộc tính biến thể mới được tạo kiểu 'select'")
    void createProduct_withImagesTagsVariants() {
        when(productRepository.findBySlug("iphone-15")).thenReturn(Optional.empty());
        when(categoryRepository.existsById(3L)).thenReturn(true);
        saveReturnsWithId(51L);
        when(productVariantRepository.save(any(ProductVariant.class))).thenAnswer(inv -> {
            ProductVariant v = inv.getArgument(0);
            v.setId(900L);
            return v;
        });
        when(attributeRepository.save(any(Attribute.class))).thenAnswer(inv -> {
            Attribute a = inv.getArgument(0);
            a.setId(70L);
            return a;
        });

        ProductVariantDto variant = ProductVariantDto.builder()
                .sku("IP15-BLK").price(new BigDecimal("21000000")).variantAttr(Map.of("color", "Đen")).build();
        ProductDto dto = baseDto()
                .images(List.of("a.jpg", "b.jpg"))
                .tags(List.of("apple", "flagship"))
                .variants(List.of(variant))
                .build();

        productService.createProduct(dto);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProductImage>> images = ArgumentCaptor.forClass(List.class);
        verify(productImageRepository).saveAll(images.capture());
        assertEquals(2, images.getValue().size());
        assertEquals(0, images.getValue().get(0).getSortOrder());
        assertEquals(1, images.getValue().get(1).getSortOrder());
        assertEquals(51L, images.getValue().get(1).getProductId());

        verify(productTagRepository).saveAll(argThat(tags -> ((List<?>) tags).size() == 2));

        ArgumentCaptor<ProductVariant> v = ArgumentCaptor.forClass(ProductVariant.class);
        verify(productVariantRepository).save(v.capture());
        assertEquals("IP15-BLK", v.getValue().getSku());
        assertTrue(v.getValue().getActive());

        ArgumentCaptor<Attribute> attr = ArgumentCaptor.forClass(Attribute.class);
        verify(attributeRepository).save(attr.capture());
        assertEquals("color", attr.getValue().getCode());
        assertEquals("select", attr.getValue().getValueType());
        verify(variantOptionValueRepository).saveAll(anyList());
    }

    @Test
    @DisplayName("TC_PH2_PROD_04: Cập nhật sản phẩm không tồn tại -> ResourceNotFoundException (404)")
    void updateProduct_notFound() {
        when(productRepository.findById(404L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> productService.updateProduct(404L, baseDto().build()));
        verify(productRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_PROD_05: Cập nhật đổi slug sang slug của sản phẩm khác -> IllegalArgumentException, không lưu")
    void updateProduct_slugTakenByOther() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(Product.builder().id(1L).slug("old-slug").build()));
        when(productRepository.findBySlug("iphone-15")).thenReturn(Optional.of(Product.builder().id(2L).slug("iphone-15").build()));

        assertThrows(IllegalArgumentException.class, () -> productService.updateProduct(1L, baseDto().build()));
        verify(productRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_PROD_06: Cập nhật biến thể theo SKU: SKU cũ có trong request -> cập nhật giá; SKU cũ không còn -> xóa; SKU mới -> thêm")
    void updateProduct_variantUpsertBySku() {
        Product existing = Product.builder().id(1L).slug("iphone-15").name("old").price(new BigDecimal("1")).build();
        ProductVariant keep = ProductVariant.builder().id(11L).productId(1L).sku("KEEP").price(new BigDecimal("100")).build();
        ProductVariant drop = ProductVariant.builder().id(12L).productId(1L).sku("DROP").price(new BigDecimal("100")).build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(categoryRepository.existsById(3L)).thenReturn(true);
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> inv.getArgument(0));
        when(productVariantRepository.findByProductId(1L)).thenReturn(List.of(keep, drop));
        when(productVariantRepository.save(any(ProductVariant.class))).thenAnswer(inv -> {
            ProductVariant v = inv.getArgument(0);
            if (v.getId() == null) v.setId(13L);
            return v;
        });

        ProductDto dto = baseDto().variants(List.of(
                ProductVariantDto.builder().sku("KEEP").price(new BigDecimal("150")).build(),
                ProductVariantDto.builder().sku("NEW").price(new BigDecimal("200")).build()
        )).build();

        productService.updateProduct(1L, dto);

        assertEquals(0, new BigDecimal("150").compareTo(keep.getPrice()));
        verify(productVariantRepository).delete(drop);
        verify(productVariantRepository, never()).delete(keep);
        verify(productVariantRepository).save(argThat(v -> "NEW".equals(v.getSku()) && v.getProductId() == 1L));
        verify(productTagRepository).deleteByProductId(1L);
        verify(productImageRepository).deleteByProductId(1L);
        verify(searchService).indexProduct(1L);
    }

    @Test
    @DisplayName("TC_PH2_PROD_07: Lấy sản phẩm theo danh mục cha -> gồm cả sản phẩm của mọi danh mục con/cháu, chỉ sản phẩm đang bán (truy vấn findByCategoryIdInAndActive)")
    void getProductsByCategory_includesDescendants() {
        Pageable pageable = PageRequest.of(0, 10);
        when(categoryRepository.findByParentId(1L)).thenReturn(List.of(Category.builder().id(2L).parentId(1L).build()));
        when(categoryRepository.findByParentId(2L)).thenReturn(List.of(Category.builder().id(3L).parentId(2L).build()));
        when(categoryRepository.findByParentId(3L)).thenReturn(List.of());
        when(productRepository.findByCategoryIdInAndActive(List.of(1L, 2L, 3L), true, pageable))
                .thenReturn(new SliceImpl<>(List.of(Product.builder().id(5L).name("P").slug("p").categoryId(3L).build()), pageable, false));

        ProductListCacheEntry entry = productService.getProductsByCategoryCacheable(1L, pageable);

        assertEquals(1, entry.getContent().size());
        assertEquals(5L, entry.getContent().get(0).getId());
        assertFalse(entry.isHasNext());
        verify(productRepository, never()).findByCategoryIdAndActive(anyLong(), any(), any());
        verify(productRepository, never()).findByCategoryIdIn(anyList(), any());
    }

    @Test
    @DisplayName("Chi tiết công khai: không trả giá vốn (sản phẩm và biến thể), không sửa bản trong cache; sản phẩm ngừng bán vẫn trả với active=false")
    void getPublicProductById_hidesCostPrice() {
        Product p = Product.builder().id(8L).name("P").slug("p").price(new BigDecimal("100"))
                .costPrice(new BigDecimal("60")).categoryId(3L).active(false).build();
        when(productRepository.findById(8L)).thenReturn(Optional.of(p));
        when(productVariantRepository.findByProductId(8L)).thenReturn(List.of(
                ProductVariant.builder().id(81L).productId(8L).sku("V").price(new BigDecimal("100")).costPrice(new BigDecimal("55")).build()));

        ProductDto full = productService.getProductById(8L);
        assertEquals(0, new BigDecimal("60").compareTo(full.getCostPrice()));

        ProductDto pub = ProductServiceImpl.toPublicView(full);
        assertNull(pub.getCostPrice());
        assertNull(pub.getVariants().get(0).getCostPrice());
        assertFalse(pub.getActive());
        assertEquals(0, pub.getReviewCount());
        // bản gốc (đang nằm trong cache) không bị sửa
        assertNotNull(full.getCostPrice());
        assertNotNull(full.getVariants().get(0).getCostPrice());
    }

    @Test
    @DisplayName("Chi tiết công khai: sản phẩm không tồn tại -> ResourceNotFoundException (404)")
    void getPublicProductById_notFound() {
        when(productRepository.findById(404L)).thenReturn(Optional.empty());
        assertThrows(ResourceNotFoundException.class, () -> productService.getPublicProductById(404L));
    }

    @Test
    @DisplayName("Danh sách công khai: chỉ lấy sản phẩm đang bán và không có giá vốn")
    void getPublicProducts_activeOnlyWithoutCostPrice() {
        Pageable pageable = PageRequest.of(0, 10);
        when(productRepository.findByActive(true, pageable)).thenReturn(new SliceImpl<>(List.of(
                Product.builder().id(5L).name("P").slug("p").price(new BigDecimal("100")).costPrice(new BigDecimal("70")).build()),
                pageable, false));

        var res = productService.getPublicProducts(pageable);

        assertEquals(1, res.getContent().size());
        assertNull(res.getContent().get(0).getCostPrice());
        verify(productRepository, never()).findBy(any());
    }

    @Test
    @DisplayName("Sản phẩm liên quan: ưu tiên cùng danh mục (cùng thương hiệu, gần giá), sau đó cùng thương hiệu; không lộ giá vốn")
    void getRelatedProducts_sameCategoryThenBrand() {
        Product source = Product.builder().id(1L).categoryId(3L).brandId(9L).price(new BigDecimal("1000")).build();
        Product farOtherBrand = Product.builder().id(2L).categoryId(3L).brandId(7L).price(new BigDecimal("1050")).costPrice(new BigDecimal("1")).build();
        Product sameBrandFar = Product.builder().id(3L).categoryId(3L).brandId(9L).price(new BigDecimal("3000")).build();
        Product sameBrandNear = Product.builder().id(4L).categoryId(3L).brandId(9L).price(new BigDecimal("1100")).build();
        Product otherCategorySameBrand = Product.builder().id(5L).categoryId(8L).brandId(9L).price(new BigDecimal("900")).build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(source));
        when(productRepository.findTop50ByCategoryIdInAndActiveTrueAndIdNot(List.of(3L), 1L))
                .thenReturn(List.of(farOtherBrand, sameBrandFar, sameBrandNear));
        when(productRepository.findTop50ByBrandIdAndActiveTrueAndIdNot(9L, 1L))
                .thenReturn(List.of(sameBrandFar, sameBrandNear, otherCategorySameBrand));

        List<ProductDto> related = productService.getRelatedProducts(1L, 4);

        assertEquals(List.of(4L, 3L, 2L, 5L), related.stream().map(ProductDto::getId).toList());
        assertTrue(related.stream().allMatch(d -> d.getCostPrice() == null));
        verify(categoryRepository, never()).findById(any());
    }

    @Test
    @DisplayName("TC_PH2_PROD_08 (cập nhật): đổi sang danh mục không tồn tại -> IllegalArgumentException, không lưu")
    void updateProduct_nonExistentCategory() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(Product.builder().id(1L).slug("iphone-15").categoryId(3L).build()));
        when(categoryRepository.existsById(999L)).thenReturn(false);

        assertThrows(IllegalArgumentException.class,
                () -> productService.updateProduct(1L, baseDto().categoryId(999L).build()));
        verify(productRepository, never()).save(any());
    }
}
