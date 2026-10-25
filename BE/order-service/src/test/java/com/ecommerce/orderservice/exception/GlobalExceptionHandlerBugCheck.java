package com.ecommerce.orderservice.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * F2 - order-service: AccessDeniedException (xem/hủy đơn của người khác, CUSTOMER gọi /ship) bị handler chung trả 500.
 * Dùng ExceptionHandlerMethodResolver - đúng cơ chế Spring MVC chọn @ExceptionHandler, không cần Spring context.
 * Chạy riêng: mvn -pl order-service test -Dtest=*BugCheck
 */
class GlobalExceptionHandlerBugCheck {

    @Test
    @DisplayName("TC_PH3_OWNER_03: Khách xem/hủy đơn của người khác (AccessDeniedException) phải trả HTTP 403 Forbidden, không phải 500")
    void accessDenied_mustMapTo403() throws Exception {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        AccessDeniedException ex = new AccessDeniedException("You are not authorized to view this order");

        Method method = new ExceptionHandlerMethodResolver(GlobalExceptionHandler.class).resolveMethod(ex);
        assertNotNull(method);
        ResponseEntity<?> response = (ResponseEntity<?>) method.invoke(handler, ex);

        assertEquals(403, response.getStatusCode().value());
    }
}
