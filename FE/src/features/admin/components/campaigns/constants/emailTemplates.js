// Seeded EMAIL templates in notification-service (NotificationTemplateSeeder).
export const EMAIL_TEMPLATE_CODES = new Set([
  "promotion_voucher_template",
  "welcome_template",
  "order_confirmed_template",
  "order_cancelled_template",
  "payment_success_template",
  "payment_failed_template",
  "vip_membership_promo_template"
]);

export const EMAIL_TEMPLATES = [
  {
    code: "promotion_voucher_template",
    label: "Thông báo voucher khuyến mãi",
    hint: "Biến: voucherCode, userId, email…"
  },
  {
    code: "vip_membership_promo_template",
    label: "Mời dùng thử gói thành viên VIP",
    hint: "Biến: customerName, cashbackPercent"
  },
  {
    code: "welcome_template",
    label: "Chào mừng thành viên mới",
    hint: "Biến: email, userId"
  },
  {
    code: "order_confirmed_template",
    label: "Xác nhận đơn hàng",
    hint: "Biến: orderId"
  },
  {
    code: "order_cancelled_template",
    label: "Đơn hàng bị hủy",
    hint: "Biến: orderId"
  },
  {
    code: "payment_success_template",
    label: "Thanh toán thành công",
    hint: "Biến: orderId"
  },
  {
    code: "payment_failed_template",
    label: "Thanh toán thất bại",
    hint: "Biến: orderId"
  }
];
