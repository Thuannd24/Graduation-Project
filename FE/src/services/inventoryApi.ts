import { apiClient } from "./apiClient";

export interface InventoryRecord {
  productId: number;
  variantId: number;
  quantity: number;
  lastUpdated?: string;
}

export interface RestockPayload {
  quantity: number;
  supplier?: string;
  note?: string;
}

export interface RestockResult {
  productId: number;
  variantId: number;
  previousQuantity: number;
  addedQuantity: number;
  currentQuantity: number;
  transactionId: number;
}

export interface InventoryTransaction {
  id: number;
  orderId?: number;
  productId: number;
  variantId: number;
  transactionType: string;
  quantityChanged: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceId?: string;
  note?: string;
  createdAt: string;
}

export interface TransactionPage {
  items: InventoryTransaction[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

function parseTransactionPage(data: unknown): TransactionPage {
  const page = data as Record<string, unknown>;
  const content = Array.isArray(page?.content) ? page.content : [];
  return {
    items: content as InventoryTransaction[],
    page: Number(page?.number ?? 0),
    size: Number(page?.size ?? content.length),
    totalElements: Number(page?.totalElements ?? content.length),
    totalPages: Number(page?.totalPages ?? 1),
    hasNext: Boolean(page?.hasNext),
    hasPrevious: Boolean(page?.hasPrevious)
  };
}

export const inventoryApi = {
  async getInventory(productId: number, variantId = 0): Promise<InventoryRecord> {
    return apiClient.get<InventoryRecord>(`/inventories/${productId}?variantId=${variantId}`);
  },

  async getBatchByProductIds(productIds: number[]): Promise<InventoryRecord[]> {
    if (!productIds.length) return [];
    const ids = productIds.filter(id => Number.isFinite(id) && id > 0);
    if (!ids.length) return [];
    const data = await apiClient.get<InventoryRecord[]>(
      `/inventories/batch?productIds=${ids.join(",")}`
    );
    return Array.isArray(data) ? data : [];
  },

  async getLowStock(threshold = 10): Promise<InventoryRecord[]> {
    const data = await apiClient.get<InventoryRecord[]>(
      `/admin/inventories/low-stock?threshold=${threshold}`,
      { requireAuth: true }
    );
    return Array.isArray(data) ? data : [];
  },

  async updateStock(productId: number, quantity: number, variantId = 0): Promise<InventoryRecord> {
    return apiClient.putAuth<InventoryRecord>(
      `/admin/inventories/${productId}?variantId=${variantId}`,
      { quantity }
    );
  },

  async restock(productId: number, payload: RestockPayload, variantId = 0): Promise<RestockResult> {
    return apiClient.postAuth<RestockResult>(
      `/admin/inventories/${productId}/restock?variantId=${variantId}`,
      payload
    );
  },

  async getTransactions(
    productId: number,
    options: { variantId?: number; page?: number; size?: number } = {}
  ): Promise<TransactionPage> {
    const { variantId, page = 0, size = 20 } = options;
    let url = `/admin/inventories/${productId}/transactions?page=${page}&size=${size}`;
    if (variantId != null && variantId > 0) {
      url += `&variantId=${variantId}`;
    }
    const data = await apiClient.get<unknown>(url, { requireAuth: true });
    return parseTransactionPage(data);
  },

  async syncRedis(): Promise<void> {
    await apiClient.postAuth("/admin/inventories/sync-redis");
  }
};
