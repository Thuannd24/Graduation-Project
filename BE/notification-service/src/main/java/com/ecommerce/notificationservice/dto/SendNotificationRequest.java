package com.ecommerce.notificationservice.dto;

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
    /** Raw HTML/text when templateId is not used. */
    private String content;
    /** Template code in MongoDB notification_templates, e.g. welcome_template. */
    private String templateId;
    /** Placeholder values for {{key}} substitution in template or raw content. */
    private Map<String, String> templateVariables;
}
