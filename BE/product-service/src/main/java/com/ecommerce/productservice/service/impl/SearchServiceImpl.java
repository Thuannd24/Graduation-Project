package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductDocument;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.ProductSearchRepository;
import com.ecommerce.productservice.service.SearchService;
import com.ecommerce.productservice.util.ProductPricingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

@Service
@RequiredArgsConstructor
@Slf4j
public class SearchServiceImpl implements SearchService {

    private final ProductSearchRepository productSearchRepository;
    private final ProductRepository productRepository;

    @Override
    public Page<ProductDocument> searchProducts(String keyword, Pageable pageable) {
        try {
            if (keyword == null || keyword.trim().isEmpty()) {
                return productSearchRepository.findAll(pageable);
            }
            return productSearchRepository.findByNameContainingOrDescriptionContaining(keyword, keyword, pageable);
        } catch (Exception e) {
            log.error("Elasticsearch search failed: {}. Falling back to DB search.", e.getMessage());
            // Fallback: search in DB
            Slice<Product> dbProductsSlice;
            if (keyword == null || keyword.trim().isEmpty()) {
                dbProductsSlice = productRepository.findByActive(true, pageable);
            } else {
                dbProductsSlice = productRepository.findByNameContainingOrDescriptionContaining(keyword, keyword, pageable);
            }
            long total = dbProductsSlice.hasNext() 
                    ? pageable.getOffset() + dbProductsSlice.getNumberOfElements() + 1 
                    : pageable.getOffset() + dbProductsSlice.getNumberOfElements();
            Page<Product> dbProducts = new PageImpl<>(dbProductsSlice.getContent(), pageable, total);
            return dbProducts.map(p -> ProductDocument.builder()
                    .id(p.getId())
                    .name(p.getName())
                    .description(p.getDescription())
                    .imageUrl(p.getImageUrl())
                    .price(p.getPrice() != null ? p.getPrice().doubleValue() : null)
                    .salePrice(p.getSalePrice() != null ? p.getSalePrice().doubleValue() : null)
                    .effectivePrice(ProductPricingUtils.getEffectivePrice(p.getPrice(), p.getSalePrice()).doubleValue())
                    .categoryId(p.getCategoryId() != null ? p.getCategoryId().toString() : null)
                    .brand(p.getBrand())
                    .brandId(p.getBrandId())
                    .status(p.getStatus() != null ? p.getStatus().name() : null)
                    .salesCount(p.getSalesCount())
                    .ratingAvg(p.getRatingAvg() != null ? p.getRatingAvg().floatValue() : null)
                    .active(p.getActive())
                    .build());
        }
    }

    @Override
    public void indexProduct(Long productId) {
        try {
            productRepository.findById(productId).ifPresent(p -> {
                ProductDocument doc = ProductDocument.builder()
                        .id(p.getId())
                        .name(p.getName())
                        .description(p.getDescription())
                        .imageUrl(p.getImageUrl())
                        .price(p.getPrice() != null ? p.getPrice().doubleValue() : null)
                        .salePrice(p.getSalePrice() != null ? p.getSalePrice().doubleValue() : null)
                        .effectivePrice(ProductPricingUtils.getEffectivePrice(p.getPrice(), p.getSalePrice()).doubleValue())
                        .categoryId(p.getCategoryId() != null ? p.getCategoryId().toString() : null)
                        .brand(p.getBrand())
                        .brandId(p.getBrandId())
                        .status(p.getStatus() != null ? p.getStatus().name() : null)
                        .salesCount(p.getSalesCount())
                        .ratingAvg(p.getRatingAvg() != null ? p.getRatingAvg().floatValue() : null)
                        .active(p.getActive())
                        .build();
                productSearchRepository.save(doc);
                log.info("Successfully indexed product ID: {} in Elasticsearch", productId);
            });
        } catch (Exception e) {
            log.warn("Elasticsearch is not available. Skipping indexing for product ID: {}. Error: {}", productId, e.getMessage());
        }
    }

    @Override
    public void removeProductIndex(Long productId) {
        try {
            productSearchRepository.deleteById(productId);
            log.info("Successfully removed product ID: {} from Elasticsearch index", productId);
        } catch (Exception e) {
            log.warn("Elasticsearch is not available. Skipping delete index for product ID: {}. Error: {}", productId, e.getMessage());
        }
    }
}
