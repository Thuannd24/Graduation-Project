package com.ecommerce.orderservice.support;

import com.ecommerce.orderservice.exception.BusinessRuleException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/** Các quy tắc nghiệp vụ dùng chung cho giỏ hàng / đặt hàng / hủy đơn. */
public final class OrderPolicy {

    /** Số lượng tối đa của một sản phẩm/biến thể trong giỏ và trong một đơn (chống gom hàng). */
    public static final int MAX_QUANTITY_PER_ITEM = 5;
    /** Số đơn chưa thanh toán (PENDING/AWAITING_PAYMENT) tối đa một khách được giữ cùng lúc. */
    public static final int MAX_PENDING_UNPAID_ORDERS = 3;

    /** Mã lý do hủy -> nhãn tiếng Việt. OTHER bắt buộc kèm mô tả. */
    public static final Map<String, String> CANCEL_REASONS;

    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("CHANGED_MIND", "Đổi ý, không muốn mua nữa");
        m.put("WRONG_ORDER", "Đặt nhầm sản phẩm / số lượng");
        m.put("CHANGE_ADDRESS", "Muốn đổi địa chỉ / thông tin nhận hàng");
        m.put("BETTER_PRICE", "Tìm được giá rẻ hơn ở nơi khác");
        m.put("PAYMENT_ISSUE", "Gặp vấn đề khi thanh toán");
        m.put("DELIVERY_TOO_SLOW", "Thời gian giao hàng quá lâu");
        m.put("OTHER", "Lý do khác");
        CANCEL_REASONS = java.util.Collections.unmodifiableMap(m);
    }

    // 10 số bắt đầu bằng 0, hoặc +84 / 84 theo sau 9 số.
    private static final Pattern VN_PHONE = Pattern.compile("^(0[0-9]{9}|[+]?84[0-9]{9})$");

    private OrderPolicy() {
    }

    public static void checkQuantity(int quantity) {
        if (quantity > MAX_QUANTITY_PER_ITEM) {
            throw new BusinessRuleException("QUANTITY_LIMIT_EXCEEDED",
                    "Mỗi sản phẩm chỉ được mua tối đa " + MAX_QUANTITY_PER_ITEM + " chiếc trong một đơn hàng.");
        }
    }

    /** Chuẩn hóa SĐT Việt Nam về dạng 0xxxxxxxxx; sai định dạng -> BusinessRuleException. */
    public static String normalizeVietnamesePhone(String raw) {
        String compact = raw == null ? "" : raw.replaceAll("[ .()-]", "").trim();
        if (!VN_PHONE.matcher(compact).matches()) {
            throw new BusinessRuleException("INVALID_PHONE",
                    "Số điện thoại không hợp lệ. Vui lòng nhập 10 chữ số bắt đầu bằng 0 hoặc dạng +84.");
        }
        if (compact.startsWith("+84")) {
            return "0" + compact.substring(3);
        }
        if (compact.startsWith("84")) {
            return "0" + compact.substring(2);
        }
        return compact;
    }
}
