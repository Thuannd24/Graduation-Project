# TÀI LIỆU THIẾT KẾ: AI ENGINE SERVICE
## (Dịch Vụ Trí Tuệ Nhân Tạo & Dự Báo)

> **Port:** `8000` | **Technology:** Python FastAPI, PyTorch, Transformers, LangChain/LlamaIndex, Scikit-learn (K-Means), LightGBM/Prophet | **Version:** 1.0.0

---

## I. TỔNG QUAN VÀ NHIỆM VỤ

AI Engine Service là trung tâm xử lý dữ liệu thông minh của hệ thống. Dịch vụ được xây dựng bằng Python để tận dụng tối đa hệ sinh thái Machine Learning & LLM.

### 1.1. Các nhiệm vụ cốt lõi
1. **RAG Chatbot & NLP Engine:** Xử lý hội thoại tự động thông qua kiến trúc RAG (Retrieval-Augmented Generation), tích hợp tìm kiếm sản phẩm từ Elasticsearch để trả lời câu hỏi của khách hàng.
2. **Visual & Semantic Search Helper:** Trích xuất vector nhúng (embeddings) 768 chiều từ hình ảnh sản phẩm (CLIP) và câu truy vấn văn bản (e5-large) để thực hiện tìm kiếm thông minh.
3. **Weekly K-Means RFM Worker:** Định kỳ chạy offline hàng tuần để tính toán điểm RFM (Recency, Frequency, Monetary) của khách hàng từ dữ liệu đơn hàng và thực hiện phân cụm (Clustering), sau đó cập nhật nhãn phân khúc về User Service.
4. **Dynamic Pricing Model (Định giá Động):** Cung cấp API tính toán điểm nhạy cảm giá của người dùng phục vụ cho Camunda Promotion Workflow.
5. **Demand Forecasting (Dự báo nhu cầu tồn kho):** Huấn luyện mô hình time-series (LightGBM/Prophet) dựa trên lịch sử tồn kho để đưa ra dự báo số lượng cần restock.

---

## II. KIẾN TRÚC THÀNH PHẦN (COMPONENT ARCHITECTURE)

```
                       ┌────────────────────────────────────────┐
                       │          AI ENGINE (:8000)             │
                       │                                        │
                       │  ┌──────────────┐    ┌──────────────┐  │
                       │  │ RAG Chatbot  │    │ Vectorizer   │  │
                       │  │ (LlamaIndex) │    │ (CLIP/e5)    │  │
                       │  └──────┬───────┘    └──────┬───────┘  │
                       │         │                   │          │
                       │  ┌──────▼───────┐    ┌──────▼───────┐  │
                       │  │K-Means Worker│    │Forecast Model│  │
                       │  │   (RFM)      │    │  (LightGBM)  │  │
                       │  └──────────────┘    └──────────────┘  │
                       └─────────┬───────────────────┬──────────┘
                                 │                   │
  ┌──────────────────────────────┼───────────────────┼──────────────────────────────┐
  ▼                              ▼                   ▼                              ▼
[Redis Cache]               [MongoDB]         [Elasticsearch]                [PostgreSQL]
(Hot similar items)    (Backup similarities)  (k-NN Vector Search)       (Orders & Snapshots)
```

---

## III. ĐẶC TẢ CHI TIẾT CÁC TÍNH NĂNG AI

### 3.1. RAG Chatbot & SSE Streaming API
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

### 3.2. Vector Extraction (Tìm kiếm bằng ảnh và ngữ nghĩa)
*   **Tìm kiếm bằng Ảnh (`POST /api/ai/embed/image`):**
    *   **Payload:** Multipart Form-data (chứa file ảnh tải lên).
    *   **Logic:** Đưa qua model **CLIP (ViT-B/32)** trích xuất đặc trưng ảnh thành vector 768 chiều. Trả về mảng float.
*   **Tìm kiếm bằng Ngữ nghĩa (`POST /api/ai/embed/text`):**
    *   **Payload:** `{ "text": "váy hoa cúc dáng dài màu vàng" }`
    *   **Logic:** Đưa qua model **e5-large** sinh vector nhúng. Trả về mảng float.

### 3.3. Weekly K-Means RFM Segmenter (Chạy ngầm - Celery Scheduler)
*   **Tần suất:** 01:00 Chủ nhật hàng tuần.
*   **Quy trình chạy:**
    1. Query cơ sở dữ liệu `ecommerce_order_db` lấy toàn bộ đơn hàng trong 180 ngày gần nhất của tất cả user hoạt động.
    2. Tính toán các chỉ số RFM cho mỗi User ID:
        *   **R (Recency):** Số ngày kể từ đơn hàng cuối cùng đến thời điểm hiện tại.
        *   **F (Frequency):** Tổng số đơn hàng thành công của user.
        *   **M (Monetary):** Tổng số tiền mua sắm tích lũy của user.
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
