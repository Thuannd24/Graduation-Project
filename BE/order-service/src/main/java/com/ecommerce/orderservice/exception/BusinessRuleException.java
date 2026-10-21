package com.ecommerce.orderservice.exception;

import lombok.Getter;

/**
 * Vi phạm quy tắc nghiệp vụ (giới hạn số lượng, số đơn chờ thanh toán, SĐT sai định dạng, thiếu lý do hủy...).
 * Trả HTTP 400 với {@code code} cụ thể để giao diện xử lý.
 */
@Getter
public class BusinessRuleException extends RuntimeException {

    private final String code;

    public BusinessRuleException(String code, String message) {
        super(message);
        this.code = code;
    }
}
