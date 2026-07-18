package com.ecommerce.apigateway.filter;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
/**
 * Đọc JWT từ Security Context sau khi đã xác thực,
 * trích xuất thông tin User và inject vào HTTP Headers
 * để các microservice downstream sử dụng mà không cần tự parse JWT.
 *
 * Headers được inject:
 *   X-User-Id       → Keycloak UUID (sub claim)
 *   X-User-Email    → Email người dùng
 *   X-User-Username → Tên đăng nhập (preferred_username)
 *   X-User-Name     → Họ và tên đầy đủ (name claim)
 *   X-User-Roles    → Danh sách roles, ngăn cách bởi dấu phẩy
 *
 * Đồng thời đảm bảo profile user đã được auto-provision trong user-service ngay
 * từ request xác thực đầu tiên (thay vì chỉ chờ FE gọi GET /users/me), để tránh
 * race condition khi các service khác (order/promotion/notification...) tra cứu
 * user qua API nội bộ trước khi FE kịp gọi /users/me.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 1) // Chạy sau Security filter chain để Security Context đã sẵn sàng
@Slf4j
public class UserHeaderFilter implements WebFilter {

    private static final String PROVISIONED_CACHE_PREFIX = "gateway:user-provisioned:";
    private static final Duration PROVISIONED_CACHE_TTL = Duration.ofHours(1);

    private final WebClient.Builder loadBalancedWebClientBuilder;
    private final ReactiveStringRedisTemplate redisTemplate;

    public UserHeaderFilter(WebClient.Builder loadBalancedWebClientBuilder,
                             ReactiveStringRedisTemplate redisTemplate) {
        this.loadBalancedWebClientBuilder = loadBalancedWebClientBuilder;
        this.redisTemplate = redisTemplate;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        // Strip any client-supplied X-User-* headers to prevent spoofing
        org.springframework.http.server.reactive.ServerHttpRequest sanitizedRequest = exchange.getRequest().mutate()
                .headers(headers -> headers.keySet().removeIf(key -> key.toLowerCase().startsWith("x-user-")))
                .build();
        ServerWebExchange sanitizedExchange = exchange.mutate().request(sanitizedRequest).build();

        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(auth -> auth instanceof JwtAuthenticationToken)
                .cast(JwtAuthenticationToken.class)
                .flatMap(jwtAuth -> {
                    String userId   = jwtAuth.getToken().getSubject();
                    String email    = jwtAuth.getToken().getClaimAsString("email");
                    String username = jwtAuth.getToken().getClaimAsString("preferred_username");
                    String fullName = jwtAuth.getToken().getClaimAsString("name");
                    String avatarUrl = jwtAuth.getToken().getClaimAsString("picture");
                    String rolesHeader = extractRoles(jwtAuth);
                    String encodedFullName = encodeFullName(fullName);

                    // userId null-check: không inject header nếu sub claim bị thiếu
                    if (userId == null || userId.isEmpty()) {
                        return Mono.just(sanitizedExchange);
                    }

                    ServerWebExchange exchangeWithHeaders = sanitizedExchange.mutate()
                            .request(sanitizedExchange.getRequest().mutate()
                                     .header("X-User-Id",       userId)
                                     .header("X-User-Email",    email    != null ? email    : "")
                                     .header("X-User-Username", username != null ? username : "")
                                     .header("X-User-Name",     encodedFullName)
                                     .header("X-User-Avatar",   avatarUrl != null ? avatarUrl : "")
                                     .header("X-User-Roles",    rolesHeader)
                                     .build())
                            .build();

                    return ensureProvisioned(userId, email, username, encodedFullName, avatarUrl)
                            .thenReturn(exchangeWithHeaders);
                })
                .defaultIfEmpty(sanitizedExchange) // Public endpoints: không có JWT → bỏ qua, forward request sạch
                .flatMap(chain::filter);
    }

    /**
     * Gọi user-service để auto-provision profile ngay từ request xác thực đầu tiên.
     * Kết quả được cache trong Redis (TTL 1h) để tránh gọi lặp lại mỗi request.
     * Lỗi khi gọi user-service (timeout, service down...) bị nuốt để không chặn
     * luồng request chính — request downstream vẫn tiếp tục như bình thường.
     */
    private Mono<Void> ensureProvisioned(String userId, String email, String username,
                                          String encodedFullName, String avatarUrl) {
        String cacheKey = PROVISIONED_CACHE_PREFIX + userId;
        return redisTemplate.hasKey(cacheKey)
                .flatMap(alreadyProvisioned -> {
                    if (Boolean.TRUE.equals(alreadyProvisioned)) {
                        return Mono.empty();
                    }
                    return loadBalancedWebClientBuilder.build().post()
                            .uri("lb://user-service/api/internal/users/provision")
                            .header("X-User-Id", userId)
                            .header("X-User-Email", email != null ? email : "")
                            .header("X-User-Username", username != null ? username : "")
                            .header("X-User-Name", encodedFullName)
                            .header("X-User-Avatar", avatarUrl != null ? avatarUrl : "")
                            .retrieve()
                            .toBodilessEntity()
                            .timeout(Duration.ofSeconds(3))
                            .then(redisTemplate.opsForValue().set(cacheKey, "1", PROVISIONED_CACHE_TTL))
                            .then();
                })
                .onErrorResume(e -> {
                        System.out.println("Auto-provision thất bại: " + e.getMessage());
                return Mono.empty();
});
    }

    private String encodeFullName(String fullName) {
        if (fullName == null || fullName.isEmpty()) {
            return "";
        }
        try {
            return java.net.URLEncoder.encode(fullName, java.nio.charset.StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return fullName;
        }
    }

    @SuppressWarnings("unchecked")
    private String extractRoles(JwtAuthenticationToken jwtAuth) {
        Map<String, Object> realmAccess = jwtAuth.getToken().getClaimAsMap("realm_access");
        if (realmAccess == null || !realmAccess.containsKey("roles")) {
            return "";
        }
        List<String> roles = (List<String>) realmAccess.get("roles");
        return roles != null ? String.join(",", roles) : "";
    }
}
