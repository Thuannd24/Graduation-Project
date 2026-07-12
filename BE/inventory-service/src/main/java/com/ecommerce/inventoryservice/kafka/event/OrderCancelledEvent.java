package com.ecommerce.inventoryservice.kafka.event;

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

    private String eventType;
    private Long orderId;
    private String timestamp;
    private List<OrderItemInfo> items;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderItemInfo {
        private Long productId;
        private Long variantId;
        private Integer quantity;
    }
}
