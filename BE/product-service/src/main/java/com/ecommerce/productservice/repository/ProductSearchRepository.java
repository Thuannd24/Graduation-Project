package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProductSearchRepository extends ElasticsearchRepository<ProductDocument, Long> {
    Page<ProductDocument> findByNameContainingOrDescriptionContaining(String name, String description, Pageable pageable);

    // Tìm kiếm công khai: chỉ trả sản phẩm đang bán (active = true)
    Page<ProductDocument> findByActiveTrue(Pageable pageable);

    Page<ProductDocument> findByActiveTrueAndNameContainingOrActiveTrueAndDescriptionContaining(String name, String description, Pageable pageable);
}
