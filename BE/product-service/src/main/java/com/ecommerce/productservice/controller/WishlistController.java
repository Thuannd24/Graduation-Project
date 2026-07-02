package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.service.WishlistService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/wishlist")
@RequiredArgsConstructor
public class WishlistController {

    private final WishlistService wishlistService;

    @PostMapping("/{productId}")
    public ApiResponse<Void> addToWishlist(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @PathVariable Long productId) {
        if ("anonymous".equals(userId)) {
            return ApiResponse.error("UNAUTHORIZED", "User not authenticated");
        }
        wishlistService.addToWishlist(userId, productId);
        return ApiResponse.success(null);
    }

    @DeleteMapping("/{productId}")
    public ApiResponse<Void> removeFromWishlist(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @PathVariable Long productId) {
        if ("anonymous".equals(userId)) {
            return ApiResponse.error("UNAUTHORIZED", "User not authenticated");
        }
        wishlistService.removeFromWishlist(userId, productId);
        return ApiResponse.success(null);
    }

    @GetMapping
    public ApiResponse<List<ProductDto>> getWishlist(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId) {
        if ("anonymous".equals(userId)) {
            return ApiResponse.error("UNAUTHORIZED", "User not authenticated");
        }
        return ApiResponse.success(wishlistService.getWishlist(userId));
    }

    @GetMapping("/check/{productId}")
    public ApiResponse<Boolean> isWishlisted(
            @RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId,
            @PathVariable Long productId) {
        if ("anonymous".equals(userId)) {
            return ApiResponse.success(false);
        }
        return ApiResponse.success(wishlistService.isWishlisted(userId, productId));
    }
}
