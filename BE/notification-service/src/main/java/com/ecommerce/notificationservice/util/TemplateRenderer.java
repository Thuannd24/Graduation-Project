package com.ecommerce.notificationservice.util;

import java.util.Map;

public final class TemplateRenderer {

    private TemplateRenderer() {
    }

    public static String render(String template, Map<String, String> variables) {
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
            result = result.replace(placeholder, value);
        }
        return result;
    }
}
