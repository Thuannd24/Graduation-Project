package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.ProductDto;

import java.util.List;

public interface WishlistService {
    
    void addToWishlist(String userId, Long productId);
    
    void removeFromWishlist(String userId, Long productId);
    
    List<ProductDto> getWishlist(String userId);
    
    boolean isWishlisted(String userId, Long productId);
}
