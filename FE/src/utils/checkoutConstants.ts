// Quy tắc giá & giao hàng dùng chung cho giỏ hàng / checkout. Phải khớp với order-service.

/** Phí giao hàng cố định cho đơn chưa đạt ngưỡng miễn phí. */
export const SHIPPING_FEE = 30_000;
/** Giữ tên cũ cho các chỗ đang import (voucherApi, VoucherPicker). */
export const DEFAULT_SHIPPING_FEE = SHIPPING_FEE;
/** Đơn có giá trị hàng (sau giảm giá sản phẩm) từ mức này được miễn phí giao hàng. */
export const FREE_SHIP_THRESHOLD = 500_000;
/** COD chỉ áp dụng cho đơn có tổng thanh toán đến mức này; cao hơn phải trả trước qua VNPay. */
export const COD_LIMIT = 20_000_000;
/** Số lượng tối đa của một sản phẩm (một dòng giỏ hàng) trong một đơn. */
export const MAX_QTY_PER_ITEM = 5;
/** Thuế suất VAT. Giá niêm yết ĐÃ GỒM VAT — chỉ dùng để tách phần VAT hiển thị, không cộng thêm. */
export const VAT_RATE = 0.1;
export const POINTS_TO_VND = 1000;

/**
 * Phí giao hàng theo giá trị hàng.
 * @param goodsValue giá trị hàng sau giảm giá sản phẩm (chưa trừ điểm, chưa gồm phí ship)
 */
export function calculateShippingFee(goodsValue: number): number {
  if (!goodsValue || goodsValue <= 0) return 0;
  return goodsValue >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE;
}
