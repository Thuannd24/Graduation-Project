package com.ecommerce.orderservice.exception;

public class InsufficientStockException extends RuntimeException {
    
    private final Long productId;
    private final Integer requested;
    private final Integer available;

    public InsufficientStockException(Long productId, Integer requested, Integer available) {
        super(String.format("Insufficient stock for product %d. Requested: %d, Available: %d", 
                productId, requested, available));
        this.productId = productId;
        this.requested = requested;
        this.available = available;
    }

    public InsufficientStockException(String message) {
        super(message);
        this.productId = null;
        this.requested = null;
        this.available = null;
    }

    public Long getProductId() {
        return productId;
    }

    public Integer getRequested() {
        return requested;
    }

    public Integer getAvailable() {
        return available;
    }
}
