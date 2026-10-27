package com.ecommerce.orderservice.support;

import com.ecommerce.orderservice.client.PromotionClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * PH3 - Công thức tính tiền đơn hàng (VAT 10%, phí ship server tính, giảm giá voucher/điểm).
 */
class OrderPricingHelperTest {

    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual), "expected " + expected + " but was " + actual);
    }

    @Test
    // Quy tắc đổi (giá đã gồm VAT, freeship từ 500.000đ): trước đây VAT cộng thêm 10% và ship luôn 30.000.
    @DisplayName("TC_PH3_PRICE_01: Tạm tính 1.000.000đ (giá đã gồm VAT), voucher giảm 100.000đ -> hàng 900.000 >= 500.000 nên freeship, VAT tách ra 81.818, thành tiền 900.000")
    void calculate_standardOrderWithVoucher() {
        OrderPricingHelper.PricingBreakdown p = OrderPricingHelper.calculate(
                new BigDecimal("1000000"), new BigDecimal("100000"), BigDecimal.ZERO, BigDecimal.ZERO);

        assertMoney("1000000", p.getSubtotal());
        assertMoney("0", p.getShippingFee());
        assertMoney("81818", p.getVatAmount());
        assertMoney("100000", p.getTotalDiscount());
        assertMoney("900000", p.getFinalAmount());

        // giảm bằng điểm: 500.000 - 200.000 điểm -> hàng 500.000 (điểm không ảnh hưởng freeship) nên ship 0,
        // thành tiền 300.000, VAT tách ra 300.000 x 10/110 = 27.273
        OrderPricingHelper.PricingBreakdown withPoints = OrderPricingHelper.calculate(
                new BigDecimal("500000"), BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("200000"));
        assertMoney("27273", withPoints.getVatAmount());
        assertMoney("300000", withPoints.getFinalAmount());
    }

    @Test
    @DisplayName("TC_PH3_PRICE_02: Biên: tạm tính 0 -> phí ship 0, thành tiền 0; giảm giá âm/null coi như 0; phí ship 30.000 cho hàng < 500.000, miễn phí từ 500.000 (tính sau giảm giá sản phẩm, không tin giá client)")
    void calculate_boundaries() {
        OrderPricingHelper.PricingBreakdown zero = OrderPricingHelper.calculate(BigDecimal.ZERO, null, null, null);
        assertMoney("0", zero.getShippingFee());
        assertMoney("0", zero.getFinalAmount());
        assertMoney("0", zero.getTotalDiscount());

        OrderPricingHelper.PricingBreakdown negative = OrderPricingHelper.calculate(
                new BigDecimal("100000"), new BigDecimal("-5000"), new BigDecimal("-1"), new BigDecimal("-3"));
        assertMoney("0", negative.getTotalDiscount());
        assertMoney("130000", negative.getFinalAmount()); // 100.000 (đã gồm VAT) + 30.000 ship
        assertMoney("9091", negative.getVatAmount());

        assertMoney("0", ShippingFeeCalculator.calculate(null));
        assertMoney("0", ShippingFeeCalculator.calculate(new BigDecimal("-1")));
        assertMoney("30000", ShippingFeeCalculator.calculate(new BigDecimal("1")));
        assertMoney("30000", ShippingFeeCalculator.calculate(new BigDecimal("499999")));
        assertMoney("0", ShippingFeeCalculator.calculate(new BigDecimal("500000")));
        assertMoney("0", ShippingFeeCalculator.calculate(new BigDecimal("99000000")));
        assertMoney("30000", ShippingFeeCalculator.calculate(new BigDecimal("600000"), new BigDecimal("150000")));
    }

    @Test
    @DisplayName("TC_PH3_PRICE_03: Giảm giá vượt tạm tính -> phần chịu thuế = 0, chỉ còn phí ship; điểm quy đổi bị chặn bởi số tiền còn phải trả; trích giảm giá từ kết quả voucher")
    void calculate_overDiscount_and_extractors() {
        OrderPricingHelper.PricingBreakdown over = OrderPricingHelper.calculate(
                new BigDecimal("200000"), new BigDecimal("300000"), BigDecimal.ZERO, BigDecimal.ZERO);
        assertMoney("0", over.getVatAmount());
        assertMoney("30000", over.getFinalAmount());

        assertMoney("150000", OrderPricingHelper.calculatePointDiscount(300, new BigDecimal("150000")));
        assertMoney("100000", OrderPricingHelper.calculatePointDiscount(100, new BigDecimal("150000")));
        assertMoney("0", OrderPricingHelper.calculatePointDiscount(0, new BigDecimal("150000")));

        PromotionClient.VoucherApplyResult both = PromotionClient.VoucherApplyResult.builder()
                .discountAmount(new BigDecimal("80000")).productDiscountAmount(new BigDecimal("50000"))
                .shippingDiscountAmount(new BigDecimal("30000")).build();
        assertMoney("50000", OrderPricingHelper.extractProductDiscount(both));
        assertMoney("30000", OrderPricingHelper.extractShippingDiscount(both));

        PromotionClient.VoucherApplyResult legacy = PromotionClient.VoucherApplyResult.builder()
                .discountAmount(new BigDecimal("70000")).build();
        assertMoney("70000", OrderPricingHelper.extractProductDiscount(legacy));
        assertMoney("0", OrderPricingHelper.extractShippingDiscount(legacy));
        assertMoney("0", OrderPricingHelper.extractProductDiscount(null));
    }
}
