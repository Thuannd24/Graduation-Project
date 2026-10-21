package com.ecommerce.paymentservice.service;

import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.PaymentConfigResponse;
import com.ecommerce.paymentservice.dto.PaymentStatusResponse;
import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.dto.RefundResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;

public interface PaymentService {
    PaymentInitiateResponse initiatePayment(PaymentInitiateRequest request);
    String verifyVnPayCallback(Map<String, String> queryParams);
    RefundResponse processRefund(RefundRequest request);
    void cancelExpiredPayments();
    void initiateAutoRefund(Long orderId);
    void processPendingRefunds();
    Page<PaymentResponse> getAllPayments(Pageable pageable);
    PaymentResponse getPaymentByOrderId(Long orderId, String callerUserId, boolean isAdminOrStaff);

    /** Trạng thái thanh toán thật (theo DB) của đơn - chỉ chủ đơn hoặc admin/staff. */
    PaymentStatusResponse getPaymentStatus(Long orderId, String callerUserId, boolean isAdminOrStaff);

    PaymentConfigResponse getPaymentConfig();
}
