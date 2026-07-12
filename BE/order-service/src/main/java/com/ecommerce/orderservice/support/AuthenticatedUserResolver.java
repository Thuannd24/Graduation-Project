package com.ecommerce.orderservice.support;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;
import java.util.stream.Collectors;

@Component
public class AuthenticatedUserResolver {

    public String resolveUserId(String headerUserId) {
        String jwtSub = extractJwtSubject();
        if (jwtSub != null && !jwtSub.isBlank()) {
            if (headerUserId != null && !headerUserId.isBlank() && !jwtSub.equals(headerUserId)) {
                throw new AccessDeniedException("Xác thực người dùng không khớp với token.");
            }
            return jwtSub;
        }
        if (headerUserId != null && !headerUserId.isBlank()) {
            return headerUserId;
        }
        throw new AccessDeniedException("Yêu cầu đăng nhập.");
    }

    public String resolveRolesHeader(String headerRoles) {
        String jwtRoles = extractJwtRolesCsv();
        if (jwtRoles != null && !jwtRoles.isBlank()) {
            return jwtRoles;
        }
        return headerRoles != null ? headerRoles : "";
    }

    public boolean isAdminOrStaff(String rolesHeader) {
        if (rolesHeader == null || rolesHeader.isBlank()) {
            return false;
        }
        return Arrays.stream(rolesHeader.split(","))
                .map(String::trim)
                .map(r -> r.toUpperCase(Locale.ROOT))
                .anyMatch(r -> r.contains("ADMIN") || r.contains("STAFF"));
    }

    private String extractJwtSubject() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            return jwt.getSubject();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String extractJwtRolesCsv() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) {
            return null;
        }
        var realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess == null || !realmAccess.containsKey("roles")) {
            return null;
        }
        var roles = (java.util.List<String>) realmAccess.get("roles");
        if (roles == null || roles.isEmpty()) {
            return null;
        }
        return roles.stream().collect(Collectors.joining(","));
    }
}
