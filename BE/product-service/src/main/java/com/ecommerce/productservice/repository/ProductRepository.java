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

    Optional<Product> findBySlug(String slug);

    List<Product> findByIdIn(List<Long> ids);

    Slice<Product> findByNameContainingOrDescriptionContaining(String name, String description, Pageable pageable);
}
