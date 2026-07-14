package com.ecommerce.promotionservice.service.support;

import com.ecommerce.promotionservice.repository.CampaignRepository;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Generates unique Camunda process definition keys from campaign names.
 * Admin UI should not require operators to manage this — BE owns it.
 */
public final class BpmnKeyGenerator {

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");
    private static final int MAX_LEN = 80;

    private BpmnKeyGenerator() {
    }

    public static String slugify(String name) {
        if (name == null || name.isBlank()) {
            return "campaign";
        }
        String normalized = Normalizer.normalize(name.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('đ', 'd')
                .replace('Đ', 'd')
                .toLowerCase(Locale.ROOT);
        String slug = NON_ALNUM.matcher(normalized).replaceAll("_")
                .replaceAll("^_+|_+$", "")
                .replaceAll("_+", "_");
        if (slug.isBlank()) {
            return "campaign";
        }
        return slug.length() > MAX_LEN ? slug.substring(0, MAX_LEN) : slug;
    }

    public static String ensureUnique(CampaignRepository repository, String campaignName) {
        String base = slugify(campaignName);
        String candidate = base;
        int suffix = 2;
        while (repository.existsByBpmnProcessDefinitionKey(candidate)) {
            String tail = "_" + suffix;
            int maxBase = MAX_LEN - tail.length();
            String trimmedBase = base.length() > maxBase ? base.substring(0, maxBase) : base;
            candidate = trimmedBase + tail;
            suffix++;
            if (suffix > 999) {
                candidate = trimmedBase + "_" + System.currentTimeMillis();
                break;
            }
        }
        return candidate;
    }
}
