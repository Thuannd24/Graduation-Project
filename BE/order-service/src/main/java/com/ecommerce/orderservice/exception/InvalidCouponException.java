package com.ecommerce.orderservice.exception;

public class InvalidCouponException extends InvalidOrderStateException {

    public InvalidCouponException(String message) {
        super(message);
    }
}
