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
    /** Lý do hủy (để thông báo / thống kê). */
    private String reason;
    /** Trạng thái cuối của đơn: CANCELLED (hủy trước giao) hoặc RETURNED (hàng hoàn đã về kho). */
    private String finalStatus;

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
