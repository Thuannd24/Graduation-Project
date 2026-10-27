export function formatVnd(value) {
  const amount = Number(value);
  return `${(Number.isFinite(amount) ? amount : 0).toLocaleString("vi-VN")}đ`;
}

export function calculateDiscountPercent(price, oldPrice) {
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}
