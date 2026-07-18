package com.ecommerce.promotionservice.client;

import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;
import java.util.Map;
import java.util.HashMap;

@Component
@Slf4j
public class UserClientFallbackFactory implements FallbackFactory<UserClient> {

    @Override
    public UserClient create(Throwable cause) {
        return new UserClient() {
            @Override
            public Map<String, Object> getAiProfile(Long userId) {
                log.error("User service is unavailable, returning fallback profile for userId: {}. Error: {}", userId, cause.getMessage());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("userId", userId);
                fallback.put("customerTier", "MEMBER"); // default tier
                fallback.put("isBlacklisted", false);
                return fallback;
            }

            @Override
            public Map<String, Object> getProfileByKeycloakId(String keycloakUserId) {
                log.error("User service unavailable for keycloak lookup {}: {}", keycloakUserId, cause.getMessage());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("code", "FALLBACK");
                fallback.put("data", null);
                return fallback;
            }

            @Override
            public Map<String, Object> getProfileById(Long userId) {
                log.error("User service unavailable for id lookup {}: {}", userId, cause.getMessage());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("code", "FALLBACK");
                fallback.put("data", null);
                return fallback;
            }

            @Override
            public void updateTier(Long userId, Map<String, Object> request) {
                log.error("User service is unavailable, fallback tier update skipped for userId: {}. Error: {}", userId, cause.getMessage());
            }

            @Override
            public Map<String, Object> updatePoints(Long userId, Map<String, Object> request) {
                log.error("User service unavailable, fallback points update for userId={}: {}", userId, cause.getMessage());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("code", "FALLBACK");
                Map<String, Object> data = new HashMap<>();
                data.put("newPointBalance", 0);
                data.put("pointsApplied", 0);
                fallback.put("data", data);
                return fallback;
            }
        };
    }
}
