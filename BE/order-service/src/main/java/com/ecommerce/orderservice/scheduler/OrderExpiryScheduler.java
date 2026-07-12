package com.ecommerce.orderservice.scheduler;

import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.repository.OrderRepository;
import com.ecommerce.orderservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderExpiryScheduler {

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final StringRedisTemplate stringRedisTemplate;

    // Run every 5 minutes to clean up orphaned/expired orders
    @Scheduled(cron = "0 */5 * * * *")
    public void cleanupExpiredOrders() {
        String lockKey = "scheduler:lock:cleanupExpiredOrders";
        Boolean locked = stringRedisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofMinutes(4));
        if (!Boolean.TRUE.equals(locked)) {
            log.debug("Another instance is running cleanupExpiredOrders scheduler task. Skipping.");
            return;
        }

        log.info("Starting cleanup of expired pending/awaiting payment orders...");
        try {
            // Cutoff is 30 minutes ago (allows ample time for checkout & redirection)
            LocalDateTime threshold = LocalDateTime.now().minusMinutes(30);
            List<Order> expiredOrders = orderRepository.findAllByStatusInAndCreatedAtBefore(
                    Arrays.asList("PENDING", "AWAITING_PAYMENT"), threshold);

            if (!expiredOrders.isEmpty()) {
                log.info("Found {} expired orders to clean up.", expiredOrders.size());
                for (Order order : expiredOrders) {
                    try {
                        orderService.expireOrder(order.getId());
                    } catch (Exception ex) {
                        log.error("Failed to expire Order ID {}: {}", order.getId(), ex.getMessage());
                    }
                }
            } else {
                log.debug("No expired orders found.");
            }
        } catch (Exception e) {
            log.error("Failed to cleanup expired orders: {}", e.getMessage(), e);
        }
    }
}
