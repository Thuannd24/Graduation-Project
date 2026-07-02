package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.BrandDto;
import com.ecommerce.productservice.service.BrandService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/brands")
@RequiredArgsConstructor
@Slf4j
public class BrandController {

    private final BrandService brandService;

    @GetMapping
    public ResponseEntity<ApiResponse<Page<BrandDto>>> getAllBrands(
            @RequestParam(value = "active", required = false) Boolean active,
            @PageableDefault(size = 20) Pageable pageable) {
        log.info("GET /api/v1/public/brands - active: {}", active);
        Page<BrandDto> brands = brandService.getAllBrands(active, pageable);
        return ResponseEntity.ok(ApiResponse.success(brands));
    }

    @GetMapping("/active")
    public ResponseEntity<ApiResponse<List<BrandDto>>> getActiveBrands() {
        log.info("GET /api/v1/public/brands/active");
        List<BrandDto> brands = brandService.getActiveBrands();
        return ResponseEntity.ok(ApiResponse.success(brands));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<BrandDto>> getBrandById(@PathVariable Long id) {
        log.info("GET /api/v1/public/brands/{}", id);
        BrandDto brand = brandService.getBrandById(id);
        return ResponseEntity.ok(ApiResponse.success(brand));
    }

    @GetMapping("/slug/{slug}")
    public ResponseEntity<ApiResponse<BrandDto>> getBrandBySlug(@PathVariable String slug) {
        log.info("GET /api/v1/public/brands/slug/{}", slug);
        BrandDto brand = brandService.getBrandBySlug(slug);
        return ResponseEntity.ok(ApiResponse.success(brand));
    }

    @GetMapping("/category/{categoryId}")
    public ResponseEntity<ApiResponse<List<BrandDto>>> getBrandsByCategoryId(@PathVariable Long categoryId) {
        log.info("GET /api/v1/public/brands/category/{}", categoryId);
        List<BrandDto> brands = brandService.getBrandsByCategoryId(categoryId);
        return ResponseEntity.ok(ApiResponse.success(brands));
    }
}
