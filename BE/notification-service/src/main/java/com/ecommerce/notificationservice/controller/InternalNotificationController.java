package com.ecommerce.notificationservice.controller;

import com.ecommerce.notificationservice.dto.ApiResponse;
import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/internal/notifications")
@RequiredArgsConstructor
@Slf4j
public class InternalNotificationController {

    private final NotificationService notificationService;

    @PostMapping("/send")
    public ApiResponse<Void> send(@RequestBody SendNotificationRequest request) {
        log.info("Internal send notification userId={} eventType={} templateId={}",
                request.getUserId(), request.getEventType(), request.getTemplateId());
        notificationService.sendNotification(request);
        return ApiResponse.success(null);
    }
}
