package com.ecommerce.productservice.util;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class ProductPricingUtilsTest {

    @Test
    void normalizeSalePrice_returnsNullWhenInvalid() {
        assertNull(ProductPricingUtils.normalizeSalePrice(new BigDecimal("100"), null));
        assertNull(ProductPricingUtils.normalizeSalePrice(new BigDecimal("100"), BigDecimal.ZERO));
        assertNull(ProductPricingUtils.normalizeSalePrice(new BigDecimal("100"), new BigDecimal("100")));
        assertNull(ProductPricingUtils.normalizeSalePrice(new BigDecimal("100"), new BigDecimal("150")));
    }

    @Test
    void normalizeSalePrice_returnsValueWhenValid() {
        assertEquals(new BigDecimal("80"), ProductPricingUtils.normalizeSalePrice(new BigDecimal("100"), new BigDecimal("80")));
    }

    @Test
    void getEffectivePrice_prefersSalePrice() {
        assertEquals(new BigDecimal("80"), ProductPricingUtils.getEffectivePrice(new BigDecimal("100"), new BigDecimal("80")));
        assertEquals(new BigDecimal("100"), ProductPricingUtils.getEffectivePrice(new BigDecimal("100"), null));
    }
}
