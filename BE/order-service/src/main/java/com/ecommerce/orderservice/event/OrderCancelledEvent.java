package com.ecommerce.orderservice.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderCancelledEvent {

    private String eventId;
    private String eventType;
    private String timestamp;
    private Long orderId;
    private String userId;
    private String email;
    private List<OrderItemInfo> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderItemInfo {
        private Long productId;
        private Long variantId;
        private Integer quantity;
    }
}
