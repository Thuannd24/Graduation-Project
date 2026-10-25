package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.exception.ResourceNotFoundException;
import com.ecommerce.productservice.repository.CategoryRepository;
import com.ecommerce.productservice.service.impl.CategoryServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bug thật trong quản lý danh mục. Chạy riêng: mvn -pl product-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class CategoryServiceImplBugCheck {

    @Mock
    private CategoryRepository categoryRepository;

    @InjectMocks
    private CategoryServiceImpl categoryService;

    @Test
    @DisplayName("TC_PH2_CAT_04: Tạo danh mục với parentId không tồn tại (999) phải bị từ chối, không tạo danh mục mồ côi ngoài cây")
    void createCategory_nonExistentParent_mustBeRejected() {
        lenient().when(categoryRepository.findBySlug("tai-nghe")).thenReturn(Optional.empty());
        lenient().when(categoryRepository.findById(999L)).thenReturn(Optional.empty());
        lenient().when(categoryRepository.save(any(Category.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThrows(RuntimeException.class, () -> categoryService.createCategory(
                CategoryDto.builder().name("Tai nghe").slug("tai-nghe").parentId(999L).build()));
        verify(categoryRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH2_CAT_05: Xem danh mục không tồn tại phải ném ResourceNotFoundException (HTTP 404), không phải RuntimeException chung (HTTP 500)")
    void getCategoryById_notFound_mustBe404() {
        when(categoryRepository.findById(404L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> categoryService.getCategoryById(404L));
    }
}
