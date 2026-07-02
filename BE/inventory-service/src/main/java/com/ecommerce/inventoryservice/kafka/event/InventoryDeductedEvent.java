package com.ecommerce.inventoryservice.kafka.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryDeductedEvent {

    private String eventType;
    private Long orderId;
    private String status; // CONFIRMED, FAILED
    private String failReason;
    private String timestamp;
}
