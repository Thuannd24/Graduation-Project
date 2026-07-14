export const DEFAULT_SHIPPING_FEE = 30_000;
export const VAT_RATE = 0.1;
export const POINTS_TO_VND = 1000;

export function calculateShippingFee(subtotal: number): number {
  if (!subtotal || subtotal <= 0) return 0;
  return DEFAULT_SHIPPING_FEE;
}
