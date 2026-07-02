package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.BrandDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface BrandService {
    Page<BrandDto> getAllBrands(Boolean active, Pageable pageable);
    List<BrandDto> getActiveBrands();
    BrandDto getBrandById(Long id);
    BrandDto getBrandBySlug(String slug);
    BrandDto createBrand(BrandDto brandDto);
    BrandDto updateBrand(Long id, BrandDto brandDto);
    void deleteBrand(Long id);
    List<BrandDto> getBrandsByCategoryId(Long categoryId);
}
