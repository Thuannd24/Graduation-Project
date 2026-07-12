package com.ecommerce.productservice.grpc;

import com.ecommerce.grpc.product.GetPriceInfoRequest;
import com.ecommerce.grpc.product.GetPriceInfoResponse;
import com.ecommerce.grpc.product.ProductGrpcServiceGrpc;
import com.ecommerce.grpc.product.ProductPriceInfoGrpc;
import com.ecommerce.grpc.product.ProductVariantInfoGrpc;
import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.dto.ProductVariantDto;
import com.ecommerce.productservice.service.ProductService;
import com.ecommerce.productservice.util.ProductPricingUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.devh.boot.grpc.server.service.GrpcService;

import java.math.BigDecimal;
import java.util.List;

/**
 * gRPC Server implementation of ProductGrpcService.
 * Replaces: REST endpoint GET /api/internal/products/price-info
 * Called by: order-service (via ProductGrpcClient) to get price info for cart/checkout
 */
@GrpcService
@RequiredArgsConstructor
@Slf4j
public class ProductGrpcServerService extends ProductGrpcServiceGrpc.ProductGrpcServiceImplBase {

    private final ProductService productService;
    private final ObjectMapper objectMapper;

    /**
     * Lấy thông tin giá, cân nặng của nhiều sản phẩm để tính tổng đơn hàng.
     * BigDecimal được chuyển thành String để tránh mất độ chính xác qua Protobuf.
     */
    @Override
    public void getPriceInfo(GetPriceInfoRequest request, StreamObserver<GetPriceInfoResponse> responseObserver) {
        List<Long> productIds = request.getProductIdsList();
        log.info("[gRPC] getPriceInfo - {} products requested", productIds.size());

        try {
            List<ProductDto> products = productService.getProductsByIds(productIds);

            GetPriceInfoResponse.Builder responseBuilder = GetPriceInfoResponse.newBuilder();
            for (ProductDto product : products) {
                responseBuilder.addProducts(toGrpcProductInfo(product));
            }

            responseObserver.onNext(responseBuilder.build());
            responseObserver.onCompleted();
        } catch (Exception e) {
            log.error("[gRPC] Error in getPriceInfo for productIds={}", productIds, e);
            responseObserver.onError(
                    io.grpc.Status.INTERNAL
                            .withDescription("Internal error while fetching product price info: " + e.getMessage())
                            .asRuntimeException()
            );
        }
    }

    private ProductPriceInfoGrpc toGrpcProductInfo(ProductDto product) {
        BigDecimal effectivePrice = ProductPricingUtils.getEffectivePrice(product.getPrice(), product.getSalePrice());

        ProductPriceInfoGrpc.Builder builder = ProductPriceInfoGrpc.newBuilder()
                .setId(product.getId())
                .setName(nullToEmpty(product.getName()))
                .setPrice(bigDecimalToString(effectivePrice))
                .setListPrice(bigDecimalToString(product.getPrice()))
                .setSalePrice(product.getSalePrice() != null ? bigDecimalToString(product.getSalePrice()) : "")
                .setCostPrice(bigDecimalToString(product.getCostPrice()))
                .setWeight(bigDecimalToString(product.getWeight()))
                .setImageUrl(nullToEmpty(product.getImageUrl()));

        if (product.getVariants() != null) {
            for (ProductVariantDto variant : product.getVariants()) {
                builder.addVariants(toGrpcVariantInfo(variant));
            }
        }

        return builder.build();
    }

    private ProductVariantInfoGrpc toGrpcVariantInfo(ProductVariantDto variant) {
        String variantAttrJson = "";
        if (variant.getVariantAttr() != null) {
            try {
                variantAttrJson = variant.getVariantAttr() instanceof String
                        ? (String) variant.getVariantAttr()
                        : objectMapper.writeValueAsString(variant.getVariantAttr());
            } catch (JsonProcessingException e) {
                log.error("[gRPC] Failed to serialize variantAttr for variantId={}", variant.getId(), e);
            }
        }

        return ProductVariantInfoGrpc.newBuilder()
                .setId(variant.getId() != null ? variant.getId() : 0L)
                .setProductId(variant.getProductId() != null ? variant.getProductId() : 0L)
                .setSku(nullToEmpty(variant.getSku()))
                .setVariantAttrJson(variantAttrJson)
                .setPrice(bigDecimalToString(variant.getPrice()))
                .setCostPrice(bigDecimalToString(variant.getCostPrice()))
                .setWeight(bigDecimalToString(variant.getWeight()))
                .setImageUrl(nullToEmpty(variant.getImageUrl()))
                .setActive(variant.getActive() != null && variant.getActive())
                .build();
    }

    private String bigDecimalToString(BigDecimal value) {
        return value != null ? value.toPlainString() : "0";
    }

    private String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
