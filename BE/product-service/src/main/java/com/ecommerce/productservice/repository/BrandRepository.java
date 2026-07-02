package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.Brand;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BrandRepository extends JpaRepository<Brand, Long> {
    Optional<Brand> findBySlug(String slug);
    boolean existsBySlug(String slug);
    org.springframework.data.domain.Page<Brand> findByActive(Boolean active, org.springframework.data.domain.Pageable pageable);
    java.util.List<Brand> findByActive(Boolean active);

    @org.springframework.data.jpa.repository.Query("SELECT b FROM Brand b JOIN b.categoryIds c WHERE c = :categoryId AND b.active = true")
    java.util.List<Brand> findActiveBrandsByCategoryId(@org.springframework.data.repository.query.Param("categoryId") Long categoryId);
}
