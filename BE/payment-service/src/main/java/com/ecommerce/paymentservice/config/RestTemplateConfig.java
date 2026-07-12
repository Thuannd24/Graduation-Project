package com.ecommerce.paymentservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Configuration
public class RestTemplateConfig {

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate(@Value("${app.internal.api-key:}") String internalApiKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000); // 3 seconds
        factory.setReadTimeout(5000);    // 5 seconds
        RestTemplate restTemplate = new RestTemplate(factory);

        List<ClientHttpRequestInterceptor> interceptors = new ArrayList<>();
        interceptors.add(new BearerTokenInterceptor());
        if (internalApiKey != null && !internalApiKey.isBlank()) {
            interceptors.add(new InternalApiKeyInterceptor(internalApiKey));
        }
        restTemplate.setInterceptors(interceptors);

        return restTemplate;
    }

    @Bean
    public RestTemplate standardRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000); // 3 seconds
        factory.setReadTimeout(5000);    // 5 seconds
        return new RestTemplate(factory);
    }

    public static class BearerTokenInterceptor implements ClientHttpRequestInterceptor {
        @Override
        public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
                throws IOException {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder
                    .getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest currentRequest = attributes.getRequest();
                String authHeader = currentRequest.getHeader("Authorization");
                if (authHeader != null) {
                    request.getHeaders().set("Authorization", authHeader);
                }
            }
            return execution.execute(request, body);
        }
    }

    public static class InternalApiKeyInterceptor implements ClientHttpRequestInterceptor {
        private final String internalApiKey;

        public InternalApiKeyInterceptor(String internalApiKey) {
            this.internalApiKey = internalApiKey;
        }

        @Override
        public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
                throws IOException {
            if (request.getURI().getPath().contains("/api/internal/")) {
                request.getHeaders().set("X-Internal-Api-Key", internalApiKey);
            }
            return execution.execute(request, body);
        }
    }
}
