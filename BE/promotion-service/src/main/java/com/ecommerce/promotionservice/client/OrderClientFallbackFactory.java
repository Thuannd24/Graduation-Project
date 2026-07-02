package com.ecommerce.promotionservice.client;

import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;
import java.util.Map;
import java.util.HashMap;
import java.math.BigDecimal;

@Component
@Slf4j
public class OrderClientFallbackFactory implements FallbackFactory<OrderClient> {

    @Override
    public OrderClient create(Throwable cause) {
        return new OrderClient() {
            @Override
            public Map<String, Object> getTotalSpending(String userId, int days) {
                log.error("Order service is unavailable, returning fallback spending for userId: {}. Error: {}", userId, cause.getMessage());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("code", "SUCCESS");
                fallback.put("message", "Fallback success");
                fallback.put("data", BigDecimal.ZERO);
                return fallback;
            }

            @Override
            public Map<String, Object> getOrderSummary(Long orderId) {
                log.error("Order service unavailable for order summary {}: {}", orderId, cause.getMessage());
                Map<String, Object> fallback = new HashMap<>();
                fallback.put("code", "FALLBACK");
                fallback.put("data", null);
                return fallback;
            }
        };
    }
}
