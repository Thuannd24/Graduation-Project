package com.ecommerce.promotionservice.service.support;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Normalises Vietnamese province names so the campaign "Địa chỉ" (Condition_Location) condition
 * matches regardless of how the province is spelled.
 *
 * The Campaign Builder offers the full names returned by user-service ("Thành phố Hà Nội",
 * "Tỉnh Bắc Ninh"...), while order shipping addresses / event payloads may carry "Hà Nội",
 * "TP. Hồ Chí Minh", "TP.HCM" or the ASCII "Hanoi". All of them collapse to one key
 * (accent-free, lowercase, no administrative prefix, letters/digits only):
 * "Thành phố Hà Nội" / "Hà Nội" / "Hanoi" → {@code hanoi}; "TP. Hồ Chí Minh" / "HCM" → {@code hochiminh}.
 */
public final class ProvinceNormalizer {

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern ADMIN_PREFIX = Pattern.compile("^(thanh pho|tinh|tp)\\b[.\\s]*");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]");

    private static final Map<String, String> ALIASES = Map.of(
            "hcm", "hochiminh",
            "tphcm", "hochiminh",
            "hcmc", "hochiminh",
            "hochiminhcity", "hochiminh",
            "saigon", "hochiminh",
            "hn", "hanoi"
    );

    private ProvinceNormalizer() {
    }

    /** Returns the comparison key of a province name, or "" when blank. */
    public static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String s = raw.trim().replace('đ', 'd').replace('Đ', 'D');
        s = Normalizer.normalize(s, Normalizer.Form.NFD);
        s = DIACRITICS.matcher(s).replaceAll("");
        s = s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        s = ADMIN_PREFIX.matcher(s).replaceFirst("");
        s = NON_ALNUM.matcher(s).replaceAll("");
        return ALIASES.getOrDefault(s, s);
    }

    /**
     * Extracts the province key from a free-text address ("số nhà, phường, quận, tỉnh[, Việt Nam]"):
     * the last comma-separated segment that is not the country.
     */
    public static String fromAddress(String address) {
        if (address == null || address.isBlank()) {
            return "";
        }
        String[] parts = address.split(",");
        for (int i = parts.length - 1; i >= 0; i--) {
            String key = normalize(parts[i]);
            if (!key.isEmpty() && !"vietnam".equals(key)) {
                return key;
            }
        }
        return "";
    }
}
