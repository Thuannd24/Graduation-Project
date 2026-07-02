package com.ecommerce.orderservice.event.consumer;

import com.ecommerce.orderservice.service.OrderService;
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

    private final OrderService orderService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "inventory-events", groupId = "order-service-group")
    public void consumeInventoryEvent(String message, Acknowledgment ack) {
        log.info("Received inventory event payload: {}", message);
        
        JsonNode rootNode;
        try {
            rootNode = objectMapper.readTree(message);
        } catch (Exception e) {
            log.error("Failed to parse JSON payload: {}. Message: {}", e.getMessage(), message);
            // This will send the message directly to DLQ as JsonProcessingException is not retryable
            throw new RuntimeException("Malformed JSON payload in inventory-events", e);
        }

        JsonNode orderIdNode = rootNode.get("orderId");
        JsonNode statusNode = rootNode.get("status");
        
        if (orderIdNode == null || statusNode == null) {
            log.error("Invalid inventory event payload: orderId or status is missing. Message: {}", message);
            // This will send the message directly to DLQ as IllegalArgumentException is not retryable
            throw new IllegalArgumentException("Invalid inventory event payload: orderId or status is missing");
        }
        
        Long orderId = orderIdNode.asLong();
        String status = statusNode.asText();
        
        log.info("Processing inventory status for Order ID {}: {}", orderId, status);
        
        if ("CONFIRMED".equalsIgnoreCase(status)) {
            orderService.updateOrderStatus(orderId, "AWAITING_PAYMENT");
        } else if ("FAILED".equalsIgnoreCase(status)) {
            orderService.updateOrderStatus(orderId, "CANCELLED");
            String reason = rootNode.has("failReason") ? rootNode.get("failReason").asText() : "Unknown reason";
            log.warn("Order ID {} was cancelled because inventory deduction failed: {}", orderId, reason);
        }
        
        // Manual acknowledgment upon successful processing
        ack.acknowledge();
    }
}
