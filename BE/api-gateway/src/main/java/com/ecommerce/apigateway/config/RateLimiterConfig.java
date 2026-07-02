package com.ecommerce.apigateway.config;

import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import reactor.core.publisher.Mono;

@Configuration
public class RateLimiterConfig {

    /**
     * Phân biệt rate limit theo User ID lấy trực tiếp từ JWT Principal.
     * KHÔNG đọc X-User-Id header vì UserHeaderFilter chạy sau Rate Limiter.
     * Fallback về IP address cho anonymous requests (public endpoints).
     */
    @Bean
    public KeyResolver userKeyResolver() {
        return exchange -> ReactiveSecurityContextHolder.getContext()
                .flatMap(ctx -> {
                    if (ctx.getAuthentication() instanceof JwtAuthenticationToken jwtAuth) {
                        String userId = jwtAuth.getToken().getSubject();
                        if (userId != null && !userId.isEmpty()) {
                            return Mono.just("user:" + userId);
                        }
                    }
                    return Mono.empty();
                })
                .switchIfEmpty(Mono.fromSupplier(() -> {
                    // Fallback: dùng IP cho anonymous / public endpoints
                    String ip = exchange.getRequest().getRemoteAddress() != null
                            ? exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
                            : "unknown";
                    return "ip:" + ip;
                }));
    }
}
