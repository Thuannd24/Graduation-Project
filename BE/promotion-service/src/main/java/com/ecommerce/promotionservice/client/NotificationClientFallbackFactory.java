package com.ecommerce.promotionservice.client;

import com.ecommerce.promotionservice.dto.SendNotificationRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class NotificationClientFallbackFactory implements FallbackFactory<NotificationClient> {

    @Override
    public NotificationClient create(Throwable cause) {
        return request -> {
            log.error("notification-service unavailable, skipping send for userId={}: {}",
                    request.getUserId(), cause.getMessage());
            Map<String, Object> fallback = new HashMap<>();
            fallback.put("code", "FALLBACK");
            fallback.put("message", "notification-service unavailable");
            return fallback;
        };
    }
}
