package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.BrandDto;
import com.ecommerce.productservice.service.BrandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/brands")
@RequiredArgsConstructor
@Slf4j
public class AdminBrandController {

    private final BrandService brandService;

    @PostMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<BrandDto>> createBrand(@Valid @RequestBody BrandDto brandDto) {
        log.info("POST /api/v1/admin/brands - name: {}", brandDto.getName());
        BrandDto created = brandService.createBrand(brandDto);
        return ResponseEntity.ok(ApiResponse.success("Brand created successfully", created));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<BrandDto>> updateBrand(
            @PathVariable Long id,
            @Valid @RequestBody BrandDto brandDto) {
        log.info("PUT /api/v1/admin/brands/{} - name: {}", id, brandDto.getName());
        BrandDto updated = brandService.updateBrand(id, brandDto);
        return ResponseEntity.ok(ApiResponse.success("Brand updated successfully", updated));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteBrand(@PathVariable Long id) {
        log.info("DELETE /api/v1/admin/brands/{}", id);
        brandService.deleteBrand(id);
        return ResponseEntity.ok(ApiResponse.success("Brand deleted successfully", null));
    }
}
