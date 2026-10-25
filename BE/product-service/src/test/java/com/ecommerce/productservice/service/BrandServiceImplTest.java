package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.BrandDto;
import com.ecommerce.productservice.entity.Brand;
import com.ecommerce.productservice.repository.BrandRepository;
import com.ecommerce.productservice.service.impl.BrandServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BrandServiceImplTest {

    @Mock
    private BrandRepository brandRepository;

    @InjectMocks
    private BrandServiceImpl brandService;

    @Test
    @DisplayName("TC_PH2_BRAND_01: Tạo thương hiệu trùng slug -> IllegalArgumentException; đổi slug khi cập nhật sang slug đã có -> IllegalArgumentException; giữ nguyên slug thì cập nhật được")
    void brand_slugUniqueness() {
        when(brandRepository.existsBySlug("apple")).thenReturn(true);
        assertThrows(IllegalArgumentException.class,
                () -> brandService.createBrand(BrandDto.builder().name("Apple").slug("apple").build()));

        Brand samsung = Brand.builder().id(2L).name("Samsung").slug("samsung").active(true).build();
        when(brandRepository.findById(2L)).thenReturn(Optional.of(samsung));
        assertThrows(IllegalArgumentException.class,
                () -> brandService.updateBrand(2L, BrandDto.builder().name("Samsung").slug("apple").build()));
        verify(brandRepository, never()).save(any());

        when(brandRepository.save(any(Brand.class))).thenAnswer(inv -> inv.getArgument(0));
        BrandDto updated = brandService.updateBrand(2L,
                BrandDto.builder().name("Samsung VN").slug("samsung").categoryIds(Set.of(1L, 2L)).build());
        assertEquals("Samsung VN", updated.getName());
        assertTrue(updated.getActive(), "active=null trong request thì giữ nguyên giá trị cũ");
        assertEquals(Set.of(1L, 2L), updated.getCategoryIds());
        verify(brandRepository, never()).existsBySlug("samsung");
    }
}
