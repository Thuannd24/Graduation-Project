package com.ecommerce.inventoryservice.exception;

public class InsufficientStockException extends RuntimeException {

    public InsufficientStockException(String message) {
        super(message);
    }

    public InsufficientStockException(Long productId, Integer requested, Integer available) {
        super(String.format("Insufficient stock for product %d: requested=%d, available=%d", 
            productId, requested, available));
    }
}
