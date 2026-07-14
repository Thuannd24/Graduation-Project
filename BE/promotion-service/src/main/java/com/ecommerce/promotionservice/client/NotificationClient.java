package com.ecommerce.promotionservice.client;

import com.ecommerce.promotionservice.dto.SendNotificationRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

import com.ecommerce.promotionservice.config.FeignInternalApiConfig;

@FeignClient(name = "notification-service", fallbackFactory = NotificationClientFallbackFactory.class, configuration = FeignInternalApiConfig.class)
public interface NotificationClient {

    @PostMapping("/api/internal/notifications/send")
    Map<String, Object> sendNotification(@RequestBody SendNotificationRequest request);
}
