package com.ecommerce.productservice.exception;

/**
 * Dịch vụ phụ thuộc (VD: order-service) không phản hồi nên không thể xác minh nghiệp vụ.
 * Trả HTTP 503 để client biết có thể thử lại sau, thay vì bỏ qua bước kiểm tra.
 */
public class ServiceUnavailableException extends RuntimeException {

    public ServiceUnavailableException(String message) {
        super(message);
    }

    public ServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
