package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.dto.request.CartItemRequest;
import com.ecommerce.orderservice.dto.response.CartResponse;

import java.util.List;

public interface CartService {
    CartResponse getCart(String cartKey);
    CartResponse buildDirectCart(List<CartItemRequest> directItems);
    CartResponse addItemToCart(String cartKey, String sessionId, CartItemRequest itemRequest);
    CartResponse updateItemQuantity(String cartKey, String sessionId, Long productId, Long variantId, Integer quantity);
    CartResponse removeItemFromCart(String cartKey, String sessionId, Long productId, Long variantId);
    void clearCart(String cartKey, String sessionId);
}
