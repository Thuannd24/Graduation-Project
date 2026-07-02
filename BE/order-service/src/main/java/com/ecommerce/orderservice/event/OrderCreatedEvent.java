package com.ecommerce.orderservice.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Event gửi đến Inventory Service để trừ kho
 * Tuân thủ chuẩn Event Schema trong CLAUDE_SYSTEM_CONVENTIONS
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderCreatedEvent {

    private String eventId;
    private String eventType;
    private String timestamp;
    private Long orderId;
    private String userId;
    private String email;
    private List<OrderItem> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OrderItem {
        private Long productId;
        private Long variantId;
        private Integer quantity;
    }
}
