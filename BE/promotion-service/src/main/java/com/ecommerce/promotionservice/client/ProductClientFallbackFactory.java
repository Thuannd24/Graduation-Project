package com.ecommerce.promotionservice.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class ProductClientFallbackFactory implements FallbackFactory<ProductClient> {

    @Override
    public ProductClient create(Throwable cause) {
        return productIds -> {
            log.error("product-service unavailable for bulk lookup: {}", cause.getMessage());
            Map<String, Object> fallback = new HashMap<>();
            fallback.put("code", "FALLBACK");
            fallback.put("data", List.of());
            return fallback;
        };
    }
}
