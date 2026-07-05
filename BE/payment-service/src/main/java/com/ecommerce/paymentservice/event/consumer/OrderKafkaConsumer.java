package com.ecommerce.paymentservice.event.consumer;

import com.ecommerce.paymentservice.dto.RefundRequest;
import com.ecommerce.paymentservice.entity.Payment;
import com.ecommerce.paymentservice.repository.PaymentRepository;
import com.ecommerce.paymentservice.service.PaymentService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderKafkaConsumer {

    private final PaymentService paymentService;
    private final PaymentRepository paymentRepository;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "order-events", groupId = "payment-service-group")
    public void consumeOrderEvent(String message) {
        log.info("Received order event payload in payment-service: {}", message);

        JsonNode rootNode;
        try {
            rootNode = objectMapper.readTree(message);
        } catch (Exception e) {
            log.error("Failed to parse JSON payload for order event: {}. Message: {}", e.getMessage(), message);
            return;
        }

        JsonNode eventTypeNode = rootNode.get("eventType");
        JsonNode orderIdNode = rootNode.get("orderId");

        if (eventTypeNode == null || orderIdNode == null) {
            log.error("Invalid order event payload: eventType or orderId is missing. Message: {}", message);
            return;
        }

        String eventType = eventTypeNode.asText();
        Long orderId = orderIdNode.asLong();

        if ("OrderCancelledEvent".equalsIgnoreCase(eventType)) {
            log.info("Processing OrderCancelledEvent for Order ID: {}", orderId);
            try {
                paymentService.initiateAutoRefund(orderId);
            } catch (Exception e) {
                log.error("Error processing refund/cancellation for Order ID: {}", orderId, e);
                throw new RuntimeException("Error processing OrderCancelledEvent for payments", e);
            }
        } else if ("OrderDeliveredEvent".equalsIgnoreCase(eventType)) {
            log.info("Processing OrderDeliveredEvent for Order ID: {}", orderId);
            try {
                Optional<Payment> paymentOpt = paymentRepository.findByOrderId(orderId);
                if (paymentOpt.isPresent()) {
                    Payment payment = paymentOpt.get();
                    if ("COD".equalsIgnoreCase(payment.getPaymentMethod()) && "PENDING".equalsIgnoreCase(payment.getStatus())) {
                        payment.setStatus("SUCCESS");
                        payment.setPaidAt(java.time.LocalDateTime.now());
                        paymentRepository.save(payment);
                        log.info("COD Payment for Order ID {} successfully updated to SUCCESS upon delivery", orderId);
                    } else {
                        log.info("Payment for Order ID {} has method {} and status {}. No action needed.",
                                orderId, payment.getPaymentMethod(), payment.getStatus());
                    }
                } else {
                    log.info("No payment record found for Order ID {}.", orderId);
                }
            } catch (Exception e) {
                log.error("Error updating payment status for Order ID: {}", orderId, e);
                throw new RuntimeException("Error processing OrderDeliveredEvent for payments", e);
            }
        }
    }
}
