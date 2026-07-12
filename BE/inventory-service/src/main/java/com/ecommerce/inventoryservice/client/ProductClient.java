package com.ecommerce.inventoryservice.client;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

import com.ecommerce.inventoryservice.config.FeignClientConfig;

@FeignClient(name = "product-service", configuration = FeignClientConfig.class)
public interface ProductClient {

    @GetMapping("/api/internal/products/bulk")
    ApiResponse<List<ProductDto>> getBulkProducts(@RequestParam("ids") List<Long> productIds);

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    class ApiResponse<T> {
        private String code;
        private String message;
        private T data;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    class ProductDto {
        private Long id;
        private String name;
        private List<ProductVariantDto> variants;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    class ProductVariantDto {
        private Long id;
        private Long productId;
        private String sku;
    }
}
