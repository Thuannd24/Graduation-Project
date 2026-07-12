package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.dto.request.CheckoutPreviewRequest;
import com.ecommerce.orderservice.dto.request.CheckoutRequest;
import com.ecommerce.orderservice.dto.response.CheckoutPreviewResponse;
import com.ecommerce.orderservice.dto.response.OrderResponse;
import com.ecommerce.orderservice.dto.response.WarrantyItemResponse;
import java.util.List;

public interface OrderService {
    OrderResponse createOrder(String userId, CheckoutRequest checkoutRequest, String idempotencyKey, String email);
    CheckoutPreviewResponse previewCheckout(String userId, CheckoutPreviewRequest request);
    OrderResponse getOrder(Long orderId, String userId, String rolesHeader);
    List<OrderResponse> getOrdersByUser(String userId, String rolesHeader);
    void cancelOrder(Long orderId, String userId, String email);
    void cancelOrder(Long orderId, String userId, String email, String rolesHeader);
    void updateOrderStatus(Long orderId, String status);
    OrderResponse shipOrder(Long orderId);
    void handleShippingWebhook(String trackingCode, String status);
    OrderResponse updateDeliveryStatusByAdmin(Long orderId, String status);
    List<WarrantyItemResponse> lookupWarrantyByPhone(String phoneNumber);
    void expireOrder(Long orderId);
}


