package com.ecommerce.notificationservice.client;

import com.ecommerce.notificationservice.service.RecipientEmailResolver;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Resolves a customer's e-mail through user-service's internal API:
 * GET /api/internal/users/keycloak/{keycloakUserId} (UUID ids) or GET /api/internal/users/{id}
 * (numeric ids). Both return ApiResponse&lt;InternalUserProfileResponse&gt; with data.email.
 * Any failure resolves to empty so the caller skips the e-mail instead of guessing an address.
 */
@Component
@Slf4j
public class UserServiceEmailResolver implements RecipientEmailResolver {

    private static final Pattern NUMERIC = Pattern.compile("\\d+");
    private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9-]{1,64}");

    private final RestTemplate restTemplate;
    private final String userServiceBaseUrl;

    public UserServiceEmailResolver(@Qualifier("internalRestTemplate") RestTemplate restTemplate,
                                    @Value("${app.user-service.base-url:http://user-service}") String userServiceBaseUrl) {
        this.restTemplate = restTemplate;
        this.userServiceBaseUrl = userServiceBaseUrl;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<String> resolveEmail(String userId) {
        if (userId == null || userId.isBlank() || "anonymous".equalsIgnoreCase(userId)
                || !SAFE_ID.matcher(userId.trim()).matches()) {
            return Optional.empty();
        }
        String id = userId.trim();
        String path = NUMERIC.matcher(id).matches()
                ? "/api/internal/users/" + id
                : "/api/internal/users/keycloak/" + id;
        try {
            Map<String, Object> body = restTemplate.getForObject(userServiceBaseUrl + path, Map.class);
            Object data = body != null ? body.get("data") : null;
            if (data instanceof Map<?, ?> profile) {
                Object email = profile.get("email");
                if (email != null && email.toString().contains("@")) {
                    return Optional.of(email.toString().trim());
                }
            }
            log.warn("user-service returned no email for user {}", id);
        } catch (Exception ex) {
            log.warn("Could not resolve email for user {} from user-service: {}", id, ex.getMessage());
        }
        return Optional.empty();
    }
}
