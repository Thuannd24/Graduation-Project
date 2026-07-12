package com.ecommerce.orderservice.scheduler;

import com.ecommerce.orderservice.repository.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxCleanupScheduler {

    private final OutboxEventRepository outboxEventRepository;
    private final StringRedisTemplate stringRedisTemplate;

    // V-14 FIX: Add distributed lock to prevent multiple instances from running cleanup simultaneously
    @Scheduled(cron = "0 0 2 * * ?")
    public void cleanupOutboxEvents() {
        String lockKey = "scheduler:lock:cleanupOrderOutboxEvents";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofMinutes(10));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running cleanupOrderOutboxEvents scheduler task. Skipping.");
            return;
        }

        log.info("Starting daily cleanup of outbox events...");
        try {
            LocalDateTime threshold = LocalDateTime.now().minusDays(2);
            outboxEventRepository.deleteByCreatedAtBefore(threshold);
            log.info("Finished cleanup of outbox events older than {}", threshold);
        } catch (Exception e) {
            log.error("Failed to cleanup outbox events: {}", e.getMessage(), e);
        }
    }
}
