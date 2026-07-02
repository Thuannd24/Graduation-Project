package com.ecommerce.inventoryservice.kafka.consumer;

import com.ecommerce.inventoryservice.kafka.event.OrderCancelledEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCreatedEvent;
import com.ecommerce.inventoryservice.service.InventoryDeductService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryKafkaConsumer {
    // InventoryKafkaConsumer lắng nghe message từ Kafka topic "order-events" 
    private final InventoryDeductService deductService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "order-events", groupId = "inventory-service-group")
    public void consumeOrderEvent(String message, Acknowledgment ack) {
        try {
            log.info("Received order event: {}", message);

            JsonNode jsonNode = objectMapper.readTree(message);
            String eventType = jsonNode.get("eventType").asText();

            switch (eventType) {
                case "OrderCreatedEvent":
                    OrderCreatedEvent orderCreated = objectMapper.readValue(message, OrderCreatedEvent.class);
                    deductService.processOrderCreated(orderCreated);
                    break;

                case "OrderCancelledEvent":
                    OrderCancelledEvent orderCancelled = objectMapper.readValue(message, OrderCancelledEvent.class);
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
        }
    }
}
