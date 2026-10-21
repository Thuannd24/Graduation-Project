package com.ecommerce.paymentservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Trạng thái thanh toán thật của một đơn (lấy từ DB), dùng cho trang kết quả thanh toán thay vì tin tham số
 * trên URL (UI_PH5_FR02_004, UI_PH5_FR02_007).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentStatusResponse {
    private Long orderId;
    /** Trạng thái đơn bên order-service (null nếu tạm thời không tra được). */
    private String orderStatus;
    private Long paymentId;
    private String paymentMethod;
    /** NOT_INITIATED, PENDING, SUCCESS, FAILED, EXPIRED, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED. */
    private String paymentStatus;
    /** Kết quả rút gọn cho giao diện: SUCCESS, FAILED, PENDING, REFUNDED, NOT_INITIATED. */
    private String result;
    private String failureCode;
    private String message;
    private BigDecimal amount;
    private LocalDateTime paidAt;
    /** Còn được thanh toán lại qua VNPay (đơn vẫn chờ thanh toán và chưa trả tiền thành công). */
    private boolean canRetry;
    /** Còn được đổi sang COD (như canRetry và số tiền không vượt hạn mức COD). */
    private boolean canSwitchToCod;
    private BigDecimal codMaxAmount;
}
