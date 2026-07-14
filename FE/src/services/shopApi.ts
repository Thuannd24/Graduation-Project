import { apiClient } from "./apiClient";

export const shopApi = {
  listStores(): Promise<unknown[]> {
    return apiClient.get("/stores");
  },

  requestWarrantyOtp(phone: string): Promise<{ message: string; expiresInSeconds: number; devOtp?: string }> {
    return apiClient.post("/public/orders/warranty/otp", { phone });
  },

  checkWarranty(phone: string, otp: string): Promise<any> {
    return apiClient.get(
      `/public/orders/warranty?phone=${encodeURIComponent(phone)}&otp=${encodeURIComponent(otp)}`
    );
  },

  submitTradeIn(payload: Record<string, unknown>): Promise<unknown> {
    return apiClient.post("/tradein", payload);
  }
};
