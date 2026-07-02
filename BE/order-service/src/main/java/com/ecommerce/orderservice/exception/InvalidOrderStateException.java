package com.ecommerce.orderservice.exception;

public class InvalidOrderStateException extends RuntimeException {
    
    public InvalidOrderStateException(String message) {
        super(message);
    }

    public InvalidOrderStateException(String currentState, String targetState) {
        super(String.format("Cannot transition from %s to %s", currentState, targetState));
    }
}
