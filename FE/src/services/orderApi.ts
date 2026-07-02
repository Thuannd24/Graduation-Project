import { apiClient } from "./apiClient";

export const orderApi = {
  getOrder(orderId: string | number): Promise<unknown> {
    return apiClient.get(`/orders/${orderId}`, { requireAuth: true });
  },

  listOrders(): Promise<unknown[]> {
    return apiClient.get<unknown[]>("/orders", { requireAuth: true });
  },

  createOrder(payload: Record<string, unknown>): Promise<any> {
    const idempotencyKey = Math.random().toString(36).substring(2, 15);
    return apiClient.request<any>("/orders/checkout", {
      method: "POST",
      requireAuth: true,
      headers: {
        "Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(payload)
    });
  },

  initiatePayment(orderId: string | number, paymentMethod: string): Promise<{ paymentId: number; txnRef: string; redirectUrl: string }> {
    return apiClient.request<any>("/payments/initiate", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ orderId: Number(orderId), paymentMethod })
    }).then(res => {
      if (res && (paymentMethod === "COD" || res.redirectUrl)) {
        return res;
      }
      throw new Error("Không nhận được URL thanh toán từ hệ thống.");
    });
  },

  shipOrder(orderId: string | number): Promise<unknown> {
    return apiClient.putAuth(`/orders/${orderId}/ship`);
  },

  cancelOrder(orderId: string | number): Promise<unknown> {
    return apiClient.postAuth(`/orders/${orderId}/cancel`);
  },

  updateShippingStatus(trackingCode: string, status: string): Promise<unknown> {
    return apiClient.post(`/orders/public/webhook/shipping`, { trackingCode, status });
  },

  updateDeliveryStatus(orderId: string | number, status: string): Promise<unknown> {
    return apiClient.put(`/orders/${orderId}/delivery-status?status=${status}`, {}, { requireAuth: true });
  },

  getPaymentByOrderId(orderId: string | number): Promise<any> {
    return apiClient.get(`/payments/order/${orderId}`, { requireAuth: true });
  },

  listAllPayments(page: number = 0, size: number = 1000): Promise<any> {
    return apiClient.get(`/admin/payments?page=${page}&size=${size}`, { requireAuth: true });
  },

  refundPayment(paymentId: number, amount: number, reason: string): Promise<any> {
    return apiClient.postAuth(`/admin/payments/refund`, { paymentId, amount, reason });
  }
};
