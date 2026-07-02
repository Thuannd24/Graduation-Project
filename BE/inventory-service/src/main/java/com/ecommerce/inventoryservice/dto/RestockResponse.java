package com.ecommerce.inventoryservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RestockResponse {

    private Long productId;
    private Long variantId;
    private Integer previousQuantity;
    private Integer addedQuantity;
    private Integer currentQuantity;
    private Long transactionId;
}
