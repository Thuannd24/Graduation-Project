package com.ecommerce.apigateway.filter;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

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
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 1) // Chạy sau Security filter chain để Security Context đã sẵn sàng
public class UserHeaderFilter implements WebFilter {

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
                .map(jwtAuth -> {
                    String userId   = jwtAuth.getToken().getSubject();
                    String email    = jwtAuth.getToken().getClaimAsString("email");
                    String username = jwtAuth.getToken().getClaimAsString("preferred_username");
                    String fullName = jwtAuth.getToken().getClaimAsString("name");
                    String avatarUrl = jwtAuth.getToken().getClaimAsString("picture");
                    String rolesHeader = extractRoles(jwtAuth);

                    String encodedFullName = "";
                    if (fullName != null && !fullName.isEmpty()) {
                        try {
                            encodedFullName = java.net.URLEncoder.encode(fullName, java.nio.charset.StandardCharsets.UTF_8.name());
                        } catch (Exception e) {
                            encodedFullName = fullName;
                        }
                    }

                    // userId null-check: không inject header nếu sub claim bị thiếu
                    if (userId == null || userId.isEmpty()) {
                        return sanitizedExchange;
                    }

                    return sanitizedExchange.mutate()
                            .request(sanitizedExchange.getRequest().mutate()
                                     .header("X-User-Id",       userId)
                                     .header("X-User-Email",    email    != null ? email    : "")
                                     .header("X-User-Username", username != null ? username : "")
                                     .header("X-User-Name",     encodedFullName)
                                     .header("X-User-Avatar",   avatarUrl != null ? avatarUrl : "")
                                     .header("X-User-Roles",    rolesHeader)
                                     .build())
                            .build();
                })
                .defaultIfEmpty(sanitizedExchange) // Public endpoints: không có JWT → bỏ qua, forward request sạch
                .flatMap(chain::filter);
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
