import { apiClient } from "./apiClient";

export const shopApi = {
  listStores(): Promise<unknown[]> {
    return apiClient.get("/stores");
  },

  getMyWarranty(): Promise<any[]> {
    return apiClient.get("/orders/warranty/me", { requireAuth: true });
  },

  submitTradeIn(payload: Record<string, unknown>): Promise<unknown> {
    return apiClient.post("/tradein", payload);
  }
};
