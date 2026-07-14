package com.ecommerce.promotionservice.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

import com.ecommerce.promotionservice.config.FeignInternalApiConfig;

@FeignClient(name = "product-service", fallbackFactory = ProductClientFallbackFactory.class, configuration = FeignInternalApiConfig.class)
public interface ProductClient {

    @GetMapping("/api/internal/products/bulk")
    Map<String, Object> getBulkProducts(@RequestParam("ids") List<Long> productIds);
}
