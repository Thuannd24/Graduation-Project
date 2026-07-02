package com.ecommerce.productservice.client;

import com.ecommerce.productservice.dto.ApiResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "order-service")
public interface OrderClient {

    @GetMapping("/api/internal/orders/check-eligible")
    ApiResponse<Boolean> checkEligibleReview(
            @RequestParam("userId") String userId,
            @RequestParam("productId") Long productId,
            @RequestParam("orderId") Long orderId);
}
