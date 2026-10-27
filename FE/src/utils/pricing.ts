import { FREE_SHIP_THRESHOLD, SHIPPING_FEE, VAT_RATE } from "./checkoutConstants";

export interface RawProductPrices {
  price?: number | string | null;
  salePrice?: number | string | null;
  oldPrice?: number | string | null;
  originalPrice?: number | string | null;
}

export interface ResolvedProductPrices {
  /** Giá niêm yết từ BE (field price) */
  listPrice: number;
  /** Giá khuyến mãi hợp lệ */
  salePrice?: number;
  /** Giá hiển thị / khách trả */
  price: number;
  /** Giá gạch ngang khi đang giảm */
  oldPrice?: number;
}

export function resolveProductPrices(raw: RawProductPrices): ResolvedProductPrices {
  const listPrice = Number(raw.price ?? 0);
  const rawSale =
    raw.salePrice != null && raw.salePrice !== "" ? Number(raw.salePrice) : undefined;
  const hasDiscount =
    rawSale != null && !Number.isNaN(rawSale) && rawSale > 0 && rawSale < listPrice;

  return {
    listPrice,
    salePrice: hasDiscount ? rawSale : undefined,
    price: hasDiscount ? rawSale! : listPrice,
    oldPrice: hasDiscount ? listPrice : undefined,
  };
}

export function validateProductPricing(
  listPriceInput: number | string,
  salePriceInput?: number | string | null
): string | null {
  const listPrice = Number(listPriceInput);
  if (!listPrice || Number.isNaN(listPrice) || listPrice <= 0) {
    return "Giá niêm yết phải lớn hơn 0";
  }

  if (salePriceInput == null || salePriceInput === "") {
    return null;
  }

  const salePrice = Number(salePriceInput);
  if (Number.isNaN(salePrice) || salePrice <= 0) {
    return "Giá khuyến mãi phải lớn hơn 0";
  }
  if (salePrice >= listPrice) {
    return "Giá khuyến mãi phải nhỏ hơn giá niêm yết";
  }

  return null;
}

export function buildSalePricePayload(
  listPriceInput: number | string,
  salePriceInput?: number | string | null
): number | null {
  const listPrice = Number(listPriceInput);
  if (salePriceInput == null || salePriceInput === "") {
    return null;
  }
  const salePrice = Number(salePriceInput);
  if (Number.isNaN(salePrice) || salePrice <= 0 || salePrice >= listPrice) {
    return null;
  }
  return salePrice;
}

/* ===================== Tổng tiền đơn hàng (giá ĐÃ GỒM VAT) ===================== */

/** Phần VAT nằm sẵn trong một số tiền đã gồm VAT: round(amount * 10 / 110). Chỉ để hiển thị. */
export function vatIncludedIn(amount: number): number {
  if (!amount || amount <= 0) return 0;
  return Math.round((amount * VAT_RATE) / (1 + VAT_RATE));
}

export interface OrderTotalsInput {
  /** Tổng giá hàng theo giá bán (đã gồm VAT) */
  subtotal: number;
  /** Giảm giá sản phẩm (voucher giảm tiền hàng) */
  productDiscount?: number;
  /** Giảm bằng điểm thưởng */
  pointDiscount?: number;
  /** Giảm phí vận chuyển (voucher freeship) */
  shippingDiscount?: number;
  /** Ghi đè phí ship (VD lấy từ server). Bỏ trống = tính theo ngưỡng miễn phí. */
  shippingFee?: number;
}

export interface OrderTotals {
  subtotal: number;
  /** = productDiscount, đặt tên `discount` để khớp prop của OrderSummary */
  discount: number;
  pointDiscount: number;
  /** subtotal − productDiscount − pointDiscount (≥ 0) */
  taxable: number;
  /** Phí ship trước khi trừ voucher freeship */
  shipping: number;
  /** Phần voucher freeship thực sự được trừ (≤ shipping) */
  shippingDiscount: number;
  /** VAT đã nằm trong `taxable` (chỉ hiển thị, KHÔNG cộng vào total) */
  vat: number;
  /** taxable + shipping − shippingDiscount */
  total: number;
  /** true để OrderSummary hiển thị VAT dạng "đã gồm" thay vì một dòng cộng thêm */
  vatIncluded: true;
}

/**
 * Tính tổng đơn theo quy tắc của order-service (giá niêm yết đã gồm VAT):
 * - Phí ship SHIPPING_FEE, miễn phí khi (subtotal − productDiscount) ≥ FREE_SHIP_THRESHOLD.
 * - taxable = max(0, subtotal − productDiscount − pointDiscount); vat = round(taxable × 10/110).
 * - total = taxable + shipping − min(shippingDiscount, shipping).
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = Math.max(0, Number(input.subtotal) || 0);
  const discount = Math.min(subtotal, Math.max(0, Number(input.productDiscount) || 0));
  const pointDiscount = Math.max(0, Number(input.pointDiscount) || 0);
  const goodsValue = subtotal - discount;
  const taxable = Math.max(0, goodsValue - pointDiscount);

  let shipping: number;
  if (input.shippingFee != null && !Number.isNaN(Number(input.shippingFee))) {
    shipping = Math.max(0, Number(input.shippingFee));
  } else {
    shipping = subtotal > 0 && goodsValue < FREE_SHIP_THRESHOLD ? SHIPPING_FEE : 0;
  }
  const shippingDiscount = Math.min(shipping, Math.max(0, Number(input.shippingDiscount) || 0));

  return {
    subtotal,
    discount,
    pointDiscount,
    taxable,
    shipping,
    shippingDiscount,
    vat: vatIncludedIn(taxable),
    total: taxable + shipping - shippingDiscount,
    vatIncluded: true,
  };
}
