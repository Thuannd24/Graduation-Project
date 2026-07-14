package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.WishlistItem;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.WishlistItemRepository;
import com.ecommerce.productservice.service.ProductService;
import com.ecommerce.productservice.service.WishlistService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class WishlistServiceImpl implements WishlistService {

    private final WishlistItemRepository wishlistRepository;
    private final ProductRepository productRepository;
    private final ProductService productService;
    private final StringRedisTemplate redisTemplate;

    private static final String WISHLIST_PREFIX = "user:";
    private static final String WISHLIST_SUFFIX = ":wishlist";

    private String getRedisKey(String userId) {
        return WISHLIST_PREFIX + userId + WISHLIST_SUFFIX;
    }

    @Override
    @Transactional
    public void addToWishlist(String userId, Long productId) {
        log.info("Adding product {} to wishlist of user {}", productId, userId);

        if (wishlistRepository.existsByUserIdAndProductId(userId, productId)) {
            log.info("Product {} already in wishlist of user {}", productId, userId);
            return;
        }

        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new RuntimeException("Product not found with id: " + productId));

        WishlistItem item = WishlistItem.builder()
                .userId(userId)
                .product(product)
                .build();

        wishlistRepository.save(item);

        // Sync to Redis cache
        try {
            String redisKey = getRedisKey(userId);
            redisTemplate.opsForSet().add(redisKey, String.valueOf(productId));
            redisTemplate.expire(redisKey, Duration.ofDays(7));
        } catch (Exception e) {
            log.error("Failed to sync wishlist to Redis for user {}", userId, e);
        }
    }

    @Override
    @Transactional
    public void removeFromWishlist(String userId, Long productId) {
        log.info("Removing product {} from wishlist of user {}", productId, userId);
        wishlistRepository.findByUserIdAndProductId(userId, productId)
                .ifPresent(wishlistRepository::delete);

        // Sync to Redis cache
        try {
            String redisKey = getRedisKey(userId);
            redisTemplate.opsForSet().remove(redisKey, String.valueOf(productId));
        } catch (Exception e) {
            log.error("Failed to remove wishlist item from Redis for user {}", userId, e);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProductDto> getWishlist(String userId) {
        log.info("Getting wishlist for user {}", userId);

        // Try fetching from Redis first
        String redisKey = getRedisKey(userId);
        Set<String> cachedIds = null;
        try {
            cachedIds = redisTemplate.opsForSet().members(redisKey);
        } catch (Exception e) {
            log.error("Failed to get wishlist from Redis for user {}", userId, e);
        }

        List<Long> productIds;
        if (cachedIds != null && !cachedIds.isEmpty()) {
            productIds = cachedIds.stream()
                    .map(Long::valueOf)
                    .collect(Collectors.toList());
        } else {
            // Fallback to database
            List<WishlistItem> dbItems = wishlistRepository.findByUserId(userId);
            productIds = dbItems.stream()
                    .map(item -> item.getProduct().getId())
                    .collect(Collectors.toList());

            // Warm up Redis cache
            if (!productIds.isEmpty()) {
                try {
                    String[] idArray = productIds.stream()
                            .map(String::valueOf)
                            .toArray(String[]::new);
                    redisTemplate.opsForSet().add(redisKey, idArray);
                    redisTemplate.expire(redisKey, Duration.ofDays(7));
                } catch (Exception e) {
                    log.error("Failed to warm up wishlist Redis cache for user {}", userId, e);
                }
            }
        }

        if (productIds.isEmpty()) {
            return Collections.emptyList();
        }

        return productService.getProductsByIds(productIds);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isWishlisted(String userId, Long productId) {
        // Check Redis cache first (O(1))
        String redisKey = getRedisKey(userId);
        try {
            // BUG FIX: SISMEMBER on a key that was never warmed (or expired) returns FALSE, not
            // null - the old code treated that FALSE as an authoritative "not wishlisted" answer
            // and never fell back to the DB, so a product added to the wishlist without the user
            // ever opening the wishlist page (cache never warmed) showed as NOT wishlisted.
            // hasKey() distinguishes "no cache yet" from "cache says no" (Redis auto-removes a
            // set once it's empty, so an existing key always has at least one real member).
            Boolean keyExists = redisTemplate.hasKey(redisKey);
            if (Boolean.TRUE.equals(keyExists)) {
                Boolean isMember = redisTemplate.opsForSet().isMember(redisKey, String.valueOf(productId));
                return Boolean.TRUE.equals(isMember);
            }
        } catch (Exception e) {
            log.error("Failed to check wishlist membership in Redis for user {}", userId, e);
        }

        // Fallback to DB (cache miss: never warmed, expired, or Redis error)
        boolean exists = wishlistRepository.existsByUserIdAndProductId(userId, productId);
        
        // Repopulate cache
        if (exists) {
            try {
                redisTemplate.opsForSet().add(redisKey, String.valueOf(productId));
                redisTemplate.expire(redisKey, Duration.ofDays(7));
            } catch (Exception ex) {
                log.error("Failed to sync isMember result to Redis", ex);
            }
        }

        return exists;
    }
}
