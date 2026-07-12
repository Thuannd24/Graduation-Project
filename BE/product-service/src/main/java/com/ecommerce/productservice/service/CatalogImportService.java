package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.catalogimport.CatalogImportManifestDto;
import com.ecommerce.productservice.dto.catalogimport.CatalogImportResultDto;

public interface CatalogImportService {
    CatalogImportResultDto importCatalog(CatalogImportManifestDto manifest, boolean dryRun);
}
