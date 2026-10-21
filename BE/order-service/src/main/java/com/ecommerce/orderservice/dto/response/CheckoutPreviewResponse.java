package com.ecommerce.orderservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CheckoutPreviewResponse {
    private BigDecimal subtotal;
    private BigDecimal productDiscount;
    private BigDecimal shippingDiscount;
    private BigDecimal pointDiscount;
    private BigDecimal shippingFee;
    private BigDecimal vatAmount;
    private BigDecimal totalDiscount;
    private BigDecimal finalAmount;
    private String couponCode;
    private String voucherMessage;
    private boolean voucherApplied;
    /** Ngưỡng miễn phí ship (giá trị hàng sau giảm giá sản phẩm). */
    private BigDecimal freeShippingThreshold;
    /** COD được phép khi finalAmount <= codMaxAmount. */
    private boolean codAvailable;
    private BigDecimal codMaxAmount;
    /** Số lượng tối đa mỗi sản phẩm/biến thể trong một đơn. */
    private Integer maxQuantityPerItem;
}
