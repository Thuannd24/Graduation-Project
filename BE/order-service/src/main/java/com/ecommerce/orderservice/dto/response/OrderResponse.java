package com.ecommerce.orderservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderResponse {

    private Long id;
    private String userId;
    private String status;
    private BigDecimal totalAmount;
    private BigDecimal discountAmount;
    private BigDecimal finalAmount;
    private String couponCode;
    private String appliedCampaignId;
    private Integer pointsRedeemed;
    private BigDecimal pointDiscountAmount;
    private BigDecimal shippingFee;
    private BigDecimal shippingDiscountAmount;
    private BigDecimal vatAmount;
    private String trackingCode;
    private String shippingAddress;
    private String phoneNumber;
    private String note;
    /** Tên / SĐT người nhận của đơn (đơn cũ: recipientPhone = phoneNumber, recipientName null). */
    private String recipientName;
    private String recipientPhone;
    /** Lý do hủy (khi CANCELLED / RETURNING / RETURNED do hủy). */
    private String cancelReasonCode;
    private String cancelReason;
    private String cancelledBy;
    private LocalDateTime cancelledAt;
    private List<OrderItemResponse> items;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
