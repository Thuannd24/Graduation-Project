package com.ecommerce.orderservice.scheduler;

import com.ecommerce.orderservice.entity.OutboxEvent;
import com.ecommerce.orderservice.event.producer.OrderKafkaProducer;
import com.ecommerce.orderservice.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.support.SendResult;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxScheduler {

    private final OutboxEventRepository outboxEventRepository;
    private final OrderKafkaProducer orderKafkaProducer;

    @Scheduled(fixedDelay = 5000) // Run every 5 seconds
    public void processPendingOutboxEvents() {
        List<OutboxEvent> pendingEvents = outboxEventRepository.findTop100ByStatusOrderByCreatedAtAsc("PENDING");
        
        if (pendingEvents.isEmpty()) {
            return;
        }

        log.info("Found {} pending outbox events to process...", pendingEvents.size());

        // Map to keep track of each event and its asynchronous send future
        Map<OutboxEvent, CompletableFuture<SendResult<String, String>>> futuresMap = new LinkedHashMap<>();

        for (OutboxEvent event : pendingEvents) {
            CompletableFuture<SendResult<String, String>> future = 
                    orderKafkaProducer.sendOrderEvent(event.getAggregateId(), event.getPayload());
            futuresMap.put(event, future);
        }

        // Wait for all futures in the batch to complete with a single collective timeout of 5 seconds
        try {
            CompletableFuture.allOf(futuresMap.values().toArray(new CompletableFuture[0]))
                    .get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("Some outbox events failed to publish or timed out: {}", e.getMessage());
        }

        // Process results for each event in the batch
        for (Map.Entry<OutboxEvent, CompletableFuture<SendResult<String, String>>> entry : futuresMap.entrySet()) {
            OutboxEvent event = entry.getKey();
            CompletableFuture<SendResult<String, String>> future = entry.getValue();

            if (future.isDone() && !future.isCompletedExceptionally()) {
                try {
                    SendResult<String, String> result = future.getNow(null);
                    event.setStatus("PROCESSED");
                    event.setProcessedAt(LocalDateTime.now());
                    log.info("Successfully published outbox event ID {} with offset {}", event.getId(), result.getRecordMetadata().offset());
                } catch (Exception e) {
                    handleFailure(event, e);
                }
            } else {
                // Either completed exceptionally, or failed to complete within the 5s timeout
                String errMsg = "Kafka publish timed out";
                if (future.isCompletedExceptionally()) {
                    try {
                        future.join(); // Extract actual cause of failure
                    } catch (Exception ex) {
                        errMsg = ex.getMessage();
                    }
                }
                handleFailure(event, new RuntimeException(errMsg));
            }
        }
        
        outboxEventRepository.saveAll(pendingEvents);
    }

    private void handleFailure(OutboxEvent event, Exception e) {
        log.error("Failed to process outbox event ID {}: {}", event.getId(), e.getMessage());
        event.setRetryCount(event.getRetryCount() + 1);
        if (event.getRetryCount() >= 5) {
            event.setStatus("FAILED");
        }
    }

    // Daily cleanup job at 2:00 AM to delete processed events older than 48 hours to prevent outbox table bloat
    @Scheduled(cron = "0 0 2 * * ?")
    public void cleanupProcessedOutboxEvents() {
        log.info("Starting daily cleanup of processed outbox events...");
        try {
            LocalDateTime threshold = LocalDateTime.now().minusDays(2);
            outboxEventRepository.deleteByStatusAndCreatedAtBefore("PROCESSED", threshold);
            log.info("Finished cleanup of processed outbox events.");
        } catch (Exception e) {
            log.error("Failed to cleanup processed outbox events: {}", e.getMessage(), e);
        }
    }
}
