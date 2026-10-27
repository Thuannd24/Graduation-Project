// Ảnh thay thế dùng chung cho sản phẩm không có ảnh / ảnh lỗi. SVG nội tuyến: không phụ thuộc dịch vụ ngoài.
export const PRODUCT_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<rect width="200" height="200" fill="#f8f9fb"/>' +
      '<rect x="62" y="58" width="76" height="64" rx="8" fill="none" stroke="#cbd5e1" stroke-width="6"/>' +
      '<circle cx="84" cy="80" r="8" fill="#cbd5e1"/>' +
      '<path d="M66 116l24-24 16 16 12-10 18 18" fill="none" stroke="#cbd5e1" stroke-width="6" stroke-linejoin="round"/>' +
      '<text x="100" y="152" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#94a3b8">Chưa có ảnh</text>' +
    "</svg>"
  );

/** Dùng cho onError của <img>: thay bằng ảnh placeholder đúng 1 lần (tránh lặp vô hạn). */
export function applyProductPlaceholder(event) {
  const img = event?.currentTarget || event?.target;
  if (!img || img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = "1";
  img.src = PRODUCT_PLACEHOLDER;
}
