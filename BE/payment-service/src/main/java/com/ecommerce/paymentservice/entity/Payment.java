package com.ecommerce.paymentservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "payments")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "user_id", length = 100)
    private String userId;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "txn_ref", unique = true, nullable = false, length = 100)
    private String txnRef; // Unique transaction reference code

    @Column(name = "gateway_txn_id", length = 100)
    private String gatewayTxnId; // Gateway transaction code (e.g. from VNPAY)

    @Column(name = "payment_method", nullable = false, length = 50)
    private String paymentMethod; // VNPAY, COD, etc.

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 10)
    @Builder.Default
    private String currency = "VND";

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "PENDING"; // PENDING, SUCCESS, FAILED, REFUNDED

    @Column(name = "failure_code", length = 50)
    private String failureCode;

    @Column(name = "gateway_response", columnDefinition = "TEXT")
    private String gatewayResponse;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    /**
     * Thời điểm của lần khởi tạo thanh toán gần nhất. Bản ghi Payment được dùng lại khi khách thanh toán
     * lại / đổi sang COD, nên hạn của một lượt VNPay phải tính từ đây chứ không phải {@code createdAt}.
     * Null với dữ liệu cũ (khi đó dùng createdAt).
     */
    @Column(name = "attempt_at")
    private LocalDateTime attemptAt;

    /**
     * Mã giao dịch VNPay của các lượt trước đã bị thay khi khách thanh toán lại / đổi sang COD
     * (phân tách bằng dấu phẩy). Khách vẫn có thể hoàn tất trang VNPay cũ -> IPN của mã cũ phải
     * được ghi nhận (hoặc hoàn tiền nếu trả trùng), không được bỏ qua.
     */
    @Column(name = "previous_txn_refs", columnDefinition = "TEXT")
    private String previousTxnRefs;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        if (this.currency == null) this.currency = "VND";
        if (this.status == null) this.status = "PENDING";
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
