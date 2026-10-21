package com.ecommerce.notificationservice.util;

import java.util.Map;

public final class TemplateRenderer {

    private TemplateRenderer() {
    }

    /** Plain substitution (subjects, SMS text): values are inserted as-is. */
    public static String render(String template, Map<String, String> variables) {
        return substitute(template, variables, false);
    }

    /**
     * Substitution for HTML e-mail bodies. Every value in {@code variables} is HTML-escaped
     * (customer names, notes, addresses... must never become markup - TC_PH7_TPL_03).
     * {@code trustedHtml} holds fragments notification-service built itself from escaped parts
     * (order item table, tracking box) and is inserted verbatim.
     */
    public static String renderHtml(String template, Map<String, String> variables, Map<String, String> trustedHtml) {
        String result = substitute(template, variables, true);
        return substitute(result, trustedHtml, false);
    }

    private static String substitute(String template, Map<String, String> variables, boolean escapeHtml) {
        if (template == null || template.isBlank()) {
            return "";
        }
        if (variables == null || variables.isEmpty()) {
            return template;
        }
        String result = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            String placeholder = "{{" + entry.getKey() + "}}";
            String value = entry.getValue() != null ? entry.getValue() : "";
            result = result.replace(placeholder, escapeHtml ? escapeHtml(value) : value);
        }
        return result;
    }

    public static String escapeHtml(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder(value.length() + 16);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}
