package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.client.UserClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class InternalUserIdResolver {

    private final UserClient userClient;

    public Optional<Long> resolveDbUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            return Optional.empty();
        }

        Long parsed = toLong(userId);
        if (parsed != null) {
            return Optional.of(parsed);
        }

        if (userId.contains("-")) {
            try {
                Map<String, Object> response = userClient.getProfileByKeycloakId(userId);
                Map<String, Object> data = extractData(response);
                if (data != null && data.get("id") != null) {
                    return Optional.ofNullable(toLong(data.get("id")));
                }
            } catch (Exception ignored) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractData(Map<String, Object> response) {
        if (response == null) {
            return null;
        }
        Object dataObj = response.get("data");
        if (dataObj instanceof Map) {
            return (Map<String, Object>) dataObj;
        }
        return response;
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
