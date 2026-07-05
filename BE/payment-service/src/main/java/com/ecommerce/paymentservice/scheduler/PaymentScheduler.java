package com.ecommerce.paymentservice.scheduler;

import com.ecommerce.paymentservice.service.PaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentScheduler {

    private final PaymentService paymentService;

    // Run every 5 minutes to clean up expired PENDING payments
    @Scheduled(cron = "0 */5 * * * *")
    public void cleanupExpiredPayments() {
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
        log.info("Starting scheduled processing of pending refunds...");
        try {
            paymentService.processPendingRefunds();
            log.info("Completed scheduled processing of pending refunds.");
        } catch (Exception e) {
            log.error("Failed to run scheduled processing of pending refunds: {}", e.getMessage(), e);
        }
    }
}
