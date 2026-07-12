package com.ecommerce.promotionservice.dto;

import com.ecommerce.promotionservice.entity.IssuedVoucher;
import com.ecommerce.promotionservice.entity.VoucherStatus;
import com.ecommerce.promotionservice.entity.VoucherType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssuedVoucherDto {
    private Long id;
    private String code;
    private Long userId;
    private Long campaignId;
    private VoucherType voucherType;
    private VoucherStatus status;
    private BigDecimal discountPercent;
    private BigDecimal maxDiscountAmount;
    private BigDecimal discountAmount;
    private BigDecimal minOrderValue;
    private BigDecimal maxShippingDiscount;
    private LocalDateTime expiresAt;
    private LocalDateTime usedAt;
    private Long usedOrderId;
    private LocalDateTime createdAt;

    public static IssuedVoucherDto from(IssuedVoucher v) {
        if (v == null) return null;
        return IssuedVoucherDto.builder()
                .id(v.getId())
                .code(v.getCode())
                .userId(v.getUserId())
                .campaignId(v.getCampaignId())
                .voucherType(v.getVoucherType())
                .status(v.getStatus())
                .discountPercent(v.getDiscountPercent())
                .maxDiscountAmount(v.getMaxDiscountAmount())
                .discountAmount(v.getDiscountAmount())
                .minOrderValue(v.getMinOrderValue())
                .maxShippingDiscount(v.getMaxShippingDiscount())
                .expiresAt(v.getExpiresAt())
                .usedAt(v.getUsedAt())
                .usedOrderId(v.getUsedOrderId())
                .createdAt(v.getCreatedAt())
                .build();
    }
}
