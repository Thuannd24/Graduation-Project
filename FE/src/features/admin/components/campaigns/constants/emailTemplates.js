// Seeded EMAIL templates in notification-service (NotificationTemplateSeeder) that are
// actually campaign-only. order_confirmed_template/order_cancelled_template/
// payment_success_template/payment_failed_template are deliberately excluded here - those 4
// are already sent automatically and unconditionally by order-service/payment-service's own
// outbox -> Kafka ("order-events"/"payment-events") -> notification-service path, independent
// of any campaign. Offering them here let an admin build a campaign that double-sends the
// exact same transactional email a customer already gets automatically.
export const EMAIL_TEMPLATE_CODES = new Set([
  "promotion_voucher_template",
  "welcome_template",
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
  }
];
