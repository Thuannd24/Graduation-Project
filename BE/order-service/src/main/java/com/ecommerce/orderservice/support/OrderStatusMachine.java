package com.ecommerce.orderservice.support;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Máy trạng thái đơn hàng - mọi chuyển trạng thái phải đi đúng trình tự (TC_PH3_DELIV_03).
 *
 * <pre>
 * PENDING ──► AWAITING_PAYMENT ──► CONFIRMED ──► SHIPPED ──► DELIVERED
 *    │               │                 │            │
 *    └───────────────┴─────────────────┴► CANCELLED └► RETURNING ──► RETURNED
 * </pre>
 * <ul>
 *   <li>PENDING: vừa tạo, đang giữ hàng / chờ thanh toán.</li>
 *   <li>AWAITING_PAYMENT: kho đã trừ, chờ khách thanh toán.</li>
 *   <li>CONFIRMED: đã thanh toán VNPay hoặc chọn COD.</li>
 *   <li>SHIPPED: đã bàn giao cho đơn vị vận chuyển.</li>
 *   <li>DELIVERED: giao thành công (trạng thái cuối).</li>
 *   <li>CANCELLED: hủy trước khi giao vận - hoàn kho, trả voucher, hoàn điểm, hoàn tiền nếu đã trả (cuối).</li>
 *   <li>RETURNING: đơn đang giao bị hủy - chờ hàng hoàn về kho, CHƯA cộng lại tồn kho.</li>
 *   <li>RETURNED: kho đã nhận lại hàng hoàn - cộng lại tồn kho, hoàn tiền nếu đã trả (cuối).</li>
 * </ul>
 */
public final class OrderStatusMachine {

    public static final String PENDING = "PENDING";
    public static final String AWAITING_PAYMENT = "AWAITING_PAYMENT";
    public static final String CONFIRMED = "CONFIRMED";
    public static final String SHIPPED = "SHIPPED";
    public static final String DELIVERED = "DELIVERED";
    public static final String CANCELLED = "CANCELLED";
    public static final String RETURNING = "RETURNING";
    public static final String RETURNED = "RETURNED";

    private static final Map<String, Set<String>> TRANSITIONS = Map.of(
            PENDING, Set.of(AWAITING_PAYMENT, CONFIRMED, CANCELLED),
            AWAITING_PAYMENT, Set.of(CONFIRMED, CANCELLED),
            CONFIRMED, Set.of(SHIPPED, CANCELLED),
            SHIPPED, Set.of(DELIVERED, RETURNING),
            RETURNING, Set.of(RETURNED),
            DELIVERED, Set.of(),
            CANCELLED, Set.of(),
            RETURNED, Set.of());

    /** Trạng thái khách còn được tự hủy (chưa bàn giao vận chuyển). */
    public static final Set<String> CUSTOMER_CANCELLABLE = Set.of(PENDING, AWAITING_PAYMENT, CONFIRMED);
    /** Trạng thái chưa thanh toán (đang giữ hàng). */
    public static final Set<String> UNPAID = Set.of(PENDING, AWAITING_PAYMENT);

    private OrderStatusMachine() {
    }

    public static String normalize(String status) {
        return status == null ? null : status.trim().toUpperCase(Locale.ROOT);
    }

    public static boolean canTransition(String from, String to) {
        Set<String> next = TRANSITIONS.get(normalize(from));
        return next != null && next.contains(normalize(to));
    }

    public static boolean isFinal(String status) {
        Set<String> next = TRANSITIONS.get(normalize(status));
        return next != null && next.isEmpty();
    }

    public static String label(String status) {
        String s = normalize(status);
        if (s == null) {
            return "không xác định";
        }
        return switch (s) {
            case PENDING -> "Chờ xử lý";
            case AWAITING_PAYMENT -> "Chờ thanh toán";
            case CONFIRMED -> "Đã xác nhận";
            case SHIPPED -> "Đang giao";
            case DELIVERED -> "Đã giao";
            case CANCELLED -> "Đã hủy";
            case RETURNING -> "Chờ hoàn hàng";
            case RETURNED -> "Đã nhận hàng hoàn";
            default -> s;
        };
    }
}
