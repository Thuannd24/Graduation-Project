package com.ecommerce.orderservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WarrantyOtpResponse {
    private String message;
    private int expiresInSeconds;
    /** Chỉ có ở môi trường dev khi bật expose — production không trả OTP. */
    private String devOtp;
}
