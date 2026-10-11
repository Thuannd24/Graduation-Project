package com.ecommerce.productservice.event.producer;

import com.ecommerce.productservice.event.ProductViewedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Nguồn ghi nhận hành vi "xem sản phẩm" cho pipeline churn-risk detection (xem
 * docs/canvas/churn-risk-implementation-plan.md Phase 2). Consumer là
 * forecast-service/app/kafka/behavior_consumer.py (Phase 4).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProductViewEventProducer {

    private static final String TOPIC = "product-viewed-events";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void publishProductViewed(Long productId, Long categoryId, String userId, String sessionId) {
        try {
            ProductViewedEvent event = ProductViewedEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("ProductViewedEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .userId(userId)
                    .sessionId(sessionId)
                    .productId(productId)
                    .categoryId(categoryId)
                    .build();

            String payload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(TOPIC, String.valueOf(productId), payload);
            log.debug("Published ProductViewedEvent productId={} userId={} to {}", productId, userId, TOPIC);
        } catch (Exception e) {
            // Fire-and-forget: lỗi publish hành vi không được phép làm hỏng response xem sản phẩm.
            log.error("Failed to publish ProductViewedEvent productId={}: {}", productId, e.getMessage());
        }
    }
}
