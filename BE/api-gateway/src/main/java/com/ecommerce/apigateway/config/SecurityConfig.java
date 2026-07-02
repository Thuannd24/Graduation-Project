package com.ecommerce.apigateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Whitelist: public endpoints không cần token
                        .pathMatchers(
                                "/api/v1/public/**", // Tất cả /public/** là public thật sự
                                "/api/v1/inventories/**", // Xem tồn kho công khai
                                "/eureka/**", // Eureka dashboard
                                "/actuator/health", // Health check (giới hạn chỉ /health, không expose tất cả)
                                "/fallback/**", // Fallback endpoints của Circuit Breaker
                                "/realms/**", // Keycloak endpoints (lấy token, đăng ký...)
                                "/resources/**" // Tài nguyên tĩnh của Keycloak UI
                        ).permitAll()
                        // Admin/Staff routes — phân quyền thô tại Gateway
                        .pathMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "STAFF")
                        // Chặn tuyệt đối mọi truy cập từ bên ngoài đến API nội bộ
                        .pathMatchers("/api/internal/**").denyAll()
                        // Mọi API khác đều cần xác thực (nhưng phân quyền chi tiết ở service)
                        .anyExchange().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));

        return http.build();
    }

    @Bean
    public ReactiveJwtAuthenticationConverter jwtAuthenticationConverter() {
        ReactiveJwtAuthenticationConverter converter = new ReactiveJwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
            if (realmAccess == null || !realmAccess.containsKey("roles")) {
                return Flux.empty();
            }

            @SuppressWarnings("unchecked")
            List<String> roles = (List<String>) realmAccess.get("roles");

            List<GrantedAuthority> authorities = roles.stream()
                    .map(role -> {
                        // Nếu role đã có tiền tố ROLE_ (ví dụ: ROLE_ADMIN), giữ nguyên
                        // Nếu chưa có, tự động thêm tiền tố ROLE_ để Spring Security nhận dạng
                        return role.startsWith("ROLE_") ? role : "ROLE_" + role;
                    })
                    .map(SimpleGrantedAuthority::new)
                    .collect(Collectors.toList());

            return Flux.fromIterable(authorities);
        });
        return converter;
    }
}
