package com.ecommerce.userservice.exception;

/** Ném ra khi một thao tác đồng bộ bắt buộc với Keycloak (đặt mật khẩu, gán quyền...) thất bại. */
public class KeycloakSyncException extends RuntimeException {
    public KeycloakSyncException(String message) {
        super(message);
    }
}
