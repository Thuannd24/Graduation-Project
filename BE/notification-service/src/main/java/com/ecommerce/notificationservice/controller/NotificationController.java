package com.ecommerce.notificationservice.controller;

import com.ecommerce.notificationservice.dto.ApiResponse;
import com.ecommerce.notificationservice.dto.FCMTokenRequest;
import com.ecommerce.notificationservice.dto.NotificationDto;
import com.ecommerce.notificationservice.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public ApiResponse<List<NotificationDto>> getNotifications(@RequestHeader("X-User-Id") String userId) {
        return ApiResponse.success(notificationService.getNotificationsByUser(userId));
    }

    @PostMapping("/fcm-token")
    public ApiResponse<Void> registerFcmToken(
            @RequestHeader("X-User-Id") String userId,
            @RequestBody FCMTokenRequest request) {
        notificationService.registerFcmToken(userId, request.getFcmToken(), request.getPlatform(), request.getDeviceId());
        return ApiResponse.success(null);
    }
}
