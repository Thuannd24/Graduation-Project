package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.dto.response.WarrantyOtpResponse;

public interface WarrantyOtpService {

    WarrantyOtpResponse requestOtp(String phoneNumber, String clientIp);

    void verifyOtpOrThrow(String phoneNumber, String otp);
}
