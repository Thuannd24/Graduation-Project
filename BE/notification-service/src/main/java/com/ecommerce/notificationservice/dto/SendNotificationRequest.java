package com.ecommerce.notificationservice.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
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
    /**
     * HTML fragments built by notification-service itself (order item table, tracking box),
     * inserted into the e-mail body without escaping. Never read from JSON, so callers of the
     * internal API cannot inject markup through it.
     */
    @JsonIgnore
    private Map<String, String> trustedHtmlVariables;
}
