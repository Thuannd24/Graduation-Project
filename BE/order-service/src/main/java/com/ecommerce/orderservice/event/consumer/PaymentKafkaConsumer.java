package com.ecommerce.orderservice.event.consumer;

import com.ecommerce.orderservice.repository.OrderRepository;
import com.ecommerce.orderservice.service.OrderService;
import com.ecommerce.orderservice.support.OrderStatusMachine;
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
    private final OrderRepository orderRepository;
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

        String failureType = rootNode.hasNonNull("failureType") ? rootNode.get("failureType").asText() : null;
        if ("PaymentFailedEvent".equalsIgnoreCase(eventType)
                && ("GATEWAY_DECLINED".equalsIgnoreCase(failureType) || "ATTEMPT_EXPIRED".equalsIgnoreCase(failureType))) {
            // Một lượt thanh toán VNPay thất bại / khách hủy ở cổng / lượt hết hạn: KHÔNG hủy đơn. Đơn vẫn chờ
            // thanh toán (giữ hàng) để khách thanh toán lại hoặc đổi sang COD; OrderExpiryScheduler hủy đơn khi
            // hết hạn giữ hàng mà vẫn chưa thanh toán.
            log.info("Payment attempt for Order ID {} failed ({}). Order kept awaiting payment for retry.",
                    orderId, failureType);
        } else if ("PaymentFailedEvent".equalsIgnoreCase(eventType)) {
            // Sự kiện kiểu cũ (không có failureType) chỉ được hủy đơn CHƯA thanh toán; đơn đã xác nhận (đã trả
            // tiền hoặc COD) không được hủy bởi một sự kiện thất bại đến muộn / bị phát lại.
            String currentStatus = orderRepository.findById(orderId).map(o -> o.getStatus()).orElse(null);
            if (currentStatus == null || !OrderStatusMachine.UNPAID.contains(currentStatus)) {
                log.warn("Ignoring legacy PaymentFailedEvent for Order ID {} in status {}", orderId, currentStatus);
                ack.acknowledge();
                return;
            }
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
                log.info("Payment event '{}' for Order ID {} processed (CONFIRMED if the state machine allows it).", eventType, orderId);
            } catch (Exception e) {
                log.error("Error updating order ID {} status to CONFIRMED for payment event", orderId, e);
                throw new RuntimeException("Error processing payment event", e);
            }
        }

        // Manual acknowledgment upon successful processing
        ack.acknowledge();
    }
}
