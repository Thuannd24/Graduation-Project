package com.ecommerce.promotionservice.service.support;

import java.util.Set;

/** Known template codes seeded in notification-service (NotificationTemplateSeeder). */
public final class NotificationTemplateCodes {

    public static final Set<String> EMAIL = Set.of(
            "welcome_template",
            "promotion_voucher_template",
            "order_confirmed_template",
            "order_cancelled_template",
            "payment_success_template",
            "payment_failed_template"
    );

    private NotificationTemplateCodes() {
    }

    public static boolean isValidEmailTemplate(String code) {
        return code != null && !code.isBlank() && EMAIL.contains(code.trim());
    }
}
