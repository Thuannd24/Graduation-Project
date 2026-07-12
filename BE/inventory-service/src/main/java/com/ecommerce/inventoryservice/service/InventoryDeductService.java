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
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.Collections;
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
    private final DefaultRedisScript<Long> stockIncrementScript;

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

        // BUG-02 FIX: Check if the order was already cancelled before creation event arrived
        Optional<InventoryTransaction> cancelTx = transactionRepository
                .findByOrderIdAndTransactionType(event.getOrderId(), "CANCEL_RECEIVED");
        if (cancelTx.isPresent()) {
            log.info("Order {} was already cancelled before creation was processed. Skipping stock deduction.", event.getOrderId());
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

        // Rely on early Redis stock reservation. DO NOT overwrite Redis stock with absolute values
        // here to prevent the Cache Lost Updates anomaly against concurrent checkouts.

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
            log.warn("No deduct transactions found for order {}. Recording CANCEL_RECEIVED tombstone for race prevention.", event.getOrderId());
            
            // Check if already has CANCEL_RECEIVED to be idempotent
            Optional<InventoryTransaction> existingCancelRec = transactionRepository
                    .findByOrderIdAndTransactionType(event.getOrderId(), "CANCEL_RECEIVED");
            if (existingCancelRec.isPresent()) {
                log.info("Order {} already cancelled (tombstone exists). Skipping duplicate Redis stock rollback.", event.getOrderId());
                return;
            }

            InventoryTransaction tombstone = InventoryTransaction.builder()
                    .orderId(event.getOrderId())
                    .productId(0L)
                    .variantId(0L)
                    .transactionType("CANCEL_RECEIVED")
                    .quantityChanged(0)
                    .quantityBefore(0)
                    .quantityAfter(0)
                    .referenceId("ORDER-CANCEL-TOMBSTONE-" + event.getOrderId())
                    .note("Tombstone record for race condition prevention")
                    .build();
            transactionRepository.save(tombstone);

            // Rollback Redis stock since database was never deducted but Redis was decremented at checkout
            if (event.getItems() != null) {
                for (OrderCancelledEvent.OrderItemInfo item : event.getItems()) {
                    incrementRedisStock(item.getProductId(), item.getVariantId(), item.getQuantity());
                }
            }
            return;
        }

        // SORT transactions by productId and variantId to prevent deadlock
        List<InventoryTransaction> sortedTransactions = deductTransactions.stream()
                .filter(tx -> "DEDUCT".equals(tx.getTransactionType()))
                .sorted(Comparator
                        .comparing(InventoryTransaction::getProductId)
                        .thenComparing(tx -> tx.getVariantId() != null ? tx.getVariantId() : 0L))
                .collect(Collectors.toList());

        // Release inventory for each deducted item in sorted order
        for (InventoryTransaction deductTx : sortedTransactions) {
            releaseInventory(deductTx.getProductId(), deductTx.getVariantId(), deductTx.getQuantityChanged(),
                    event.getOrderId());
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

        // Increment Redis stock relatively to prevent overwriting concurrent checkout reservations
        final Long finalVId = vId;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    incrementRedisStock(productId, finalVId, quantity);
                }
            });
        } else {
            incrementRedisStock(productId, vId, quantity);
        }

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

    private void incrementRedisStock(Long productId, Long variantId, Integer quantity) {
        try {
            String key = REDIS_KEY_PREFIX + productId + ":" + (variantId != null ? variantId : 0L);
            
            // V-13 FIX: Use atomic Lua script instead of check-then-increment pattern
            // The old pattern: hasKey() then increment() has a race condition where the key
            // could be evicted between the two Redis calls.
            Long newStock = redisTemplate.execute(
                stockIncrementScript,
                Collections.singletonList(key),
                String.valueOf(quantity)
            );
            
            if (newStock != null && newStock == -1) {
                log.info("Redis key {} does not exist. Skipping relative increment.", key);
            } else if (newStock != null && newStock >= 0) {
                log.info("Incremented Redis stock for product {}, variant {} by {} to {}", 
                         productId, variantId, quantity, newStock);
            }
        } catch (Exception e) {
            log.error("Failed to increment Redis stock for product {}, variant {}", productId, variantId, e);
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
