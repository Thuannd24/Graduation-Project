package com.ecommerce.inventoryservice.service;

import com.ecommerce.inventoryservice.client.ProductClient;
import com.ecommerce.inventoryservice.client.ProductClient.ProductDto;
import com.ecommerce.inventoryservice.client.ProductClient.ProductVariantDto;
import com.ecommerce.inventoryservice.dto.InventoryResponse;
import com.ecommerce.inventoryservice.dto.RestockRequestDto;
import com.ecommerce.inventoryservice.dto.RestockResponse;
import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.entity.InventoryTransaction;
import com.ecommerce.inventoryservice.entity.RestockRequest;
import com.ecommerce.inventoryservice.exception.ResourceNotFoundException;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import com.ecommerce.inventoryservice.repository.InventoryTransactionRepository;
import com.ecommerce.inventoryservice.repository.RestockRequestRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test InventoryService (PH4 - Tồn kho): nhập kho, đặt tồn kho tuyệt đối, xác thực sản phẩm qua product-service,
 * đồng bộ Redis sau commit, tồn kho thấp.
 */
@ExtendWith(MockitoExtension.class)
class InventoryServiceTest {

    @Mock private InventoryRepository inventoryRepository;
    @Mock private InventoryTransactionRepository transactionRepository;
    @Mock private RestockRequestRepository restockRequestRepository;
    @Mock private RedisTemplate<String, String> redisTemplate;
    @Mock private DefaultRedisScript<Long> stockIncrementScript;
    @Mock private ProductClient productClient;
    @Mock private ValueOperations<String, String> valueOps;

    @InjectMocks
    private InventoryService inventoryService;

    private void productExists(Long productId, Long... variantIds) {
        List<ProductVariantDto> variants = new java.util.ArrayList<>();
        for (Long v : variantIds) {
            variants.add(ProductVariantDto.builder().id(v).productId(productId).sku("SKU-" + v).build());
        }
        ProductDto dto = ProductDto.builder().id(productId).name("iPhone 15").variants(variants).build();
        when(productClient.getBulkProducts(List.of(productId)))
                .thenReturn(ProductClient.ApiResponse.<List<ProductDto>>builder().code("SUCCESS").data(List.of(dto)).build());
    }

    private void saveReturnsArgument() {
        when(inventoryRepository.save(any(Inventory.class))).thenAnswer(inv -> inv.getArgument(0));
        when(transactionRepository.save(any(InventoryTransaction.class))).thenAnswer(inv -> {
            InventoryTransaction tx = inv.getArgument(0);
            tx.setId(555L);
            return tx;
        });
    }

    @Test
    @DisplayName("TC_PH4_STOCK_01: Nhập thêm hàng cộng dồn vào tồn kho, ghi giao dịch RESTOCK, phiếu nhập COMPLETED và tăng kho Redis theo delta")
    void restock_success_addsQuantityAndLogs() {
        productExists(1L, 11L);
        Inventory inv = Inventory.builder().id(9L).productId(1L).variantId(11L).quantity(10).build();
        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(1L, 11L)).thenReturn(Optional.of(inv));
        when(inventoryRepository.findByProductIdAndVariantId(1L, 11L)).thenReturn(Optional.of(inv));
        saveReturnsArgument();
        when(redisTemplate.execute(eq(stockIncrementScript), eq(List.of("product:stock:1:11")), eq("5"))).thenReturn(15L);

        RestockRequestDto req = RestockRequestDto.builder().quantity(5).supplier("Công ty ABC").note("Nhập lô tháng 10").build();
        RestockResponse res = inventoryService.restock(1L, 11L, req, "admin-1");

        assertEquals(10, res.getPreviousQuantity());
        assertEquals(5, res.getAddedQuantity());
        assertEquals(15, res.getCurrentQuantity());
        assertEquals(555L, res.getTransactionId());
        assertEquals(15, inv.getQuantity());

        ArgumentCaptor<InventoryTransaction> tx = ArgumentCaptor.forClass(InventoryTransaction.class);
        verify(transactionRepository).save(tx.capture());
        assertEquals("RESTOCK", tx.getValue().getTransactionType());
        assertEquals(5, tx.getValue().getQuantityChanged());
        assertEquals(10, tx.getValue().getQuantityBefore());
        assertEquals(15, tx.getValue().getQuantityAfter());
        assertEquals("Công ty ABC", tx.getValue().getReferenceId());

        ArgumentCaptor<RestockRequest> rr = ArgumentCaptor.forClass(RestockRequest.class);
        verify(restockRequestRepository).save(rr.capture());
        assertEquals("COMPLETED", rr.getValue().getStatus());
        assertEquals("admin-1", rr.getValue().getRequestedBy());
        assertNotNull(rr.getValue().getCompletedAt());
        verify(redisTemplate, never()).opsForValue();
    }

    @Test
    @DisplayName("TC_PH4_STOCK_02: Nhập hàng cho sản phẩm chưa có bản ghi tồn kho (variantId=null) thì tạo mới với variant 0, tồn kho = số nhập; Redis chưa có key thì ghi giá trị tuyệt đối")
    void restock_createsInventoryWhenAbsent() {
        productExists(2L);
        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(2L, 0L)).thenReturn(Optional.empty());
        saveReturnsArgument();
        when(inventoryRepository.findByProductIdAndVariantId(2L, 0L))
                .thenReturn(Optional.of(Inventory.builder().productId(2L).variantId(0L).quantity(7).build()));
        when(redisTemplate.execute(eq(stockIncrementScript), eq(List.of("product:stock:2:0")), eq("7"))).thenReturn(-1L);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);

        RestockResponse res = inventoryService.restock(2L, null, RestockRequestDto.builder().quantity(7).build(), "admin-1");

        assertEquals(0L, res.getVariantId());
        assertEquals(0, res.getPreviousQuantity());
        assertEquals(7, res.getCurrentQuantity());
        ArgumentCaptor<Inventory> saved = ArgumentCaptor.forClass(Inventory.class);
        verify(inventoryRepository).save(saved.capture());
        assertEquals(2L, saved.getValue().getProductId());
        assertEquals(0L, saved.getValue().getVariantId());
        verify(valueOps).set("product:stock:2:0", "7");
    }

    @Test
    @DisplayName("TC_PH4_STOCK_03: Nhập hàng cho sản phẩm không tồn tại ở product-service (data rỗng hoặc code lỗi) bị từ chối, không ghi DB")
    void restock_productNotFound() {
        when(productClient.getBulkProducts(List.of(404L)))
                .thenReturn(ProductClient.ApiResponse.<List<ProductDto>>builder().code("SUCCESS").data(List.of()).build());
        when(productClient.getBulkProducts(List.of(405L)))
                .thenReturn(ProductClient.ApiResponse.<List<ProductDto>>builder().code("NOT_FOUND").build());
        RestockRequestDto req = RestockRequestDto.builder().quantity(5).build();

        assertThrows(ResourceNotFoundException.class, () -> inventoryService.restock(404L, null, req, "admin-1"));
        assertThrows(ResourceNotFoundException.class, () -> inventoryService.restock(405L, null, req, "admin-1"));
        verify(inventoryRepository, never()).save(any());
        verify(transactionRepository, never()).save(any());
        verify(restockRequestRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH4_STOCK_04: Nhập hàng với biến thể không thuộc sản phẩm bị từ chối (ResourceNotFoundException ProductVariant)")
    void restock_variantNotBelongToProduct() {
        productExists(1L, 11L, 12L);
        RestockRequestDto req = RestockRequestDto.builder().quantity(5).build();

        ResourceNotFoundException ex = assertThrows(ResourceNotFoundException.class,
                () -> inventoryService.restock(1L, 99L, req, "admin-1"));
        assertTrue(ex.getMessage().contains("ProductVariant"));
        verify(inventoryRepository, never()).findByProductIdAndVariantIdForUpdate(anyLong(), anyLong());
        verify(inventoryRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH4_STOCK_05: product-service không phản hồi thì báo lỗi tạm thời, productId null thì IllegalArgumentException; không ghi DB")
    void restock_productServiceDown_orNullProduct() {
        when(productClient.getBulkProducts(List.of(1L))).thenThrow(new RuntimeException("Connection refused"));
        RestockRequestDto req = RestockRequestDto.builder().quantity(5).build();

        RuntimeException ex = assertThrows(RuntimeException.class, () -> inventoryService.restock(1L, null, req, "admin-1"));
        assertTrue(ex.getMessage().contains("dịch vụ sản phẩm không phản hồi"));
        assertThrows(IllegalArgumentException.class, () -> inventoryService.updateInventory(null, null, 10));
        verify(inventoryRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH4_STOCK_06: Khi có transaction, đồng bộ Redis sau nhập hàng chỉ chạy SAU KHI commit (afterCommit)")
    void restock_redisSyncDeferredUntilCommit() {
        productExists(1L);
        Inventory inv = Inventory.builder().productId(1L).variantId(0L).quantity(3).build();
        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(1L, 0L)).thenReturn(Optional.of(inv));
        saveReturnsArgument();

        TransactionSynchronizationManager.initSynchronization();
        try {
            inventoryService.restock(1L, 0L, RestockRequestDto.builder().quantity(4).build(), "admin-1");
            verifyNoInteractions(redisTemplate);

            when(inventoryRepository.findByProductIdAndVariantId(1L, 0L)).thenReturn(Optional.of(inv));
            when(redisTemplate.execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("4"))).thenReturn(9L);
            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            assertEquals(1, syncs.size());
            syncs.forEach(TransactionSynchronization::afterCommit);
            verify(redisTemplate).execute(eq(stockIncrementScript), eq(List.of("product:stock:1:0")), eq("4"));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("TC_PH4_UPDATE_01: Admin đặt tồn kho tuyệt đối 20 -> 8: lưu 8, giao dịch ghi |delta|=12 (trước 20, sau 8), Redis tăng theo delta -12")
    void updateInventory_absoluteValue() {
        productExists(3L);
        Inventory inv = Inventory.builder().productId(3L).variantId(0L).quantity(20).build();
        when(inventoryRepository.findByProductIdAndVariantIdForUpdate(3L, 0L)).thenReturn(Optional.of(inv));
        when(inventoryRepository.findByProductIdAndVariantId(3L, 0L)).thenReturn(Optional.of(inv));
        saveReturnsArgument();
        when(redisTemplate.execute(eq(stockIncrementScript), eq(List.of("product:stock:3:0")), eq("-12"))).thenReturn(8L);

        InventoryResponse res = inventoryService.updateInventory(3L, null, 8);

        assertEquals(8, res.getQuantity());
        ArgumentCaptor<InventoryTransaction> tx = ArgumentCaptor.forClass(InventoryTransaction.class);
        verify(transactionRepository).save(tx.capture());
        assertEquals(12, tx.getValue().getQuantityChanged());
        assertEquals(20, tx.getValue().getQuantityBefore());
        assertEquals(8, tx.getValue().getQuantityAfter());
        assertEquals("Admin manual update", tx.getValue().getNote());
    }

    @Test
    @DisplayName("TC_PH4_UPDATE_02: syncSingleProductToRedis: key Redis chưa có (-1) thì ghi tuyệt đối; delta=null ghi tuyệt đối; lỗi (không có bản ghi) bị nuốt, không ném ra")
    void syncSingleProductToRedis_branches() {
        Inventory inv = Inventory.builder().productId(4L).variantId(0L).quantity(42).build();
        when(inventoryRepository.findByProductIdAndVariantId(4L, 0L)).thenReturn(Optional.of(inv));
        when(inventoryRepository.findByProductIdAndVariantId(5L, 0L)).thenReturn(Optional.empty());
        when(redisTemplate.execute(eq(stockIncrementScript), eq(List.of("product:stock:4:0")), eq("2"))).thenReturn(-1L);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);

        inventoryService.syncSingleProductToRedis(4L, null, 2);
        inventoryService.syncSingleProductToRedis(4L, 0L, null);
        assertDoesNotThrow(() -> inventoryService.syncSingleProductToRedis(5L, null, 1));

        verify(valueOps, times(2)).set("product:stock:4:0", "42");
        verify(redisTemplate, times(1)).execute(eq(stockIncrementScript), anyList(), any());
    }

    @Test
    @DisplayName("TC_PH4_LOW_01: Tồn kho thấp / tra cứu: lấy SP dưới ngưỡng; tra kho không tồn tại -> ResourceNotFoundException; lịch sử giao dịch lọc theo variant khi variantId > 0")
    void lowStock_getInventory_transactions() {
        when(inventoryRepository.findLowStock(5)).thenReturn(List.of(
                Inventory.builder().productId(1L).variantId(0L).quantity(2).build(),
                Inventory.builder().productId(2L).variantId(21L).quantity(0).build()));
        when(inventoryRepository.findByProductIdAndVariantId(9L, 0L)).thenReturn(Optional.empty());
        Pageable p = PageRequest.of(0, 10);
        Page<InventoryTransaction> empty = new PageImpl<>(List.of());
        when(transactionRepository.findByProductId(1L, p)).thenReturn(empty);
        when(transactionRepository.findByProductIdAndVariantId(1L, 11L, p)).thenReturn(empty);

        List<InventoryResponse> low = inventoryService.getLowStockProducts(5);
        assertEquals(2, low.size());
        assertEquals(2, low.get(0).getQuantity());
        assertEquals(21L, low.get(1).getVariantId());

        assertThrows(ResourceNotFoundException.class, () -> inventoryService.getInventory(9L, null));

        inventoryService.getTransactions(1L, null, p);
        inventoryService.getTransactions(1L, 0L, p);
        inventoryService.getTransactions(1L, 11L, p);
        verify(transactionRepository, times(2)).findByProductId(1L, p);
        verify(transactionRepository, times(1)).findByProductIdAndVariantId(1L, 11L, p);
    }
}
