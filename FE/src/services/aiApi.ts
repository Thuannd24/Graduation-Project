import { apiClient, hasAuthToken } from "./apiClient.ts";

export interface AIProduct {
  id: string | number;
  name: string;
  price: number;
  oldPrice?: number;
  image: string;
  brand: string;
  category: string;
  rating?: number;
  matchScore?: number;
}

export interface OrderStatusCard {
  type: "order_status";
  orderId: number;
  statusCode: string;
  statusLabel: string;
  trackingCode?: string | null;
  finalAmount?: number | null;
  items?: Array<{
    productName: string;
    productImage?: string | null;
    quantity: number;
    unitPrice?: number | null;
    subtotal?: number | null;
  }>;
}

export interface WarrantyCard {
  type: "warranty";
  orderId: number;
  items: Array<{
    productName: string;
    productImage?: string | null;
    expiry: string;
    daysRemaining?: number | null;
    active: boolean;
  }>;
}

export interface LoyaltyCard {
  type: "loyalty";
  points: number;
  value: number;
}

export interface VouchersCard {
  type: "vouchers";
  vouchers: Array<{
    title: string;
    code: string;
    expiresAt: string;
    discountPercent?: number | null;
    discountAmount?: number | null;
    minOrderValue?: number | null;
  }>;
}

export type ChatCard = OrderStatusCard | WarrantyCard | LoyaltyCard | VouchersCard;

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
  products?: AIProduct[];
  card?: ChatCard | null;
  isEscalated?: boolean;
}

export const aiApi = {
  // 1. Chatbot AI
  sendMessage: async (message: string, image?: string, sessionId?: string): Promise<{ message: string; products?: AIProduct[]; intent?: string; card?: ChatCard | null }> => {
    // apiClient.post already unwraps the {code,message,data} envelope (or passes through
    // a raw payload as-is) — it does NOT return an axios-style {data: ...} response object.
    return await apiClient.post("/chatbot/message", { message, image, session_id: sessionId });
  },

  escalateSession: async (sessionId: string): Promise<boolean> => {
    try {
      await apiClient.post("/chatbot/escalate", { session_id: sessionId });
      return true;
    } catch (err) {
      console.warn("Escalate API fallback.", err);
      return true;
    }
  },

  // 2. Visual Search (Tìm kiếm bằng hình ảnh)
  searchByImage: async (imageFile: File): Promise<{ items: AIProduct[]; cropBox: { x1: number; y1: number; x2: number; y2: number } }> => {
    const formData = new FormData();
    formData.append("image", imageFile);
    return await apiClient.post("/search/image", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
  },

  // 3. Recommendations
  getPersonalizedRecommendations: async (userId?: string): Promise<AIProduct[]> => {
    if (!hasAuthToken()) {
      return [];
    }
    try {
      return await apiClient.get(`/recommendations/personal?user_id=${userId || ""}`);
    } catch (err) {
      console.warn("Recommendation API not available yet.", err);
      return [];
    }
  },

  getCrossSellCombo: async (itemIds: string[]): Promise<AIProduct[]> => {
    try {
      return await apiClient.get(`/recommendations/cross-sell?item_ids=${itemIds.join(",")}`);
    } catch (err) {
      console.warn("Cross-sell API fallback.", err);
      return [];
    }
  },

  // 4. AI Admin Analytics Charts
  getDemandForecasting: async (): Promise<{ dates: string[]; actual: number[]; forecast: number[] }> => {
    try {
      return await apiClient.get("/admin/analytics/demand-forecasting");
    } catch (err) {
      // Mock data for forecasting graph
      const dates = ["01/07", "03/07", "05/07", "07/07", "09/07", "11/07", "13/07", "15/07", "17/07", "19/07"];
      return {
        dates,
        actual: [120, 150, 140, 190, 160, 210, 180, 240, null, null],
        forecast: [115, 145, 142, 185, 165, 205, 182, 230, 250, 280]
      };
    }
  },

  getAnomalyLogs: async (): Promise<Array<{ id: string; timestamp: string; amount: number; user: string; riskScore: number; reason: string }>> => {
    try {
      return await apiClient.get("/admin/analytics/anomalies");
    } catch (err) {
      return [
        { id: "TX-78391", timestamp: "2026-07-10 14:23:11", amount: 154000000, user: "nguyenvan_a@gmail.com", riskScore: 92, reason: "Giá trị đơn hàng cao đột biến & Đặt liên tiếp 3 đơn trong 5 phút" },
        { id: "TX-78345", timestamp: "2026-07-10 11:05:44", amount: 45000000, user: "ty_le99@yahoo.com", riskScore: 81, reason: "Thanh toán khác quốc gia với IP đăng ký ban đầu" },
        { id: "TX-78102", timestamp: "2026-07-09 23:51:02", amount: 3500000, user: "guest_98271", riskScore: 78, reason: "Sử dụng 5 mã giảm giá sai liên tiếp trước khi thanh toán" }
      ];
    }
  },

  getCustomerSegmentation: async (): Promise<Array<{ segment: string; count: number; percentage: number; color: string; spendRatio: number }>> => {
    try {
      return await apiClient.get("/admin/analytics/segmentation");
    } catch (err) {
      return [
        { segment: "Khách hàng VIP (Core)", count: 245, percentage: 12.5, color: "#10b981", spendRatio: 45 },
        { segment: "Khách hàng mua thường xuyên", count: 680, percentage: 34.6, color: "#3b82f6", spendRatio: 35 },
        { segment: "Khách hàng mới / Tiềm năng", count: 820, percentage: 41.8, color: "#f59e0b", spendRatio: 15 },
        { segment: "Khách hàng nguy cơ rời bỏ", count: 220, percentage: 11.2, color: "#ef4444", spendRatio: 5 }
      ];
    }
  }
};
