package com.ecommerce.notificationservice.event.consumer;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import static com.ecommerce.notificationservice.util.TemplateRenderer.escapeHtml;

/**
 * Builds the optional HTML blocks of order/payment e-mails from whatever the Kafka event carries.
 * Every value taken from the event is HTML-escaped here; the resulting fragments are passed as
 * trusted HTML (SendNotificationRequest.trustedHtmlVariables).
 *
 * Fields read (all optional, missing ones are simply omitted):
 *  - items[]: productName | name, variantName, quantity, unitPrice | price, subtotal | lineTotal
 *  - totalAmount, shippingFee, discountAmount, finalAmount
 *  - trackingCode (OrderShippedEvent)
 *  - amount, message (RefundCompletedEvent)
 */
final class EventEmailFragments {

    private static final String TD = "padding:6px 0;font-size:14px;color:#334155;";
    private static final String TD_RIGHT = TD + "text-align:right;";

    private EventEmailFragments() {
    }

    static Map<String, String> build(String eventType, JsonNode payload) {
        Map<String, String> html = new HashMap<>();
        if (payload == null) {
            return html;
        }
        String orderDetails = orderDetails(payload);
        if (!orderDetails.isEmpty()) {
            html.put("orderDetailsHtml", orderDetails);
        }
        String tracking = text(payload, "trackingCode");
        if (tracking != null) {
            html.put("trackingInfoHtml", "<p style=\"margin:16px 0 0;font-size:14px;color:#334155;\">Mã vận đơn: <strong>"
                    + escapeHtml(tracking) + "</strong></p>");
        }
        if ("RefundCompletedEvent".equalsIgnoreCase(eventType)) {
            StringBuilder sb = new StringBuilder("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:16px;\">");
            BigDecimal amount = decimal(payload, "amount");
            if (amount != null) {
                sb.append(row("Số tiền hoàn:", "<strong>" + money(amount) + "</strong>"));
            }
            sb.append("</table>");
            html.put("refundInfoHtml", sb.toString());
        }
        return html;
    }

    private static String orderDetails(JsonNode payload) {
        StringBuilder sb = new StringBuilder();
        JsonNode items = payload.get("items");
        if (hasName(items)) {
            sb.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:20px;border-top:1px solid #f1f5f9;\">");
            sb.append("<tr><td style=\"").append(TD).append("font-weight:800;\">Sản phẩm</td>")
              .append("<td style=\"").append(TD_RIGHT).append("font-weight:800;\">SL</td>")
              .append("<td style=\"").append(TD_RIGHT).append("font-weight:800;\">Thành tiền</td></tr>");
            for (JsonNode item : items) {
                String name = text(item, "productName");
                if (name == null) name = text(item, "name");
                if (name == null) continue;
                String variant = text(item, "variantName");
                int qty = item.hasNonNull("quantity") ? item.get("quantity").asInt() : 1;
                BigDecimal line = decimal(item, "subtotal");
                if (line == null) line = decimal(item, "lineTotal");
                if (line == null) {
                    BigDecimal unit = decimal(item, "unitPrice");
                    if (unit == null) unit = decimal(item, "price");
                    line = unit != null ? unit.multiply(BigDecimal.valueOf(qty)) : null;
                }
                sb.append("<tr><td style=\"").append(TD).append("\">").append(escapeHtml(name));
                if (variant != null) sb.append(" <span style=\"color:#64748b;\">(").append(escapeHtml(variant)).append(")</span>");
                sb.append("</td><td style=\"").append(TD_RIGHT).append("\">").append(qty).append("</td>")
                  .append("<td style=\"").append(TD_RIGHT).append("\">").append(line != null ? money(line) : "").append("</td></tr>");
            }
            sb.append("</table>");
        }
        StringBuilder totals = new StringBuilder();
        appendTotal(totals, payload, "totalAmount", "Tạm tính:");
        appendTotal(totals, payload, "shippingFee", "Phí vận chuyển:");
        appendTotal(totals, payload, "discountAmount", "Giảm giá:");
        appendTotal(totals, payload, "finalAmount", "Tổng thanh toán:");
        if (totals.length() > 0) {
            sb.append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:8px;\">")
              .append(totals).append("</table>");
        }
        return sb.toString();
    }

    private static boolean hasName(JsonNode items) {
        if (items == null || !items.isArray()) return false;
        for (JsonNode item : items) {
            if (item.hasNonNull("productName") || item.hasNonNull("name")) return true;
        }
        return false;
    }

    private static void appendTotal(StringBuilder sb, JsonNode payload, String field, String label) {
        BigDecimal value = decimal(payload, field);
        if (value != null) {
            sb.append(row(label, money(value)));
        }
    }

    private static String row(String label, String valueHtml) {
        return "<tr><td style=\"" + TD + "color:#64748b;\">" + label + "</td><td style=\"" + TD_RIGHT
                + "font-weight:600;\">" + valueHtml + "</td></tr>";
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) return null;
        String v = node.get(field).asText();
        return v == null || v.isBlank() ? null : v;
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) return null;
        try {
            return new BigDecimal(node.get(field).asText());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String money(BigDecimal value) {
        DecimalFormat df = new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(new Locale("vi", "VN")));
        return df.format(value) + "đ";
    }
}
