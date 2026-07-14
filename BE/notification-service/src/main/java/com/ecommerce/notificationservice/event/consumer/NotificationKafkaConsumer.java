package com.ecommerce.notificationservice.event.consumer;

import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.service.NotificationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationKafkaConsumer {

    private final NotificationService notificationService;
    private final NotificationRepository notificationRepository;
    private final ObjectMapper objectMapper;

    // Idempotent consumer (theo BE/CLAUDE.md mục VI.2): Kafka có thể redeliver cùng 1 message
    // (rebalance, retry sau lỗi tạm thời...) — nếu không check, notification-service sẽ gửi email
    // trùng cho cùng 1 (orderId, eventType). Kiểm tra unique key trước khi thực thi.
    private boolean alreadyProcessed(Long orderId, String eventType) {
        boolean exists = notificationRepository.existsByOrderIdAndEventType(orderId, eventType);
        if (exists) {
            log.info("Skip duplicate event: orderId={}, eventType={} đã được xử lý trước đó.", orderId, eventType);
        }
        return exists;
    }

    @KafkaListener(topics = "order-events", groupId = "notification-group")
    public void consumeOrderEvent(String message, Acknowledgment ack) {
        log.info("Received order event message: {}", message);
        try {
            JsonNode payload = objectMapper.readTree(message);
            if (payload.isTextual()) {
                payload = objectMapper.readTree(payload.asText());
            }
            String eventType = payload.get("eventType").asText();
            Long orderId = payload.get("orderId").asLong();
            String userId = payload.has("userId") ? payload.get("userId").asText() : "anonymous";
            String email = payload.has("email") ? payload.get("email").asText() : "";

            if (alreadyProcessed(orderId, eventType)) {
                ack.acknowledge();
                return;
            }

            if ("OrderConfirmedEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .templateId("order_confirmed_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("OrderCancelledEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .templateId("order_cancelled_template")
                        .build();
                notificationService.sendNotification(request);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing order-event notification: {}", e.getMessage());
            // Acknowledge anyway to avoid infinite loop of poisoned messages
            ack.acknowledge();
        }
    }

    @KafkaListener(topics = "payment-events", groupId = "notification-group")
    public void consumePaymentEvent(String message, Acknowledgment ack) {
        log.info("Received payment event message: {}", message);
        try {
            JsonNode payload = objectMapper.readTree(message);
            if (payload.isTextual()) {
                payload = objectMapper.readTree(payload.asText());
            }
            String eventType = payload.get("eventType").asText();
            Long orderId = payload.get("orderId").asLong();
            String userId = payload.has("userId") ? payload.get("userId").asText() : "anonymous";
            String email = payload.has("email") ? payload.get("email").asText() : "";

            if (alreadyProcessed(orderId, eventType)) {
                ack.acknowledge();
                return;
            }

            if ("PaymentSuccessEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .templateId("payment_success_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("PaymentFailedEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .templateId("payment_failed_template")
                        .build();
                notificationService.sendNotification(request);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing payment-event notification: {}", e.getMessage());
            ack.acknowledge();
        }
    }
}
