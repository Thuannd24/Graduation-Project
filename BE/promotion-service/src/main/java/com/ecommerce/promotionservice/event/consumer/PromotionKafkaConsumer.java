package com.ecommerce.promotionservice.event.consumer;

import com.ecommerce.promotionservice.service.CampaignTriggerService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class PromotionKafkaConsumer {

    private final CampaignTriggerService campaignTriggerService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "user-created-events", groupId = "promotion-service-group")
    public void consumeUserCreated(String message, Acknowledgment ack) {
        log.info("[Promotion] user-created-events: {}", message);
        try {
            JsonNode payload = objectMapper.readTree(message);
            String eventType = textOr(payload, "eventType", "UserRegisteredEvent");
            if (!"UserRegisteredEvent".equalsIgnoreCase(eventType)) {
                ack.acknowledge();
                return;
            }

            Map<String, Object> variables = new HashMap<>();
            if (payload.has("userId")) {
                variables.put("userDbId", payload.get("userId").asLong());
                variables.put("userId", payload.get("userId").asText());
            }
            putIfPresent(payload, variables, "keycloakUserId");
            putIfPresent(payload, variables, "email");
            putIfPresent(payload, variables, "phone");

            campaignTriggerService.triggerByEventType("Trigger_Event_NewUser", variables);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process user-created-events: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }

    @KafkaListener(topics = "payment-events", groupId = "promotion-service-group")
    public void consumePaymentEvent(String message, Acknowledgment ack) {
        log.info("[Promotion] payment-events: {}", message);
        try {
            JsonNode payload = objectMapper.readTree(message);
            if (payload.isTextual()) {
                payload = objectMapper.readTree(payload.asText());
            }
            String eventType = textOr(payload, "eventType", "");
            if (!"PaymentSuccessEvent".equalsIgnoreCase(eventType)) {
                ack.acknowledge();
                return;
            }

            Map<String, Object> variables = new HashMap<>();
            if (payload.has("orderId")) {
                variables.put("orderId", payload.get("orderId").asLong());
            }
            putIfPresent(payload, variables, "userId");
            putIfPresent(payload, variables, "email");
            if (payload.has("amount")) {
                variables.put("amount", payload.get("amount").decimalValue());
                variables.put("totalAmount", payload.get("amount").decimalValue());
                variables.put("finalAmount", payload.get("amount").decimalValue());
            }

            campaignTriggerService.triggerByEventType("Trigger_Event_OrderSuccess", variables);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process payment-events: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }

    @KafkaListener(topics = "order-events", groupId = "promotion-service-group")
    public void consumeOrderEvent(String message, Acknowledgment ack) {
        try {
            JsonNode payload = objectMapper.readTree(message);
            if (payload.isTextual()) {
                payload = objectMapper.readTree(payload.asText());
            }
            String eventType = textOr(payload, "eventType", "");
            if (!"OrderConfirmedEvent".equalsIgnoreCase(eventType)) {
                ack.acknowledge();
                return;
            }

            log.info("[Promotion] order-events OrderConfirmedEvent: orderId={}",
                    payload.has("orderId") ? payload.get("orderId").asLong() : null);

            Map<String, Object> variables = new HashMap<>();
            if (payload.has("orderId")) {
                variables.put("orderId", payload.get("orderId").asLong());
            }
            putIfPresent(payload, variables, "userId");
            putIfPresent(payload, variables, "email");

            campaignTriggerService.triggerByEventType("Trigger_Event_OrderSuccess", variables);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process order-events: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }

    @KafkaListener(topics = "product-reviewed-events", groupId = "promotion-service-group")
    public void consumeProductReviewed(String message, Acknowledgment ack) {
        log.info("[Promotion] product-reviewed-events: {}", message);
        try {
            JsonNode payload = objectMapper.readTree(message);
            String eventType = textOr(payload, "eventType", "ProductReviewedEvent");
            if (!"ProductReviewedEvent".equalsIgnoreCase(eventType)) {
                ack.acknowledge();
                return;
            }

            Map<String, Object> variables = new HashMap<>();
            if (payload.has("reviewId")) {
                variables.put("reviewId", payload.get("reviewId").asLong());
            }
            if (payload.has("productId")) {
                variables.put("productId", payload.get("productId").asLong());
            }
            if (payload.has("rating")) {
                variables.put("rating", payload.get("rating").asInt());
            }
            putIfPresent(payload, variables, "userId");

            campaignTriggerService.triggerByEventType("Trigger_Event_ReviewProduct", variables);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process product-reviewed-events: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }

    /**
     * Sự kiện AI phát hiện nguy cơ rời bỏ (forecast-service/app/kafka/risk_producer.py, xem
     * docs/canvas/churn-risk-implementation-plan.md Phase 6-7). `eventUniqueId` do phía AI tự
     * sinh dạng "{userId}:{yyyyMMdd}" để chống trigger trùng trong ngày — bắt buộc phải truyền
     * xuống variables để CampaignTriggerService.resolveEventUniqueId() đọc lại được.
     */
    @KafkaListener(topics = "user-risk-events", groupId = "promotion-service-group")
    public void consumeUserRiskEvent(String message, Acknowledgment ack) {
        log.info("[Promotion] user-risk-events: {}", message);
        try {
            JsonNode payload = objectMapper.readTree(message);
            String eventType = textOr(payload, "eventType", "");
            if (!"ChurnRiskDetectedEvent".equalsIgnoreCase(eventType)) {
                ack.acknowledge();
                return;
            }

            Map<String, Object> variables = new HashMap<>();
            putIfPresent(payload, variables, "userId");
            putIfPresent(payload, variables, "segment");
            putIfPresent(payload, variables, "eventUniqueId");
            if (payload.has("churnProbability")) {
                variables.put("churnProbability", payload.get("churnProbability").asDouble());
            }
            if (payload.has("daysSinceLastActivity")) {
                variables.put("daysSinceLastActivity", payload.get("daysSinceLastActivity").asDouble());
            }
            if (payload.has("cartAbandonCount")) {
                variables.put("cartAbandonCount", payload.get("cartAbandonCount").asDouble());
            }
            // Xếp hạng theo tổn thất kỳ vọng (churnProbability x monetary) do phía AI tính, đưa
            // xuống để admin dựng nhánh điều kiện trong BPMN theo GIÁ TRỊ khách hàng chứ không chỉ
            // theo xác suất churn — vd expectedLoss cao thì voucher lớn, thấp thì chỉ email nhắc.
            if (payload.has("monetary")) {
                variables.put("monetary", payload.get("monetary").asDouble());
            }
            if (payload.has("expectedLoss")) {
                variables.put("expectedLoss", payload.get("expectedLoss").asDouble());
            }
            if (payload.has("riskRank")) {
                variables.put("riskRank", payload.get("riskRank").asInt());
            }

            campaignTriggerService.triggerByEventType("Trigger_Event_ChurnRisk", variables);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Failed to process user-risk-events: {}", e.getMessage(), e);
            ack.acknowledge();
        }
    }

    private void putIfPresent(JsonNode payload, Map<String, Object> variables, String field) {
        if (payload.has(field) && !payload.get(field).isNull()) {
            variables.put(field, payload.get(field).asText());
        }
    }

    private String textOr(JsonNode payload, String field, String defaultValue) {
        return payload.has(field) ? payload.get(field).asText() : defaultValue;
    }
}
