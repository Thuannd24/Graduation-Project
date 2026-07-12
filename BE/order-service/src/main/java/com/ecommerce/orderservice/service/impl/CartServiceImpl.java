package com.ecommerce.orderservice.service.impl;

import com.ecommerce.grpc.inventory.InventoryGrpcResponse;
import com.ecommerce.grpc.product.GetPriceInfoResponse;
import com.ecommerce.grpc.product.ProductPriceInfoGrpc;
import com.ecommerce.grpc.product.ProductVariantInfoGrpc;
import com.ecommerce.orderservice.dto.request.CartItemRequest;
import com.ecommerce.orderservice.dto.response.CartItemResponse;
import com.ecommerce.orderservice.dto.response.CartResponse;
import com.ecommerce.orderservice.grpc.InventoryGrpcClient;
import com.ecommerce.orderservice.grpc.ProductGrpcClient;
import com.ecommerce.orderservice.service.CartService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;
import com.ecommerce.orderservice.exception.InsufficientStockException;

@Service
@RequiredArgsConstructor
@Slf4j
public class CartServiceImpl implements CartService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final RedisTemplate<String, String> stringRedisTemplate;
    private final ProductGrpcClient productGrpcClient;
    private final InventoryGrpcClient inventoryGrpcClient;
    private final ObjectMapper objectMapper;

    private static final String CART_PREFIX = "cart:";

    private String getRedisKey(String cartKey) {
        return cartKey.startsWith(CART_PREFIX) ? cartKey : CART_PREFIX + cartKey;
    }

    private String getFieldKey(Long productId, Long variantId) {
        return variantId != null ? productId + ":" + variantId : String.valueOf(productId);
    }

    private CartItemRequest deserializeCartItem(Object val) {
        if (val == null)
            return null;
        try {
            if (val instanceof CartItemRequest) {
                return (CartItemRequest) val;
            }
            if (val instanceof String) {
                return objectMapper.readValue((String) val, CartItemRequest.class);
            }
            return objectMapper.convertValue(val, CartItemRequest.class);
        } catch (Exception e) {
            log.error("Failed to deserialize cart item: {}", e.getMessage(), e);
            return null;
        }
    }

    @Override
    public CartResponse getCart(String cartKey) {
        String key = getRedisKey(cartKey);
        Map<Object, Object> entries = redisTemplate.opsForHash().entries(key);

        List<CartItemResponse> items = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;

        if (!entries.isEmpty()) {
            List<Long> productIds = entries.values().stream()
                    .map(this::deserializeCartItem)
                    .filter(Objects::nonNull)
                    .map(CartItemRequest::getProductId)
                    .distinct()
                    .collect(Collectors.toList());

            // Fetch live product details from Product Service via gRPC
            Map<Long, ProductPriceInfoGrpc> productDetails = new HashMap<>();
            if (!productIds.isEmpty()) {
                try {
                    GetPriceInfoResponse response = productGrpcClient.getPriceInfo(productIds);
                    for (ProductPriceInfoGrpc info : response.getProductsList()) {
                        productDetails.put(info.getId(), info);
                    }
                } catch (Exception e) {
                    log.error("[gRPC] Failed to fetch product details from product-service during cart retrieval: {}",
                            e.getMessage());
                    throw new com.ecommerce.orderservice.exception.ServiceUnavailableException(
                            "Hệ thống giỏ hàng đang bận do không thể tải thông tin sản phẩm. Vui lòng thử lại sau.");
                }
            }

            for (Map.Entry<Object, Object> entry : entries.entrySet()) {
                CartItemRequest reqItem = deserializeCartItem(entry.getValue());
                if (reqItem == null)
                    continue;

                Long productId = reqItem.getProductId();
                Long variantId = reqItem.getVariantId();
                ProductPriceInfoGrpc prodInfo = productDetails.get(productId);

                if (prodInfo != null) {
                    BigDecimal unitPrice = ProductGrpcClient.getPrice(prodInfo);
                    String productName = prodInfo.getName();
                    String imageUrl = prodInfo.getImageUrl();
                    BigDecimal weight = ProductGrpcClient.getWeight(prodInfo);
                    String variantAttr = null;
                    String size = null;
                    String color = null;

                    // If variant is present, override price, attributes and image with variant
                    // details
                    if (variantId != null && !prodInfo.getVariantsList().isEmpty()) {
                        Optional<ProductVariantInfoGrpc> variantOpt = prodInfo.getVariantsList().stream()
                                .filter(v -> variantId.equals(v.getId()))
                                .findFirst();

                        if (variantOpt.isPresent()) {
                            ProductVariantInfoGrpc varInfo = variantOpt.get();
                            BigDecimal varPrice = ProductGrpcClient.getVariantPrice(varInfo);
                            if (varPrice.compareTo(BigDecimal.ZERO) > 0) {
                                unitPrice = varPrice;
                            }
                            if (!varInfo.getImageUrl().isBlank()) {
                                imageUrl = varInfo.getImageUrl();
                            }
                            BigDecimal varWeight = ProductGrpcClient.getVariantWeight(varInfo);
                            if (varWeight.compareTo(BigDecimal.ZERO) > 0) {
                                weight = varWeight;
                            }
                            String varAttrJson = varInfo.getVariantAttrJson();
                            if (varAttrJson != null && !varAttrJson.isBlank()) {
                                variantAttr = varAttrJson;
                                try {
                                    Map<String, String> attrMap = objectMapper.readValue(varAttrJson,
                                            new TypeReference<Map<String, String>>() {
                                            });
                                    size = attrMap.getOrDefault("size", attrMap.get("storage"));
                                    color = attrMap.get("color");
                                } catch (Exception e) {
                                    log.error("Failed to parse variant attributes: {}", e.getMessage());
                                }
                            }
                        }
                    }

                    BigDecimal itemTotal = unitPrice.multiply(BigDecimal.valueOf(reqItem.getQuantity()));
                    totalAmount = totalAmount.add(itemTotal);

                    items.add(CartItemResponse.builder()
                            .productId(productId)
                            .variantId(variantId)
                            .productName(productName)
                            .size(size)
                            .color(color)
                            .imageUrl(imageUrl)
                            .variantAttr(variantAttr)
                            .unitPrice(unitPrice)
                            .quantity(reqItem.getQuantity())
                            .subtotal(itemTotal)
                            .weight(weight)
                            .build());
                } else {
                    log.warn("Product ID {} in cart not found in product-service details", productId);
                }
            }
        }

        String userId = cartKey.startsWith(CART_PREFIX) ? cartKey.substring(CART_PREFIX.length()) : cartKey;

        return CartResponse.builder()
                .userId(userId)
                .items(items)
                .totalAmount(totalAmount)
                .build();
    }

    private void validateStock(Long productId, Long variantId, int quantityRequested) {
        Long resolvedVariantId = variantId != null ? variantId : 0L;
        String stockKey = "product:stock:" + productId + ":" + resolvedVariantId;
        String stockStr = stringRedisTemplate.opsForValue().get(stockKey);

        if (stockStr == null) {
            log.warn(
                    "Stock cache is missing for product: {}, variant: {}. Initializing from inventory-service during cart validation.",
                    productId, resolvedVariantId);

            String stockLockKey = "product:stock:lock:" + productId + ":" + resolvedVariantId;
            String lockValue = UUID.randomUUID().toString();
            boolean acquired = false;
            int maxRetries = 10;
            int retryCount = 0;

            while (stockStr == null && retryCount < maxRetries) {
                Boolean success = stringRedisTemplate.opsForValue().setIfAbsent(stockLockKey, lockValue,
                        Duration.ofSeconds(5));
                if (Boolean.TRUE.equals(success)) {
                    acquired = true;
                    break;
                }

                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
                stockStr = stringRedisTemplate.opsForValue().get(stockKey);
                retryCount++;
            }

            if (acquired) {
                try {
                    stockStr = stringRedisTemplate.opsForValue().get(stockKey);
                    if (stockStr == null) {
                        // Gọi inventory-service qua gRPC thay vì Feign
                        InventoryGrpcResponse grpcResponse = inventoryGrpcClient.getInventory(productId, resolvedVariantId);
                        if (grpcResponse.getFound()) {
                            int actualStock = grpcResponse.getQuantity();
                            stringRedisTemplate.opsForValue().set(stockKey, String.valueOf(actualStock));
                            stockStr = String.valueOf(actualStock);
                        } else {
                            log.warn("[gRPC] Inventory not found for product {}, variant {}. Caching stock as 0.",
                                    productId, resolvedVariantId);
                            stringRedisTemplate.opsForValue().set(stockKey, "0");
                            stockStr = "0";
                        }
                    }
                } catch (Exception e) {
                    log.error("[gRPC] Failed to fetch stock from inventory-service for product {}, variant {}",
                            productId, resolvedVariantId, e);
                    log.warn(
                            "Stock validation failed due to gRPC error. Permitting cart add (fail-open) to maintain resilience.");
                    return;
                } finally {
                    String currentLockVal = stringRedisTemplate.opsForValue().get(stockLockKey);
                    if (lockValue.equals(currentLockVal)) {
                        stringRedisTemplate.delete(stockLockKey);
                    }
                }
            } else if (stockStr == null) {
                log.warn("Stock validation lock timeout. Permitting cart add (fail-open) to maintain resilience.");
                return;
            }
        }

        try {
            int availableStock = Integer.parseInt(stockStr);
            if (quantityRequested > availableStock) {
                throw new InsufficientStockException(
                        "Sản phẩm này hiện chỉ còn " + availableStock + " sản phẩm trong kho.");
            }
        } catch (NumberFormatException e) {
            log.error("Invalid stock value in Redis for key {}: {}", stockKey, stockStr);
        }
    }

    @Override
    public CartResponse addItemToCart(String cartKey, CartItemRequest itemRequest) {
        String key = getRedisKey(cartKey);
        String fieldKey = getFieldKey(itemRequest.getProductId(), itemRequest.getVariantId());

        try {
            int newQuantity = itemRequest.getQuantity();
            Object existingVal = redisTemplate.opsForHash().get(key, fieldKey);
            if (existingVal != null) {
                CartItemRequest existingItem = deserializeCartItem(existingVal);
                if (existingItem != null) {
                    newQuantity += existingItem.getQuantity();
                }
            }

            // Validate stock before saving
            validateStock(itemRequest.getProductId(), itemRequest.getVariantId(), newQuantity);

            itemRequest.setQuantity(newQuantity);
            redisTemplate.opsForHash().put(key, fieldKey, itemRequest);
            redisTemplate.expire(key, Duration.ofDays(30));
        } catch (InsufficientStockException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to add item to cart in Redis: {}", e.getMessage(), e);
            throw new RuntimeException("Cart update failed: " + e.getMessage());
        }

        return getCart(cartKey);
    }

    @Override
    public CartResponse updateItemQuantity(String cartKey, Long productId, Long variantId, Integer quantity) {
        String key = getRedisKey(cartKey);
        String fieldKey = getFieldKey(productId, variantId);

        try {
            Object existingVal = redisTemplate.opsForHash().get(key, fieldKey);
            if (existingVal != null) {
                CartItemRequest existingItem = deserializeCartItem(existingVal);
                if (existingItem != null) {
                    if (quantity <= 0) {
                        redisTemplate.opsForHash().delete(key, fieldKey);
                    } else {
                        // Validate stock before updating
                        validateStock(productId, variantId, quantity);
                        existingItem.setQuantity(quantity);
                        redisTemplate.opsForHash().put(key, fieldKey, existingItem);
                        redisTemplate.expire(key, Duration.ofDays(30));
                    }
                }
            }
        } catch (InsufficientStockException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to update item quantity in Redis: {}", e.getMessage(), e);
            throw new RuntimeException("Cart update failed: " + e.getMessage());
        }

        return getCart(cartKey);
    }

    @Override
    public CartResponse removeItemFromCart(String cartKey, Long productId, Long variantId) {
        String key = getRedisKey(cartKey);
        String fieldKey = getFieldKey(productId, variantId);
        redisTemplate.opsForHash().delete(key, fieldKey);
        return getCart(cartKey);
    }

    @Override
    public void clearCart(String cartKey) {
        String key = getRedisKey(cartKey);
        redisTemplate.delete(key);
    }
}
