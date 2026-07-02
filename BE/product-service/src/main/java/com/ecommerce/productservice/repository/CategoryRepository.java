package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CategoryRepository extends JpaRepository<Category, Long> {

    List<Category> findByParentIdIsNull();

    List<Category> findByParentId(Long parentId);

    Optional<Category> findBySlug(String slug);

    List<Category> findByActive(Boolean active);
}
