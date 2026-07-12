package com.ecommerce.promotionservice.dto;

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
public class UserVoucherDto {
    private Long id;
    private String code;
    private VoucherType voucherType;
    private VoucherStatus status;
    private BigDecimal discountPercent;
    private BigDecimal maxDiscountAmount;
    private BigDecimal discountAmount;
    private BigDecimal minOrderValue;
    private BigDecimal maxShippingDiscount;
    private LocalDateTime expiresAt;
    private Long campaignId;
    private String title;
    private String description;
    private boolean usable;
}
