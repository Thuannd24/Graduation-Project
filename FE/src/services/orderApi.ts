import { apiClient } from "./apiClient";

export const orderApi = {
  getOrder(orderId: string | number): Promise<unknown> {
    return apiClient.get(`/orders/${orderId}`, { requireAuth: true });
  },

  listOrders(): Promise<unknown[]> {
    return apiClient.get<unknown[]>("/orders", { requireAuth: true });
  },

  previewCheckout(payload: { couponCode?: string; pointsToRedeem?: number }): Promise<{
    subtotal: number;
    productDiscount: number;
    shippingDiscount: number;
    pointDiscount: number;
    shippingFee: number;
    vatAmount: number;
    totalDiscount: number;
    finalAmount: number;
    couponCode?: string;
    voucherApplied?: boolean;
    voucherMessage?: string;
  }> {
    return apiClient.postAuth("/orders/checkout/preview", payload);
  },

  createOrder(payload: Record<string, unknown>, idempotencyKey?: string): Promise<any> {
    const key = idempotencyKey || crypto.randomUUID();
    return apiClient.request<any>("/orders/checkout", {
      method: "POST",
      requireAuth: true,
      headers: {
        "Idempotency-Key": key
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

  /** Hủy đơn: bắt buộc lý do. reasonCode thuộc CANCEL_REASONS; "OTHER" cần kèm reason. */
  cancelOrder(orderId: string | number, reasonCode: string, reason?: string): Promise<any> {
    return apiClient.postAuth(`/orders/${orderId}/cancel`, { reasonCode, reason: reason?.trim() || undefined });
  },

  updateDeliveryStatus(orderId: string | number, status: string, reason?: string): Promise<unknown> {
    const reasonParam = reason ? `&reason=${encodeURIComponent(reason)}` : "";
    return apiClient.put(`/orders/${orderId}/delivery-status?status=${status}${reasonParam}`, {}, { requireAuth: true });
  },

  /** Admin xác nhận đã nhận hàng hoàn: RETURNING -> RETURNED (cộng lại kho, hoàn tiền nếu đã thanh toán). */
  confirmReturnReceived(orderId: string | number, note?: string): Promise<any> {
    return apiClient.putAuth(`/orders/${orderId}/return-received`, note ? { note } : {});
  },

  /** Quy tắc đơn hàng do server công bố (phí ship, ngưỡng COD, lý do hủy...). */
  getOrderPolicy(): Promise<any> {
    return apiClient.get(`/orders/policy`, { requireAuth: true });
  },

  /** Trạng thái thanh toán THẬT của đơn (không dựa vào tham số trên URL trả về từ VNPay). */
  getPaymentStatus(orderId: string | number): Promise<{
    orderId: number;
    orderStatus: string;
    paymentMethod?: string;
    paymentStatus: string;
    result: "SUCCESS" | "FAILED" | "PENDING" | "REFUNDED" | "NOT_INITIATED";
    failureCode?: string;
    message?: string;
    amount?: number;
    paidAt?: string;
    canRetry: boolean;
    canSwitchToCod: boolean;
    codMaxAmount?: number;
  }> {
    return apiClient.get(`/payments/order/${orderId}/status`, { requireAuth: true });
  },

  /** Thanh toán lại VNPay (URL mới) hoặc đổi sang COD cho đơn đang chờ thanh toán. */
  retryPayment(orderId: string | number, paymentMethod: "VNPAY" | "COD"): Promise<{ paymentId: number; redirectUrl?: string }> {
    return apiClient.postAuth(`/payments/order/${orderId}/retry`, { paymentMethod });
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
