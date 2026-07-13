package com.ecommerce.productservice.dto.catalogimport;

import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CatalogImportManifestDto {

    @Valid
    @Builder.Default
    private List<ImportAttributeItem> attributes = new ArrayList<>();

    @Valid
    @Builder.Default
    private List<ImportCategoryItem> categories = new ArrayList<>();

    @Valid
    @Builder.Default
    private List<ImportCategoryAttributeItem> categoryAttributes = new ArrayList<>();

    @Valid
    @Builder.Default
    private List<ImportBrandItem> brands = new ArrayList<>();

    @Valid
    @Builder.Default
    private List<ImportProductItem> products = new ArrayList<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportAttributeItem {
        private String code;
        private String name;
        private String valueType;
        private String allowedValues;
        private Boolean isColor;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportCategoryItem {
        private String slug;
        private String name;
        private String parentSlug;
        private String imageUrl;
        private Integer sortOrder;
        private Boolean active;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportCategoryAttributeItem {
        private String categorySlug;
        private String attributeCode;
        private Boolean isVariant;
        private Boolean isRequired;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportBrandItem {
        private String slug;
        private String name;
        private String logoUrl;
        private String description;
        private Boolean active;
        @Builder.Default
        private List<String> categorySlugs = new ArrayList<>();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportProductItem {
        private String slug;
        private String name;
        private String categorySlug;
        private String brandSlug;
        private String description;
        private BigDecimal price;
        private BigDecimal salePrice;
        private BigDecimal costPrice;
        private String imageUrl;
        @Builder.Default
        private List<String> images = new ArrayList<>();
        private String status;
        private Boolean active;
        private Integer warrantyPeriod;
        private String warrantyPolicy;
        @Builder.Default
        private Map<String, String> specs = new LinkedHashMap<>();
        @Builder.Default
        private List<String> tags = new ArrayList<>();
        @Builder.Default
        private List<ImportVariantItem> variants = new ArrayList<>();
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportVariantItem {
        private String sku;
        private BigDecimal price;
        private BigDecimal salePrice;
        private BigDecimal costPrice;
        private String imageUrl;
        private Boolean active;
        @Builder.Default
        private Map<String, String> options = new LinkedHashMap<>();
    }
}
