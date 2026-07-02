package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.AttributeDto;
import com.ecommerce.productservice.dto.CategoryAttributeDto;
import com.ecommerce.productservice.service.AttributeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminAttributeController {

    private final AttributeService attributeService;

    @PostMapping("/attributes")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<AttributeDto> createAttribute(@Valid @RequestBody AttributeDto attributeDto) {
        return ApiResponse.success(attributeService.createAttribute(attributeDto));
    }

    @PutMapping("/attributes/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<AttributeDto> updateAttribute(@PathVariable Long id, @Valid @RequestBody AttributeDto attributeDto) {
        return ApiResponse.success(attributeService.updateAttribute(id, attributeDto));
    }

    @GetMapping("/attributes")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<List<AttributeDto>> getAllAttributes() {
        return ApiResponse.success(attributeService.getAllAttributes());
    }

    @GetMapping("/attributes/{id}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<AttributeDto> getAttributeById(@PathVariable Long id) {
        return ApiResponse.success(attributeService.getAttributeById(id));
    }

    @DeleteMapping("/attributes/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<Void> deleteAttribute(@PathVariable Long id) {
        attributeService.deleteAttribute(id);
        return ApiResponse.success(null);
    }

    @PostMapping("/categories/{categoryId}/attributes")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<CategoryAttributeDto> assignAttributeToCategory(
            @PathVariable Long categoryId,
            @RequestBody CategoryAttributeDto categoryAttributeDto) {
        categoryAttributeDto.setCategoryId(categoryId);
        return ApiResponse.success(attributeService.assignAttributeToCategory(categoryAttributeDto));
    }

    @DeleteMapping("/categories/{categoryId}/attributes/{attributeId}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<Void> removeAttributeFromCategory(
            @PathVariable Long categoryId,
            @PathVariable Long attributeId) {
        attributeService.removeAttributeFromCategory(categoryId, attributeId);
        return ApiResponse.success(null);
    }
}
