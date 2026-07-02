package com.ecommerce.userservice.dto.request;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class PointUpdateRequest {

    /**
     * FIXED: số điểm cộng/trừ trực tiếp (bắt buộc khác 0).
     * ORDER_SPEND: điểm thưởng cộng thêm (bonus), có thể = 0.
     */
    private Integer pointAmount;

    /**
     * FIXED — dùng {@link #pointAmount} từ chiến dịch.
     * ORDER_SPEND — tính từ orderAmount theo quy tắc 10.000 VND = 1 điểm × hệ số hạng.
     */
    private String calculationMode = "FIXED";

    /** Giá trị đơn hàng thực tế (sau giảm giá) — bắt buộc khi calculationMode = ORDER_SPEND. */
    private BigDecimal orderAmount;

    private Long orderId;
    private Long campaignId;

    /** CAMPAIGN | ORDER | MANUAL | REDEMPTION */
    private String sourceType = "CAMPAIGN";

    private String reason;
}
