package com.ecommerce.orderservice.service;

import com.ecommerce.grpc.product.GetPriceInfoResponse;
import com.ecommerce.grpc.product.ProductPriceInfoGrpc;
import com.ecommerce.grpc.product.ProductVariantInfoGrpc;
import com.ecommerce.orderservice.dto.request.CartItemRequest;
import com.ecommerce.orderservice.dto.response.CartItemResponse;
import com.ecommerce.orderservice.dto.response.CartResponse;
import com.ecommerce.orderservice.event.producer.CartEventProducer;
import com.ecommerce.orderservice.exception.InsufficientStockException;
import com.ecommerce.orderservice.grpc.InventoryGrpcClient;
import com.ecommerce.orderservice.grpc.ProductGrpcClient;
import com.ecommerce.orderservice.service.impl.CartServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CartServiceImplTest {

    @Mock private RedisTemplate<String, Object> redisTemplate;
    @Mock private RedisTemplate<String, String> stringRedisTemplate;
    @Mock private HashOperations<String, Object, Object> hashOps;
    @Mock private ValueOperations<String, String> valueOps;
    @Mock private ProductGrpcClient productGrpcClient;
    @Mock private InventoryGrpcClient inventoryGrpcClient;
    @Mock private CartEventProducer cartEventProducer;

    private CartServiceImpl cartService;

    @BeforeEach
    void setUp() {
        // Khởi tạo thủ công: 2 RedisTemplate cùng kiểu thô nên không để Mockito tự đoán theo kiểu.
        cartService = new CartServiceImpl(redisTemplate, stringRedisTemplate, productGrpcClient,
                inventoryGrpcClient, new ObjectMapper(), cartEventProducer);
        lenient().when(redisTemplate.opsForHash()).thenReturn(hashOps);
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOps);
    }

    private static CartItemRequest item(long productId, Long variantId, int qty) {
        return CartItemRequest.builder().productId(productId).variantId(variantId).quantity(qty).build();
    }

    @Test
    @DisplayName("TC_PH3_CART_01: Thêm sản phẩm đã có trong giỏ (2 cái) thêm 3 -> cộng dồn 5, kiểm tồn kho theo 5 (kho 10), lưu Redis TTL 30 ngày, phát sự kiện ADD_ITEM")
    void addItem_mergesQuantity() {
        when(hashOps.get("cart:u1", "5")).thenReturn(item(5L, null, 2));
        when(valueOps.get("product:stock:5:0")).thenReturn("10");
        when(hashOps.entries("cart:u1")).thenReturn(Collections.emptyMap());

        cartService.addItemToCart("u1", "sess-1", item(5L, null, 3));

        ArgumentCaptor<Object> saved = ArgumentCaptor.forClass(Object.class);
        verify(hashOps).put(eq("cart:u1"), eq("5"), saved.capture());
        assertEquals(5, ((CartItemRequest) saved.getValue()).getQuantity());
        verify(redisTemplate).expire("cart:u1", Duration.ofDays(30));
        verify(cartEventProducer).publishCartUpdated("u1", "sess-1", 5L, null, 5, "ADD_ITEM");
    }

    @Test
    @DisplayName("TC_PH3_CART_02: Thêm 5 sản phẩm khi kho chỉ còn 4 -> InsufficientStockException 'chỉ còn 4', không ghi giỏ, không phát sự kiện")
    void addItem_exceedsStock() {
        when(hashOps.get("cart:u1", "5:51")).thenReturn(null);
        when(valueOps.get("product:stock:5:51")).thenReturn("4");

        InsufficientStockException ex = assertThrows(InsufficientStockException.class,
                () -> cartService.addItemToCart("u1", null, item(5L, 51L, 5)));
        assertTrue(ex.getMessage().contains("chỉ còn 4"));
        verify(hashOps, never()).put(any(), any(), any());
        verifyNoInteractions(cartEventProducer);
    }

    @Test
    @DisplayName("TC_PH3_CART_03: Xem giỏ: giá lấy trực tiếp từ product-service, biến thể ghi đè giá + tách size/color; sản phẩm không còn tồn tại bị bỏ qua; tổng = 650.000")
    void getCart_livePricesAndVariants() {
        Map<Object, Object> entries = new LinkedHashMap<>();
        entries.put("5", item(5L, null, 2));
        entries.put("6:61", item(6L, 61L, 1));
        entries.put("8", item(8L, null, 1));
        when(hashOps.entries("cart:u1")).thenReturn(entries);

        ProductPriceInfoGrpc p5 = ProductPriceInfoGrpc.newBuilder().setId(5L).setName("Ốp lưng").setPrice("100000").build();
        ProductPriceInfoGrpc p6 = ProductPriceInfoGrpc.newBuilder().setId(6L).setName("iPhone").setPrice("500000")
                .addVariants(ProductVariantInfoGrpc.newBuilder().setId(61L).setPrice("450000")
                        .setVariantAttrJson("{\"color\":\"Đen\",\"storage\":\"256GB\"}").build())
                .build();
        when(productGrpcClient.getPriceInfo(anyList()))
                .thenReturn(GetPriceInfoResponse.newBuilder().addProducts(p5).addProducts(p6).build());

        CartResponse cart = cartService.getCart("u1");

        assertEquals("u1", cart.getUserId());
        assertEquals(2, cart.getItems().size());
        assertEquals(0, new BigDecimal("650000").compareTo(cart.getTotalAmount()));
        CartItemResponse variantItem = cart.getItems().stream().filter(i -> i.getProductId() == 6L).findFirst().orElseThrow();
        assertEquals(0, new BigDecimal("450000").compareTo(variantItem.getUnitPrice()));
        assertEquals("256GB", variantItem.getSize());
        assertEquals("Đen", variantItem.getColor());
    }
}
