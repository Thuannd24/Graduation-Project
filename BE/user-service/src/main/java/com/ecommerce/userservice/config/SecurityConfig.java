package com.ecommerce.userservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Phân quyền 2 tầng tại User-Service (Defense-in-depth):
 *
 * Tầng 1 — API Gateway: Kiểm tra JWT hợp lệ, block unauthenticated request.
 * Tầng 2 — User-Service: Verify lại JWT + @PreAuthorize kiểm tra role chi tiết.
 *
 * Lý do cần tầng 2: Nếu có service nội bộ hoặc bypass Gateway, service vẫn an toàn.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true) // Bật @PreAuthorize trên Controller/Service
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Internal API — chỉ cho phép từ nội bộ (không qua Internet)
                // Trong thực tế nên thêm IP whitelist hoặc mTLS
                .requestMatchers("/api/internal/**").permitAll()
                .requestMatchers("/api/v1/public/**").permitAll()

                // Actuator health check
                .requestMatchers("/actuator/health").permitAll()

                // Admin routes — phân quyền thô (tinh hơn ở @PreAuthorize)
                .requestMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "STAFF")

                // Tất cả API khác cần xác thực
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthConverter()))
            );

        return http.build();
    }

    /**
     * Converter: đọc roles từ realm_access.roles trong JWT
     * và chuyển thành Spring Security GrantedAuthority có prefix ROLE_.
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
            if (realmAccess == null || !realmAccess.containsKey("roles")) {
                return List.of();
            }

            @SuppressWarnings("unchecked")
            List<String> roles = (List<String>) realmAccess.get("roles");

            return roles.stream()
                    .map(role -> role.toUpperCase())
                    .map(role -> role.startsWith("ROLE_") ? role : "ROLE_" + role)
                    .map(SimpleGrantedAuthority::new)
                    .collect(Collectors.toList());
        });
        return converter;
    }
}
