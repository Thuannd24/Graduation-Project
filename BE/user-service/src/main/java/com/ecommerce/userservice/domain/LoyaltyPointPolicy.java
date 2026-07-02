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
}
