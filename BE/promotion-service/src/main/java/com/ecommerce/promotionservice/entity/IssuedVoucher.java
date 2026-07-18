package com.ecommerce.promotionservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "issued_vouchers", indexes = {
        @Index(name = "idx_voucher_code", columnList = "code", unique = true),
        @Index(name = "idx_voucher_user", columnList = "user_id"),
        @Index(name = "idx_voucher_idempotency_key", columnList = "idempotency_key", unique = true)
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssuedVoucher {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String code;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "campaign_id")
    private Long campaignId;

    @Enumerated(EnumType.STRING)
    @Column(name = "voucher_type", nullable = false, length = 20)
    private VoucherType voucherType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private VoucherStatus status = VoucherStatus.UNUSED;

    @Column(name = "discount_percent")
    private BigDecimal discountPercent;

    @Column(name = "max_discount_amount")
    private BigDecimal maxDiscountAmount;

    @Column(name = "discount_amount")
    private BigDecimal discountAmount;

    @Column(name = "min_order_value")
    private BigDecimal minOrderValue;

    @Column(name = "max_shipping_discount")
    private BigDecimal maxShippingDiscount;

    /**
     * Comma-separated category/product IDs this voucher is restricted to (null/blank = no
     * restriction). Populated from the issuing campaign's Condition_ContainsCategory /
     * Condition_ContainsProduct node (if any) so a voucher earned for buying category X can only
     * be redeemed on an order that also contains category X - previously these conditions only
     * gated who RECEIVED the voucher, not what it could be REDEEMED against.
     */
    @Column(name = "restricted_category_ids", length = 500)
    private String restrictedCategoryIds;

    @Column(name = "restricted_product_ids", length = 500)
    private String restrictedProductIds;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    @Column(name = "used_order_id")
    private Long usedOrderId;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    /**
     * "<processInstanceId>:<activityId>" of the Camunda service task that issued this voucher.
     * Nullable (older rows / non-Camunda issuance paths have none). Lets issuance be retried
     * safely - Camunda job retries re-run a delegate's execute() from scratch, and without this
     * guard a retry would issue a second real voucher and debit the campaign budget twice for one
     * customer action.
     */
    @Column(name = "idempotency_key", unique = true, length = 100)
    private String idempotencyKey;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (status == null) {
            status = VoucherStatus.UNUSED;
        }
    }
}
