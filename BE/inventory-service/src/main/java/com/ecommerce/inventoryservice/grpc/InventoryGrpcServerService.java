package com.ecommerce.inventoryservice.grpc;

import com.ecommerce.grpc.inventory.BatchInventoryGrpcResponse;
import com.ecommerce.grpc.inventory.GetBatchInventoryRequest;
import com.ecommerce.grpc.inventory.GetInventoryRequest;
import com.ecommerce.grpc.inventory.InventoryGrpcResponse;
import com.ecommerce.grpc.inventory.InventoryGrpcServiceGrpc;
import com.ecommerce.inventoryservice.entity.Inventory;
import com.ecommerce.inventoryservice.repository.InventoryRepository;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.devh.boot.grpc.server.service.GrpcService;

import java.util.List;

/**
 * gRPC Server implementation of InventoryGrpcService.
 * Replaces: REST endpoints GET /api/v1/inventories/{productId} and GET /api/v1/inventories/batch
 * Called by: order-service (via InventoryGrpcClient)
 */
@GrpcService
@RequiredArgsConstructor
@Slf4j
public class InventoryGrpcServerService extends InventoryGrpcServiceGrpc.InventoryGrpcServiceImplBase {

    private final InventoryRepository inventoryRepository;

    /**
     * Lấy tồn kho của 1 sản phẩm/variant.
     * Dùng khi order-service cần init cache Redis (cache miss).
     */
    @Override
    public void getInventory(GetInventoryRequest request, StreamObserver<InventoryGrpcResponse> responseObserver) {
        log.info("[gRPC] getInventory - productId={}, variantId={}", request.getProductId(), request.getVariantId());

        try {
            long variantId = request.getVariantId() == 0 ? 0L : request.getVariantId();

            inventoryRepository
                    .findByProductIdAndVariantId(request.getProductId(), variantId)
                    .ifPresentOrElse(
                            inventory -> {
                                InventoryGrpcResponse response = toGrpcResponse(inventory, true);
                                responseObserver.onNext(response);
                            },
                            () -> {
                                // Không throw exception, trả về found=false để client xử lý gracefully
                                log.warn("[gRPC] Inventory not found for productId={}, variantId={}", request.getProductId(), variantId);
                                InventoryGrpcResponse response = InventoryGrpcResponse.newBuilder()
                                        .setProductId(request.getProductId())
                                        .setVariantId(variantId)
                                        .setQuantity(0)
                                        .setFound(false)
                                        .build();
                                responseObserver.onNext(response);
                            }
                    );
            responseObserver.onCompleted();
        } catch (Exception e) {
            log.error("[gRPC] Error in getInventory for productId={}", request.getProductId(), e);
            responseObserver.onError(
                    io.grpc.Status.INTERNAL
                            .withDescription("Internal error while fetching inventory: " + e.getMessage())
                            .asRuntimeException()
            );
        }
    }

    /**
     * Lấy tồn kho hàng loạt theo danh sách productIds.
     * Dùng khi order-service cần kiểm tra tồn kho của nhiều sản phẩm trong giỏ.
     */
    @Override
    public void getBatchInventory(GetBatchInventoryRequest request, StreamObserver<BatchInventoryGrpcResponse> responseObserver) {
        List<Long> productIds = request.getProductIdsList();
        log.info("[gRPC] getBatchInventory - {} products", productIds.size());

        try {
            List<Inventory> inventories = inventoryRepository.findByProductIdIn(productIds);

            BatchInventoryGrpcResponse.Builder responseBuilder = BatchInventoryGrpcResponse.newBuilder();
            for (Inventory inv : inventories) {
                responseBuilder.addInventories(toGrpcResponse(inv, true));
            }

            responseObserver.onNext(responseBuilder.build());
            responseObserver.onCompleted();
        } catch (Exception e) {
            log.error("[gRPC] Error in getBatchInventory", e);
            responseObserver.onError(
                    io.grpc.Status.INTERNAL
                            .withDescription("Internal error while fetching batch inventory: " + e.getMessage())
                            .asRuntimeException()
            );
        }
    }

    private InventoryGrpcResponse toGrpcResponse(Inventory inventory, boolean found) {
        return InventoryGrpcResponse.newBuilder()
                .setProductId(inventory.getProductId())
                .setVariantId(inventory.getVariantId() != null ? inventory.getVariantId() : 0L)
                .setQuantity(inventory.getQuantity())
                .setFound(found)
                .build();
    }
}
