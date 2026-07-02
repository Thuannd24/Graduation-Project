package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.request.CartItemRequest;
import com.ecommerce.orderservice.dto.response.CartResponse;
import com.ecommerce.orderservice.service.CartService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
@Validated
public class CartController {

    private final CartService cartService;

    @GetMapping
    public ApiResponse<CartResponse> getCart(@RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId) {
        return ApiResponse.success(cartService.getCart(userId));
    }

    @PostMapping
    public ApiResponse<CartResponse> addItemToCart(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @Valid @RequestBody CartItemRequest request) {
        return ApiResponse.success(cartService.addItemToCart(userId, request));
    }

    @PutMapping("/items/{productId}")
    public ApiResponse<CartResponse> updateItemQuantity(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @PathVariable Long productId,
            @RequestParam(value = "variantId", required = false) Long variantId,
            @RequestParam("quantity") @Min(value = 1, message = "Quantity must be at least 1") Integer quantity) {
        return ApiResponse.success(cartService.updateItemQuantity(userId, productId, variantId, quantity));
    }

    @DeleteMapping("/items/{productId}")
    public ApiResponse<CartResponse> removeItemFromCart(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @PathVariable Long productId,
            @RequestParam(value = "variantId", required = false) Long variantId) {
        return ApiResponse.success(cartService.removeItemFromCart(userId, productId, variantId));
    }

    @DeleteMapping
    public ApiResponse<Void> clearCart(@RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId) {
        cartService.clearCart(userId);
        return ApiResponse.success(null);
    }
}
