package com.ecommerce.promotionservice.entity;

public enum VoucherStatus {
    /** Chưa dùng — có thể apply khi checkout */
    UNUSED,
    /** Đã gắn với đơn hàng, chờ thanh toán thành công */
    RESERVED,
    USED,
    EXPIRED,
    CANCELLED
}
