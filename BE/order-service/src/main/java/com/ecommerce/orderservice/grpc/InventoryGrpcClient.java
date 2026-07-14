package com.ecommerce.orderservice.grpc;

import com.ecommerce.grpc.inventory.BatchInventoryGrpcResponse;
import com.ecommerce.grpc.inventory.GetBatchInventoryRequest;
import com.ecommerce.grpc.inventory.GetInventoryRequest;
import com.ecommerce.grpc.inventory.InventoryGrpcResponse;
import com.ecommerce.grpc.inventory.InventoryGrpcServiceGrpc;
import io.grpc.StatusRuntimeException;
import lombok.extern.slf4j.Slf4j;
import net.devh.boot.grpc.client.inject.GrpcClient;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * gRPC Client wrapper for inventory-service.
 * Replaces: InventoryClient (Feign) for the 2 high-traffic endpoints called during checkout.
 *
 * Endpoints replaced:
 *   - GET /api/v1/inventories/{productId}       → getInventory()
 *   - GET /api/v1/inventories/batch             → getBatchInventory()
 */
@Component
@Slf4j
public class InventoryGrpcClient {

    @GrpcClient("inventory-service")
    private InventoryGrpcServiceGrpc.InventoryGrpcServiceBlockingStub inventoryStub;

    /**
     * Lấy tồn kho 1 sản phẩm/variant.
     *
     * @param productId  ID sản phẩm
     * @param variantId  ID variant (null hoặc 0 nếu không có variant)
     * @return InventoryGrpcResponse với found=false nếu không tìm thấy
     */
    public InventoryGrpcResponse getInventory(Long productId, Long variantId) {
        log.debug("[gRPC Client] getInventory productId={}, variantId={}", productId, variantId);
        GetInventoryRequest request = GetInventoryRequest.newBuilder()
                .setProductId(productId)
                .setVariantId(variantId != null ? variantId : 0L)
                .build();
        return inventoryStub.getInventory(request);
    }

    /**
     * Lấy tồn kho hàng loạt theo danh sách productIds.
     *
     * @param productIds danh sách product IDs cần lấy tồn kho
     * @return BatchInventoryGrpcResponse chứa danh sách InventoryGrpcResponse
     */
    public BatchInventoryGrpcResponse getBatchInventory(List<Long> productIds) {
        log.debug("[gRPC Client] getBatchInventory {} products", productIds.size());
        GetBatchInventoryRequest request = GetBatchInventoryRequest.newBuilder()
                .addAllProductIds(productIds)
                .build();
        return inventoryStub.getBatchInventory(request);
    }
}
