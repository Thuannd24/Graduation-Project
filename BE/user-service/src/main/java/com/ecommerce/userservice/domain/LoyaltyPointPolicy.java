package com.ecommerce.userservice.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Quy tắc tích/lũy điểm thưởng chuẩn của hệ thống.
 *
 * <ul>
 *   <li>Tích điểm: mỗi {@link #VND_PER_EARN_POINT} VND chi tiêu thực tế = 1 điểm cơ bản</li>
 *   <li>Hệ số nhân theo hạng thành viên (MEMBER → VIP)</li>
 *   <li>Quy đổi: 1 điểm = {@link #VND_PER_REDEEM_POINT} VND khi thanh toán (tham chiếu nghiệp vụ)</li>
 * </ul>
 */
public final class LoyaltyPointPolicy {

    public static final BigDecimal VND_PER_EARN_POINT = new BigDecimal("10000");
    public static final BigDecimal VND_PER_REDEEM_POINT = new BigDecimal("1000");

    public static final String MODE_FIXED = "FIXED";
    public static final String MODE_ORDER_SPEND = "ORDER_SPEND";

    public static final String SOURCE_REDEMPTION = "REDEMPTION";
    public static final String SOURCE_REFUND = "REFUND";

    private LoyaltyPointPolicy() {
    }

    public static double tierMultiplier(String customerTier) {
        if (customerTier == null) {
            return 1.0;
        }
        return switch (customerTier.toUpperCase()) {
            case "SILVER" -> 1.2;
            case "GOLD" -> 1.5;
            case "VIP" -> 2.0;
            case "DIAMOND" -> 2.5;
            default -> 1.0; // MEMBER, BRONZE, ...
        };
    }

    /**
     * Tính điểm tích lũy từ giá trị đơn hàng (sau giảm giá).
     */
    public static int calculateEarnFromOrderSpend(BigDecimal orderAmount, String customerTier) {
        if (orderAmount == null || orderAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return 0;
        }
        int basePoints = orderAmount
                .divide(VND_PER_EARN_POINT, 0, RoundingMode.DOWN)
                .intValue();
        return (int) Math.floor(basePoints * tierMultiplier(customerTier));
    }

    /** Số điểm tối đa có thể dùng cho một đơn (giới hạn bởi số dư và giá trị đơn). */
    public static int calculateMaxRedeemablePoints(int balance, BigDecimal payableAmount) {
        if (balance <= 0 || payableAmount == null || payableAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return 0;
        }
        int maxByAmount = payableAmount.divide(VND_PER_REDEEM_POINT, 0, RoundingMode.DOWN).intValue();
        return Math.min(balance, maxByAmount);
    }

    /** Quy đổi điểm sang số tiền giảm (VND). */
    public static BigDecimal calculateDiscountFromPoints(int points) {
        if (points <= 0) {
            return BigDecimal.ZERO;
        }
        return VND_PER_REDEEM_POINT.multiply(BigDecimal.valueOf(points));
    }
}
