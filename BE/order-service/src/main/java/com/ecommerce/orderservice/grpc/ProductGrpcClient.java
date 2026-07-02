package com.ecommerce.orderservice.grpc;

import com.ecommerce.grpc.product.GetPriceInfoRequest;
import com.ecommerce.grpc.product.GetPriceInfoResponse;
import com.ecommerce.grpc.product.ProductGrpcServiceGrpc;
import com.ecommerce.grpc.product.ProductPriceInfoGrpc;
import com.ecommerce.grpc.product.ProductVariantInfoGrpc;
import io.grpc.StatusRuntimeException;
import lombok.extern.slf4j.Slf4j;
import net.devh.boot.grpc.client.inject.GrpcClient;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

/**
 * gRPC Client wrapper for product-service.
 * Replaces: ProductClient (Feign) GET /api/internal/products/price-info
 *
 * Called during cart retrieval and checkout to get live prices and weights.
 */
@Component
@Slf4j
public class ProductGrpcClient {

    @GrpcClient("product-service")
    private ProductGrpcServiceGrpc.ProductGrpcServiceBlockingStub productStub;

    /**
     * Lấy thông tin giá và cân nặng của nhiều sản phẩm.
     * Dùng trong CartServiceImpl.getCart() và CartServiceImpl.addItemToCart().
     *
     * @param productIds danh sách ID sản phẩm cần lấy thông tin
     * @return GetPriceInfoResponse chứa danh sách ProductPriceInfoGrpc
     */
    public GetPriceInfoResponse getPriceInfo(List<Long> productIds) {
        log.debug("[gRPC Client] getPriceInfo {} products", productIds.size());
        try {
            GetPriceInfoRequest request = GetPriceInfoRequest.newBuilder()
                    .addAllProductIds(productIds)
                    .build();
            return productStub.getPriceInfo(request);
        } catch (StatusRuntimeException e) {
            log.error("[gRPC Client] getPriceInfo failed: {} - {}", e.getStatus(), e.getMessage());
            return GetPriceInfoResponse.newBuilder().build(); // empty list
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helper: chuyển đổi Protobuf model sang kiểu tương thích với CartServiceImpl
    // Giữ nguyên tên field giống ProductClient.ProductPriceInfo cũ để
    // CartServiceImpl không cần thay đổi logic xử lý
    // ─────────────────────────────────────────────────────────────────────

    public static BigDecimal parseBigDecimal(String value) {
        if (value == null || value.isBlank())
            return BigDecimal.ZERO;
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    /**
     * Helper: lấy price từ ProductPriceInfoGrpc.
     * Protobuf truyền BigDecimal dưới dạng String để giữ độ chính xác.
     */
    public static BigDecimal getPrice(ProductPriceInfoGrpc info) {
        return parseBigDecimal(info.getPrice());
    }

    public static BigDecimal getWeight(ProductPriceInfoGrpc info) {
        return parseBigDecimal(info.getWeight());
    }

    public static BigDecimal getCostPrice(ProductPriceInfoGrpc info) {
        return parseBigDecimal(info.getCostPrice());
    }

    public static BigDecimal getVariantPrice(ProductVariantInfoGrpc variant) {
        return parseBigDecimal(variant.getPrice());
    }

    public static BigDecimal getVariantWeight(ProductVariantInfoGrpc variant) {
        return parseBigDecimal(variant.getWeight());
    }
}
