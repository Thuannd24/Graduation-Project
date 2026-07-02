package com.ecommerce.notificationservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FCMTokenRequest {
    private String fcmToken;
    private String platform;
    private String deviceId;
}
