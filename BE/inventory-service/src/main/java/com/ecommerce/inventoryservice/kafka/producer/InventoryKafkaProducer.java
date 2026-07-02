package com.ecommerce.inventoryservice.kafka.producer;

import com.ecommerce.inventoryservice.kafka.event.InventoryDeductedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;
import java.util.concurrent.CompletableFuture;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryKafkaProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    private static final String TOPIC = "inventory-events";

    public void publishInventoryEvent(InventoryDeductedEvent event) {
        try {
            String message = objectMapper.writeValueAsString(event);
            
            // Gửi bất đồng bộ và nhận CompletableFuture
            CompletableFuture<SendResult<String, String>> future = 
                    kafkaTemplate.send(TOPIC, String.valueOf(event.getOrderId()), message);
            
            // Lắng nghe kết quả từ Kafka Broker
            future.whenComplete((result, ex) -> {
                if (ex == null) {
                    log.info("Successfully published InventoryDeductedEvent for order {} to partition {} at offset {}", 
                            event.getOrderId(), 
                            result.getRecordMetadata().partition(), 
                            result.getRecordMetadata().offset());
                } else {
                    log.error("Failed to publish inventory event for order {} due to: {}", 
                            event.getOrderId(), ex.getMessage(), ex);
                }
            });

        } catch (Exception e) {
            log.error("Serialization failed for order event {}", event.getOrderId(), e);
        }
    }
}
