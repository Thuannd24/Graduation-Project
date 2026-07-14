package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportResultDto;
import com.ecommerce.productservice.service.CatalogImportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/import")
@RequiredArgsConstructor
public class AdminCatalogImportController {

    private final CatalogImportService catalogImportService;

    /**
     * Import catalog theo manifest JSON.
     * Mặc định dryRun=true — chỉ validate, không ghi DB.
     * Truyền dryRun=false để thực sự import (upsert theo slug/code/sku).
     */
    @PostMapping("/catalog")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<CatalogImportResultDto> importCatalog(
            @Valid @RequestBody CatalogImportManifestDto manifest,
            @RequestParam(value = "dryRun", defaultValue = "true") boolean dryRun) {
        CatalogImportResultDto result = catalogImportService.importCatalog(manifest, dryRun);
        String message = dryRun
                ? "Dry-run validation completed"
                : (result.isSuccess() ? "Catalog import completed" : "Catalog import completed with errors");
        return ApiResponse.success(message, result);
    }
}
