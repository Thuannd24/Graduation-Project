package com.ecommerce.notificationservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationDto {

    private String id;
    private String userId;
    private Long orderId;
    private String eventType;
    private List<String> channels;
    private String recipient;
    private String subject;
    private String content;
    private String status;
    private LocalDateTime createdAt;
}
