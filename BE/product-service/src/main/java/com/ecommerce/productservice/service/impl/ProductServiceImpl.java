package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.dto.ProductVariantDto;
import com.ecommerce.productservice.entity.*;
import com.ecommerce.productservice.exception.ResourceNotFoundException;
import com.ecommerce.productservice.repository.*;
import com.ecommerce.productservice.service.ProductService;
import com.ecommerce.productservice.service.SearchService;
import com.ecommerce.productservice.util.ProductPricingUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.SliceImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductServiceImpl implements ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final ProductVariantRepository productVariantRepository;
    private final ProductTagRepository productTagRepository;
    private final ProductImageRepository productImageRepository;
    private final BrandRepository brandRepository;
    private final AttributeRepository attributeRepository;
    private final ProductAttributeValueRepository productAttributeValueRepository;
    private final VariantOptionValueRepository variantOptionValueRepository;
    
    private final CacheManager cacheManager;
    private final ObjectMapper objectMapper;

    @Lazy
    private final SearchService searchService;

    @Override
    public Slice<ProductDto> getAllProducts(Boolean active, Pageable pageable) {
        Slice<Product> products;
        if (active != null) {
            products = productRepository.findByActive(active, pageable);
        } else {
            products = productRepository.findBy(pageable);
        }
        List<ProductDto> dtos = convertToDtoList(products.getContent());
        return new SliceImpl<>(dtos, pageable, products.hasNext());
    }

    @Override
    public Slice<ProductDto> getProductsByCategory(Long categoryId, Pageable pageable) {
        List<Long> categoryIds = resolveCategoryIdsWithDescendants(categoryId);
        Slice<Product> products = categoryIds.size() == 1
                ? productRepository.findByCategoryId(categoryId, pageable)
                : productRepository.findByCategoryIdIn(categoryIds, pageable);
        List<ProductDto> dtos = convertToDtoList(products.getContent());
        return new SliceImpl<>(dtos, pageable, products.hasNext());
    }

    // Danh mục cha hiển thị luôn sản phẩm của mọi danh mục con (đệ quy), không chỉ sản phẩm gán trực tiếp vào nó
    private List<Long> resolveCategoryIdsWithDescendants(Long categoryId) {
        List<Long> ids = new ArrayList<>();
        ids.add(categoryId);
        Deque<Long> queue = new ArrayDeque<>();
        queue.add(categoryId);
        while (!queue.isEmpty()) {
            Long current = queue.poll();
            for (Category child : categoryRepository.findByParentId(current)) {
                ids.add(child.getId());
                queue.add(child.getId());
            }
        }
        return ids;
    }

    @Override
    @Cacheable(value = "products", key = "#id", sync = true)
    public ProductDto getProductById(Long id) {
        return productRepository.findById(id)
                .map(this::convertToDto)
                .orElse(null);
    }

    @Override
    @Cacheable(value = "products_slug", key = "#slug", sync = true)
    public ProductDto getProductBySlug(String slug) {
        return productRepository.findBySlug(slug)
                .map(this::convertToDto)
                .orElse(null);
    }

    @Override
    @Transactional
    public ProductDto createProduct(ProductDto productDto) {
        if (productRepository.findBySlug(productDto.getSlug()).isPresent()) {
            throw new IllegalArgumentException("Slug sản phẩm đã tồn tại: " + productDto.getSlug());
        }
        normalizeProductPricing(productDto);
        String resolvedBrandName = productDto.getBrand();
        if (productDto.getBrandId() != null) {
            resolvedBrandName = brandRepository.findById(productDto.getBrandId())
                    .map(Brand::getName)
                    .orElse(productDto.getBrand());
        }

        // For backward compatibility at the DB level, we store an empty/null string in the legacy JSON column
        Product product = Product.builder()
                .name(productDto.getName())
                .slug(productDto.getSlug())
                .description(productDto.getDescription())
                .attributes(null) // Deprecated: attributes now stored in product_attribute_values
                .specsRaw(serializeSpecsRaw(productDto.getSpecsRaw()))
                .price(productDto.getPrice())
                .costPrice(productDto.getCostPrice())
                .salePrice(productDto.getSalePrice())
                .weight(productDto.getWeight())
                .length(productDto.getLength() != null ? productDto.getLength() : BigDecimal.ZERO)
                .width(productDto.getWidth() != null ? productDto.getWidth() : BigDecimal.ZERO)
                .height(productDto.getHeight() != null ? productDto.getHeight() : BigDecimal.ZERO)
                .categoryId(productDto.getCategoryId())
                .brandId(productDto.getBrandId())
                .brand(resolvedBrandName)
                .imageUrl(productDto.getImageUrl())
                .warrantyPeriod(productDto.getWarrantyPeriod())
                .warrantyPolicy(productDto.getWarrantyPolicy())
                .active(productDto.getActive() != null ? productDto.getActive() : true)
                .build();

        product = productRepository.save(product);
        final Long productId = product.getId();

        // 1. Save dynamic specifications to the relational table (EAV)
        Map<String, Attribute> attributesByCode = getAttributesByCodeMap();
        saveSpecifications(productId, productDto.getAttributes(), attributesByCode);

        // 2. Save gallery images
        if (productDto.getImages() != null) {
            int sortOrder = 0;
            List<ProductImage> productImages = new ArrayList<>();
            for (String imgUrl : productDto.getImages()) {
                productImages.add(ProductImage.builder()
                        .productId(productId)
                        .imageUrl(imgUrl)
                        .sortOrder(sortOrder++)
                        .isPrimary(false)
                        .build());
            }
            productImageRepository.saveAll(productImages);
        }

        // 3. Save variants & their option values
        if (productDto.getVariants() != null) {
            for (ProductVariantDto v : productDto.getVariants()) {
                ProductVariant variant = ProductVariant.builder()
                        .productId(productId)
                        .sku(v.getSku())
                        .variantAttr(null) // Deprecated: variant attributes now stored in variant_option_values
                        .price(v.getPrice())
                        .salePrice(v.getSalePrice())
                        .costPrice(v.getCostPrice())
                        .weight(v.getWeight())
                        .imageUrl(v.getImageUrl())
                        .active(v.getActive() != null ? v.getActive() : true)
                        .build();
                variant = productVariantRepository.save(variant);
                
                // Save option values relational link
                saveVariantOptions(variant.getId(), v.getVariantAttr(), attributesByCode);
            }
        }

        // 4. Save tags
        if (productDto.getTags() != null) {
            List<ProductTag> tags = productDto.getTags().stream()
                    .map(tag -> ProductTag.builder()
                            .productId(productId)
                            .tag(tag)
                            .build())
                    .collect(Collectors.toList());
            productTagRepository.saveAll(tags);
        }

        // Convert to DTO first while we are inside the transaction (loads lazy properties)
        ProductDto responseDto = convertToDto(product);
        final String newSlug = product.getSlug();

        // Index in Elasticsearch (Post DB transaction commit)
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        searchService.indexProduct(productId);
                    } catch (Exception e) {
                        log.error("Failed to index product in Elasticsearch after transaction commit: {}", e.getMessage());
                    }

                    // BUG FIX: getProductBySlug caches a null result (Cache Penetration guard in
                    // CacheConfig), so if the slug was looked up (e.g. an admin "slug already
                    // taken?" check) before this product was created, that null stays cached for
                    // the full 24h TTL and the newly created product would 404 by slug until it
                    // expires. Evict pre-emptively so the next lookup reads the DB.
                    try {
                        Cache slugsCache = cacheManager.getCache("products_slug");
                        if (slugsCache != null && newSlug != null) {
                            slugsCache.evict(newSlug);
                        }
                    } catch (Exception e) {
                        log.error("Failed to evict products_slug cache for new product slug: {}", newSlug, e);
                    }
                }
            });
        } else {
            try {
                searchService.indexProduct(productId);
            } catch (Exception e) {
                log.error("Failed to index product in Elasticsearch: {}", e.getMessage());
            }
            try {
                Cache slugsCache = cacheManager.getCache("products_slug");
                if (slugsCache != null && newSlug != null) {
                    slugsCache.evict(newSlug);
                }
            } catch (Exception e) {
                log.error("Failed to evict products_slug cache for new product slug: {}", newSlug, e);
            }
        }

        return responseDto;
    }

    @Override
    @Transactional
    public ProductDto updateProduct(Long id, ProductDto productDto) {
        normalizeProductPricing(productDto);
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", id));

        final String oldSlug = product.getSlug();

        if (!oldSlug.equals(productDto.getSlug())
                && productRepository.findBySlug(productDto.getSlug()).isPresent()) {
            throw new IllegalArgumentException("Slug sản phẩm đã tồn tại: " + productDto.getSlug());
        }

        String resolvedBrandName = productDto.getBrand();
        if (productDto.getBrandId() != null) {
            resolvedBrandName = brandRepository.findById(productDto.getBrandId())
                    .map(Brand::getName)
                    .orElse(productDto.getBrand());
        }

        product.setName(productDto.getName());
        product.setSlug(productDto.getSlug());
        product.setDescription(productDto.getDescription());
        product.setAttributes(null); // Keep legacy column null
        if (productDto.getSpecsRaw() != null) {
            product.setSpecsRaw(serializeSpecsRaw(productDto.getSpecsRaw()));
        }
        product.setPrice(productDto.getPrice());
        product.setCostPrice(productDto.getCostPrice());
        product.setSalePrice(productDto.getSalePrice());
        product.setWeight(productDto.getWeight());
        product.setLength(productDto.getLength() != null ? productDto.getLength() : BigDecimal.ZERO);
        product.setWidth(productDto.getWidth() != null ? productDto.getWidth() : BigDecimal.ZERO);
        product.setHeight(productDto.getHeight() != null ? productDto.getHeight() : BigDecimal.ZERO);
        product.setCategoryId(productDto.getCategoryId());
        product.setBrandId(productDto.getBrandId());
        product.setBrand(resolvedBrandName);
        product.setImageUrl(productDto.getImageUrl());
        product.setWarrantyPeriod(productDto.getWarrantyPeriod());
        product.setWarrantyPolicy(productDto.getWarrantyPolicy());
        if (productDto.getActive() != null) {
            product.setActive(productDto.getActive());
        }

        product = productRepository.save(product);

        // 1. Save updated relational specifications (upsert — update existing, insert new, delete removed)
        Map<String, Attribute> attributesByCode = getAttributesByCodeMap();
        saveSpecifications(id, productDto.getAttributes(), attributesByCode);

        // 2. Save updated variants (upsert by SKU — update existing, insert new, delete removed)
        Map<String, ProductVariant> existingVariantsBySku = new HashMap<>();
        List<ProductVariant> oldVariants = productVariantRepository.findByProductId(id);
        for (ProductVariant ov : oldVariants) {
            if (ov.getSku() != null) {
                existingVariantsBySku.put(ov.getSku(), ov);
            }
        }

        if (productDto.getVariants() != null) {
            Set<String> incomingSkus = new HashSet<>();
            for (ProductVariantDto v : productDto.getVariants()) {
                String sku = v.getSku();
                incomingSkus.add(sku);
                ProductVariant existing = existingVariantsBySku.get(sku);
                if (existing != null) {
                    // Update existing variant
                    existing.setPrice(v.getPrice());
                    existing.setSalePrice(v.getSalePrice());
                    existing.setCostPrice(v.getCostPrice());
                    existing.setWeight(v.getWeight());
                    existing.setImageUrl(v.getImageUrl());
                    existing.setActive(v.getActive() != null ? v.getActive() : true);
                    productVariantRepository.save(existing);
                    // Delete old option values, then re-insert
                    variantOptionValueRepository.deleteByVariantId(existing.getId());
                    variantOptionValueRepository.flush();
                    saveVariantOptions(existing.getId(), v.getVariantAttr(), attributesByCode);
                } else {
                    // Insert new variant
                    ProductVariant variant = ProductVariant.builder()
                            .productId(id)
                            .sku(sku)
                            .variantAttr(null)
                            .price(v.getPrice())
                            .salePrice(v.getSalePrice())
                            .costPrice(v.getCostPrice())
                            .weight(v.getWeight())
                            .imageUrl(v.getImageUrl())
                            .active(v.getActive() != null ? v.getActive() : true)
                            .build();
                    variant = productVariantRepository.save(variant);
                    saveVariantOptions(variant.getId(), v.getVariantAttr(), attributesByCode);
                }
            }
            // Delete variants in DB but NOT in incoming list
            for (ProductVariant ov : oldVariants) {
                if (ov.getSku() != null && !incomingSkus.contains(ov.getSku())) {
                    variantOptionValueRepository.deleteByVariantId(ov.getId());
                    productVariantRepository.delete(ov);
                }
            }
        }

        // 3. Delete old tags and images
        productTagRepository.deleteByProductId(id);
        productImageRepository.deleteByProductId(id);

        // 4. Save new gallery images
        if (productDto.getImages() != null) {
            int sortOrder = 0;
            List<ProductImage> productImages = new ArrayList<>();
            for (String imgUrl : productDto.getImages()) {
                productImages.add(ProductImage.builder()
                        .productId(id)
                        .imageUrl(imgUrl)
                        .sortOrder(sortOrder++)
                        .isPrimary(false)
                        .build());
            }
            productImageRepository.saveAll(productImages);
        }

        // 5. Save new tags
        if (productDto.getTags() != null) {
            List<ProductTag> tags = productDto.getTags().stream()
                    .map(tag -> ProductTag.builder()
                            .productId(id)
                            .tag(tag)
                            .build())
                    .collect(Collectors.toList());
            productTagRepository.saveAll(tags);
        }

        // Convert to DTO while inside transaction
        ProductDto responseDto = convertToDto(product);
        final String finalOldSlug = oldSlug;
        final String finalNewSlug = product.getSlug();

        // Index post-commit
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        searchService.indexProduct(id);
                    } catch (Exception e) {
                        log.error("Failed to index product in Elasticsearch after transaction commit: {}", e.getMessage());
                    }

                    // Evict cache
                    try {
                        Cache productsCache = cacheManager.getCache("products");
                        Cache slugsCache = cacheManager.getCache("products_slug");
                        if (productsCache != null) {
                            productsCache.evict(id);
                        }
                        if (slugsCache != null) {
                            if (finalOldSlug != null) slugsCache.evict(finalOldSlug);
                            if (finalNewSlug != null) slugsCache.evict(finalNewSlug);
                        }
                        log.info("Successfully evicted Redis cache for product ID: {} after transaction commit", id);
                    } catch (Exception e) {
                        log.error("Failed to evict Redis cache for product ID: {}", id, e);
                    }
                }
            });
        } else {
            try {
                searchService.indexProduct(id);
            } catch (Exception e) {
                log.error("Failed to index product in Elasticsearch: {}", e.getMessage());
            }
            try {
                Cache productsCache = cacheManager.getCache("products");
                Cache slugsCache = cacheManager.getCache("products_slug");
                if (productsCache != null) {
                    productsCache.evict(id);
                }
                if (slugsCache != null) {
                    if (finalOldSlug != null) slugsCache.evict(finalOldSlug);
                    if (finalNewSlug != null) slugsCache.evict(finalNewSlug);
                }
            } catch (Exception e) {
                log.error("Failed to evict Redis cache for product ID: {}", id, e);
            }
        }

        return responseDto;
    }

    @Override
    @Transactional
    public void deleteProduct(Long id) {
        Product product = productRepository.findById(id).orElse(null);
        if (product != null) {
            final String slug = product.getSlug();

            // 1. Delete dynamic specifications
            productAttributeValueRepository.deleteByProductId(id);

            // 2. Delete variants & option values
            List<ProductVariant> variants = productVariantRepository.findByProductId(id);
            if (!variants.isEmpty()) {
                List<Long> variantIds = variants.stream().map(ProductVariant::getId).collect(Collectors.toList());
                variantOptionValueRepository.deleteByVariantIdIn(variantIds);
                productVariantRepository.deleteByProductId(id);
            }

            // 3. Delete tags, images and the product itself
            productTagRepository.deleteByProductId(id);
            productImageRepository.deleteByProductId(id);
            productRepository.deleteById(id);

            // Evict & remove index post-commit
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            searchService.removeProductIndex(id);
                        } catch (Exception e) {
                            log.error("Failed to remove product index from Elasticsearch after transaction commit: {}", e.getMessage());
                        }

                        try {
                            Cache productsCache = cacheManager.getCache("products");
                            Cache slugsCache = cacheManager.getCache("products_slug");
                            if (productsCache != null) {
                                productsCache.evict(id);
                            }
                            if (slugsCache != null && slug != null) {
                                slugsCache.evict(slug);
                            }
                            log.info("Successfully evicted Redis cache for deleted product ID: {} after transaction commit", id);
                        } catch (Exception e) {
                            log.error("Failed to evict Redis cache for product ID: {}", id, e);
                        }
                    }
                });
            } else {
                try {
                    searchService.removeProductIndex(id);
                } catch (Exception e) {
                    log.error("Failed to remove product index from Elasticsearch: {}", e.getMessage());
                }
                try {
                    Cache productsCache = cacheManager.getCache("products");
                    Cache slugsCache = cacheManager.getCache("products_slug");
                    if (productsCache != null) {
                        productsCache.evict(id);
                    }
                    if (slugsCache != null && slug != null) {
                        slugsCache.evict(slug);
                    }
                } catch (Exception e) {
                    log.error("Failed to evict Redis cache for product ID: {}", id, e);
                }
            }
        }
    }

    @Override
    public List<ProductDto> getProductsByIds(List<Long> ids) {
        List<Product> products = productRepository.findByIdIn(ids);
        return convertToDtoList(products);
    }

    private List<ProductDto> convertToDtoList(List<Product> products) {
        if (products == null || products.isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> productIds = products.stream().map(Product::getId).collect(Collectors.toList());

        List<ProductVariant> allVariants = productVariantRepository.findByProductIdIn(productIds);
        List<ProductTag> allTags = productTagRepository.findByProductIdIn(productIds);
        List<ProductImage> allImages = productImageRepository.findByProductIdIn(productIds);

        // Fetch relational specifications and variant option values in batch (Optimized - No N+1 select)
        List<ProductAttributeValue> allPavs = productAttributeValueRepository.findByProductIdIn(productIds);
        List<Long> variantIds = allVariants.stream().map(ProductVariant::getId).collect(Collectors.toList());
        List<VariantOptionValue> allVovs = variantIds.isEmpty() ? Collections.emptyList() : variantOptionValueRepository.findByVariantIdIn(variantIds);
        
        Map<Long, Attribute> attributesMap = getAttributesMap();

        Map<Long, List<ProductVariant>> variantsMap = allVariants.stream()
                .collect(Collectors.groupingBy(ProductVariant::getProductId));
        Map<Long, List<ProductTag>> tagsMap = allTags.stream()
                .collect(Collectors.groupingBy(ProductTag::getProductId));
        Map<Long, List<ProductImage>> imagesMap = allImages.stream()
                .collect(Collectors.groupingBy(ProductImage::getProductId));

        Map<Long, List<ProductAttributeValue>> pavsMap = allPavs.stream()
                .collect(Collectors.groupingBy(ProductAttributeValue::getProductId));
        Map<Long, List<VariantOptionValue>> vovsMap = allVovs.stream()
                .collect(Collectors.groupingBy(VariantOptionValue::getVariantId));

        return products.stream()
                .map(p -> convertToDto(p,
                        variantsMap.getOrDefault(p.getId(), Collections.emptyList()),
                        tagsMap.getOrDefault(p.getId(), Collections.emptyList()),
                        imagesMap.getOrDefault(p.getId(), Collections.emptyList()),
                        pavsMap.getOrDefault(p.getId(), Collections.emptyList()),
                        vovsMap,
                        attributesMap))
                .collect(Collectors.toList());
    }

    private ProductDto convertToDto(Product product) {
        List<ProductVariant> variants = productVariantRepository.findByProductId(product.getId());
        List<ProductTag> tags = productTagRepository.findByProductId(product.getId());
        List<ProductImage> images = productImageRepository.findByProductId(product.getId());
        
        List<ProductAttributeValue> pavs = productAttributeValueRepository.findByProductId(product.getId());
        List<Long> variantIds = variants.stream().map(ProductVariant::getId).collect(Collectors.toList());
        List<VariantOptionValue> vovs = variantIds.isEmpty() ? Collections.emptyList() : variantOptionValueRepository.findByVariantIdIn(variantIds);
        
        Map<Long, List<VariantOptionValue>> vovsMap = vovs.stream().collect(Collectors.groupingBy(VariantOptionValue::getVariantId));
        Map<Long, Attribute> attributesMap = getAttributesMap();

        return convertToDto(product, variants, tags, images, pavs, vovsMap, attributesMap);
    }

    private ProductDto convertToDto(Product product, List<ProductVariant> variants, List<ProductTag> tags,
            List<ProductImage> images, List<ProductAttributeValue> pavs, Map<Long, List<VariantOptionValue>> vovsMap, Map<Long, Attribute> attributesMap) {
        
        List<String> imageUrls = images.stream()
                .map(ProductImage::getImageUrl)
                .collect(Collectors.toList());

        // 1. Build the dynamic attributes JSON Node from relational specifications
        Map<String, String> specMap = new LinkedHashMap<>();
        for (ProductAttributeValue pav : pavs) {
            Attribute attr = attributesMap.get(pav.getAttributeId());
            if (attr != null) {
                specMap.put(attr.getCode(), pav.getValue());
            }
        }

        // 2. Build variants and map their option values dynamically
        List<ProductVariantDto> variantDtos = variants.stream()
                .map(v -> {
                    List<VariantOptionValue> options = vovsMap.getOrDefault(v.getId(), Collections.emptyList());
                    Map<String, String> optionMap = new LinkedHashMap<>();
                    for (VariantOptionValue o : options) {
                        Attribute attr = attributesMap.get(o.getAttributeId());
                        if (attr != null) {
                            optionMap.put(attr.getCode(), o.getValue());
                        }
                    }

                    return ProductVariantDto.builder()
                            .id(v.getId())
                            .productId(v.getProductId())
                            .sku(v.getSku())
                            .variantAttr(optionMap) // Dynamic option values represented as a Map
                            .price(v.getPrice())
                            .salePrice(v.getSalePrice())
                            .costPrice(v.getCostPrice())
                            .weight(v.getWeight())
                            .imageUrl(v.getImageUrl())
                            .active(v.getActive())
                            .build();
                })
                .collect(Collectors.toList());

        List<String> tagStrings = tags.stream()
                .map(ProductTag::getTag)
                .collect(Collectors.toList());

        return ProductDto.builder()
                .id(product.getId())
                .name(product.getName())
                .slug(product.getSlug())
                .description(product.getDescription())
                .attributes(specMap) // Dynamic specifications represented as a Map
                .specsRaw(deserializeSpecsRaw(product.getSpecsRaw()))
                .price(product.getPrice())
                .costPrice(product.getCostPrice())
                .salePrice(product.getSalePrice())
                .weight(product.getWeight())
                .length(product.getLength())
                .width(product.getWidth())
                .height(product.getHeight())
                .categoryId(product.getCategoryId())
                .brandId(product.getBrandId())
                .brand(product.getBrand())
                .imageUrl(product.getImageUrl())
                .images(imageUrls)
                .salesCount(product.getSalesCount())
                .ratingAvg(product.getRatingAvg())
                .warrantyPeriod(product.getWarrantyPeriod())
                .warrantyPolicy(product.getWarrantyPolicy())
                .active(product.getActive())
                .variants(variantDtos)
                .tags(tagStrings)
                .build();
    }

    private void saveSpecifications(Long productId, Object specsObj, Map<String, Attribute> attributesByCode) {
        if (specsObj == null) {
            return;
        }
        Map<String, Object> specsMap = null;
        try {
            if (specsObj instanceof String) {
                String str = (String) specsObj;
                if (!str.trim().isEmpty() && !str.equals("null")) {
                    specsMap = objectMapper.readValue(str, Map.class);
                }
            } else if (specsObj instanceof Map) {
                specsMap = (Map<String, Object>) specsObj;
            } else {
                specsMap = objectMapper.convertValue(specsObj, Map.class);
            }
        } catch (Exception e) {
            log.error("Failed to parse specifications map from class: {}", specsObj.getClass().getName(), e);
            return;
        }

        if (specsMap == null || specsMap.isEmpty()) {
            return;
        }

        // Load existing specs for this product (key = attributeId)
        List<ProductAttributeValue> existingList = productAttributeValueRepository.findByProductId(productId);
        Map<Long, ProductAttributeValue> existingByAttrId = new HashMap<>();
        for (ProductAttributeValue pav : existingList) {
            existingByAttrId.put(pav.getAttributeId(), pav);
        }

        Set<Long> incomingAttrIds = new HashSet<>();
        List<ProductAttributeValue> toSave = new ArrayList<>();

        for (Map.Entry<String, Object> entry : specsMap.entrySet()) {
            String code = entry.getKey();
            if (entry.getValue() == null) continue;
            String value = entry.getValue().toString();

            Attribute attr = attributesByCode.get(code);
            if (attr == null) {
                attr = Attribute.builder()
                        .code(code)
                        .name(capitalize(code))
                        .valueType("text")
                        .build();
                attr = attributeRepository.save(attr);
                attributesByCode.put(code, attr);
            }

            incomingAttrIds.add(attr.getId());
            ProductAttributeValue existing = existingByAttrId.get(attr.getId());
            if (existing != null) {
                // Update existing record
                existing.setValue(value);
                toSave.add(existing);
            } else {
                // Insert new record
                toSave.add(ProductAttributeValue.builder()
                        .productId(productId)
                        .attributeId(attr.getId())
                        .value(value)
                        .build());
            }
        }

        // Delete specs that are in DB but NOT in the incoming list
        for (ProductAttributeValue pav : existingList) {
            if (!incomingAttrIds.contains(pav.getAttributeId())) {
                productAttributeValueRepository.delete(pav);
            }
        }

        if (!toSave.isEmpty()) {
            productAttributeValueRepository.saveAll(toSave);
        }
    }

    // Chuyển JSON string trong cột specs_raw ngược lại thành Map để trả ra DTO
    private Map<String, String> deserializeSpecsRaw(String specsRawJson) {
        if (specsRawJson == null || specsRawJson.trim().isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(specsRawJson, LinkedHashMap.class);
        } catch (Exception e) {
            log.error("Failed to deserialize specs_raw column", e);
            return Collections.emptyMap();
        }
    }

    // Chuyển specsRaw (Map hoặc JSON string từ import) thành JSON string để lưu vào cột specs_raw
    private String serializeSpecsRaw(Object specsRawObj) {
        if (specsRawObj == null) {
            return null;
        }
        if (specsRawObj instanceof String) {
            String str = (String) specsRawObj;
            return (str.trim().isEmpty() || str.equals("null")) ? null : str;
        }
        try {
            Map<?, ?> map = (specsRawObj instanceof Map)
                    ? (Map<?, ?>) specsRawObj
                    : objectMapper.convertValue(specsRawObj, Map.class);
            if (map.isEmpty()) {
                return null;
            }
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            log.error("Failed to serialize specsRaw from class: {}", specsRawObj.getClass().getName(), e);
            return null;
        }
    }

    private void saveVariantOptions(Long variantId, Object variantAttrObj, Map<String, Attribute> attributesByCode) {
        if (variantAttrObj == null) {
            return;
        }
        Map<String, Object> attrMap = null;
        try {
            if (variantAttrObj instanceof String) {
                String str = (String) variantAttrObj;
                if (!str.trim().isEmpty() && !str.equals("null")) {
                    attrMap = objectMapper.readValue(str, Map.class);
                }
            } else if (variantAttrObj instanceof Map) {
                attrMap = (Map<String, Object>) variantAttrObj;
            } else {
                attrMap = objectMapper.convertValue(variantAttrObj, Map.class);
            }
        } catch (Exception e) {
            log.error("Failed to parse variant attributes map from class: {}", variantAttrObj.getClass().getName(), e);
            return;
        }

        if (attrMap == null || attrMap.isEmpty()) {
            return;
        }

        List<VariantOptionValue> vovs = new ArrayList<>();
        for (Map.Entry<String, Object> entry : attrMap.entrySet()) {
            String code = entry.getKey();
            if (entry.getValue() == null) continue;
            String value = entry.getValue().toString();

            Attribute attr = attributesByCode.get(code);
            if (attr == null) {
                attr = Attribute.builder()
                        .code(code)
                        .name(capitalize(code))
                        .valueType("select")
                        .build();
                attr = attributeRepository.save(attr);
                attributesByCode.put(code, attr);
            }

            vovs.add(VariantOptionValue.builder()
                    .variantId(variantId)
                    .attributeId(attr.getId())
                    .value(value)
                    .build());
        }
        if (!vovs.isEmpty()) {
            variantOptionValueRepository.saveAll(vovs);
        }
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return str;
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }

    private Map<Long, Attribute> getAttributesMap() {
        return attributeRepository.findAll().stream()
                .collect(Collectors.toMap(Attribute::getId, a -> a));
    }

    private void normalizeProductPricing(ProductDto productDto) {
        if (productDto == null) {
            return;
        }
        productDto.setSalePrice(
                ProductPricingUtils.normalizeSalePrice(productDto.getPrice(), productDto.getSalePrice()));
    }

    private Map<String, Attribute> getAttributesByCodeMap() {
        return attributeRepository.findAll().stream()
                .collect(Collectors.toMap(Attribute::getCode, a -> a, (existing, replacement) -> existing));
    }
}
