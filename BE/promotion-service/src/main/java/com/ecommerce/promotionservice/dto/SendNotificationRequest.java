package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SendNotificationRequest {
    private String userId;
    private String email;
    private Long orderId;
    private String eventType;
    private String subject;
    private String content;
    private String templateId;
    private Map<String, String> templateVariables;
}
