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
public class PaymentKafkaConsumer {

    private final OrderService orderService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "payment-events", groupId = "order-service-group")
    public void consumePaymentEvent(String message, Acknowledgment ack) {
        log.info("Received payment event payload: {}", message);

        JsonNode rootNode;
        try {
            rootNode = objectMapper.readTree(message);
            if (rootNode.isTextual()) {
                rootNode = objectMapper.readTree(rootNode.asText());
            }
        } catch (Exception e) {
            log.error("Failed to parse JSON payload for payment event: {}. Message: {}", e.getMessage(), message);
            throw new RuntimeException("Malformed JSON payload in payment-events", e);
        }

        JsonNode eventTypeNode = rootNode.get("eventType");
        JsonNode orderIdNode = rootNode.get("orderId");

        if (eventTypeNode == null || orderIdNode == null) {
            log.error("Invalid payment event payload: eventType or orderId is missing. Message: {}", message);
            throw new IllegalArgumentException("Invalid payment event payload: eventType or orderId is missing");
        }

        String eventType = eventTypeNode.asText();
        Long orderId = orderIdNode.asLong();
        String userId = rootNode.has("userId") ? rootNode.get("userId").asText() : "anonymous";
        String email = rootNode.has("email") ? rootNode.get("email").asText() : "";

        log.info("Processing payment event '{}' for Order ID: {}", eventType, orderId);

        if ("PaymentFailedEvent".equalsIgnoreCase(eventType)) {
            try {
                orderService.cancelOrder(orderId, userId, email);
                log.info("Order ID {} successfully cancelled due to payment failure or expiration", orderId);
            } catch (com.ecommerce.orderservice.exception.InvalidOrderStateException e) {
                log.warn("Order ID {} could not be cancelled (possibly already cancelled/shipped): {}", orderId, e.getMessage());
            } catch (Exception e) {
                log.error("Error cancelling order ID {} for PaymentFailedEvent", orderId, e);
                throw new RuntimeException("Error processing PaymentFailedEvent", e);
            }
        } else if ("PaymentSuccessEvent".equalsIgnoreCase(eventType) || "PaymentCODConfirmedEvent".equalsIgnoreCase(eventType)) {
            try {
                orderService.updateOrderStatus(orderId, "CONFIRMED");
                log.info("Payment event '{}' for Order ID {} processed. Order status updated to CONFIRMED. Proceeding to shipping phase.", eventType, orderId);
            } catch (Exception e) {
                log.error("Error updating order ID {} status to CONFIRMED for payment event", orderId, e);
                throw new RuntimeException("Error processing payment event", e);
            }
        }

        // Manual acknowledgment upon successful processing
        ack.acknowledge();
    }
}
