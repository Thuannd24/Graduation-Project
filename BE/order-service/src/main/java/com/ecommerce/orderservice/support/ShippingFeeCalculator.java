package com.ecommerce.orderservice.support;

import java.math.BigDecimal;

/**
 * Phí ship do server tính — không tin giá trị client gửi lên.
 */
public final class ShippingFeeCalculator {

    public static final BigDecimal DEFAULT_SHIPPING_FEE = BigDecimal.valueOf(30_000);

    private ShippingFeeCalculator() {
    }

    public static BigDecimal calculate(BigDecimal orderSubtotal) {
        if (orderSubtotal == null || orderSubtotal.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        return DEFAULT_SHIPPING_FEE;
    }
}
