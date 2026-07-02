package com.ecommerce.inventoryservice.controller;

import com.ecommerce.inventoryservice.dto.ApiResponse;
import com.ecommerce.inventoryservice.dto.InventoryResponse;
import com.ecommerce.inventoryservice.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/inventories")
@RequiredArgsConstructor
@Slf4j
public class InventoryController {

    private final InventoryService inventoryService;

    @GetMapping("/{productId}")
    public ResponseEntity<ApiResponse<InventoryResponse>> getInventory(
            @PathVariable Long productId,
            @RequestParam(value = "variantId", required = false, defaultValue = "0") Long variantId) {
        log.info("GET /api/v1/inventories/{}?variantId={}", productId, variantId);
        InventoryResponse inventory = inventoryService.getInventory(productId, variantId);
        return ResponseEntity.ok(ApiResponse.success(inventory));
    }
    // lấy 1 số lượng tồn kho của nhiều sản phẩm 
    @GetMapping("/batch")
    public ResponseEntity<ApiResponse<List<InventoryResponse>>> getBatchInventory(
            @RequestParam List<Long> productIds) {
        log.info("GET /api/v1/inventories/batch - {} products", productIds.size());
        List<InventoryResponse> inventories = inventoryService.getBatchInventory(productIds);
        return ResponseEntity.ok(ApiResponse.success(inventories));
    }
}
