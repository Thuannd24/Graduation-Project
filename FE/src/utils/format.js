export function formatVnd(value) {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function calculateDiscountPercent(price, oldPrice) {
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}
