package com.ecommerce.notificationservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * Service-to-service HTTP client (resolved through Eureka, e.g. http://user-service) that sends
 * the shared X-Internal-Api-Key header expected by the /api/internal/** endpoints.
 */
@Configuration
public class InternalRestClientConfig {

    @Bean
    @LoadBalanced
    public RestTemplate internalRestTemplate(RestTemplateBuilder builder,
                                             @Value("${app.internal.api-key:}") String internalApiKey) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(3))
                .setReadTimeout(Duration.ofSeconds(5))
                .additionalInterceptors((request, body, execution) -> {
                    if (internalApiKey != null && !internalApiKey.isBlank()) {
                        request.getHeaders().set("X-Internal-Api-Key", internalApiKey);
                    }
                    return execution.execute(request, body);
                })
                .build();
    }
}
