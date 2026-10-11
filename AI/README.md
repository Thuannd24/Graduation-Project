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
│   │   ├── api/            # Endpoints: /search, /search/suggest, /search/image, /search/multimodal, /search/similar/{id}
│   │   ├── core/           # Cấu hình riêng cho Search Service
│   │   ├── models/         # Pydantic schemas xác thực request/response
│   │   └── services/       # Dense (e5-large) + BM25 (Elasticsearch) + RRF, Visual (CLIP + FAISS), YOLO crop (mặc định tắt)
│   ├── scripts/            # build_index.py (build FAISS index, chạy tay), evaluate.py, experiment_visual.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── chatbot-service/        # Microservice RAG Chatbot "Aura" (:8002) — xem docs/AI/chatbot-ai.md
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
│   │   ├── api/            # /public/recommendations/personal?source=auto|for_you|recent|trending (FE dùng),
│   │   │                   # /recommendations/personal, /recommendations/cross-sell, /recommend (nội bộ)
│   │   ├── models/         # Recommendation request/response models
│   │   └── services/       # Thang 3 tầng: SASRec (PyTorch) → Recency → Popularity; tra thông tin sản phẩm
│   ├── evaluation/         # Harness đánh giá (chia theo thời gian, baseline, ablation) + train_serving (cổng deploy)
│   ├── scripts/            # backfill_history.py: dựng lại lịch sử Redis từ user_events
│   ├── tests/              # pytest
│   ├── Dockerfile
│   └── requirements.txt
│
└── forecast-service/       # Microservice phân tích nghiệp vụ, dự báo doanh thu & định giá (:8004)
    ├── app/
    │   ├── api/            # API Endpoints (/forecast, /anomaly, /pricing/predict, /rfm/trigger,
    │   │                   # /public/behavior/events: nhận vi hành vi từ FE)
    │   ├── kafka/          # Consumer hành vi: Kafka → user_events (MariaDB) + lịch sử Redis
    │   ├── models/         # Pydantic models cho forecasting và dynamic pricing
    │   └── services/       # Demand Forecast (LightGBM), K-Means RFM, Anomaly detection, Pricing
    ├── Dockerfile
    └── requirements.txt
```

---

## 2. Các Công Nghệ Và Mô Hình AI Sử Dụng

1. **Visual Search:** Trích xuất đặc trưng hình ảnh bằng **CLIP (ViT-B/32, 512 chiều)**, tìm chính xác trên FAISS `IndexFlatIP` (index tất cả ảnh sản phẩm, build tay bằng `scripts/build_index.py`). YOLOv8 crop có code nhưng mặc định tắt. Chi tiết: `docs/AI/visual-search.md`.
2. **Semantic Text Search:** Vector ngữ nghĩa **multilingual-e5-large** (1024 chiều) + **BM25** trên Elasticsearch, gộp bằng **Reciprocal Rank Fusion (RRF, k = 60)**. Trang tìm kiếm của website hiện vẫn dùng search của product-service. Chi tiết: `docs/AI/text-search.md`; số liệu đo: `docs/AI/search-evaluation.md`.
3. **Personalized Recommendations:** Mô hình **SASRec (Self-Attentive Sequential Recommendation)** chạy trên PyTorch, gợi ý dựa trên lịch sử xem/thêm giỏ của user (hoặc của phiên nếu chưa đăng nhập). Phục vụ theo thang 3 tầng SASRec → Recency → Popularity; checkpoint chỉ được nạp khi qua cổng đánh giá. Chi tiết: [`docs/AI/recsys-behavior-knowledge-transfer.md`](../docs/AI/recsys-behavior-knowledge-transfer.md).
4. **Demand Forecasting:** Dự báo nhu cầu tồn kho kho hàng dựa trên dữ liệu lịch sử bằng **LightGBM Regressor** hoặc **Meta Prophet**.
5. **Customer Segmentation:** Định kỳ chạy phân cụm **K-Means (RFM)** chia nhóm người dùng để cấu hình chính sách khuyến mãi.
6. **Dynamic Pricing:** Thuật toán đánh giá độ nhạy cảm giá người dùng để xuất hành động cho Camunda Workflow engine.
7. **RAG Chatbot:** Kiến trúc RAG với **DeepSeek-Chat** (nhà cung cấp LLM duy nhất, không có Gemini/GPT dự phòng) cho cả phân loại ý định lẫn sinh câu trả lời; RAG chính sách dùng FAISS + `multilingual-e5-base` thật, RAG sản phẩm là keyword-search gọi thẳng product-service (không có vector store riêng). Chi tiết: `docs/AI/chatbot-ai.md`.

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
* **Chatbot Service:** Cổng `8002` (cần khai báo `DEEPSEEK_API_KEY` trong biến môi trường; chatbot chỉ dùng DeepSeek)
* **Recommendations Service:** Cổng `8003`
* **Forecast Service:** Cổng `8004`

---

## 4. Chạy Bằng Docker Compose (Production / Docker Deployment)

Hệ thống AI microservices tích hợp trực tiếp chung với dải mạng `ecommerce-network` của Java microservices.

Để chạy tất cả các AI microservices:
```bash
# Từ thư mục AI/ chạy lệnh:
docker-compose up --build -d
```

Các dịch vụ sẽ tự động build image và chạy tương ứng trên các cổng `8001`, `8002`, `8003`, `8004`.
