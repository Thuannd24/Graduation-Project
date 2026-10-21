package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.Product;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {

    Slice<Product> findBy(Pageable pageable);

    Slice<Product> findByActive(Boolean active, Pageable pageable);

    Slice<Product> findByCategoryId(Long categoryId, Pageable pageable);

    Slice<Product> findByCategoryIdIn(List<Long> categoryIds, Pageable pageable);

    // Danh sách công khai chỉ lấy sản phẩm đang bán (active = true)
    Slice<Product> findByCategoryIdAndActive(Long categoryId, Boolean active, Pageable pageable);

    Slice<Product> findByCategoryIdInAndActive(List<Long> categoryIds, Boolean active, Pageable pageable);

    // Ứng viên cho "Sản phẩm liên quan": chỉ sản phẩm đang bán, loại trừ chính sản phẩm đang xem
    List<Product> findTop50ByCategoryIdInAndActiveTrueAndIdNot(List<Long> categoryIds, Long excludedId);

    List<Product> findTop50ByBrandIdAndActiveTrueAndIdNot(Long brandId, Long excludedId);

    Optional<Product> findBySlug(String slug);

    List<Product> findByIdIn(List<Long> ids);

    Slice<Product> findByNameContainingOrDescriptionContaining(String name, String description, Pageable pageable);

    // Tìm kiếm công khai (fallback DB): chỉ sản phẩm đang bán
    Slice<Product> findByActiveTrueAndNameContainingOrActiveTrueAndDescriptionContaining(String name, String description, Pageable pageable);
}
