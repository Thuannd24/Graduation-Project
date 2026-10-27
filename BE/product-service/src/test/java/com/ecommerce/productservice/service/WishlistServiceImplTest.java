package com.ecommerce.productservice.service;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.WishlistItem;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.WishlistItemRepository;
import com.ecommerce.productservice.service.impl.WishlistServiceImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WishlistServiceImplTest {

    @Mock private WishlistItemRepository wishlistRepository;
    @Mock private ProductRepository productRepository;
    @Mock private ProductService productService;
    @Mock private StringRedisTemplate redisTemplate;
    @Mock private SetOperations<String, String> setOperations;

    @InjectMocks
    private WishlistServiceImpl wishlistService;

    @Test
    @DisplayName("TC_PH2_WISH_01: Thêm sản phẩm vào wishlist: đã có thì bỏ qua (không lưu trùng); chưa có thì lưu DB và đồng bộ Redis set user:{id}:wishlist (TTL 7 ngày)")
    void addToWishlist_idempotentAndSyncsRedis() {
        when(wishlistRepository.existsByUserIdAndProductId("u1", 5L)).thenReturn(true);
        wishlistService.addToWishlist("u1", 5L);
        verify(wishlistRepository, never()).save(any());

        when(wishlistRepository.existsByUserIdAndProductId("u1", 6L)).thenReturn(false);
        when(productRepository.findById(6L)).thenReturn(Optional.of(Product.builder().id(6L).build()));
        when(redisTemplate.opsForSet()).thenReturn(setOperations);

        wishlistService.addToWishlist("u1", 6L);

        verify(wishlistRepository).save(any(WishlistItem.class));
        verify(setOperations).add("user:u1:wishlist", "6");
        verify(redisTemplate).expire("user:u1:wishlist", Duration.ofDays(7));
    }

    @Test
    @DisplayName("TC_PH2_WISH_02: Kiểm tra đã thích khi cache Redis chưa có key -> đọc DB (true) và nạp lại cache, không trả 'false' sai")
    void isWishlisted_cacheMissFallsBackToDb() {
        when(redisTemplate.hasKey("user:u1:wishlist")).thenReturn(false);
        when(wishlistRepository.existsByUserIdAndProductId("u1", 5L)).thenReturn(true);
        when(redisTemplate.opsForSet()).thenReturn(setOperations);

        assertTrue(wishlistService.isWishlisted("u1", 5L));
        verify(setOperations, never()).isMember(any(), any());
        verify(setOperations).add("user:u1:wishlist", "5");
    }
}
