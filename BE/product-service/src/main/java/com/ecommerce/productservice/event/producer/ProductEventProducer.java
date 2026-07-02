package com.ecommerce.productservice.event.producer;

import com.ecommerce.productservice.entity.ProductReview;
import com.ecommerce.productservice.event.ProductReviewedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class ProductEventProducer {

    private static final String TOPIC = "product-reviewed-events";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public void publishProductReviewed(ProductReview review) {
        try {
            ProductReviewedEvent event = ProductReviewedEvent.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("ProductReviewedEvent")
                    .timestamp(LocalDateTime.now().toString())
                    .reviewId(review.getId())
                    .userId(review.getUserId())
                    .productId(review.getProductId())
                    .orderId(review.getOrderId())
                    .rating(review.getRating())
                    .build();

            String payload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(TOPIC, String.valueOf(review.getProductId()), payload);
            log.info("Published ProductReviewedEvent reviewId={} to {}", review.getId(), TOPIC);
        } catch (Exception e) {
            log.error("Failed to publish ProductReviewedEvent reviewId={}: {}", review.getId(), e.getMessage());
        }
    }
}
