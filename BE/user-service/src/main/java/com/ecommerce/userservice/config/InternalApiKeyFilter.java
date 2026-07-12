package com.ecommerce.userservice.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class InternalApiKeyFilter extends OncePerRequestFilter {

    @Value("${app.internal.api-key:}")
    private String internalApiKey;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!request.getRequestURI().startsWith("/api/internal/")) {
            filterChain.doFilter(request, response);
            return;
        }
        if (internalApiKey == null || internalApiKey.isBlank()) {
            // Fail-closed: khi chưa cấu hình API key → block toàn bộ internal API
            // Ngăn chặn trường hợp quên config key mà internal API bị expose
            log.warn("Internal API key is not configured. Blocking request to: {}", request.getRequestURI());
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"code\":\"FORBIDDEN\",\"message\":\"Internal API key not configured\"}");
            return;
        }
        String provided = request.getHeader("X-Internal-Api-Key");
        if (internalApiKey.equals(provided)) {
            filterChain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"Invalid internal API key\"}");
    }
}
