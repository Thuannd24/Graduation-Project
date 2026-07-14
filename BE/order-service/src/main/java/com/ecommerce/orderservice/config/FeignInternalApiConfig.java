package com.ecommerce.orderservice.config;

import feign.RequestInterceptor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FeignInternalApiConfig {

    @Bean
    public RequestInterceptor internalApiKeyInterceptor(@Value("${app.internal.api-key:}") String internalApiKey) {
        return template -> {
            if (internalApiKey != null && !internalApiKey.isBlank()) {
                template.header("X-Internal-Api-Key", internalApiKey);
            }
        };
    }
}
