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

  // 2. Recommendations
  // Danh tính KHÔNG truyền qua query nữa: gateway inject X-User-Id từ JWT (nếu đăng nhập) và apiClient
  // luôn gửi X-Session-Id — nên khách chưa đăng nhập cũng nhận gợi ý theo phiên đang duyệt. Tham số
  // `_userId` giữ lại chỉ để không vỡ chỗ gọi cũ.
  getPersonalizedRecommendations: async (_userId?: string): Promise<AIProduct[]> => {
    return aiApi.getRecommendations("auto");
  },

  // Mỗi khối UI lấy đúng 1 nguồn (tách "xem lại" khỏi "khám phá" — quyết định D1 trong
  // docs/AI/recsys-p1-assessment-and-plan.md): for_you = SASRec (món mới), recent = món vừa xem,
  // trending = phổ biến 30 ngày. "auto" = thang sasrec → recency → popularity như trước.
  getRecommendations: async (source: RecommendationSource, topK = 10): Promise<AIProduct[]> => {
    try {
      return asProductList(await apiClient.get(`/public/recommendations/personal?top_k=${topK}&source=${source}`));
    } catch (err) {
      console.warn("Recommendation API not available yet.", err);
      return [];
    }
  },

  // Tìm kiếm ngữ nghĩa (BM25 + vector, search-service): hiểu "tai nghe chống ồn" ~ "headphone ANC".
  // Chỉ trả sản phẩm đang bán. Lỗi -> trả [] để trang tìm kiếm quay về tìm theo từ khóa.
  searchText: async (query: string, topK = 40): Promise<AIProduct[]> => {
    try {
      const res = await apiClient.get<{ items?: Array<Record<string, unknown>> }>(
        `/public/search?q=${encodeURIComponent(query)}&top_k=${topK}`
      );
      return (res?.items || []).map((item) => ({
        id: item.id as string | number,
        name: String(item.name || ""),
        price: Number(item.price || 0),
        image: String(item.image || ""),
        brand: "",
        category: "",
        matchScore: Number(item.score || 0)
      }));
    } catch (err) {
      console.warn("Semantic search unavailable, falling back to keyword search.", err);
      return [];
    }
  },

  getCrossSellCombo: async (itemIds: string[]): Promise<AIProduct[]> => {
    try {
      // Alias public để giỏ của khách chưa đăng nhập cũng có gợi ý mua kèm theo sản phẩm trong giỏ.
      return asProductList(await apiClient.get(`/public/recommendations/cross-sell?item_ids=${itemIds.join(",")}&top_k=4`));
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
      return await apiClient.get("/admin/analytics/demand-forecasting");
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
      return await apiClient.get("/admin/analytics/anomalies");
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
      return await apiClient.get("/admin/analytics/segmentation");
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
