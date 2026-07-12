package com.ecommerce.inventoryservice.service;

import com.ecommerce.inventoryservice.client.ProductClient;
import com.ecommerce.inventoryservice.client.ProductClient.ProductDto;
import com.ecommerce.inventoryservice.client.ProductClient.ProductVariantDto;
import com.ecommerce.inventoryservice.dto.*;
import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.entity.InventoryTransaction;
import com.ecommerce.inventoryservice.entity.RestockRequest;
import com.ecommerce.inventoryservice.exception.ResourceNotFoundException;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.repository.InventoryTransactionRepository;
import com.ecommerce.inventoryservice.repository.RestockRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryService {

    private final InventoryRepository inventoryRepository;
    private final InventoryTransactionRepository transactionRepository;
    private final RestockRequestRepository restockRequestRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final DefaultRedisScript<Long> stockIncrementScript;
    private final ProductClient productClient;

    private static final String REDIS_KEY_PREFIX = "product:stock:";

    public InventoryResponse getInventory(Long productId, Long variantId) {
        log.info("Getting inventory for product: {}, variant: {}", productId, variantId);
        Long vId = variantId != null ? variantId : 0L;
        Inventory inventory = inventoryRepository.findByProductIdAndVariantId(productId, vId)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory", "productId:variantId", productId + ":" + vId));

        return InventoryResponse.builder()
                .productId(inventory.getProductId())
                .variantId(inventory.getVariantId())
                .quantity(inventory.getQuantity())
                .lastUpdated(inventory.getUpdatedAt())
                .build();
    }

    public List<InventoryResponse> getBatchInventory(List<Long> productIds) {
        log.info("Getting batch inventory for {} products", productIds.size());
        List<Inventory> inventories = inventoryRepository.findByProductIdIn(productIds);

        return inventories.stream()
                .map(inv -> InventoryResponse.builder()
                        .productId(inv.getProductId())
                        .variantId(inv.getVariantId())
                        .quantity(inv.getQuantity())
                        .lastUpdated(inv.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    public List<InventoryResponse> getBatchInventoryByVariants(List<Long> variantIds) {
        log.info("Getting batch inventory for {} variants", variantIds.size());
        List<Inventory> inventories = inventoryRepository.findByVariantIdIn(variantIds);

        return inventories.stream()
                .map(inv -> InventoryResponse.builder()
                        .productId(inv.getProductId())
                        .variantId(inv.getVariantId())
                        .quantity(inv.getQuantity())
                        .lastUpdated(inv.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional
    public InventoryResponse updateInventory(Long productId, Long variantId, Integer quantity) {
        log.info("Updating inventory for product {}, variant {} to quantity {}", productId, variantId, quantity);
        Long vId = variantId != null ? variantId : 0L;

        validateProductAndVariant(productId, vId);

        Inventory inventory = inventoryRepository.findByProductIdAndVariantIdForUpdate(productId, vId)
                .orElse(Inventory.builder()
                        .productId(productId)
                        .variantId(vId)
                        .quantity(0)
                        .build());

        Integer oldQuantity = inventory.getQuantity();
        inventory.setQuantity(quantity);
        inventory = inventoryRepository.save(inventory);

        // Create transaction log
        saveTransaction(productId, vId, null, "RESTOCK", 
                Math.abs(quantity - oldQuantity), oldQuantity, quantity, 
                "Admin manual update", null);

        // Sync to Redis
        syncSingleProductToRedis(productId, vId, quantity - oldQuantity);

        return InventoryResponse.builder()
                .productId(inventory.getProductId())
                .variantId(inventory.getVariantId())
                .quantity(inventory.getQuantity())
                .lastUpdated(inventory.getUpdatedAt())
                .build();
    }

    @Transactional
    public RestockResponse restock(Long productId, Long variantId, RestockRequestDto request, String adminId) {
        log.info("Restocking product {}, variant {} with quantity {}", productId, variantId, request.getQuantity());
        Long vId = variantId != null ? variantId : 0L;

        validateProductAndVariant(productId, vId);

        Inventory inventory = inventoryRepository.findByProductIdAndVariantIdForUpdate(productId, vId)
                .orElse(Inventory.builder()
                        .productId(productId)
                        .variantId(vId)
                        .quantity(0)
                        .build());

        Integer previousQuantity = inventory.getQuantity();
        Integer newQuantity = previousQuantity + request.getQuantity();
        inventory.setQuantity(newQuantity);
        inventory = inventoryRepository.save(inventory);

        // Create transaction
        InventoryTransaction transaction = saveTransaction(
                productId, vId, null, "RESTOCK",
                request.getQuantity(), previousQuantity, newQuantity,
                request.getNote(), request.getSupplier());

        // Create restock request record
        RestockRequest restockRequest = RestockRequest.builder()
                .productId(productId)
                .variantId(vId)
                .quantity(request.getQuantity())
                .supplier(request.getSupplier())
                .status("COMPLETED")
                .requestedBy(adminId)
                .completedAt(LocalDateTime.now())
                .build();
        restockRequestRepository.save(restockRequest);

        // Sync to Redis
        syncSingleProductToRedis(productId, vId, request.getQuantity());

        return RestockResponse.builder()
                .productId(productId)
                .variantId(vId)
                .previousQuantity(previousQuantity)
                .addedQuantity(request.getQuantity())
                .currentQuantity(newQuantity)
                .transactionId(transaction.getId())
                .build();
    }

    public Page<InventoryTransactionResponse> getTransactions(Long productId, Long variantId, Pageable pageable) {
        log.info("Getting transactions for product: {}, variant: {}", productId, variantId);
        Page<InventoryTransaction> transactions;
        if (variantId != null && variantId > 0) {
            transactions = transactionRepository.findByProductIdAndVariantId(productId, variantId, pageable);
        } else {
            transactions = transactionRepository.findByProductId(productId, pageable);
        }

        return transactions.map(tx -> InventoryTransactionResponse.builder()
                .id(tx.getId())
                .orderId(tx.getOrderId())
                .productId(tx.getProductId())
                .variantId(tx.getVariantId())
                .transactionType(tx.getTransactionType())
                .quantityChanged(tx.getQuantityChanged())
                .quantityBefore(tx.getQuantityBefore())
                .quantityAfter(tx.getQuantityAfter())
                .referenceId(tx.getReferenceId())
                .note(tx.getNote())
                .createdAt(tx.getCreatedAt())
                .build());
    }

    public List<InventoryResponse> getLowStockProducts(int threshold) {
        log.info("Getting low stock products with threshold: {}", threshold);
        List<Inventory> lowStockInventories = inventoryRepository.findLowStock(threshold);

        return lowStockInventories.stream()
                .map(inv -> InventoryResponse.builder()
                        .productId(inv.getProductId())
                        .variantId(inv.getVariantId())
                        .quantity(inv.getQuantity())
                        .lastUpdated(inv.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    public void syncRedisFromDatabase() {
        log.info("Starting optimized Redis sync from database");
        int pageSize = 1000;
        int pageNum = 0;
        Page<Inventory> inventoryPage;
        int totalSynced = 0;

        do {
            Pageable pageable = PageRequest.of(pageNum, pageSize);
            inventoryPage = inventoryRepository.findAll(pageable);
            List<Inventory> batchList = inventoryPage.getContent();

            if (!batchList.isEmpty()) {
                final int currentBatchSize = batchList.size();
                redisTemplate.executePipelined((RedisCallback<Object>) connection -> {
                    for (Inventory inv : batchList) {
                        String key = REDIS_KEY_PREFIX + inv.getProductId() + ":" + inv.getVariantId();
                        byte[] rawKey = redisTemplate.getStringSerializer().serialize(key);
                        byte[] rawValue = redisTemplate.getStringSerializer().serialize(String.valueOf(inv.getQuantity()));
                        if (rawKey != null && rawValue != null) {
                            connection.set(rawKey, rawValue);
                        }
                    }
                    return null;
                });
                totalSynced += currentBatchSize;
            }
            pageNum++;
        } while (inventoryPage.hasNext());

        log.info("Redis sync completed. Synced {} products total", totalSynced);
    }

    public void syncSingleProductToRedis(Long productId, Long variantId, Integer delta) {
        try {
            Long vId = variantId != null ? variantId : 0L;
            Inventory inventory = inventoryRepository.findByProductIdAndVariantId(productId, vId)
                    .orElseThrow(() -> new ResourceNotFoundException("Inventory", "productId:variantId", productId + ":" + vId));

            String key = REDIS_KEY_PREFIX + productId + ":" + vId;
            boolean absoluteSet = true;

            if (delta != null) {
                Long newStock = redisTemplate.execute(
                        stockIncrementScript,
                        Collections.singletonList(key),
                        String.valueOf(delta)
                );
                if (newStock != null && newStock != -1) {
                    absoluteSet = false;
                    log.info("Relatively updated product {}, variant {} in Redis by delta {}. New stock: {}", 
                            productId, vId, delta, newStock);
                }
            }

            if (absoluteSet) {
                redisTemplate.opsForValue().set(key, String.valueOf(inventory.getQuantity()));
                log.info("Synced product {}, variant {} to Redis with absolute quantity {}", 
                        productId, vId, inventory.getQuantity());
            }
        } catch (Exception e) {
            log.error("Failed to sync product {}, variant {} to Redis", productId, variantId, e);
        }
    }

    private InventoryTransaction saveTransaction(Long productId, Long variantId, Long orderId, String type,
                                                  Integer quantityChanged, Integer before, Integer after,
                                                  String note, String referenceId) {
        InventoryTransaction transaction = InventoryTransaction.builder()
                .productId(productId)
                .variantId(variantId != null ? variantId : 0L)
                .orderId(orderId)
                .transactionType(type)
                .quantityChanged(quantityChanged)
                .quantityBefore(before)
                .quantityAfter(after)
                .note(note)
                .referenceId(referenceId)
                .build();

        return transactionRepository.save(transaction);
    }

    private void validateProductAndVariant(Long productId, Long variantId) {
        if (productId == null) {
            throw new IllegalArgumentException("Product ID cannot be null");
        }
        
        try {
            log.info("Validating product {} and variant {} against product-service via Feign Client", productId, variantId);
            
            ProductClient.ApiResponse<List<ProductDto>> response = 
                    productClient.getBulkProducts(Collections.singletonList(productId));
                    
            if (response == null || !"SUCCESS".equals(response.getCode())) {
                throw new ResourceNotFoundException("Product", "id", productId);
            }
            
            List<ProductDto> data = response.getData();
            if (data == null || data.isEmpty()) {
                throw new ResourceNotFoundException("Product", "id", productId);
            }
            
            if (variantId != null && variantId != 0L) {
                ProductDto productDto = data.get(0);
                List<ProductVariantDto> variants = productDto.getVariants();
                
                boolean variantExists = false;
                if (variants != null) {
                    for (ProductVariantDto v : variants) {
                        if (v.getId() != null && v.getId().longValue() == variantId.longValue()) {
                            variantExists = true;
                            break;
                        }
                    }
                }
                
                if (!variantExists) {
                    throw new ResourceNotFoundException("ProductVariant", "id", variantId);
                }
            }
        } catch (ResourceNotFoundException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to communicate with product-service for validation: {}", e.getMessage(), e);
            throw new RuntimeException("Không thể xác thực thông tin sản phẩm do dịch vụ sản phẩm không phản hồi. Vui lòng thử lại sau.", e);
        }
    }
}
