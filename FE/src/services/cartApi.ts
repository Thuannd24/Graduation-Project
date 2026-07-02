import { apiClient } from "./apiClient";
import type { Product } from "./productApi";

export interface CartItem {
  id?: string | number;
  cartItemId?: string | number;
  productId?: string;
  qty: number;
  quantity?: number;
  variant?: string;
  product?: Product;
  [key: string]: unknown;
}

function normalizeCollection<T>(data: T[] | { content?: T[]; items?: T[] }): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export const cartApi = {
  async getCart(): Promise<CartItem[]> {
    return normalizeCollection(await apiClient.get<CartItem[] | { items?: CartItem[] }>("/cart", { requireAuth: true }));
  },

  async addItem(productId: string | number, qty = 1, variantId?: string | number): Promise<CartItem[]> {
    const payload = {
      productId: Number(productId),
      variantId: variantId ? Number(variantId) : null,
      quantity: qty
    };
    const response = await apiClient.postAuth<CartItem[] | { items?: CartItem[] }>("/cart", payload);
    return normalizeCollection(response);
  },

  async updateItem(productId: string | number, qty: number, variantId?: string | number): Promise<CartItem[]> {
    const variantQuery = variantId ? `&variantId=${variantId}` : "";
    const response = await apiClient.putAuth<CartItem[] | { items?: CartItem[] }>(
      `/cart/items/${productId}?quantity=${qty}${variantQuery}`
    );
    return normalizeCollection(response);
  },

  async removeItem(productId: string | number, variantId?: string | number): Promise<CartItem[]> {
    const variantQuery = variantId ? `?variantId=${variantId}` : "";
    const response = await apiClient.deleteAuth<CartItem[] | { items?: CartItem[] }>(`/cart/items/${productId}${variantQuery}`);
    return normalizeCollection(response);
  },

  async clearCart(): Promise<void> {
    return apiClient.deleteAuth<void>("/cart");
  }
};
