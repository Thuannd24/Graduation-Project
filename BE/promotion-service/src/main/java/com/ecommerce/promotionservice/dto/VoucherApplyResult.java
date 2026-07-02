package com.ecommerce.promotionservice.dto;

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
public class VoucherApplyResult {
    private boolean applied;
    private String message;
    private String voucherCode;
    private VoucherType voucherType;
    private BigDecimal discountAmount;
    private BigDecimal finalAmount;
    private Long campaignId;
    private LocalDateTime expiresAt;

    public static VoucherApplyResult invalid(String message) {
        return VoucherApplyResult.builder()
                .applied(false)
                .message(message)
                .build();
    }
}
