package com.ecommerce.userservice.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * PH1 - Quy tắc tích / đổi điểm thưởng (domain thuần, không cần mock).
 */
class LoyaltyPointPolicyTest {

    @Test
    @DisplayName("TC_PH1_POLICY_01: Hệ số nhân điểm theo hạng MEMBER/SILVER/GOLD/VIP, không phân biệt hoa thường, null/không rõ = 1.0")
    void tierMultiplier_allTiers() {
        assertEquals(1.0, LoyaltyPointPolicy.tierMultiplier("MEMBER"));
        assertEquals(1.2, LoyaltyPointPolicy.tierMultiplier("SILVER"));
        assertEquals(1.5, LoyaltyPointPolicy.tierMultiplier("gold"));
        assertEquals(2.0, LoyaltyPointPolicy.tierMultiplier("VIP"));
        assertEquals(1.0, LoyaltyPointPolicy.tierMultiplier(null));
        assertEquals(1.0, LoyaltyPointPolicy.tierMultiplier("DIAMOND"));
    }

    @Test
    @DisplayName("TC_PH1_POLICY_02: Tích điểm theo giá trị đơn: 10.000đ = 1 điểm, làm tròn xuống, nhân hệ số hạng; đơn <=0 hoặc null = 0 điểm")
    void calculateEarnFromOrderSpend_rules() {
        // 1.250.000 / 10.000 = 125 điểm cơ bản x 1.5 (GOLD) = 187.5 -> 187
        assertEquals(187, LoyaltyPointPolicy.calculateEarnFromOrderSpend(new BigDecimal("1250000"), "GOLD"));
        // biên: 9.999đ chưa đủ 1 điểm
        assertEquals(0, LoyaltyPointPolicy.calculateEarnFromOrderSpend(new BigDecimal("9999"), "VIP"));
        // biên: đúng 10.000đ = 1 điểm (MEMBER)
        assertEquals(1, LoyaltyPointPolicy.calculateEarnFromOrderSpend(new BigDecimal("10000"), "MEMBER"));
        assertEquals(0, LoyaltyPointPolicy.calculateEarnFromOrderSpend(BigDecimal.ZERO, "VIP"));
        assertEquals(0, LoyaltyPointPolicy.calculateEarnFromOrderSpend(new BigDecimal("-50000"), "VIP"));
        assertEquals(0, LoyaltyPointPolicy.calculateEarnFromOrderSpend(null, "VIP"));
    }

    @Test
    @DisplayName("TC_PH1_POLICY_03: Số điểm đổi tối đa = min(số dư, giá trị đơn/1.000) và quy đổi 1 điểm = 1.000đ")
    void maxRedeemable_and_discount() {
        assertEquals(300, LoyaltyPointPolicy.calculateMaxRedeemablePoints(500, new BigDecimal("300000")));
        assertEquals(500, LoyaltyPointPolicy.calculateMaxRedeemablePoints(500, new BigDecimal("2000000")));
        assertEquals(0, LoyaltyPointPolicy.calculateMaxRedeemablePoints(0, new BigDecimal("300000")));
        assertEquals(0, LoyaltyPointPolicy.calculateMaxRedeemablePoints(500, null));
        assertEquals(0, LoyaltyPointPolicy.calculateMaxRedeemablePoints(500, new BigDecimal("999")));

        assertEquals(0, new BigDecimal("200000").compareTo(LoyaltyPointPolicy.calculateDiscountFromPoints(200)));
        assertEquals(0, BigDecimal.ZERO.compareTo(LoyaltyPointPolicy.calculateDiscountFromPoints(0)));
        assertEquals(0, BigDecimal.ZERO.compareTo(LoyaltyPointPolicy.calculateDiscountFromPoints(-5)));
    }
}
