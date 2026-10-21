// Trạng thái đơn hàng dùng chung cho trang khách và trang quản trị. Phải khớp OrderStatusMachine (order-service).

export const ORDER_STATUS_LABELS = {
  PENDING: "Chờ xác nhận",
  AWAITING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  SHIPPED: "Đang giao hàng",
  DELIVERED: "Đã giao hàng",
  COMPLETED: "Đã giao hàng",
  CANCELLED: "Đã hủy",
  RETURNING: "Chờ hoàn hàng",
  RETURNED: "Đã nhận hàng hoàn"
};

export const ORDER_STATUS_BADGE = {
  PENDING: "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40",
  AWAITING_PAYMENT: "bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40",
  CONFIRMED: "bg-emerald-50 text-emerald-750 dark:bg-emerald-955/20 dark:text-emerald-400 border-emerald-250/60 dark:border-emerald-900/40",
  SHIPPED: "bg-indigo-50 text-indigo-755 dark:bg-indigo-955/20 dark:text-indigo-400 border-indigo-200/60 dark:border-indigo-900/40",
  DELIVERED: "bg-teal-50 text-teal-700 dark:bg-teal-955/20 dark:text-teal-400 border-teal-200/60 dark:border-teal-900/40",
  COMPLETED: "bg-teal-50 text-teal-700 dark:bg-teal-955/20 dark:text-teal-400 border-teal-200/60 dark:border-teal-900/40",
  CANCELLED: "bg-rose-50 text-rose-600 dark:bg-rose-955/20 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40",
  RETURNING: "bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200/60 dark:border-orange-900/40",
  RETURNED: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60 dark:border-slate-700"
};

const DEFAULT_BADGE = "bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200/60 dark:border-slate-850/40";

export function orderStatusLabel(status) {
  const s = String(status || "").toUpperCase();
  return ORDER_STATUS_LABELS[s] || s || "Đang xử lý";
}

export function orderStatusBadge(status) {
  return ORDER_STATUS_BADGE[String(status || "").toUpperCase()] || DEFAULT_BADGE;
}

/** Khách chỉ được hủy khi đơn chưa bàn giao cho đơn vị vận chuyển (backend kiểm tra lại). */
export const CUSTOMER_CANCELLABLE_STATUSES = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED"];

export function isCustomerCancellable(status) {
  return CUSTOMER_CANCELLABLE_STATUSES.includes(String(status || "").toUpperCase());
}

/** Đơn đã kết thúc theo hướng không giao thành công (hiển thị như đơn hủy). */
export function isTerminatedOrder(status) {
  return ["CANCELLED", "RETURNING", "RETURNED"].includes(String(status || "").toUpperCase());
}

/** Lý do hủy, khớp OrderPolicy.CANCEL_REASONS. "OTHER" bắt buộc nhập mô tả. */
export const CANCEL_REASONS = [
  { code: "CHANGED_MIND", label: "Đổi ý, không muốn mua nữa" },
  { code: "WRONG_ORDER", label: "Đặt nhầm sản phẩm / số lượng" },
  { code: "CHANGE_ADDRESS", label: "Muốn đổi địa chỉ / thông tin nhận hàng" },
  { code: "BETTER_PRICE", label: "Tìm được giá rẻ hơn ở nơi khác" },
  { code: "PAYMENT_ISSUE", label: "Gặp vấn đề khi thanh toán" },
  { code: "DELIVERY_TOO_SLOW", label: "Thời gian giao hàng quá lâu" },
  { code: "OTHER", label: "Lý do khác" }
];

export function cancelReasonLabel(code, reason) {
  const found = CANCEL_REASONS.find((r) => r.code === code);
  if (found && code !== "OTHER") return reason ? `${found.label} — ${reason}` : found.label;
  return reason || found?.label || "";
}
