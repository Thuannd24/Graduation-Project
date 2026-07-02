package com.ecommerce.paymentservice.service;

import com.ecommerce.paymentservice.dto.PaymentInitiateRequest;
import com.ecommerce.paymentservice.dto.PaymentInitiateResponse;
import com.ecommerce.paymentservice.dto.PaymentResponse;
import com.ecommerce.paymentservice.dto.RefundRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;

public interface PaymentService {
    PaymentInitiateResponse initiatePayment(PaymentInitiateRequest request);
    String verifyVnPayCallback(Map<String, String> queryParams);
    void processRefund(RefundRequest request);
    void cancelExpiredPayments();
    Page<PaymentResponse> getAllPayments(Pageable pageable);
    PaymentResponse getPaymentByOrderId(Long orderId);
}
