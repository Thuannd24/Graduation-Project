package com.ecommerce.productservice.config;

import org.apache.http.HttpResponseInterceptor;
import org.springframework.boot.autoconfigure.elasticsearch.RestClientBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ElasticsearchConfig {

    @Bean
    public RestClientBuilderCustomizer restClientBuilderCustomizer() {
        return builder -> builder.setHttpClientConfigCallback(httpClientBuilder -> {
            httpClientBuilder.addInterceptorLast((HttpResponseInterceptor) (response, context) -> {
                if (!response.containsHeader("X-Elastic-Product")) {
                    response.addHeader("X-Elastic-Product", "Elasticsearch");
                }
            });
            return httpClientBuilder;
        });
    }
}
