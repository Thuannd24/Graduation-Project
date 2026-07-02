package com.ecommerce.orderservice.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartUpdatedEvent {

    private String eventId;
    private String eventType;
    private String timestamp;
    private String userId;
    private String sessionId;
    private Long productId;
    private Long variantId;
    private Integer quantity;
    private String action; // ADD_ITEM, UPDATE_QTY, REMOVE_ITEM, CLEAR_CART
}
