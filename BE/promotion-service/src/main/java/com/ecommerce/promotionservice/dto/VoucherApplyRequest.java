package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VoucherApplyRequest {
    private String code;
    /** Keycloak UUID hoặc user DB id (string). */
    private String userId;
    /** Bắt buộc khi apply (reserve) — null khi chỉ preview validate. */
    private Long orderId;
    private BigDecimal orderTotal;
    /** Dùng cho FREESHIP; nếu null sẽ dùng maxShippingDiscount làm mức trần. */
    private BigDecimal shippingFee;
}
