package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.repository.CategoryRepository;
import com.ecommerce.productservice.service.CategoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CategoryServiceImpl implements CategoryService {

    private final CategoryRepository categoryRepository;

    @Override
    public List<CategoryDto> getCategoryTree() {
        List<Category> categories = categoryRepository.findAll();
        List<CategoryDto> dtos = categories.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());

        Map<Long, List<CategoryDto>> groupedByParent = dtos.stream()
                .filter(c -> c.getParentId() != null)
                .collect(Collectors.groupingBy(CategoryDto::getParentId));

        List<CategoryDto> roots = dtos.stream()
                .filter(c -> c.getParentId() == null)
                .collect(Collectors.toList());

        for (CategoryDto root : roots) {
            populateChildren(root, groupedByParent);
        }

        return roots;
    }

    private void populateChildren(CategoryDto parent, Map<Long, List<CategoryDto>> groupedByParent) {
        List<CategoryDto> children = groupedByParent.get(parent.getId());
        if (children != null) {
            parent.setChildren(children);
            for (CategoryDto child : children) {
                populateChildren(child, groupedByParent);
            }
        } else {
            parent.setChildren(new ArrayList<>());
        }
    }

    @Override
    public CategoryDto getCategoryById(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found with id: " + id));
        return convertToDto(category);
    }

    @Override
    @Transactional
    public CategoryDto createCategory(CategoryDto categoryDto) {
        if (categoryRepository.findBySlug(categoryDto.getSlug()).isPresent()) {
            throw new IllegalArgumentException("Slug danh mục đã tồn tại: " + categoryDto.getSlug());
        }
        Category category = Category.builder()
                .name(categoryDto.getName())
                .slug(categoryDto.getSlug())
                .parentId(categoryDto.getParentId())
                .imageUrl(categoryDto.getImageUrl())
                .icon(categoryDto.getIcon())
                .sortOrder(categoryDto.getSortOrder())
                .active(categoryDto.getActive() != null ? categoryDto.getActive() : true)
                .build();
        category = categoryRepository.save(category);
        return convertToDto(category);
    }

    @Override
    @Transactional
    public CategoryDto updateCategory(Long id, CategoryDto categoryDto) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found with id: " + id));

        if (!category.getSlug().equals(categoryDto.getSlug())
                && categoryRepository.findBySlug(categoryDto.getSlug()).isPresent()) {
            throw new IllegalArgumentException("Slug danh mục đã tồn tại: " + categoryDto.getSlug());
        }

        if (categoryDto.getParentId() != null) {
            if (categoryDto.getParentId().equals(id)) {
                throw new IllegalArgumentException("Danh mục không thể là cha của chính nó.");
            }
            if (createsCycle(id, categoryDto.getParentId())) {
                throw new IllegalArgumentException("Danh mục cha tạo thành chu trình (cycle) không hợp lệ.");
            }
        }

        category.setName(categoryDto.getName());
        category.setSlug(categoryDto.getSlug());
        category.setParentId(categoryDto.getParentId());
        category.setImageUrl(categoryDto.getImageUrl());
        category.setIcon(categoryDto.getIcon());
        category.setSortOrder(categoryDto.getSortOrder());
        if (categoryDto.getActive() != null) {
            category.setActive(categoryDto.getActive());
        }
        category = categoryRepository.save(category);
        return convertToDto(category);
    }

    @Override
    @Transactional
    public void deleteCategory(Long id) {
        categoryRepository.deleteById(id);
    }

    // Đi ngược lên chuỗi parentId từ newParentId — nếu gặp lại categoryId thì đây là 1 cycle
    // (VD: A đang là ông/cha của B, nay lại gán parent của A = B).
    private boolean createsCycle(Long categoryId, Long newParentId) {
        Long currentId = newParentId;
        while (currentId != null) {
            if (currentId.equals(categoryId)) {
                return true;
            }
            currentId = categoryRepository.findById(currentId)
                    .map(Category::getParentId)
                    .orElse(null);
        }
        return false;
    }

    private CategoryDto convertToDto(Category category) {
        return CategoryDto.builder()
                .id(category.getId())
                .name(category.getName())
                .slug(category.getSlug())
                .parentId(category.getParentId())
                .imageUrl(category.getImageUrl())
                .icon(category.getIcon())
                .sortOrder(category.getSortOrder())
                .active(category.getActive())
                .children(new ArrayList<>())
                .build();
    }
}
