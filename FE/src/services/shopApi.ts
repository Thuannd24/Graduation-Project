import { apiClient } from "./apiClient";

export const shopApi = {
  listStores(): Promise<unknown[]> {
    return apiClient.get("/stores");
  },

  checkWarranty(phone: string): Promise<any> {
    return apiClient.get(`/public/orders/warranty?phone=${encodeURIComponent(phone)}`);
  },

  submitTradeIn(payload: Record<string, unknown>): Promise<unknown> {
    return apiClient.post("/tradein", payload);
  }
};
