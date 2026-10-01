import { apiClient } from "./apiClient.ts";

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

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
  products?: AIProduct[];
  isEscalated?: boolean;
}

export type RecommendationSource = "auto" | "for_you" | "recent" | "trending";

// recs-service trả thẳng MẢNG (không bọc {code, data}), nên apiClient trả nguyên payload — đọc
// `.data` như trước sẽ ra `undefined` (carousel gợi ý luôn rỗng, CartPage gọi `.length` trên undefined).
// Nhận cả 2 dạng để không phụ thuộc việc sau này có bọc envelope hay không.
function asProductList(payload: unknown): AIProduct[] {
  if (Array.isArray(payload)) return payload as AIProduct[];
  const data = (payload as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as AIProduct[]) : [];
}

export const aiApi = {
  // 1. Chatbot AI
  sendMessage: async (message: string, image?: string, sessionId?: string): Promise<{ message: string; products?: AIProduct[]; intent?: string }> => {
    const response = await apiClient.post("/chatbot/message", { message, image, session_id: sessionId });
    return response.data;
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
    const response = await apiClient.post("/search/image", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  },

  // 3. Recommendations
  // Danh tính KHÔNG truyền qua query nữa: gateway inject X-User-Id từ JWT (nếu đăng nhập) và apiClient
  // luôn gửi X-Session-Id — nên khách chưa đăng nhập cũng nhận gợi ý theo phiên đang duyệt. Tham số
  // `_userId` giữ lại chỉ để không vỡ chỗ gọi cũ.
  getPersonalizedRecommendations: async (_userId?: string): Promise<AIProduct[]> => {
    return aiApi.getRecommendations("auto");
  },

  // Mỗi khối UI lấy đúng 1 nguồn (tách "xem lại" khỏi "khám phá" — quyết định D1 trong
  // docs/canvas/recsys-p1-assessment-and-plan.md): for_you = SASRec (món mới), recent = món vừa xem,
  // trending = phổ biến 30 ngày. "auto" = thang sasrec → recency → popularity như trước.
  getRecommendations: async (source: RecommendationSource, topK = 10): Promise<AIProduct[]> => {
    try {
      return asProductList(await apiClient.get(`/public/recommendations/personal?top_k=${topK}&source=${source}`));
    } catch (err) {
      console.warn("Recommendation API not available yet.", err);
      return [];
    }
  },

  getCrossSellCombo: async (itemIds: string[]): Promise<AIProduct[]> => {
    try {
      return asProductList(await apiClient.get(`/recommendations/cross-sell?item_ids=${itemIds.join(",")}`));
    } catch (err) {
      console.warn("Cross-sell API fallback.", err);
      return [];
    }
  },

  // 4. AI Admin Analytics Charts
  //
  // Cả 3 endpoint dưới đây trả kèm `is_demo_data` + `note`: `segmentation` đã nối vào model churn
  // thật (is_demo_data=false); `demand-forecasting`/`anomalies` vẫn là dữ liệu minh họa vì dựng bản
  // thật là hướng phát triển riêng ngoài phạm vi churn-risk — xem AI/forecast-service/app/api/
  // endpoints/forecast.py. AnalyticsAITab.jsx đọc cờ này để hiển thị banner, không im lặng nữa.
  getDemandForecasting: async (): Promise<{
    data: { dates: string[]; actual: (number | null)[]; forecast: number[] };
    is_demo_data: boolean;
    note: string | null;
  }> => {
    try {
      const response = await apiClient.get("/admin/analytics/demand-forecasting");
      return response.data;
    } catch (err) {
      const dates = ["01/07", "03/07", "05/07", "07/07", "09/07", "11/07", "13/07", "15/07", "17/07", "19/07"];
      return {
        data: {
          dates,
          actual: [120, 150, 140, 190, 160, 210, 180, 240, null, null],
          forecast: [115, 145, 142, 185, 165, 205, 182, 230, 250, 280]
        },
        is_demo_data: true,
        note: "Không gọi được máy chủ AI — hiển thị dữ liệu minh họa dự phòng."
      };
    }
  },

  getAnomalyLogs: async (): Promise<{
    data: Array<{ id: string; timestamp: string; amount: number; user: string; riskScore: number; reason: string }>;
    is_demo_data: boolean;
    note: string | null;
  }> => {
    try {
      const response = await apiClient.get("/admin/analytics/anomalies");
      return response.data;
    } catch (err) {
      return {
        data: [
          { id: "TX-78391", timestamp: "2026-07-10 14:23:11", amount: 154000000, user: "nguyenvan_a@gmail.com", riskScore: 92, reason: "Giá trị đơn hàng cao đột biến & Đặt liên tiếp 3 đơn trong 5 phút" },
          { id: "TX-78345", timestamp: "2026-07-10 11:05:44", amount: 45000000, user: "ty_le99@yahoo.com", riskScore: 81, reason: "Thanh toán khác quốc gia với IP đăng ký ban đầu" },
          { id: "TX-78102", timestamp: "2026-07-09 23:51:02", amount: 3500000, user: "guest_98271", riskScore: 78, reason: "Sử dụng 5 mã giảm giá sai liên tiếp trước khi thanh toán" }
        ],
        is_demo_data: true,
        note: "Không gọi được máy chủ AI — hiển thị dữ liệu minh họa dự phòng."
      };
    }
  },

  getCustomerSegmentation: async (): Promise<{
    data: Array<{ segment: string; count: number; percentage: number; color: string; spendRatio: number }>;
    is_demo_data: boolean;
    note: string | null;
  }> => {
    try {
      const response = await apiClient.get("/admin/analytics/segmentation");
      return response.data;
    } catch (err) {
      return {
        data: [
          { segment: "VIP Champions", count: 245, percentage: 12.5, color: "#10b981", spendRatio: 45 },
          { segment: "Loyal Regulars", count: 680, percentage: 34.6, color: "#3b82f6", spendRatio: 35 },
          { segment: "Lapsed", count: 820, percentage: 41.8, color: "#f59e0b", spendRatio: 15 },
          { segment: "At Risk", count: 220, percentage: 11.2, color: "#ef4444", spendRatio: 5 }
        ],
        is_demo_data: true,
        note: "Không gọi được máy chủ AI — hiển thị dữ liệu minh họa dự phòng."
      };
    }
  }
};
