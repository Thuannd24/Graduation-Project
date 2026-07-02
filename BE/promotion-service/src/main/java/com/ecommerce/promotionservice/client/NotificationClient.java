package com.ecommerce.promotionservice.client;

import com.ecommerce.promotionservice.dto.SendNotificationRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.Map;

@FeignClient(name = "notification-service", fallbackFactory = NotificationClientFallbackFactory.class)
public interface NotificationClient {

    @PostMapping("/api/internal/notifications/send")
    Map<String, Object> sendNotification(@RequestBody SendNotificationRequest request);
}
