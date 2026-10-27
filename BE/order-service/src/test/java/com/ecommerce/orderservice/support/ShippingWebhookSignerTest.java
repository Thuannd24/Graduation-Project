package com.ecommerce.orderservice.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PH3 - Chữ ký HMAC-SHA256 của webhook đơn vị vận chuyển: hex(HMAC(secret, trackingCode + "|" + status)).
 */
class ShippingWebhookSignerTest {

    private static final String SECRET = "dev-shipping-webhook-secret";

    @Test
    @DisplayName("TC_PH3_WEBHOOK_01: Chữ ký đúng được chấp nhận (kể cả viết hoa/khoảng trắng); sửa status, sai secret, thiếu chữ ký -> từ chối; secret trống -> IllegalStateException")
    void signAndVerify() {
        String sig = ShippingWebhookSigner.sign(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED");

        assertEquals(64, sig.length());
        assertTrue(sig.matches("[0-9a-f]{64}"));
        assertEquals(sig, ShippingWebhookSigner.sign(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED"), "phải tất định");

        assertTrue(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED", sig));
        assertTrue(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED", "  " + sig.toUpperCase() + " "));

        assertFalse(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-AB12CD34", "CANCELLED", sig), "đổi status phải sai chữ ký");
        assertFalse(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-OTHER", "DELIVERED", sig));
        assertFalse(ShippingWebhookSigner.verify("other-secret", "MOCK-GHTK-AB12CD34", "DELIVERED", sig));
        assertFalse(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED", null));
        assertFalse(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED", ""));
        assertFalse(ShippingWebhookSigner.verify(SECRET, "MOCK-GHTK-AB12CD34", "DELIVERED", sig.substring(1)));

        assertThrows(IllegalStateException.class, () -> ShippingWebhookSigner.sign("  ", "X", "DELIVERED"));
        assertThrows(IllegalStateException.class, () -> ShippingWebhookSigner.verify(null, "X", "DELIVERED", sig));
    }
}
