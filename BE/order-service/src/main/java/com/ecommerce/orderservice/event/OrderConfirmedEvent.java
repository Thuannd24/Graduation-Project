package com.ecommerce.orderservice.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderConfirmedEvent {

    private String eventId;
    private String eventType;
    private String timestamp;
    private Long orderId;
    private String userId;
    private String email;

    // Chi tiết đơn cho email xác nhận (notification-service). Thêm mới, không bắt buộc.
    private java.util.List<Item> items;
    private java.math.BigDecimal totalAmount;
    private java.math.BigDecimal shippingFee;
    private java.math.BigDecimal discountAmount;
    private java.math.BigDecimal vatAmount;
    private java.math.BigDecimal finalAmount;
    private String recipientName;
    private String shippingAddress;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Item {
        private Long productId;
        private String productName;
        /** Thuộc tính biến thể (JSON, vd. {"color":"Đen","storage":"256GB"}) - có thể null. */
        private String variantName;
        private Integer quantity;
        private java.math.BigDecimal unitPrice;
        private java.math.BigDecimal subtotal;
    }
}
