package com.ecommerce.inventoryservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryTransactionResponse {

    private Long id;
    private Long orderId;
    private Long productId;
    private Long variantId;
    private String transactionType;
    private Integer quantityChanged;
    private Integer quantityBefore;
    private Integer quantityAfter;
    private String referenceId;
    private String note;
    private LocalDateTime createdAt;
}
