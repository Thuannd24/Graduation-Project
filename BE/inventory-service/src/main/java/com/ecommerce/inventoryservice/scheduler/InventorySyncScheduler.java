package com.ecommerce.inventoryservice.scheduler;

import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.entity.InventoryDailySnapshot;
import com.ecommerce.inventoryservice.repository.InventoryDailySnapshotRepository;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventorySyncScheduler {

    private final InventoryService inventoryService;
    private final InventoryRepository inventoryRepository;
    private final InventoryDailySnapshotRepository snapshotRepository;

    // Sync Redis with database during off-peak hours (2 AM daily)
    // This prevents active checkouts/Flash Sales from having their Redis cache overwritten with stale DB values due to Kafka queue lag
    @Scheduled(cron = "0 0 2 * * ?")
    public void syncRedisWithDatabase() {
        log.info("Starting scheduled Redis sync");
        try {
            inventoryService.syncRedisFromDatabase();
            log.info("Scheduled Redis sync completed successfully");
        } catch (Exception e) {
            log.error("Failed to sync Redis with database", e);
        }
    }

    // Take daily snapshot at 11 PM
    @Scheduled(cron = "0 0 23 * * ?")
    public void takeDailySnapshot() {
        log.info("Starting daily inventory snapshot");
        try {
            LocalDate today = LocalDate.now();
            
            // 1. Fetch all existing snapshot keys for today to prevent duplicates
            List<InventoryDailySnapshot> existingSnapshots = snapshotRepository.findBySnapshotDate(today);
            Set<String> existingKeys = existingSnapshots.stream()
                    .map(s -> s.getProductId() + ":" + s.getVariantId())
                    .collect(Collectors.toSet());
            
            int pageSize = 1000;
            int pageNum = 0;
            Page<Inventory> inventoryPage;
            int snapshotCount = 0;

            // 2. Page through all inventories to avoid JVM OOM
            do {
                Pageable pageable = PageRequest.of(pageNum, pageSize);
                inventoryPage = inventoryRepository.findAll(pageable);
                List<Inventory> batchList = inventoryPage.getContent();

                if (!batchList.isEmpty()) {
                    List<InventoryDailySnapshot> newSnapshots = new ArrayList<>();
                    
                    for (Inventory inventory : batchList) {
                        String key = inventory.getProductId() + ":" + inventory.getVariantId();
                        if (!existingKeys.contains(key)) {
                            InventoryDailySnapshot snapshot = InventoryDailySnapshot.builder()
                                    .productId(inventory.getProductId())
                                    .variantId(inventory.getVariantId())
                                    .stockLevel(inventory.getQuantity())
                                    .snapshotDate(today)
                                    .build();
                            newSnapshots.add(snapshot);
                        }
                    }

                    // 3. Save snapshots in batch
                    if (!newSnapshots.isEmpty()) {
                        snapshotRepository.saveAll(newSnapshots);
                        snapshotCount += newSnapshots.size();
                    }
                }
                pageNum++;
            } while (inventoryPage.hasNext());

            log.info("Daily snapshot completed. Created {} snapshots", snapshotCount);
        } catch (Exception e) {
            log.error("Failed to take daily inventory snapshot", e);
        }
    }
}
