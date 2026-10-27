package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.repository.CategoryRepository;
import com.ecommerce.productservice.service.impl.CategoryServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CategoryServiceImplTest {

    @Mock
    private CategoryRepository categoryRepository;

    @InjectMocks
    private CategoryServiceImpl categoryService;

    private Category cat(long id, String slug, Long parentId) {
        return Category.builder().id(id).name("C" + id).slug(slug).parentId(parentId).build();
    }

    @Test
    @DisplayName("TC_PH2_CAT_01: Tạo danh mục trùng slug -> IllegalArgumentException; slug mới -> lưu với active mặc định true")
    void createCategory_slugRules() {
        when(categoryRepository.findBySlug("dien-thoai")).thenReturn(Optional.of(cat(1L, "dien-thoai", null)));
        when(categoryRepository.findBySlug("laptop")).thenReturn(Optional.empty());
        when(categoryRepository.save(any(Category.class))).thenAnswer(inv -> {
            Category c = inv.getArgument(0);
            c.setId(10L);
            return c;
        });

        assertThrows(IllegalArgumentException.class,
                () -> categoryService.createCategory(CategoryDto.builder().name("Điện thoại").slug("dien-thoai").build()));

        CategoryDto created = categoryService.createCategory(CategoryDto.builder().name("Laptop").slug("laptop").build());
        assertEquals(10L, created.getId());
        assertTrue(created.getActive());
        verify(categoryRepository, times(1)).save(any());
    }

    @Test
    @DisplayName("TC_PH2_CAT_02: Cập nhật danh mục đặt cha là chính nó -> IllegalArgumentException 'không thể là cha của chính nó'")
    void updateCategory_selfParent() {
        when(categoryRepository.findById(5L)).thenReturn(Optional.of(cat(5L, "phu-kien", null)));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> categoryService.updateCategory(5L, CategoryDto.builder().name("Phụ kiện").slug("phu-kien").parentId(5L).build()));
        assertTrue(ex.getMessage().contains("chính nó"));
        verify(categoryRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_CAT_03: Cập nhật tạo chu trình (A là ông của C, đặt cha của A = C) -> IllegalArgumentException 'chu trình'")
    void updateCategory_cycle() {
        // A(1) <- B(2) <- C(3)
        when(categoryRepository.findById(1L)).thenReturn(Optional.of(cat(1L, "a", null)));
        when(categoryRepository.findById(3L)).thenReturn(Optional.of(cat(3L, "c", 2L)));
        when(categoryRepository.findById(2L)).thenReturn(Optional.of(cat(2L, "b", 1L)));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> categoryService.updateCategory(1L, CategoryDto.builder().name("A").slug("a").parentId(3L).build()));
        assertTrue(ex.getMessage().contains("chu trình"));
        verify(categoryRepository, never()).save(any());
    }
}
