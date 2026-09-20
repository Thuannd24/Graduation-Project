# Hệ Thống AI Microservices - Graduation Project

Hệ thống AI được tách biệt hoàn toàn thành một thư mục độc lập ngang hàng với Backend (`BE/`) và Frontend (`FE/`). Kiến trúc này giúp tối ưu tài nguyên phần cứng, tránh xung đột thư viện (Dependency Hell) và chuẩn hóa thiết kế dự án lớn.

---

## 1. Kiến Trúc Thư Mục (System Directory Structure)

```text
AI/
├── shared-common/          # Thư viện chứa logic dùng chung (DB connections, Logger, Settings)
│   ├── shared_common/      # Source package của shared library
│   └── setup.py            # File cấu hình để cài đặt package chung (-e ../shared-common)
│
├── search-service/         # Microservice xử lý Visual & Text Hybrid Search (:8001)
│   ├── app/
│   │   ├── api/            # Router & API Endpoints (/search, /search/suggest, /search/similar-image)
│   │   ├── core/           # Cấu hình riêng cho Search Service
│   │   ├── models/         # Pydantic schemas xác thực request/response
│   │   └── services/       # Dense Retrieval (e5-large), Visual Search (CLIP), Hybrid Fusion (RRF)
│   ├── Dockerfile
│   └── requirements.txt
│
├── chatbot-service/        # Microservice RAG Chatbot "Aura" (:8002) — xem docs/canvas/chatbot-ai.md
│   ├── app/
│   │   ├── api/            # API Endpoints (/chat, /chat/sessions/history — JSON thường, không SSE)
│   │   ├── core/           # Cấu hình Chatbot
│   │   ├── models/         # Chat validation models
│   │   └── services/       # nlu/ (LLM-based, fallback từ khoá), rag/ (product keyword-search + policy FAISS), tools.py, memory (Redis)
│   ├── Dockerfile
│   └── requirements.txt
│
├── recs-service/           # Microservice gợi ý cá nhân hóa và Cold-start (:8003)
│   ├── app/
│   │   ├── api/            # API Endpoints (/recommend)
│   │   ├── models/         # Recommendation request/response models
│   │   └── services/       # Mô hình SASRec (PyTorch), Trending Popularity (Cold-start)
│   ├── Dockerfile
│   └── requirements.txt
│
└── forecast-service/       # Microservice phân tích nghiệp vụ, dự báo doanh thu & định giá (:8004)
    ├── app/
    │   ├── api/            # API Endpoints (/forecast, /anomaly, /pricing/predict, /rfm/trigger)
    │   ├── models/         # Pydantic models cho forecasting và dynamic pricing
    │   └── services/       # Demand Forecast (LightGBM), K-Means RFM, Anomaly detection, Pricing
    ├── Dockerfile
    └── requirements.txt
```

---

## 2. Các Công Nghệ Và Mô Hình AI Sử Dụng

1. **Visual Search:** Trích xuất đặc trưng hình ảnh sử dụng mô hình **CLIP (ViT-B/32)**.
2. **Semantic Text Search:** Trích xuất vector ngữ nghĩa sử dụng mô hình **multilingual-e5-large** kết hợp với từ khóa **BM25** thông qua **Reciprocal Rank Fusion (RRF)**.
3. **Personalized Recommendations:** Mô hình **SASRec (Self-Attention Sequential Recommendation)** chạy trên PyTorch giúp gợi ý sản phẩm dựa trên lịch sử tương tác phiên (session history).
4. **Demand Forecasting:** Dự báo nhu cầu tồn kho kho hàng dựa trên dữ liệu lịch sử bằng **LightGBM Regressor** hoặc **Meta Prophet**.
5. **Customer Segmentation:** Định kỳ chạy phân cụm **K-Means (RFM)** chia nhóm người dùng để cấu hình chính sách khuyến mãi.
6. **Dynamic Pricing:** Thuật toán đánh giá độ nhạy cảm giá người dùng để xuất hành động cho Camunda Workflow engine.
7. **RAG Chatbot:** Kiến trúc RAG với **DeepSeek-Chat** (nhà cung cấp LLM duy nhất, không có Gemini/GPT dự phòng) cho cả phân loại ý định lẫn sinh câu trả lời; RAG chính sách dùng FAISS + `multilingual-e5-base` thật, RAG sản phẩm là keyword-search gọi thẳng product-service (không có vector store riêng). Chi tiết: `docs/canvas/chatbot-ai.md`.

---

## 3. Hướng Dẫn Chạy Cục Bộ (Local Development Setup)

### Bước 1: Khởi tạo môi trường ảo Python (Virtual Environment)
Khuyên khích dùng môi trường ảo riêng để tránh xung đột thư viện với hệ thống:
```bash
# Tạo virtual environment ở thư mục gốc AI/
python -m venv venv         # Trên Windows dùng: py -m venv venv

# Kích hoạt trên Windows (PowerShell)
.\venv\Scripts\activate

# Kích hoạt trên Linux/macOS
source venv/bin/activate
```

### Bước 2: Cài đặt và phát triển các service riêng lẻ
Mỗi service được liên kết với `shared-common` ở chế độ chỉnh sửa trực tiếp (`-e`). Để chạy service nào, truy cập thư mục của service đó và cài đặt:
```bash
cd search-service
pip install -r requirements.txt
python main.py
```

Lặp lại cho các service còn lại:
* **Chatbot Service:** Cổng `8002` (cần khai báo `DEEPSEEK_API_KEY` hoặc `GEMINI_API_KEY` trong biến môi trường)
* **Recommendations Service:** Cổng `8003`
* **Forecast Service:** Cổng `8004`

---

## 4. Chạy Bằng Docker Compose (Production / Docker Deployment)

Hệ thống AI microservices tích hợp trực tiếp chung với dải mạng mạng `be_ecommerce-network` của Java microservices.

Để chạy tất cả các AI microservices:
```bash
# Từ thư mục AI/ chạy lệnh:
docker-compose up --build -d
```

Các dịch vụ sẽ tự động build image và chạy tương ứng trên các cổng `8001`, `8002`, `8003`, `8004`.
