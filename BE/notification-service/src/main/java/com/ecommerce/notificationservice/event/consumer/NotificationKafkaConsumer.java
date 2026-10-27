package com.ecommerce.notificationservice.event.consumer;

import com.ecommerce.notificationservice.dto.SendNotificationRequest;
import com.ecommerce.notificationservice.repository.NotificationRepository;
import com.ecommerce.notificationservice.service.NotificationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.ecommerce.notificationservice.util.TemplateRenderer;
import org.springframework.beans.factory.annotation.Value;
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

    /** Mailbox of the support team; offline chat messages are forwarded here. */
    @Value("${app.brand.support-email:}")
    private String supportEmail;

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
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("order_confirmed_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("OrderCancelledEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("order_cancelled_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("OrderShippedEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("order_shipped_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("OrderDeliveredEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("order_delivered_template")
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
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("payment_success_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("PaymentFailedEvent".equalsIgnoreCase(eventType)) {
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("payment_failed_template")
                        .build();
                notificationService.sendNotification(request);
            } else if ("RefundCompletedEvent".equalsIgnoreCase(eventType)) {
                // Refund confirmation (payment-service publishes this only once money has really
                // moved). Dedup is per (orderId, eventType): a second partial refund of the same
                // order is not e-mailed again.
                SendNotificationRequest request = SendNotificationRequest.builder()
                        .userId(userId)
                        .email(email)
                        .orderId(orderId)
                        .eventType(eventType)
                        .trustedHtmlVariables(EventEmailFragments.build(eventType, payload))
                        .templateId("refund_completed_template")
                        .build();
                notificationService.sendNotification(request);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing payment-event notification: {}", e.getMessage());
            ack.acknowledge();
        }
    }

    /**
     * chat-service publishes SupportChatOfflineEvent (topic notification-events) when a customer
     * writes into a WAITING room while no staff is online. Forward it to the support mailbox so
     * the "đã chuyển tiếp email hỗ trợ" promise in the chat widget is real. One e-mail per room
     * (the messages themselves stay stored in the room for staff to answer).
     */
    @KafkaListener(topics = "notification-events", groupId = "notification-group")
    public void consumeSupportChatEvent(String message, Acknowledgment ack) {
        try {
            JsonNode event = objectMapper.readTree(message);
            if (event.isTextual()) {
                event = objectMapper.readTree(event.asText());
            }
            if (!event.hasNonNull("eventType")
                    || !"SupportChatOfflineEvent".equalsIgnoreCase(event.get("eventType").asText())) {
                ack.acknowledge();
                return;
            }
            JsonNode payload = event.has("payload") ? event.get("payload") : event;
            String roomId = payload.path("roomId").asText("");
            String dedupeKey = "SupportChatOfflineEvent:" + roomId;
            if (roomId.isBlank() || supportEmail == null || supportEmail.isBlank()
                    || notificationRepository.existsByEventType(dedupeKey)) {
                ack.acknowledge();
                return;
            }
            String customerName = payload.path("customerName").asText("Khách hàng");
            String customerEmail = payload.path("customerEmail").asText("");
            String content = payload.path("content").asText("");
            String body = "<p>Khách hàng <strong>" + TemplateRenderer.escapeHtml(customerName) + "</strong>"
                    + (customerEmail.isBlank() ? "" : " (" + TemplateRenderer.escapeHtml(customerEmail) + ")")
                    + " đã nhắn tin khi không có nhân viên trực tuyến.</p>"
                    + "<blockquote style=\"border-left:3px solid #94a3b8;padding-left:12px;color:#334155;\">"
                    + TemplateRenderer.escapeHtml(content) + "</blockquote>"
                    + "<p>Phòng chat <code>" + TemplateRenderer.escapeHtml(roomId) + "</code> đang ở trạng thái"
                    + " <strong>WAITING</strong>; toàn bộ tin nhắn được lưu trong phòng. Vui lòng nhận phòng"
                    + " trong trang quản trị Chat hỗ trợ để phản hồi.</p>";
            notificationService.sendNotification("support", supportEmail, null, dedupeKey,
                    "[Hỗ trợ] Tin nhắn chờ phản hồi từ " + customerName, body);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error processing notification-events message: {}", e.getMessage());
            ack.acknowledge();
        }
    }
}
