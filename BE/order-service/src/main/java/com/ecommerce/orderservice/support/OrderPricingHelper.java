package com.ecommerce.orderservice.support;

import com.ecommerce.orderservice.client.PromotionClient;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class OrderPricingHelper {

    public static final BigDecimal VAT_RATE = new BigDecimal("0.10");
    public static final BigDecimal POINTS_TO_VND = new BigDecimal("1000");

    private OrderPricingHelper() {
    }

    @Data
    @Builder
    public static class PricingBreakdown {
        private BigDecimal subtotal;
        private BigDecimal productDiscount;
        private BigDecimal shippingDiscount;
        private BigDecimal pointDiscount;
        private BigDecimal shippingFee;
        private BigDecimal vatAmount;
        private BigDecimal totalDiscount;
        private BigDecimal finalAmount;
    }

    public static PricingBreakdown calculate(
            BigDecimal subtotal,
            BigDecimal productDiscount,
            BigDecimal shippingDiscount,
            BigDecimal pointDiscount) {

        BigDecimal safeSubtotal = nonNegative(subtotal);
        BigDecimal productDisc = nonNegative(productDiscount);
        BigDecimal shipDisc = nonNegative(shippingDiscount);
        BigDecimal pointDisc = nonNegative(pointDiscount);

        BigDecimal shippingFee = ShippingFeeCalculator.calculate(safeSubtotal);
        BigDecimal taxable = safeSubtotal.subtract(productDisc).subtract(pointDisc).max(BigDecimal.ZERO);
        BigDecimal vat = taxable.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP);
        BigDecimal finalAmount = taxable.add(vat).add(shippingFee).subtract(shipDisc).max(BigDecimal.ZERO);
        BigDecimal totalDiscount = productDisc.add(shipDisc).add(pointDisc);

        return PricingBreakdown.builder()
                .subtotal(safeSubtotal)
                .productDiscount(productDisc)
                .shippingDiscount(shipDisc)
                .pointDiscount(pointDisc)
                .shippingFee(shippingFee)
                .vatAmount(vat)
                .totalDiscount(totalDiscount)
                .finalAmount(finalAmount)
                .build();
    }

    public static BigDecimal extractProductDiscount(PromotionClient.VoucherApplyResult result) {
        if (result == null) {
            return BigDecimal.ZERO;
        }
        if (result.getProductDiscountAmount() != null) {
            return nonNegative(result.getProductDiscountAmount());
        }
        return nonNegative(result.getDiscountAmount());
    }

    public static BigDecimal extractShippingDiscount(PromotionClient.VoucherApplyResult result) {
        if (result == null || result.getShippingDiscountAmount() == null) {
            return BigDecimal.ZERO;
        }
        return nonNegative(result.getShippingDiscountAmount());
    }

    public static BigDecimal calculatePointDiscount(int pointsToRedeem, BigDecimal payableAfterProductDiscount) {
        if (pointsToRedeem <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal raw = POINTS_TO_VND.multiply(BigDecimal.valueOf(pointsToRedeem));
        return raw.min(nonNegative(payableAfterProductDiscount));
    }

    private static BigDecimal nonNegative(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO;
        }
        return value;
    }
}
