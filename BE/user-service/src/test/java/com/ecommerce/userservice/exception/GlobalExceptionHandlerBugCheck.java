package com.ecommerce.userservice.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * F2 - @PreAuthorize từ chối (AccessDeniedException) bị handler chung bắt thành 500.
 * Dùng chính cơ chế chọn @ExceptionHandler của Spring (ExceptionHandlerMethodResolver), không cần Spring context.
 * Chạy riêng: mvn -pl user-service test -Dtest=*BugCheck
 */
class GlobalExceptionHandlerBugCheck {

    @Test
    @DisplayName("TC_PH1_AUTHZ_01: STAFF gọi API chỉ dành cho ADMIN (AccessDeniedException từ @PreAuthorize) phải trả HTTP 403, không phải 500")
    void accessDenied_mustMapTo403() throws Exception {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        AccessDeniedException ex = new AccessDeniedException("Access Denied");

        Method method = new ExceptionHandlerMethodResolver(GlobalExceptionHandler.class).resolveMethod(ex);
        assertNotNull(method);
        ResponseEntity<?> response = (ResponseEntity<?>) method.invoke(handler, ex);

        assertEquals(403, response.getStatusCode().value());
    }
}
