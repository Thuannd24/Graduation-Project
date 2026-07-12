export function formatVnd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 VNĐ";
  return n.toLocaleString("vi-VN") + " VNĐ";
}

export function clampMoney(value, min = 0) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
}

export function validateMoney(value, { min = 0, step = 1000, required = true } = {}) {
  const n = Number(value);
  if (required && (!Number.isFinite(n) || n < min)) {
    return `Giá trị tối thiểu ${formatVnd(min)}`;
  }
  if (Number.isFinite(n) && step > 0 && n > 0 && n % step !== 0) {
    return `Nên nhập bội số ${step.toLocaleString("vi-VN")} VNĐ`;
  }
  return "";
}

export function validateInt(value, { min, max, required = true, label = "Giá trị" } = {}) {
  const n = Number(value);
  if (required && !Number.isFinite(n)) return `${label} là bắt buộc`;
  if (Number.isFinite(min) && n < min) return `${label} tối thiểu ${min}`;
  if (Number.isFinite(max) && n > max) return `${label} tối đa ${max}`;
  return "";
}
