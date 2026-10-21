package com.ecommerce.orderservice.support;

import java.math.BigDecimal;

/**
 * Phí ship do server tính — không tin giá trị client gửi lên.
 *
 * <p>Quy tắc (cố định, không gọi API hãng vận chuyển): 30.000đ/đơn; MIỄN PHÍ khi giá trị hàng sau giảm giá
 * sản phẩm (voucher) từ {@link #FREE_SHIPPING_THRESHOLD} trở lên. Giỏ trống thì phí 0.
 */
public final class ShippingFeeCalculator {

    public static final BigDecimal DEFAULT_SHIPPING_FEE = BigDecimal.valueOf(30_000);
    /** Ngưỡng miễn phí vận chuyển: giá trị hàng (sau giảm giá sản phẩm) >= 500.000đ. */
    public static final BigDecimal FREE_SHIPPING_THRESHOLD = BigDecimal.valueOf(500_000);

    private ShippingFeeCalculator() {
    }

    /** Phí ship khi chưa có giảm giá sản phẩm (giá trị hàng = tạm tính). */
    public static BigDecimal calculate(BigDecimal orderSubtotal) {
        return calculate(orderSubtotal, BigDecimal.ZERO);
    }

    /**
     * @param orderSubtotal   tạm tính giỏ hàng (<= 0 nghĩa là giỏ trống -> không tính phí)
     * @param productDiscount giảm giá sản phẩm từ voucher (không tính giảm phí ship, không tính điểm)
     */
    public static BigDecimal calculate(BigDecimal orderSubtotal, BigDecimal productDiscount) {
        if (orderSubtotal == null || orderSubtotal.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal discount = productDiscount == null || productDiscount.signum() < 0 ? BigDecimal.ZERO : productDiscount;
        BigDecimal goodsValue = orderSubtotal.subtract(discount).max(BigDecimal.ZERO);
        if (goodsValue.compareTo(FREE_SHIPPING_THRESHOLD) >= 0) {
            return BigDecimal.ZERO;
        }
        return DEFAULT_SHIPPING_FEE;
    }
}
