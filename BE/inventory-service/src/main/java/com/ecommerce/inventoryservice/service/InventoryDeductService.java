package com.ecommerce.inventoryservice.service;

import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.entity.InventoryTransaction;
import com.ecommerce.inventoryservice.exception.InsufficientStockException;
import com.ecommerce.inventoryservice.kafka.event.InventoryDeductedEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCancelledEvent;
import com.ecommerce.inventoryservice.kafka.event.OrderCreatedEvent;
import com.ecommerce.inventoryservice.kafka.producer.InventoryKafkaProducer;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.repository.InventoryTransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryDeductService {

    private final InventoryRepository inventoryRepository;
    private final InventoryTransactionRepository transactionRepository;
    private final InventoryKafkaProducer kafkaProducer;
    private final RedisTemplate<String, String> redisTemplate;

    private static final String REDIS_KEY_PREFIX = "product:stock:";

    @Transactional(rollbackFor = Exception.class)
    public void processOrderCreated(OrderCreatedEvent event) {
        log.info("Processing OrderCreatedEvent for order: {}", event.getOrderId());

        // Step 1: Idempotency Check
        Optional<InventoryTransaction> existingTx = transactionRepository
                .findByOrderIdAndTransactionType(event.getOrderId(), "DEDUCT");

        if (existingTx.isPresent()) {
            log.warn("Order {} already processed. Skipping duplicate.", event.getOrderId());
            // Publish success event again (idempotent)
            publishSuccessEvent(event.getOrderId());
            return;
        }

        // Step 2: Sort items by Product ID and Variant ID to avoid DB deadlocks
        List<OrderCreatedEvent.OrderItem> sortedItems = event.getItems().stream()
                .sorted(Comparator
                        .comparing(OrderCreatedEvent.OrderItem::getProductId)
                        .thenComparing(item -> item.getVariantId() != null ? item.getVariantId() : 0L))
                .collect(Collectors.toList());

        // Step 3: Deduct inventory for each item
        for (OrderCreatedEvent.OrderItem item : sortedItems) {
            deductInventory(item.getProductId(), item.getVariantId(), item.getQuantity(), event.getOrderId());
        }

        // Step 4: Publish success event AFTER the database transaction commits successfully
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            publishSuccessEvent(event.getOrderId());
                        }
                    });
        } else {
            publishSuccessEvent(event.getOrderId());
        }
        log.info("Successfully processed order {}", event.getOrderId());
    }

    @Transactional
    public void deductInventory(Long productId, Long variantId, Integer quantity, Long orderId) {
        Long vId = variantId != null ? variantId : 0L;
        log.info("Deducting {} units from product {}, variant {}", quantity, productId, vId);

        // Use database pessimistic lock (SELECT FOR UPDATE) to guarantee absolute ACID consistency
        Inventory inventory = inventoryRepository.findByProductIdAndVariantIdForUpdate(productId, vId)
                .orElseThrow(() -> new InsufficientStockException(
                        String.format("Product %d, variant %d not found in inventory", productId, vId)));

        Integer currentQuantity = inventory.getQuantity();

        // Check stock availability
        if (currentQuantity < quantity) {
            throw new InsufficientStockException(productId, quantity, currentQuantity);
        }

        // Deduct
        Integer newQuantity = currentQuantity - quantity;
        inventory.setQuantity(newQuantity);
        inventoryRepository.save(inventory);

        // Save transaction log
        InventoryTransaction transaction = InventoryTransaction.builder()
                .orderId(orderId)
                .productId(productId)
                .variantId(vId)
                .transactionType("DEDUCT")
                .quantityChanged(quantity)
                .quantityBefore(currentQuantity)
                .quantityAfter(newQuantity)
                .referenceId("ORDER-" + orderId)
                .note("Stock deducted for order")
                .build();
        transactionRepository.save(transaction);

        // Sync to Redis (Self-Healing Cache update)
        syncToRedis(productId, vId, newQuantity);

        log.info("Successfully deducted {} units from product {}, variant {}. New quantity: {}",
                quantity, productId, vId, newQuantity);
    }

    @Transactional
    public void processOrderCancelled(OrderCancelledEvent event) {
        log.info("Processing OrderCancelledEvent for order: {}", event.getOrderId());

        // Step 1: Idempotency Check for RELEASE
        Optional<InventoryTransaction> existingRelease = transactionRepository
                .findByOrderIdAndTransactionType(event.getOrderId(), "RELEASE");

        if (existingRelease.isPresent()) {
            log.warn("Order {} already cancelled and inventory released. Skipping duplicate.", event.getOrderId());
            return;
        }

        // Find DEDUCT transactions for this order
        List<InventoryTransaction> deductTransactions = transactionRepository
                .findByOrderId(event.getOrderId());

        if (deductTransactions.isEmpty()) {
            log.warn("No deduct transactions found for order {}", event.getOrderId());
            return;
        }

        // Release inventory for each deducted item
        for (InventoryTransaction deductTx : deductTransactions) {
            if ("DEDUCT".equals(deductTx.getTransactionType())) {
                releaseInventory(deductTx.getProductId(), deductTx.getVariantId(), deductTx.getQuantityChanged(),
                        event.getOrderId());
            }
        }

        log.info("Successfully released inventory for cancelled order {}", event.getOrderId());
    }

    @Transactional
    public void releaseInventory(Long productId, Long variantId, Integer quantity, Long orderId) {
        Long vId = variantId != null ? variantId : 0L;
        log.info("Releasing {} units to product {}, variant {}", quantity, productId, vId);

        // Use database pessimistic lock (SELECT FOR UPDATE)
        Inventory inventory = inventoryRepository.findByProductIdAndVariantIdForUpdate(productId, vId)
                .orElseThrow(() -> new RuntimeException(
                        String.format("Product %d, variant %d not found in inventory", productId, vId)));

        Integer currentQuantity = inventory.getQuantity();
        Integer newQuantity = currentQuantity + quantity;
        inventory.setQuantity(newQuantity);
        inventoryRepository.save(inventory);

        // Save RELEASE transaction
        InventoryTransaction transaction = InventoryTransaction.builder()
                .orderId(orderId)
                .productId(productId)
                .variantId(vId)
                .transactionType("RELEASE")
                .quantityChanged(quantity)
                .quantityBefore(currentQuantity)
                .quantityAfter(newQuantity)
                .referenceId("ORDER-CANCEL-" + orderId)
                .note("Stock released due to order cancellation")
                .build();
        transactionRepository.save(transaction);

        // Sync to Redis
        syncToRedis(productId, vId, newQuantity);

        log.info("Successfully released {} units to product {}, variant {}. New quantity: {}",
                quantity, productId, vId, newQuantity);
    }

    private void syncToRedis(Long productId, Long variantId, Integer quantity) {
        try {
            String key = REDIS_KEY_PREFIX + productId + ":" + (variantId != null ? variantId : 0L);
            redisTemplate.opsForValue().set(key, String.valueOf(quantity));
            log.debug("Synced product {}, variant {} to Redis with quantity {}", productId, variantId, quantity);
        } catch (Exception e) {
            log.error("Failed to sync product {}, variant {} to Redis", productId, variantId, e);
        }
    }

    private void publishSuccessEvent(Long orderId) {
        InventoryDeductedEvent event = InventoryDeductedEvent.builder()
                .eventType("InventoryDeductedEvent")
                .orderId(orderId)
                .status("CONFIRMED")
                .failReason(null)
                .timestamp(LocalDateTime.now().toString())
                .build();
        kafkaProducer.publishInventoryEvent(event);
    }

    public void publishFailureEvent(Long orderId, String reason) {
        InventoryDeductedEvent event = InventoryDeductedEvent.builder()
                .eventType("InventoryDeductedEvent")
                .orderId(orderId)
                .status("FAILED")
                .failReason(reason)
                .timestamp(LocalDateTime.now().toString())
                .build();
        kafkaProducer.publishInventoryEvent(event);
    }
}
