package com.ecommerce.productservice.dto.catalogimport;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CatalogImportResultDto {
    private boolean dryRun;
    private boolean success;

    @Builder.Default
    private ImportCounts counts = new ImportCounts();

    @Builder.Default
    private List<String> errors = new ArrayList<>();

    @Builder.Default
    private List<String> warnings = new ArrayList<>();

    @Builder.Default
    private Map<String, Long> categoryIdsBySlug = new LinkedHashMap<>();

    @Builder.Default
    private Map<String, Long> brandIdsBySlug = new LinkedHashMap<>();

    @Builder.Default
    private Map<String, Long> productIdsBySlug = new LinkedHashMap<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ImportCounts {
        private int attributesCreated;
        private int attributesUpdated;
        private int attributesSkipped;
        private int categoriesCreated;
        private int categoriesUpdated;
        private int categoryAttributesLinked;
        private int brandsCreated;
        private int brandsUpdated;
        private int productsCreated;
        private int productsUpdated;
    }
}
