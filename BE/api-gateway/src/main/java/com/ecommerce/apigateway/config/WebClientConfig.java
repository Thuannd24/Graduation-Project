package com.ecommerce.apigateway.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

@Configuration
public class WebClientConfig {

    /**
     * WebClient có tích hợp Load Balancer (Eureka) để gọi trực tiếp các service nội bộ
     * bằng scheme lb://service-name, dùng cho các tác vụ side-effect tại Gateway
     * (ví dụ: auto-provision user profile) mà không cần đi qua route table của Gateway.
     */
    @Bean
    @LoadBalanced
    public WebClient.Builder loadBalancedWebClientBuilder() {
        return WebClient.builder();
    }
}
