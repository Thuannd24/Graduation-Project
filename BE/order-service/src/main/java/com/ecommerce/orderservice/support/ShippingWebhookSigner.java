package com.ecommerce.orderservice.support;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

public final class ShippingWebhookSigner {

    private ShippingWebhookSigner() {
    }

    public static String sign(String secret, String trackingCode, String status) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("Shipping webhook secret is not configured.");
        }
        String payload = trackingCode + "|" + status;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot sign shipping webhook payload", ex);
        }
    }

    public static boolean verify(String secret, String trackingCode, String status, String providedSignature) {
        if (providedSignature == null || providedSignature.isBlank()) {
            return false;
        }
        String expected = sign(secret, trackingCode, status);
        return constantTimeEquals(expected, providedSignature.trim().toLowerCase());
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
