package com.ecommerce.notificationservice.service;

import com.ecommerce.notificationservice.dto.NotificationDto;
import com.ecommerce.notificationservice.dto.SendNotificationRequest;

import java.util.List;

public interface NotificationService {

    void sendNotification(SendNotificationRequest request);

    void sendNotification(String userId, String email, Long orderId, String eventType, String subject, String content);

    List<NotificationDto> getNotificationsByUser(String userId);

    void registerFcmToken(String userId, String token, String platform, String deviceId);
}
