# TÀI LIỆU THIẾT KẾ: AI ENGINE SERVICE
## (Dịch Vụ Trí Tuệ Nhân Tạo & Dự Báo)

> **Lưu ý (cập nhật 2026-10):** Tài liệu này mô tả **thiết kế ban đầu** với một dịch vụ duy nhất "AI Engine :8000" và **đã được tái cấu trúc**. Hệ thống AI microservices thực tế nằm trong thư mục `AI/` (xem [`AI/README.md`](../../AI/README.md)) gồm các service FastAPI chuyên biệt: **chatbot-service :8002** (RAG Chatbot Aura), **recs-service :8003** (SASRec sequential recommendations), và **forecast-service :8004** (dự báo tồn kho, churn risk, K-Means RFM phân khúc, dynamic pricing). Về tìm kiếm văn bản ngữ nghĩa, xem thêm [`docs/AI/text-search.md`](../AI/text-search.md).

> **Port (thiết kế ban đầu):** `8000` | **Technology:** Python FastAPI, PyTorch, Transformers, LangChain/LlamaIndex, Scikit-learn (K-Means), LightGBM/Prophet | **Version:** 1.0.0

---

## I. TỔNG QUAN VÀ NHIỆM VỤ

AI Engine Service là trung tâm xử lý dữ liệu thông minh của hệ thống. Dịch vụ được xây dựng bằng Python để tận dụng tối đa hệ sinh thái Machine Learning & LLM.

### 1.1. Các nhiệm vụ cốt lõi
1. **RAG Chatbot & NLP Engine (chatbot-service :8002):** Xử lý hội thoại tự động thông qua kiến trúc RAG với DeepSeek-Chat, tích hợp truy xuất sản phẩm từ Catalog và tra cứu chính sách FAISS để hỗ trợ khách hàng theo thời gian thực.
2. **Personalized Sequential Recommendations (recs-service :8003):** Mô hình SASRec (Self-Attentive Sequential Recommendation) trên nền tảng PyTorch, gợi ý sản phẩm cá nhân hóa theo chuỗi tương tác (xem, click, giỏ hàng) và giải quyết cold-start qua tầng dự phòng Recency / Popularity.
3. **Customer Churn Risk & RFM Segmentation (forecast-service :8004):** Đánh giá nguy cơ rời bỏ khách hàng (Churn Risk) phát sự kiện tới promotion-service; định kỳ phân cụm K-Means RFM để phân nhóm khách hàng (VIP Champions, Potential Loyalists, At Risk, New Customers).
4. **Demand Forecasting (Dự báo nhu cầu tồn kho):** Huấn luyện mô hình time-series (LightGBM/Prophet) dựa trên lịch sử tồn kho để đưa ra dự báo số lượng cần restock và cảnh báo tồn kho an toàn.
5. **Dynamic Pricing Model (Định giá Động):** Cung cấp API tính toán điểm nhạy cảm giá của người dùng phục vụ cho chính sách khuyến mãi.

---

## II. KIẾN TRÚC THÀNH PHẦN (COMPONENT ARCHITECTURE)

```
                       ┌────────────────────────────────────────┐
                       │          AI SERVICES CLUSTER           │
                       │                                        │
                       │  ┌──────────────┐    ┌──────────────┐  │
                       │  │ RAG Chatbot  │    │ Recs Engine  │  │
                       │  │ (DeepSeek)   │    │   (SASRec)   │  │
                       │  └──────┬───────┘    └──────┬───────┘  │
                       │         │                   │          │
                       │  ┌──────▼───────┐    ┌──────▼───────┐  │
                       │  │Churn & RFM   │    │Forecast Model│  │
                       │  │(KMeans/XGB)  │    │  (LightGBM)  │  │
                       │  └──────────────┘    └──────────────┘  │
                       └─────────┬───────────────────┬──────────┘
                                 │                   │
  ┌──────────────────────────────┼───────────────────┼──────────────────────────────┐
  ▼                              ▼                   ▼                              ▼
[Redis Cache]               [MongoDB]         [Kafka Event Bus]             [MariaDB]
(User Sessions & History)  (Chat & NoSQL)    (User Behavior & Risks)    (Orders, Inventory, Users)
```

---

## III. ĐẶC TẢ CHI TIẾT CÁC TÍNH NĂNG AI

### 3.1. RAG Chatbot & SSE Streaming API

> *Thiết kế ban đầu.* Chatbot thực tế là chatbot-service :8002 — xem `docs/AI/chatbot-ai.md`. Hai bước 1–2 bên dưới không được cài đặt như mô tả: e5-large cho vector **1024** chiều (không phải 768) và hệ thống **không** dùng Elasticsearch k-NN.
*   **Endpoint:** `POST /api/ai/chat/stream`
*   **Request Payload:**
```json
{
  "sessionId": "sess_123456789",
  "userId": 101,
  "message": "Tôi muốn mua một chiếc áo gió mỏng nhẹ màu đen",
  "chatHistory": [
    { "role": "user", "content": "Chào shop" },
    { "role": "bot", "content": "Chào bạn! Tôi có thể giúp gì cho bạn?" }
  ]
}
```
*   **Logic thực thi:**
    1. Gọi mô hình **e5-large** để chuyển đổi câu hỏi `"Tôi muốn mua..."` thành Query Vector (768 dims).
    2. Gọi Elasticsearch k-NN search trên index `products` bằng query vector để tìm top 5 sản phẩm khớp nhất về mặt ngữ nghĩa.
    3. Lấy thông tin chi tiết 5 sản phẩm đó ghép làm Context cùng lịch sử hội thoại đưa vào LLM Prompt.
    4. Gọi OpenAI/Gemini hoặc Local LLM để sinh phản hồi dưới dạng Stream (Server-Sent Events) để trả về cho Client gõ chữ thời gian thực.
    5. Đẩy tin nhắn của khách và phản hồi của bot vào hàng đợi lưu trữ MongoDB.

### 3.2. Personalized Sequential Recommendation Engine (recs-service :8003)
*   **Mô hình cốt lõi:** SASRec (Self-Attentive Sequential Recommendation) huấn luyện trên PyTorch.
*   **Kiến trúc phục vụ 3 tầng (3-tier fallback):**
    1. *Tầng 1 (Cá nhân hóa):* SASRec dự đoán top-K sản phẩm tiếp theo dựa trên chuỗi tương tác gần nhất của user (chuỗi xem sản phẩm, thêm vào giỏ).
    2. *Tầng 2 (Recency fallback):* Nếu chưa đủ độ dài chuỗi hành vi, fallback theo các danh mục/sản phẩm user vừa xem gần nhất.
    3. *Tầng 3 (Popularity / Trending):* Đối với khách vãng lai mới hoàn toàn (cold-start), gợi ý sản phẩm bán chạy hoặc thịnh hành theo danh mục.
*   **Endpoint chính:** `GET /public/recommendations/personal?source=auto|for_you|recent|trending` và `POST /recommendations/cross-sell`.
*   **Mã nguồn dịch vụ:** Tham khảo triển khai tại `AI/recs-service/` và tài liệu tổng thể `AI/README.md`.

### 3.3. Customer Churn Risk & RFM Segmentation (forecast-service :8004)
*   **Dự báo nguy cơ rời bỏ (Churn Risk):**
    *   Mô hình đánh giá điểm rủi ro khách hàng rời bỏ dựa trên tần suất tương tác, thời gian không hoạt động, biến động giỏ hàng và phản hồi đánh giá.
    *   Khi phát hiện nguy cơ cao, phát `ChurnRiskDetectedEvent` lên Kafka topic `user-risk-events` để Promotion Service kích hoạt chiến dịch giữ chân khách hàng (voucher tái kích hoạt).
    *   Chi tiết: Tham khảo [`docs/AI/churn-risk-feature-overview.md`](../AI/churn-risk-feature-overview.md).
*   **Weekly K-Means RFM Segmenter (Chạy ngầm):**
    *   **Tần suất:** 01:00 Chủ nhật hàng tuần.
    *   **Quy trình chạy:**
        1. Query cơ sở dữ liệu lấy toàn bộ đơn hàng trong 180 ngày gần nhất của tất cả user hoạt động.
        2. Tính toán các chỉ số RFM (Recency, Frequency, Monetary) cho mỗi User ID.
        3. Áp dụng chuẩn hóa MinMax Scaler và chạy thuật toán phân cụm **K-Means** (với $K=4$).
        4. Gán nhãn phân khúc cho từng user:
            *   *Nhóm 1:* `VIP Champions` (R thấp, F cao, M cao).
            *   *Nhóm 2:* `Potential Loyalists` (F trung bình, M khá).
            *   *Nhóm 3:* `At Risk / About to Sleep` (R cao - lâu chưa mua lại).
            *   *Nhóm 4:* `New Customers` (R thấp, F thấp, M thấp).
        5. Gọi API nội bộ của Identity & User Service: `PUT /api/internal/users/{userId}/segmentation` để lưu nhãn phân khúc phục vụ khuyến mãi.

### 3.4. Dynamic Pricing Engine (Mô hình Định giá Động)
*   **Endpoint:** `POST /api/ai/pricing/predict`
*   **Request Payload:**
```json
{
  "userId": 101,
  "productId": 2002,
  "customerTier": "GOLD",
  "segmentationLabel": "At Risk",
  "cartTotal": 1250000.0
}
```
*   **Response 200 OK:**
```json
{
  "aiPriceScore": 0.82,
  "recommendedAction": "GIVE_HIGH_DISCOUNT" // Dựa trên độ nhạy cảm giá cao
}
```
*   **Logic:** Sử dụng mô hình XGBoost Classifier dự đoán xác suất chuyển đổi đơn hàng nếu giảm giá. Trả về điểm nhạy cảm giá để đẩy vào Camunda Promotion DMN.

### 3.5. Demand Forecasting Engine (Dự báo Nhu cầu Kho)
*   **Tần suất:** Hàng đêm (02:00 AM).
*   **Quy trình chạy:**
    1. Query PostgreSQL `inventory_daily_snapshots` lấy dữ liệu tồn kho lịch sử.
    2. Huấn luyện mô hình **Prophet (Meta)** hoặc **LightGBM Regressor** cho từng mã sản phẩm (Product ID).
    3. Dự báo mức tiêu thụ trong 7 ngày, 14 ngày, và 30 ngày tiếp theo.
    4. Nếu dự báo tồn kho sắp tới rơi xuống dưới mức an toàn (Safety Stock):
        *   Tạo bản ghi nháp Restock Request trạng thái `PENDING` trong PostgreSQL `restock_requests`.
        *   Bắn thông báo qua email/Slack cho Admin quản lý kho.

---

## IV. CẤU HÌNH DOCKER COMPOSE CHO AI SERVICE

```yaml
version: '3.8'

services:
  ai-engine:
    image: ecommerce/ai-engine:latest
    ports:
      - "8000:8000"
    environment:
      - PORT=8000
      - ELASTICSEARCH_HOST=http://elasticsearch:9200
      - MONGO_URI=mongodb://mongodb:27017/ecommerce_product_nosql
      - POSTGRES_ORDER_DB_URL=postgresql://postgres:5432/ecommerce_order_db
      - USER_SERVICE_URL=http://user-service:8085
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./models:/app/models # Mount thư mục lưu model weights (.bin / .pkl)
    networks:
      - ecommerce-network

networks:
  ecommerce-network:
    external: true
```

---
*Tài liệu thuộc nhóm 2 — Kiến trúc & Kỹ thuật chuyên sâu.*
