package com.ecommerce.orderservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "orders")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 100)
    private String userId;

    @Column(name = "email", length = 255)
    private String email;

    @Column(name = "status", nullable = false)
    @Builder.Default
    private String status = "PENDING"; // PENDING, AWAITING_PAYMENT, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, RETURNING, RETURNED (xem OrderStatusMachine)

    @Column(name = "total_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    @Column(name = "discount_amount", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal discountAmount = BigDecimal.ZERO;

    @Column(name = "final_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal finalAmount;

    @Column(name = "total_weight", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal totalWeight = BigDecimal.ZERO;

    @Column(name = "coupon_code", length = 50)
    private String couponCode;

    @Column(name = "applied_campaign_id", length = 50)
    private String appliedCampaignId;

    @Column(name = "points_redeemed")
    @Builder.Default
    private Integer pointsRedeemed = 0;

    @Column(name = "point_discount_amount", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal pointDiscountAmount = BigDecimal.ZERO;

    @Column(name = "shipping_fee", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal shippingFee = BigDecimal.ZERO;

    @Column(name = "shipping_discount_amount", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal shippingDiscountAmount = BigDecimal.ZERO;

    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(name = "tracking_code", length = 100)
    private String trackingCode;

    @Column(name = "shipping_address", columnDefinition = "TEXT", nullable = false)
    private String shippingAddress;

    @Column(name = "phone_number", length = 15, nullable = false)
    private String phoneNumber;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    /** Tên người nhận hàng của riêng đơn này (mua tặng / nhờ nhận hộ). Null với đơn cũ. */
    @Column(name = "recipient_name", length = 150)
    private String recipientName;

    /** SĐT người nhận đã chuẩn hóa (0xxxxxxxxx). Null với đơn cũ (khi đó dùng phoneNumber). */
    @Column(name = "recipient_phone", length = 15)
    private String recipientPhone;

    /** Mã lý do hủy (CHANGED_MIND, WRONG_ORDER, CHANGE_ADDRESS, BETTER_PRICE, PAYMENT_ISSUE, OTHER, SYSTEM...). */
    @Column(name = "cancel_reason_code", length = 50)
    private String cancelReasonCode;

    /** Lý do hủy (văn bản) - để thống kê nguyên nhân hủy. */
    @Column(name = "cancel_reason", columnDefinition = "TEXT")
    private String cancelReason;

    /** Ai hủy: CUSTOMER, ADMIN, SYSTEM, CARRIER. */
    @Column(name = "cancelled_by", length = 20)
    private String cancelledBy;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.status == null) this.status = "PENDING";
        if (this.discountAmount == null) this.discountAmount = BigDecimal.ZERO;
        if (this.pointDiscountAmount == null) this.pointDiscountAmount = BigDecimal.ZERO;
        if (this.shippingFee == null) this.shippingFee = BigDecimal.ZERO;
        if (this.shippingDiscountAmount == null) this.shippingDiscountAmount = BigDecimal.ZERO;
        if (this.vatAmount == null) this.vatAmount = BigDecimal.ZERO;
        if (this.pointsRedeemed == null) this.pointsRedeemed = 0;
        if (this.totalWeight == null) this.totalWeight = BigDecimal.ZERO;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
