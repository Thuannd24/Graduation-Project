package com.ecommerce.productservice.repository;

import com.ecommerce.productservice.entity.ProductDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ProductSearchRepository extends ElasticsearchRepository<ProductDocument, Long> {
    Page<ProductDocument> findByNameContainingOrDescriptionContaining(String name, String description, Pageable pageable);
}
