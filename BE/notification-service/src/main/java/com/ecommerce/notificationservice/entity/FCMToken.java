package com.ecommerce.notificationservice.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "fcm_tokens")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FCMToken {

    @Id
    private String id;
    private String userId;
    private String token;
    private String platform; // IOS, ANDROID, WEB
    private String deviceId;
    private LocalDateTime lastUsedAt;
}
