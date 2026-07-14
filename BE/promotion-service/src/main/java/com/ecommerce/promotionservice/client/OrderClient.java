package com.ecommerce.promotionservice.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.Map;

import com.ecommerce.promotionservice.config.FeignInternalApiConfig;

@FeignClient(name = "order-service", fallbackFactory = OrderClientFallbackFactory.class, configuration = FeignInternalApiConfig.class)
public interface OrderClient {

    @GetMapping("/api/internal/orders/total-spending")
    Map<String, Object> getTotalSpending(
            @RequestParam("userId") String userId,
            @RequestParam("days") int days
    );

    @GetMapping("/api/internal/orders/{orderId}/summary")
    Map<String, Object> getOrderSummary(@PathVariable("orderId") Long orderId);
}
