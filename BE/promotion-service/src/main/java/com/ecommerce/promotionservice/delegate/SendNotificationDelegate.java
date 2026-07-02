package com.ecommerce.promotionservice.delegate;

import com.ecommerce.promotionservice.client.NotificationClient;
import com.ecommerce.promotionservice.dto.SendNotificationRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Generic notification delegate for:
 * Action_Send_Email, Action_Send_SMS, Action_Send_AppPush, Action_Send_Zalo
 */
@Component("sendEmailDelegate")
@RequiredArgsConstructor
@Slf4j
public class SendNotificationDelegate implements JavaDelegate {

    private static final Set<String> SKIP_TEMPLATE_VARS = Set.of(
            "campaignWorkflowJson", "actionType", "templateId", "rawContent"
    );

    private final NotificationClient notificationClient;

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        String userId = getStr(execution, "userId");
        String email = getStr(execution, "email");
        String actionType = getStr(execution, "actionType");
        String templateId = getStr(execution, "templateId");
        String rawContent = getStr(execution, "rawContent");

        Map<String, String> templateVariables = collectTemplateVariables(execution);

        String subject = "Action_Send_Email".equals(actionType)
                ? "Thông báo khuyến mãi từ E-Commerce"
                : "Thông báo hệ thống";

        Long orderId = null;
        Object orderIdVar = execution.getVariable("orderId");
        if (orderIdVar != null) {
            try {
                orderId = Long.parseLong(orderIdVar.toString());
            } catch (NumberFormatException ignored) {
                // optional
            }
        }

        log.info("[SendNotification] type={} userId={} email={} templateId={}",
                actionType, userId, email, templateId.isBlank() ? "(raw)" : templateId);

        SendNotificationRequest.SendNotificationRequestBuilder requestBuilder = SendNotificationRequest.builder()
                .userId(userId)
                .email(email)
                .orderId(orderId)
                .eventType(actionType != null && !actionType.isBlank() ? actionType : "PromotionCampaignEvent")
                .subject(subject)
                .templateVariables(templateVariables);

        if (!templateId.isBlank()) {
            requestBuilder.templateId(templateId);
        } else {
            requestBuilder.content(rawContent);
        }

        try {
            notificationClient.sendNotification(requestBuilder.build());
            execution.setVariable("notificationSent", true);
            log.info("[SendNotification] Sent via notification-service to user {}", userId);
        } catch (Exception ex) {
            log.error("[SendNotification] Failed to send notification: {}", ex.getMessage());
            execution.setVariable("notificationSent", false);
        }
    }

    private Map<String, String> collectTemplateVariables(DelegateExecution execution) {
        Map<String, String> variables = new HashMap<>();
        for (String name : execution.getVariableNames()) {
            if (SKIP_TEMPLATE_VARS.contains(name)) {
                continue;
            }
            Object value = execution.getVariable(name);
            if (value != null) {
                variables.put(name, value.toString());
            }
        }
        return variables;
    }

    private String getStr(DelegateExecution e, String key) {
        Object v = e.getVariable(key);
        return v != null ? v.toString() : "";
    }
}
