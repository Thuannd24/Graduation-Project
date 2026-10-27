package com.ecommerce.orderservice.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Bug thật trong công thức tính tiền. Chạy riêng: mvn -pl order-service test -Dtest=*BugCheck
 */
class OrderPricingHelperBugCheck {

    @Test
    // Cập nhật theo quy tắc mới (giá đã gồm VAT, freeship từ 500.000đ): dùng đơn 400.000đ để vẫn có phí ship 30.000.
    @DisplayName("TC_PH3_PRICE_04: Voucher freeship 50.000đ nhưng phí ship chỉ 30.000đ -> giảm ship phải bị chặn ở 30.000 (thành tiền 400.000), không được trừ lấn sang tiền hàng")
    void shippingDiscount_mustBeCappedAtShippingFee() {
        OrderPricingHelper.PricingBreakdown p = OrderPricingHelper.calculate(
                new BigDecimal("400000"), BigDecimal.ZERO, new BigDecimal("50000"), BigDecimal.ZERO);

        // 400.000 (đã gồm VAT) + ship 30.000 - freeship tối đa 30.000 = 400.000
        assertAll(
                () -> assertEquals(0, new BigDecimal("400000").compareTo(p.getFinalAmount()),
                        "finalAmount = " + p.getFinalAmount()),
                () -> assertEquals(0, new BigDecimal("30000").compareTo(p.getShippingDiscount()),
                        "shippingDiscount = " + p.getShippingDiscount()),
                () -> assertEquals(0, new BigDecimal("30000").compareTo(p.getTotalDiscount()),
                        "totalDiscount = " + p.getTotalDiscount())
        );
    }
}
