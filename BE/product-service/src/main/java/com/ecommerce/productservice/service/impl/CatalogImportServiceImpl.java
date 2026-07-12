package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.dto.AttributeDto;
import com.ecommerce.productservice.dto.BrandDto;
import com.ecommerce.productservice.dto.CategoryAttributeDto;
import com.ecommerce.productservice.dto.CategoryDto;
import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.dto.ProductVariantDto;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto.ImportAttributeItem;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto.ImportBrandItem;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto.ImportCategoryAttributeItem;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto.ImportCategoryItem;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto.ImportProductItem;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto.ImportVariantItem;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportResultDto;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportResultDto.ImportCounts;
import com.ecommerce.productservice.entity.Attribute;
import com.ecommerce.productservice.entity.Brand;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.repository.AttributeRepository;
import com.ecommerce.productservice.repository.BrandRepository;
import com.ecommerce.productservice.repository.CategoryRepository;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.service.AttributeService;
import com.ecommerce.productservice.service.BrandService;
import com.ecommerce.productservice.service.CatalogImportService;
import com.ecommerce.productservice.service.CategoryService;
import com.ecommerce.productservice.service.ProductService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CatalogImportServiceImpl implements CatalogImportService {

    private final AttributeRepository attributeRepository;
    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final ProductRepository productRepository;
    private final AttributeService attributeService;
    private final CategoryService categoryService;
    private final BrandService brandService;
    private final ProductService productService;

    @Override
    @Transactional
    public CatalogImportResultDto importCatalog(CatalogImportManifestDto manifest, boolean dryRun) {
        CatalogImportResultDto result = CatalogImportResultDto.builder()
                .dryRun(dryRun)
                .counts(new ImportCounts())
                .build();

        if (manifest == null) {
            result.getErrors().add("Manifest is empty");
            result.setSuccess(false);
            return result;
        }

        validateManifest(manifest, result);
        if (!result.getErrors().isEmpty()) {
            result.setSuccess(false);
            return result;
        }

        if (dryRun) {
            result.setSuccess(true);
            result.getWarnings().add("Dry-run mode: validation passed, no data written.");
            populateDryRunMaps(manifest, result);
            return result;
        }

        importAttributes(manifest.getAttributes(), result);
        importCategories(manifest.getCategories(), result);
        importCategoryAttributes(manifest.getCategoryAttributes(), result);
        importBrands(manifest.getBrands(), result);
        importProducts(manifest.getProducts(), result);

        result.setSuccess(result.getErrors().isEmpty());
        return result;
    }

    private void validateManifest(CatalogImportManifestDto manifest, CatalogImportResultDto result) {
        Set<String> attributeCodes = new HashSet<>();
        for (ImportAttributeItem item : safeList(manifest.getAttributes())) {
            requireSlug(item.getCode(), "attribute.code", result);
            if (!attributeCodes.add(normalize(item.getCode()))) {
                result.getErrors().add("Duplicate attribute code: " + item.getCode());
            }
        }

        Set<String> categorySlugs = new HashSet<>();
        for (ImportCategoryItem item : safeList(manifest.getCategories())) {
            requireSlug(item.getSlug(), "category.slug", result);
            if (!categorySlugs.add(normalize(item.getSlug()))) {
                result.getErrors().add("Duplicate category slug: " + item.getSlug());
            }
        }
        for (ImportCategoryItem item : safeList(manifest.getCategories())) {
            if (StringUtils.hasText(item.getParentSlug()) && !categorySlugs.contains(normalize(item.getParentSlug()))) {
                result.getErrors().add("Category '" + item.getSlug() + "' references unknown parentSlug: " + item.getParentSlug());
            }
            if (normalize(item.getSlug()).equals(normalize(item.getParentSlug()))) {
                result.getErrors().add("Category cannot be its own parent: " + item.getSlug());
            }
        }

        Set<String> brandSlugs = new HashSet<>();
        for (ImportBrandItem item : safeList(manifest.getBrands())) {
            requireSlug(item.getSlug(), "brand.slug", result);
            if (!brandSlugs.add(normalize(item.getSlug()))) {
                result.getErrors().add("Duplicate brand slug: " + item.getSlug());
            }
            for (String catSlug : safeList(item.getCategorySlugs())) {
                if (!categorySlugs.contains(normalize(catSlug))) {
                    result.getErrors().add("Brand '" + item.getSlug() + "' references unknown categorySlug: " + catSlug);
                }
            }
        }

        for (ImportCategoryAttributeItem item : safeList(manifest.getCategoryAttributes())) {
            if (!categorySlugs.contains(normalize(item.getCategorySlug()))) {
                result.getErrors().add("CategoryAttribute references unknown categorySlug: " + item.getCategorySlug());
            }
            if (!attributeCodes.contains(normalize(item.getAttributeCode()))) {
                result.getErrors().add("CategoryAttribute references unknown attributeCode: " + item.getAttributeCode());
            }
        }

        Set<String> productSlugs = new HashSet<>();
        Set<String> skus = new HashSet<>();
        for (ImportProductItem item : safeList(manifest.getProducts())) {
            requireSlug(item.getSlug(), "product.slug", result);
            if (!productSlugs.add(normalize(item.getSlug()))) {
                result.getErrors().add("Duplicate product slug: " + item.getSlug());
            }
            if (!categorySlugs.contains(normalize(item.getCategorySlug()))) {
                result.getErrors().add("Product '" + item.getSlug() + "' references unknown categorySlug: " + item.getCategorySlug());
            }
            if (StringUtils.hasText(item.getBrandSlug()) && !brandSlugs.contains(normalize(item.getBrandSlug()))) {
                result.getErrors().add("Product '" + item.getSlug() + "' references unknown brandSlug: " + item.getBrandSlug());
            }
            if (item.getPrice() == null || item.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                result.getErrors().add("Product '" + item.getSlug() + "' must have price > 0");
            }
            if (item.getSalePrice() != null && item.getPrice() != null
                    && item.getSalePrice().compareTo(item.getPrice()) >= 0) {
                result.getErrors().add("Product '" + item.getSlug() + "' salePrice must be less than price");
            }
            for (ImportVariantItem variant : safeList(item.getVariants())) {
                requireSlug(variant.getSku(), "variant.sku for product " + item.getSlug(), result);
                if (!skus.add(normalize(variant.getSku()))) {
                    result.getErrors().add("Duplicate SKU: " + variant.getSku());
                }
            }
        }
    }

    private void populateDryRunMaps(CatalogImportManifestDto manifest, CatalogImportResultDto result) {
        long fakeId = 1L;
        for (ImportCategoryItem item : sortCategories(safeList(manifest.getCategories()))) {
            result.getCategoryIdsBySlug().put(item.getSlug(), fakeId++);
        }
        for (ImportBrandItem item : safeList(manifest.getBrands())) {
            result.getBrandIdsBySlug().put(item.getSlug(), fakeId++);
        }
        for (ImportProductItem item : safeList(manifest.getProducts())) {
            result.getProductIdsBySlug().put(item.getSlug(), fakeId++);
        }
        ImportCounts counts = result.getCounts();
        counts.setAttributesCreated((int) safeList(manifest.getAttributes()).stream()
                .filter(a -> attributeRepository.findByCode(a.getCode()).isEmpty()).count());
        counts.setCategoriesCreated((int) safeList(manifest.getCategories()).stream()
                .filter(c -> categoryRepository.findBySlug(c.getSlug()).isEmpty()).count());
        counts.setBrandsCreated((int) safeList(manifest.getBrands()).stream()
                .filter(b -> brandRepository.findBySlug(b.getSlug()).isEmpty()).count());
        counts.setProductsCreated((int) safeList(manifest.getProducts()).stream()
                .filter(p -> productRepository.findBySlug(p.getSlug()).isEmpty()).count());
        counts.setCategoryAttributesLinked(safeList(manifest.getCategoryAttributes()).size());
    }

    private void importAttributes(List<ImportAttributeItem> items, CatalogImportResultDto result) {
        for (ImportAttributeItem item : safeList(items)) {
            Optional<Attribute> existing = attributeRepository.findByCode(item.getCode());
            if (existing.isPresent()) {
                AttributeDto dto = AttributeDto.builder()
                        .id(existing.get().getId())
                        .code(item.getCode())
                        .name(item.getName() != null ? item.getName() : existing.get().getName())
                        .valueType(item.getValueType() != null ? item.getValueType() : existing.get().getValueType())
                        .allowedValues(item.getAllowedValues() != null ? item.getAllowedValues() : existing.get().getAllowedValues())
                        .isColor(item.getIsColor() != null ? item.getIsColor() : existing.get().getIsColor())
                        .build();
                attributeService.updateAttribute(existing.get().getId(), dto);
                result.getCounts().setAttributesUpdated(result.getCounts().getAttributesUpdated() + 1);
            } else {
                AttributeDto dto = AttributeDto.builder()
                        .code(item.getCode())
                        .name(item.getName())
                        .valueType(StringUtils.hasText(item.getValueType()) ? item.getValueType() : "text")
                        .allowedValues(item.getAllowedValues())
                        .isColor(Boolean.TRUE.equals(item.getIsColor()))
                        .build();
                attributeService.createAttribute(dto);
                result.getCounts().setAttributesCreated(result.getCounts().getAttributesCreated() + 1);
            }
        }
    }

    private void importCategories(List<ImportCategoryItem> items, CatalogImportResultDto result) {
        Map<String, Long> slugToId = new HashMap<>();
        for (ImportCategoryItem item : sortCategories(safeList(items))) {
            Long parentId = null;
            if (StringUtils.hasText(item.getParentSlug())) {
                parentId = slugToId.get(normalize(item.getParentSlug()));
                if (parentId == null) {
                    parentId = categoryRepository.findBySlug(item.getParentSlug()).map(Category::getId).orElse(null);
                }
            }

            Optional<Category> existing = categoryRepository.findBySlug(item.getSlug());
            CategoryDto dto = CategoryDto.builder()
                    .name(item.getName())
                    .slug(item.getSlug())
                    .parentId(parentId)
                    .imageUrl(item.getImageUrl())
                    .sortOrder(item.getSortOrder())
                    .active(item.getActive() == null || item.getActive())
                    .build();

            if (existing.isPresent()) {
                categoryService.updateCategory(existing.get().getId(), dto);
                slugToId.put(normalize(item.getSlug()), existing.get().getId());
                result.getCategoryIdsBySlug().put(item.getSlug(), existing.get().getId());
                result.getCounts().setCategoriesUpdated(result.getCounts().getCategoriesUpdated() + 1);
            } else {
                CategoryDto created = categoryService.createCategory(dto);
                slugToId.put(normalize(item.getSlug()), created.getId());
                result.getCategoryIdsBySlug().put(item.getSlug(), created.getId());
                result.getCounts().setCategoriesCreated(result.getCounts().getCategoriesCreated() + 1);
            }
        }
    }

    private void importCategoryAttributes(List<ImportCategoryAttributeItem> items, CatalogImportResultDto result) {
        for (ImportCategoryAttributeItem item : safeList(items)) {
            Category category = categoryRepository.findBySlug(item.getCategorySlug())
                    .orElseThrow(() -> new IllegalStateException("Category missing during import: " + item.getCategorySlug()));
            Attribute attribute = attributeRepository.findByCode(item.getAttributeCode())
                    .orElseThrow(() -> new IllegalStateException("Attribute missing during import: " + item.getAttributeCode()));

            CategoryAttributeDto dto = CategoryAttributeDto.builder()
                    .categoryId(category.getId())
                    .attributeId(attribute.getId())
                    .isVariant(Boolean.TRUE.equals(item.getIsVariant()))
                    .isRequired(Boolean.TRUE.equals(item.getIsRequired()))
                    .isFilter(false)
                    .build();
            attributeService.assignAttributeToCategory(dto);
            result.getCounts().setCategoryAttributesLinked(result.getCounts().getCategoryAttributesLinked() + 1);
        }
    }

    private void importBrands(List<ImportBrandItem> items, CatalogImportResultDto result) {
        for (ImportBrandItem item : safeList(items)) {
            Set<Long> categoryIds = safeList(item.getCategorySlugs()).stream()
                    .map(slug -> categoryRepository.findBySlug(slug).map(Category::getId).orElse(null))
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            BrandDto dto = BrandDto.builder()
                    .name(item.getName())
                    .slug(item.getSlug())
                    .logoUrl(item.getLogoUrl())
                    .description(item.getDescription())
                    .active(item.getActive() == null || item.getActive())
                    .categoryIds(categoryIds)
                    .build();

            Optional<Brand> existing = brandRepository.findBySlug(item.getSlug());
            if (existing.isPresent()) {
                BrandDto updated = brandService.updateBrand(existing.get().getId(), dto);
                result.getBrandIdsBySlug().put(item.getSlug(), updated.getId());
                result.getCounts().setBrandsUpdated(result.getCounts().getBrandsUpdated() + 1);
            } else {
                BrandDto created = brandService.createBrand(dto);
                result.getBrandIdsBySlug().put(item.getSlug(), created.getId());
                result.getCounts().setBrandsCreated(result.getCounts().getBrandsCreated() + 1);
            }
        }
    }

    private void importProducts(List<ImportProductItem> items, CatalogImportResultDto result) {
        for (ImportProductItem item : safeList(items)) {
            Long categoryId = categoryRepository.findBySlug(item.getCategorySlug()).map(Category::getId)
                    .orElseThrow(() -> new IllegalStateException("Category missing during product import: " + item.getCategorySlug()));
            Long brandId = null;
            String brandName = null;
            if (StringUtils.hasText(item.getBrandSlug())) {
                Brand brand = brandRepository.findBySlug(item.getBrandSlug())
                        .orElseThrow(() -> new IllegalStateException("Brand missing during product import: " + item.getBrandSlug()));
                brandId = brand.getId();
                brandName = brand.getName();
            }

            List<ProductVariantDto> variants = safeList(item.getVariants()).stream()
                    .map(v -> ProductVariantDto.builder()
                            .sku(v.getSku())
                            .price(v.getPrice() != null ? v.getPrice() : item.getSalePrice() != null ? item.getSalePrice() : item.getPrice())
                            .costPrice(v.getCostPrice() != null ? v.getCostPrice() : item.getCostPrice())
                            .imageUrl(v.getImageUrl())
                            .active(v.getActive() == null || v.getActive())
                            .variantAttr(v.getOptions() != null ? new LinkedHashMap<>(v.getOptions()) : Map.of())
                            .build())
                    .collect(Collectors.toList());

            ProductDto dto = ProductDto.builder()
                    .name(item.getName())
                    .slug(item.getSlug())
                    .description(item.getDescription())
                    .price(item.getPrice())
                    .salePrice(item.getSalePrice())
                    .costPrice(item.getCostPrice())
                    .categoryId(categoryId)
                    .brandId(brandId)
                    .brand(brandName)
                    .imageUrl(item.getImageUrl())
                    .images(item.getImages())
                    .status(StringUtils.hasText(item.getStatus()) ? item.getStatus() : "PUBLISHED")
                    .active(item.getActive() == null || item.getActive())
                    .warrantyPeriod(item.getWarrantyPeriod())
                    .warrantyPolicy(item.getWarrantyPolicy())
                    .attributes(item.getSpecs() != null ? new LinkedHashMap<>(item.getSpecs()) : Map.of())
                    .tags(item.getTags())
                    .variants(variants)
                    .build();

            Optional<Product> existing = productRepository.findBySlug(item.getSlug());
            if (existing.isPresent()) {
                ProductDto updated = productService.updateProduct(existing.get().getId(), dto);
                result.getProductIdsBySlug().put(item.getSlug(), updated.getId());
                result.getCounts().setProductsUpdated(result.getCounts().getProductsUpdated() + 1);
            } else {
                ProductDto created = productService.createProduct(dto);
                result.getProductIdsBySlug().put(item.getSlug(), created.getId());
                result.getCounts().setProductsCreated(result.getCounts().getProductsCreated() + 1);
            }
        }
    }

    private List<ImportCategoryItem> sortCategories(List<ImportCategoryItem> items) {
        Map<String, ImportCategoryItem> bySlug = items.stream()
                .collect(Collectors.toMap(i -> normalize(i.getSlug()), i -> i, (a, b) -> a, LinkedHashMap::new));
        List<ImportCategoryItem> sorted = new ArrayList<>();
        Set<String> visited = new HashSet<>();

        Comparator<ImportCategoryItem> comparator = Comparator
                .comparing((ImportCategoryItem c) -> StringUtils.hasText(c.getParentSlug()) ? 1 : 0)
                .thenComparing(c -> c.getSortOrder() != null ? c.getSortOrder() : 0)
                .thenComparing(ImportCategoryItem::getSlug);

        for (ImportCategoryItem item : items.stream().sorted(comparator).collect(Collectors.toList())) {
            visitCategory(item, bySlug, visited, sorted, new HashSet<>());
        }
        return sorted;
    }

    private void visitCategory(
            ImportCategoryItem item,
            Map<String, ImportCategoryItem> bySlug,
            Set<String> visited,
            List<ImportCategoryItem> sorted,
            Set<String> stack) {
        String slug = normalize(item.getSlug());
        if (visited.contains(slug)) return;
        if (stack.contains(slug)) {
            throw new IllegalArgumentException("Category parent cycle detected at slug: " + item.getSlug());
        }
        stack.add(slug);
        if (StringUtils.hasText(item.getParentSlug())) {
            ImportCategoryItem parent = bySlug.get(normalize(item.getParentSlug()));
            if (parent != null) {
                visitCategory(parent, bySlug, visited, sorted, stack);
            }
        }
        stack.remove(slug);
        if (!visited.contains(slug)) {
            sorted.add(item);
            visited.add(slug);
        }
    }

    private void requireSlug(String value, String field, CatalogImportResultDto result) {
        if (!StringUtils.hasText(value)) {
            result.getErrors().add("Missing required field: " + field);
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private <T> List<T> safeList(List<T> list) {
        return list == null ? List.of() : list;
    }
}
