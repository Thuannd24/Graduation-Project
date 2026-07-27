package com.ecommerce.orderservice.event.producer;

import com.ecommerce.orderservice.event.CartUpdatedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Wire DTO {@link CartUpdatedEvent} (đã tồn tại từ trước, chưa từng được publish) lên Kafka cho
 * pipeline churn-risk detection (xem docs/canvas/churn-risk-implementation-plan.md Phase 2).
 * Consumer là forecast-service/app/kafka/behavior_consumer.py (Phase 4).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CartEventProducer {

    private static final String TOPIC = "cart-updated-events";

    // Giá trị mặc định của header X-User-Id khi khách chưa đăng nhập (CartController) — mọi
    // khách vãng lai dùng chung literal này, publish sẽ chỉ gây nhiễu Kafka mà không gắn được
    // với 1 user cụ thể nào, nên chủ động bỏ qua thay vì ghi nhận sai.
    private static final String ANONYMOUS_USER_ID = "anonymous";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void publishCartUpdated(String userId, Long productId, Long variantId, Integer quantity, String action) {
        if (userId == null || userId.isBlank() || ANONYMOUS_USER_ID.equals(userId)) {
            log.debug("Skip publishing CartUpdatedEvent: no real user identity (action={}, productId={})",
                    action, productId);
            return;
        }

        try {
            CartUpdatedEvent event = CartUpdatedEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("CartUpdatedEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .userId(userId)
                    .sessionId(null)
                    .productId(productId)
                    .variantId(variantId)
                    .quantity(quantity)
                    .action(action)
                    .build();

            String payload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(TOPIC, userId, payload);
            log.debug("Published CartUpdatedEvent userId={} action={} productId={} to {}",
                    userId, action, productId, TOPIC);
        } catch (Exception e) {
            // Fire-and-forget: lỗi publish hành vi không được phép làm hỏng thao tác giỏ hàng thật.
            log.error("Failed to publish CartUpdatedEvent userId={} action={}: {}", userId, action, e.getMessage());
        }
    }
}
