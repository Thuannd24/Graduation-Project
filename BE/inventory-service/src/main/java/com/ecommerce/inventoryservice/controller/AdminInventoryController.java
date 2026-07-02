package com.ecommerce.inventoryservice.controller;

import com.ecommerce.inventoryservice.dto.*;
import com.ecommerce.inventoryservice.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/inventories")
@RequiredArgsConstructor
@Slf4j
public class AdminInventoryController {

    private final InventoryService inventoryService;

    @PutMapping("/{productId}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<InventoryResponse>> updateInventory(
            @PathVariable Long productId,
            @RequestParam(value = "variantId", required = false, defaultValue = "0") Long variantId,
            @Valid @RequestBody InventoryUpdateRequest request) {
        
        log.info("PUT /api/v1/admin/inventories/{}?variantId={} - quantity: {}", productId, variantId, request.getQuantity());
        InventoryResponse response = inventoryService.updateInventory(productId, variantId, request.getQuantity());
        return ResponseEntity.ok(ApiResponse.success("Inventory updated successfully", response));
    }

    @PostMapping("/{productId}/restock")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<RestockResponse>> restock(
            @PathVariable Long productId,
            @RequestParam(value = "variantId", required = false, defaultValue = "0") Long variantId,
            @Valid @RequestBody RestockRequestDto request,
            @RequestHeader(value = "X-User-Id", required = false, defaultValue = "admin") String userIdHeader) {
        
        log.info("POST /api/v1/admin/inventories/{}/restock?variantId={} - quantity: {}", 
                productId, variantId, request.getQuantity());
        
        String adminId = userIdHeader;
        RestockResponse response = inventoryService.restock(productId, variantId, request, adminId);
        return ResponseEntity.ok(ApiResponse.success("Product restocked successfully", response));
    }

    @GetMapping("/{productId}/transactions")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<Page<InventoryTransactionResponse>>> getTransactions(
            @PathVariable Long productId,
            @RequestParam(value = "variantId", required = false) Long variantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        log.info("GET /api/v1/admin/inventories/{}/transactions?variantId={} - page: {}, size: {}", 
                productId, variantId, page, size);
        
        Pageable pageable = PageRequest.of(page, size);
        Page<InventoryTransactionResponse> transactions = 
                inventoryService.getTransactions(productId, variantId, pageable);
        return ResponseEntity.ok(ApiResponse.success(transactions));
    }

    @GetMapping("/low-stock")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<List<InventoryResponse>>> getLowStockProducts(
            @RequestParam(defaultValue = "10") int threshold) {
        
        log.info("GET /api/v1/admin/inventories/low-stock - threshold: {}", threshold);
        List<InventoryResponse> lowStockProducts = inventoryService.getLowStockProducts(threshold);
        return ResponseEntity.ok(ApiResponse.success(lowStockProducts));
    }

    @PostMapping("/sync-redis")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<String>> syncRedis() {
        log.info("POST /api/v1/admin/inventories/sync-redis");
        inventoryService.syncRedisFromDatabase();
        return ResponseEntity.ok(ApiResponse.success("Redis sync triggered successfully", null));
    }
}
