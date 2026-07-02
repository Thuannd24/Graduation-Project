package com.ecommerce.orderservice.event.producer;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderKafkaProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    
    private static final String ORDER_TOPIC = "order-events";

    public java.util.concurrent.CompletableFuture<org.springframework.kafka.support.SendResult<String, String>> sendOrderEvent(String key, String payload) {
        log.info("Publishing event to topic '{}' with key '{}'", ORDER_TOPIC, key);
        return kafkaTemplate.send(ORDER_TOPIC, key, payload);
    }
}
