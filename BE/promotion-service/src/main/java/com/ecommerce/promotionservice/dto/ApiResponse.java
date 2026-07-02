package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {

    private String code;
    private String message;
    private T data;

    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .code("SUCCESS")
                .message("Thành công")
                .data(data)
                .build();
    }

    public static <T> ApiResponse<T> error(String message) {
        return ApiResponse.<T>builder()
                .code("ERROR")
                .message(message)
                .data(null)
                .build();
    }

    public static <T> ApiResponse<T> validationFailed(String message, T data) {
        return ApiResponse.<T>builder()
                .code("VALIDATION_FAILED")
                .message(message)
                .data(data)
                .build();
    }
}
