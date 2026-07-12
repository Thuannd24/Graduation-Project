import { apiClient } from "./apiClient";
import { DEFAULT_SHIPPING_FEE } from "../utils/checkoutConstants";

export type VoucherType = "PERCENT" | "FIXED" | "FREESHIP";
export type VoucherStatus = "UNUSED" | "RESERVED" | "USED" | "EXPIRED" | "CANCELLED";

export interface UserVoucher {
  id: number;
  code: string;
  voucherType: VoucherType;
  status: VoucherStatus;
  discountPercent?: number;
  maxDiscountAmount?: number;
  discountAmount?: number;
  minOrderValue?: number;
  maxShippingDiscount?: number;
  expiresAt: string;
  campaignId?: number;
  title: string;
  description: string;
  usable: boolean;
}

export interface VoucherPreviewResult {
  applied: boolean;
  message?: string;
  voucherCode?: string;
  voucherType?: VoucherType;
  discountAmount?: number;
  productDiscountAmount?: number;
  shippingDiscountAmount?: number;
  finalAmount?: number;
  campaignId?: number;
  expiresAt?: string;
}

export { DEFAULT_SHIPPING_FEE } from "../utils/checkoutConstants";

export const voucherApi = {
  getMyVouchers(): Promise<UserVoucher[]> {
    return apiClient
      .get<UserVoucher[]>("/promotions/vouchers/me", { requireAuth: true })
      .then((data) => (Array.isArray(data) ? data : []));
  },

  previewVoucher(payload: {
    code: string;
    orderTotal: number;
    shippingFee?: number;
  }): Promise<VoucherPreviewResult> {
    return apiClient.postAuth<VoucherPreviewResult>("/promotions/vouchers/preview", {
      code: payload.code.trim().toUpperCase(),
      orderTotal: payload.orderTotal,
      shippingFee: payload.shippingFee ?? DEFAULT_SHIPPING_FEE
    });
  }
};
