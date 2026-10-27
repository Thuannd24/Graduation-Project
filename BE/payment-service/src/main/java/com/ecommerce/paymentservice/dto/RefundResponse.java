package com.ecommerce.paymentservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Kết quả yêu cầu hoàn tiền của admin - phản ánh đúng kết quả cổng thanh toán, không báo "thành công"
 * khi VNPay chưa xác nhận (UI_PH5_FR03_008).
 *
 * <p>{@code status}:
 * <ul>
 *   <li>SUCCESS - tiền đã được hoàn (VNPay xác nhận ngay, hoặc COD ghi nhận hoàn thủ công);</li>
 *   <li>REFUND_PENDING - đã gửi yêu cầu, cổng chưa xác nhận (lỗi tạm thời), hệ thống sẽ tự thử lại;</li>
 *   <li>PENDING_MANUAL - VNPay từ chối, cần xử lý thủ công.</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RefundResponse {
    private Long refundId;
    private Long paymentId;
    private Long orderId;
    private BigDecimal amount;
    private String status;
    /** Trạng thái Payment sau khi xử lý (SUCCESS, PARTIALLY_REFUNDED, REFUNDED...). */
    private String paymentStatus;
    private String gatewayRefundId;
    private String message;
}
