package com.ecommerce.notificationservice.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Document(collection = "notifications")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    private String id;

    private String userId;

    private Long orderId;

    private String eventType;

    private List<String> channels; // EMAIL, PUSH

    private String recipient; // Email address or FCM device token

    private String subject;

    private String content;

    private String status; // PENDING, SENT, FAILED

    private String deliveryResults;

    @Builder.Default
    private Integer retryCount = 0;

    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
