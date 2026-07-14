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
    /** Tổng tiết kiệm (giảm sản phẩm + giảm ship). */
    private BigDecimal discountAmount;
    /** Giảm trực tiếp trên giá sản phẩm (PERCENT, FIXED). */
    private BigDecimal productDiscountAmount;
    /** Giảm phí vận chuyển (FREESHIP). */
    private BigDecimal shippingDiscountAmount;
    /** Số tiền sản phẩm sau giảm — không trừ phí ship. */
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
