package com.ecommerce.inventoryservice.kafka.consumer;

import com.ecommerce.inventoryservice.kafka.event.OrderCancelledEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCreatedEvent;
import com.ecommerce.inventoryservice.service.InventoryDeductService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryKafkaConsumer {
    // InventoryKafkaConsumer lắng nghe message từ Kafka topic "order-events" 
    private final InventoryDeductService deductService;
    private final ObjectMapper objectMapper;
    private final RedisTemplate<String, String> redisTemplate;

    @KafkaListener(topics = "order-events", groupId = "inventory-service-group")
    public void consumeOrderEvent(String message, Acknowledgment ack) {
        String lockKey = null;
        try {
            log.info("Received order event: {}", message);

            JsonNode jsonNode = objectMapper.readTree(message);
            if (jsonNode.isTextual()) {
                jsonNode = objectMapper.readTree(jsonNode.asText());
            }
            String eventType = jsonNode.get("eventType").asText();
            
            if (!jsonNode.has("orderId")) {
                log.error("Invalid order event payload: orderId is missing. Message: {}", message);
                if (ack != null) {
                    ack.acknowledge();
                }
                return;
            }
            
            Long orderId = jsonNode.get("orderId").asLong();
            lockKey = "lock:inventory-consumer:" + orderId;
            boolean lockAcquired = false;

            // Retry for up to 5 seconds to acquire the lock
            for (int i = 0; i < 50; i++) {
                Boolean locked = redisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofSeconds(10));
                if (Boolean.TRUE.equals(locked)) {
                    lockAcquired = true;
                    break;
                }
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Lock acquisition interrupted", ie);
                }
            }

            if (!lockAcquired) {
                log.warn("Could not acquire lock {} for order event processing. Throwing exception to trigger Kafka retry.", lockKey);
                throw new RuntimeException("Could not acquire lock for order event processing");
            }

            switch (eventType) {
                case "OrderCreatedEvent":
                    OrderCreatedEvent orderCreated = objectMapper.treeToValue(jsonNode, OrderCreatedEvent.class);
                    deductService.processOrderCreated(orderCreated);
                    break;

                case "OrderCancelledEvent":
                    OrderCancelledEvent orderCancelled = objectMapper.treeToValue(jsonNode, OrderCancelledEvent.class);
                    deductService.processOrderCancelled(orderCancelled);
                    break;

                default:
                    log.debug("Ignoring event type: {}", eventType);
                    break;
            }

            // Manual acknowledgment
            if (ack != null) {
                ack.acknowledge();
            }

        } catch (Exception e) {
            Throwable rootCause = e;
            while (rootCause.getCause() != null && rootCause != rootCause.getCause()) {
                rootCause = rootCause.getCause();
            }

            if (rootCause instanceof com.ecommerce.inventoryservice.exception.InsufficientStockException) {
                log.error("Insufficient stock detected for order event. Publishing failure and acknowledging. Error: {}", rootCause.getMessage());
                try {
                    JsonNode jsonNode = objectMapper.readTree(message);
                    if (jsonNode.has("orderId")) {
                        Long orderId = jsonNode.get("orderId").asLong();
                        deductService.publishFailureEvent(orderId, rootCause.getMessage());
                    }
                } catch (Exception ex) {
                    log.error("Failed to publish failure event for order event: {}", message, ex);
                }
                if (ack != null) {
                    ack.acknowledge();
                }
            } else {
                log.error("Failed to process order event due to system/database error: {}", message, e);
                throw new RuntimeException("Error processing Kafka message, retrying...", e);
            }
        } finally {
            if (lockKey != null) {
                try {
                    redisTemplate.delete(lockKey);
                } catch (Exception e) {
                    log.error("Failed to release lock {}", lockKey, e);
                }
            }
        }
    }
}
