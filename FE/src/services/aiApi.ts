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

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
  products?: AIProduct[];
  isEscalated?: boolean;
}

// Fallback Mock Data for UI demonstration
const MOCK_PRODUCTS: AIProduct[] = [
  { id: 1, name: "iPhone 15 Pro Max 256GB Titanium", price: 29990000, oldPrice: 34990000, image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=300", brand: "Apple", category: "Phone", rating: 4.8, matchScore: 98.5 },
  { id: 2, name: "MacBook Pro 14\" M3 Space Gray (8GB/512GB)", price: 39990000, oldPrice: 42990000, image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300", brand: "Apple", category: "Laptop", rating: 4.7, matchScore: 92.4 },
  { id: 3, name: "Sony WH-1000XM5 Wireless Headphones", price: 6490000, oldPrice: 8490000, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300", brand: "Sony", category: "Accessories", rating: 4.9, matchScore: 89.2 },
  { id: 4, name: "Bàn phím cơ ASUS ROG Strix Scope II", price: 2890000, oldPrice: 3490000, image: "https://images.unsplash.com/photo-1618384887929-16ec33faf9c1?w=300", brand: "ASUS", category: "Accessories", rating: 4.5, matchScore: 85.0 },
  { id: 5, name: "Samsung Galaxy S24 Ultra 512GB", price: 27490000, oldPrice: 31990000, image: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=300", brand: "Samsung", category: "Phone", rating: 4.8, matchScore: 95.0 }
];

export const aiApi = {
  // 1. Chatbot AI
  sendMessage: async (message: string, image?: string, sessionId?: string): Promise<{ message: string; products?: AIProduct[]; intent?: string }> => {
    try {
      const response = await apiClient.post("/chatbot/message", { message, image, session_id: sessionId });
      return response.data;
    } catch (err) {
      console.warn("AI Service API not ready. Using simulation mock responses.", err);
      // Simulate chatbot responses based on message keywords
      return new Promise((resolve) => {
        setTimeout(() => {
          const query = message.toLowerCase();
          if (query.includes("iphone") || query.includes("apple") || query.includes("điện thoại")) {
            resolve({
              message: "Tôi tìm thấy một số sản phẩm iPhone và điện thoại cao cấp phù hợp với yêu cầu của bạn. Bạn có muốn xem thêm chi tiết hoặc so sánh cấu hình không?",
              products: [MOCK_PRODUCTS[0], MOCK_PRODUCTS[4]],
              intent: "product_search"
            });
          } else if (query.includes("macbook") || query.includes("laptop") || query.includes("máy tính")) {
            resolve({
              message: "Đây là mẫu MacBook Pro M3 đang được ưu chuộng nhất tại cửa hàng với hiệu năng cực kỳ ấn tượng.",
              products: [MOCK_PRODUCTS[1]],
              intent: "product_search"
            });
          } else if (query.includes("tai nghe") || query.includes("phụ kiện") || query.includes("bàn phím")) {
            resolve({
              message: "Gợi ý các phụ kiện công nghệ chất lượng cao, đang có chương trình giảm giá sâu tuần này:",
              products: [MOCK_PRODUCTS[2], MOCK_PRODUCTS[3]],
              intent: "product_search"
            });
          } else if (query.includes("bảo hành") || query.includes("đổi trả")) {
            resolve({
              message: "Chính sách bảo hành tại AuraTech:\n- Bảo hành chính hãng 12-24 tháng đối với toàn bộ thiết bị điện tử.\n- Lỗi 1 đổi 1 trong vòng 30 ngày nếu phát hiện lỗi từ nhà sản xuất.\n- Hỗ trợ gửi trả bảo hành tận nơi miễn phí phí vận chuyển 2 chiều.",
              intent: "qa_policy"
            });
          } else if (query.includes("nhân viên") || query.includes("gặp người") || query.includes("hỗ trợ trực tiếp")) {
            resolve({
              message: "Yêu cầu của bạn đã được chuyển giao cho nhân viên trực tuyến. Tư vấn viên sẽ phản hồi bạn sau vài giây!",
              intent: "escalate"
            });
          } else {
            resolve({
              message: "Chào bạn! Tôi là Aura AI - trợ lý mua sắm thông minh của AuraTech. Tôi có thể giúp bạn tìm kiếm sản phẩm bằng văn bản/hình ảnh, tư vấn cấu hình, hoặc tra cứu chính sách bảo hành. Bạn cần hỗ trợ gì hôm nay?",
              intent: "greeting"
            });
          }
        }, 1000);
      });
    }
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
    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      const response = await apiClient.post("/search/image", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return response.data;
    } catch (err) {
      console.warn("Visual Search API not ready. Simulating image retrieval.", err);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            items: [
              { ...MOCK_PRODUCTS[0], matchScore: 96.8 },
              { ...MOCK_PRODUCTS[4], matchScore: 84.2 },
              { ...MOCK_PRODUCTS[2], matchScore: 61.5 }
            ],
            cropBox: { x1: 50, y1: 50, x2: 450, y2: 450 } // Simulated crop rectangle
          });
        }, 1200);
      });
    }
  },

  // 3. Recommendations (Đề xuất cá nhân hóa & mua kèm)
  // recs-service chưa triển khai — trả về rỗng để mục "Gợi ý từ AI" tự ẩn (SuggestedSection),
  // không hiện data giả khi service chưa có thật.
  getPersonalizedRecommendations: async (userId?: string): Promise<AIProduct[]> => {
    if (!hasAuthToken()) {
      return [];
    }
    try {
      const response = await apiClient.get(`/recommendations/personal?user_id=${userId || ""}`);
      return response.data;
    } catch (err) {
      console.warn("Recommendation API not available yet.", err);
      return [];
    }
  },

  getCrossSellCombo: async (itemIds: string[]): Promise<AIProduct[]> => {
    try {
      const response = await apiClient.get(`/recommendations/cross-sell?item_ids=${itemIds.join(",")}`);
      return response.data;
    } catch (err) {
      console.warn("Cross-sell API fallback.");
      // Return accessories for cross sell
      return [MOCK_PRODUCTS[2], MOCK_PRODUCTS[3]];
    }
  },

  // 4. AI Admin Analytics Charts
  getDemandForecasting: async (): Promise<{ dates: string[]; actual: number[]; forecast: number[] }> => {
    try {
      const response = await apiClient.get("/admin/analytics/demand-forecasting");
      return response.data;
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
      const response = await apiClient.get("/admin/analytics/anomalies");
      return response.data;
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
      const response = await apiClient.get("/admin/analytics/segmentation");
      return response.data;
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
