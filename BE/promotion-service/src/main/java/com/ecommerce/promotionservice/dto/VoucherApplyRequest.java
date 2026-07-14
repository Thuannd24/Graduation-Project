package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

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
    /** Product IDs trong đơn hàng/giỏ hàng hiện tại — dùng để kiểm tra ràng buộc
     *  danh mục/sản phẩm của voucher (nếu voucher được phát có kèm điều kiện đó). */
    private List<Long> productIds;
}
