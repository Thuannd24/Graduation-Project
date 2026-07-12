package com.ecommerce.productservice.util;

import java.math.BigDecimal;

/**
 * Chuẩn hóa giá sản phẩm:
 * - price (listPrice): giá niêm yết
 * - salePrice: giá khuyến mãi (optional, phải &lt; listPrice)
 * - effectivePrice: giá khách thực trả = salePrice nếu hợp lệ, ngược lại listPrice
 */
public final class ProductPricingUtils {

    private ProductPricingUtils() {
    }

    public static boolean hasActiveSale(BigDecimal listPrice, BigDecimal salePrice) {
        return normalizeSalePrice(listPrice, salePrice) != null;
    }

    public static BigDecimal normalizeSalePrice(BigDecimal listPrice, BigDecimal salePrice) {
        if (listPrice == null || salePrice == null) {
            return null;
        }
        if (salePrice.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        if (salePrice.compareTo(listPrice) >= 0) {
            return null;
        }
        return salePrice;
    }

    public static BigDecimal getEffectivePrice(BigDecimal listPrice, BigDecimal salePrice) {
        BigDecimal normalizedSale = normalizeSalePrice(listPrice, salePrice);
        if (normalizedSale != null) {
            return normalizedSale;
        }
        return listPrice != null ? listPrice : BigDecimal.ZERO;
    }
}
