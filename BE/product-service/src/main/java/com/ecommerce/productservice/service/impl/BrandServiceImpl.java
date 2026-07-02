package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.dto.BrandDto;
import com.ecommerce.productservice.entity.Brand;
import com.ecommerce.productservice.repository.BrandRepository;
import com.ecommerce.productservice.service.BrandService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class BrandServiceImpl implements BrandService {

    private final BrandRepository brandRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<BrandDto> getAllBrands(Boolean active, Pageable pageable) {
        log.info("Getting all brands - active: {}", active);
        Page<Brand> brands;
        if (active != null) {
            brands = brandRepository.findByActive(active, pageable);
        } else {
            brands = brandRepository.findAll(pageable);
        }
        return brands.map(this::convertToDto);
    }

    @Override
    @Transactional(readOnly = true)
    public List<BrandDto> getActiveBrands() {
        log.info("Getting active brands");
        return brandRepository.findByActive(true).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public BrandDto getBrandById(Long id) {
        log.info("Getting brand by id: {}", id);
        Brand brand = brandRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Brand not found with id: " + id));
        return convertToDto(brand);
    }

    @Override
    @Transactional(readOnly = true)
    public BrandDto getBrandBySlug(String slug) {
        log.info("Getting brand by slug: {}", slug);
        Brand brand = brandRepository.findBySlug(slug)
                .orElseThrow(() -> new RuntimeException("Brand not found with slug: " + slug));
        return convertToDto(brand);
    }

    @Override
    @Transactional
    public BrandDto createBrand(BrandDto brandDto) {
        log.info("Creating brand: {}", brandDto.getName());
        if (brandRepository.existsBySlug(brandDto.getSlug())) {
            throw new IllegalArgumentException("Brand slug already exists: " + brandDto.getSlug());
        }
        Brand brand = Brand.builder()
                .name(brandDto.getName())
                .slug(brandDto.getSlug())
                .logoUrl(brandDto.getLogoUrl())
                .description(brandDto.getDescription())
                .active(brandDto.getActive() != null ? brandDto.getActive() : true)
                .categoryIds(brandDto.getCategoryIds() != null ? brandDto.getCategoryIds() : new java.util.HashSet<>())
                .build();
        brand = brandRepository.save(brand);
        return convertToDto(brand);
    }

    @Override
    @Transactional
    public BrandDto updateBrand(Long id, BrandDto brandDto) {
        log.info("Updating brand: {}", id);
        Brand brand = brandRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Brand not found with id: " + id));

        // Check unique slug if changed
        if (!brand.getSlug().equals(brandDto.getSlug()) && brandRepository.existsBySlug(brandDto.getSlug())) {
            throw new IllegalArgumentException("Brand slug already exists: " + brandDto.getSlug());
        }

        brand.setName(brandDto.getName());
        brand.setSlug(brandDto.getSlug());
        brand.setLogoUrl(brandDto.getLogoUrl());
        brand.setDescription(brandDto.getDescription());
        if (brandDto.getActive() != null) {
            brand.setActive(brandDto.getActive());
        }
        if (brandDto.getCategoryIds() != null) {
            brand.setCategoryIds(brandDto.getCategoryIds());
        }

        brand = brandRepository.save(brand);
        return convertToDto(brand);
    }

    @Override
    @Transactional
    public void deleteBrand(Long id) {
        log.info("Deleting brand: {}", id);
        brandRepository.deleteById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public List<BrandDto> getBrandsByCategoryId(Long categoryId) {
        log.info("Getting active brands by categoryId: {}", categoryId);
        return brandRepository.findActiveBrandsByCategoryId(categoryId).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    private BrandDto convertToDto(Brand brand) {
        return BrandDto.builder()
                .id(brand.getId())
                .name(brand.getName())
                .slug(brand.getSlug())
                .logoUrl(brand.getLogoUrl())
                .description(brand.getDescription())
                .active(brand.getActive())
                .categoryIds(brand.getCategoryIds())
                .build();
    }
}
