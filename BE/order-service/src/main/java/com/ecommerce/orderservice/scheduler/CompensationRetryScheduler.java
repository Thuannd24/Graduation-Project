package com.ecommerce.orderservice.scheduler;

import com.ecommerce.orderservice.entity.CompensationTask;
import com.ecommerce.orderservice.repository.CompensationTaskRepository;
import com.ecommerce.orderservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;

/**
 * Retries voucher-release / loyalty-points-refund compensation actions that failed when first
 * attempted right after an order cancellation (e.g. promotion-service or user-service was
 * temporarily unavailable). Without this, those failures were previously only logged and the
 * compensation was permanently dropped.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CompensationRetryScheduler {

    private final CompensationTaskRepository compensationTaskRepository;
    private final OrderService orderService;
    private final StringRedisTemplate stringRedisTemplate;

    // Run every 5 minutes, alongside the other order-service maintenance schedulers
    @Scheduled(cron = "0 */5 * * * *")
    public void retryPendingCompensationTasks() {
        String lockKey = "scheduler:lock:retryPendingCompensationTasks";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofMinutes(4));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running retryPendingCompensationTasks scheduler task. Skipping.");
            return;
        }

        try {
            List<CompensationTask> pending = compensationTaskRepository.findByStatus("PENDING");
            if (pending.isEmpty()) {
                return;
            }

            log.info("Found {} pending compensation tasks to retry", pending.size());
            for (CompensationTask task : pending) {
                try {
                    orderService.retryCompensationTask(task.getId());
                } catch (Exception ex) {
                    log.error("Unexpected error retrying compensation task ID {}: {}", task.getId(), ex.getMessage(),
                            ex);
                }
            }
        } catch (Exception e) {
            log.error("Failed to run retryPendingCompensationTasks: {}", e.getMessage(), e);
        }
    }
}
