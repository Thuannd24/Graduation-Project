package com.ecommerce.productservice.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductReviewedEvent {
    private String eventId;
    private String eventType;
    private String timestamp;
    private Long reviewId;
    private String userId;
    private Long productId;
    private Long orderId;
    private Integer rating;
}
