package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.CategoryDto;
import java.util.List;

public interface CategoryService {
    List<CategoryDto> getCategoryTree();
    CategoryDto getCategoryById(Long id);
    CategoryDto createCategory(CategoryDto categoryDto);
    CategoryDto updateCategory(Long id, CategoryDto categoryDto);
    void deleteCategory(Long id);
}
