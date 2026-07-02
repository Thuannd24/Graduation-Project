package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.dto.CategoryAttributeDto;
import com.ecommerce.productservice.service.CategoryService;
import com.ecommerce.productservice.service.AttributeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;
    private final AttributeService attributeService;

    @GetMapping("/tree")
    public ApiResponse<List<CategoryDto>> getCategoryTree() {
        return ApiResponse.success(categoryService.getCategoryTree());
    }

    @GetMapping("/{id}")
    public ApiResponse<CategoryDto> getCategoryById(@PathVariable Long id) {
        return ApiResponse.success(categoryService.getCategoryById(id));
    }

    @GetMapping("/{id}/attributes")
    public ApiResponse<List<CategoryAttributeDto>> getAttributesByCategory(@PathVariable Long id) {
        return ApiResponse.success(attributeService.getAttributesByCategory(id));
    }
}
