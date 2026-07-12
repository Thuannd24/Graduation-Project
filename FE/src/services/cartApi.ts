import { apiClient } from "./apiClient";
import type { Product } from "./productApi";
import { normalizeCollection } from "../utils/normalizeCollection";

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
