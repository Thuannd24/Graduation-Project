package com.ecommerce.promotionservice.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;
import java.util.Map;

import com.ecommerce.promotionservice.config.FeignInternalApiConfig;

@FeignClient(name = "user-service", fallbackFactory = UserClientFallbackFactory.class, configuration = FeignInternalApiConfig.class)
public interface UserClient {

    @GetMapping("/api/internal/users/{userId}/profile-ai")
    Map<String, Object> getAiProfile(@PathVariable("userId") Long userId);

    @GetMapping("/api/internal/users/keycloak/{keycloakUserId}")
    Map<String, Object> getProfileByKeycloakId(@PathVariable("keycloakUserId") String keycloakUserId);

    @GetMapping("/api/internal/users/{userId}")
    Map<String, Object> getProfileById(@PathVariable("userId") Long userId);

    @PutMapping("/api/internal/users/{userId}/tier")
    void updateTier(@PathVariable("userId") Long userId, @RequestBody Map<String, Object> request);

    @PutMapping("/api/internal/users/{userId}/points")
    Map<String, Object> updatePoints(@PathVariable("userId") Long userId, @RequestBody Map<String, Object> request);
}
