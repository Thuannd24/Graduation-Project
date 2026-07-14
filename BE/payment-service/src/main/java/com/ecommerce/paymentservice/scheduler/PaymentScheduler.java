package com.ecommerce.paymentservice.scheduler;

import com.ecommerce.paymentservice.repository.OutboxEventRepository;
import com.ecommerce.paymentservice.service.PaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentScheduler {

    private final PaymentService paymentService;
    private final StringRedisTemplate stringRedisTemplate;
    private final OutboxEventRepository outboxEventRepository;

    // Run every 5 minutes to clean up expired PENDING payments
    @Scheduled(cron = "0 */5 * * * *")
    public void cleanupExpiredPayments() {
        String lockKey = "scheduler:lock:cleanupExpiredPayments";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofMinutes(4));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running cleanupExpiredPayments scheduler task. Skipping.");
            return;
        }

        log.info("Starting scheduled cleanup of expired pending payments...");
        try {
            paymentService.cancelExpiredPayments();
            log.info("Completed scheduled cleanup of expired pending payments.");
        } catch (Exception e) {
            log.error("Failed to run scheduled cleanup of expired pending payments: {}", e.getMessage(), e);
        }
    }

    // Run every minute to process pending refunds asynchronously
    @Scheduled(cron = "0 */1 * * * *")
    public void processPendingRefunds() {
        String lockKey = "scheduler:lock:processPendingRefunds";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofSeconds(45));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running processPendingRefunds scheduler task. Skipping.");
            return;
        }

        log.info("Starting scheduled processing of pending refunds...");
        try {
            paymentService.processPendingRefunds();
            log.info("Completed scheduled processing of pending refunds.");
        } catch (Exception e) {
            log.error("Failed to run scheduled processing of pending refunds: {}", e.getMessage(), e);
        }
    }

    // V-14 FIX: Cleanup old outbox events with distributed lock to prevent duplicate execution
    @Scheduled(cron = "0 0 2 * * ?")
    @Transactional
    public void cleanupOutboxEvents() {
        String lockKey = "scheduler:lock:cleanupOutboxEvents";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofMinutes(10));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running cleanupOutboxEvents scheduler task. Skipping.");
            return;
        }

        log.info("Starting daily cleanup of payment outbox events...");
        try {
            LocalDateTime threshold = LocalDateTime.now().minusDays(2);
            outboxEventRepository.deleteByCreatedAtBefore(threshold);
            log.info("Finished cleanup of payment outbox events older than {}", threshold);
        } catch (Exception e) {
            log.error("Failed to cleanup payment outbox events: {}", e.getMessage(), e);
        }
    }
}
