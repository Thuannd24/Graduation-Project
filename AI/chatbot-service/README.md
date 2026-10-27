# Chatbot Service (AI)

Microservice Python (FastAPI) đóng vai trò chatbot RAG "Aura" của AuraTech: phân loại ý định, tra cứu chính sách (Policy RAG bằng FAISS), tra cứu đơn hàng/điểm thưởng/voucher/bảo hành (chỉ đọc, gọi thẳng các service BE), và sinh câu trả lời bằng DeepSeek (có fallback mock nếu chưa có API key).

### Cấu trúc thư mục `app/services/`

```
services/
  llm_client.py   # Gọi DeepSeek — nhà cung cấp LLM duy nhất, dùng cho cả NLU và sinh câu trả lời
  memory.py       # Lịch sử chat trong Redis (sliding window)
  prompt.py       # Ghép system-prompt.md + context RAG + thông tin khách hàng
  tools.py        # Gọi order/user/promotion-service (chỉ đọc) cho order_tracking/order_action
  nlu/
    classifier.py # NluService — 1 lệnh gọi DeepSeek trả về {intent, sentiment, order_id, account_topic}
    heuristics.py # Heuristic từ khoá — CHỈ dùng khi lệnh gọi DeepSeek ở trên lỗi
  rag/
    product_rag.py # Tìm sản phẩm thật qua product-service (product_search/price_inquiry)
    policy_rag.py   # Tìm chính sách qua FAISS index (policy_faq)
```

Chạy ở cổng **8002**, đứng sau API Gateway ở route `/api/v1/chatbot/**`.

---

## 1. Yêu cầu trước khi chạy

| Thành phần | Bắt buộc? | Ghi chú |
|---|---|---|
| Python 3.10+ | Có | |
| Redis | Có | Lưu lịch sử chat (sliding window). Mặc định `localhost:6379`. |
| BE: order-service / user-service / promotion-service | Không bắt buộc để service khởi động, nhưng cần chạy để 4 tool tra cứu (đơn hàng, điểm thưởng, voucher, bảo hành) trả dữ liệu thật. Nếu tắt, chatbot vẫn chạy — chỉ các câu hỏi đó sẽ báo "chưa tra cứu được". |
| BE: product-service (cổng 8089) | Không bắt buộc | Cần cho intent `product_search`/`price_inquiry` (tìm kiếm catalog thật — xem `app/services/rag/product_rag.py`). |
| `DEEPSEEK_API_KEY` | Không bắt buộc | Nhà cung cấp LLM duy nhất (NLU + sinh câu trả lời). Nếu không set, NLU rơi về heuristic từ khoá và câu trả lời rơi về mock hiển thị thẳng context/policy vừa tra được (không phải câu chung chung) — vẫn test được routing/guardrail/retrieval đầy đủ, chỉ là câu văn không được LLM viết lại tự nhiên. |

---

## 2. Cài đặt trên máy mới (lần đầu)

Dự án dùng 1 virtualenv chung cho toàn bộ `AI/` (theo `AI/README.md`):

```bash
cd AI
python -m venv venv
source venv/bin/activate          # Windows: .\venv\Scripts\activate

cd chatbot-service
pip install -r requirements.txt
```

> **Lưu ý cài đặt torch (dùng bởi `sentence-transformers`):** nếu máy không có GPU, nên cài bản CPU-only trước để tránh pip kéo theo hàng GB package CUDA không cần thiết:
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cpu
> pip install -r requirements.txt   # các package còn lại, torch đã có sẵn nên sẽ bỏ qua
> ```

### Build Policy RAG index (bắt buộc trước khi chạy lần đầu)

Chatbot tra cứu chính sách bằng FAISS index build từ `data/policies/*.md`. Build 1 lần:

```bash
python scripts/build_policy_index.py
```

Chạy lại script này **mỗi khi bạn sửa nội dung** trong `data/policies/*.md` (thêm/sửa chính sách) — output là `data/index/policy.index` + `data/index/policy_meta.json`, có thể commit vào git để khỏi phải build lại trên máy khác.

---

## 3. Chạy service

### Cách 1 — chạy trực tiếp bằng Python (khuyến nghị khi dev)

```bash
cd AI
source venv/bin/activate
cd chatbot-service
python main.py
```

Service có `reload=True` sẵn — sửa code Python thì service **tự restart**, không cần tắt/mở lại tay. Chỉ cần restart tay khi:
- Bạn sửa `requirements.txt` (cần `pip install` lại).
- Bạn sửa `data/policies/*.md` (cần chạy lại `build_policy_index.py` rồi mới restart để nạp index mới).

### Cách 2 — chạy bằng Docker Compose

```bash
cd AI
docker compose up -d --build chatbot-service
```

Dùng khi cần chạy cùng lúc với các AI service khác hoặc trên network chung với BE (`be_ecommerce-network`).

### Kiểm tra đã chạy chưa

```bash
curl http://localhost:8002/health
```

---

## 4. Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8002` | Cổng chạy service |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Lưu lịch sử chat |
| `DEEPSEEK_API_KEY` | *(rỗng)* | Nếu có → dùng DeepSeek (nhà cung cấp LLM duy nhất) cho cả NLU và sinh câu trả lời; nếu không → NLU rơi về heuristic, câu trả lời rơi về mock |
| `PRODUCT_SERVICE_URL` | `http://localhost:8089` | BE product-service — tìm sản phẩm thật (product_search/price_inquiry) |
| `ORDER_SERVICE_URL` | `http://localhost:8082` | BE order-service (tra đơn hàng, bảo hành) |
| `USER_SERVICE_URL` | `http://localhost:8085` | BE user-service (điểm thưởng) |
| `PROMOTION_SERVICE_URL` | `http://localhost:8087` | BE promotion-service (voucher) |
| `POLICY_EMBEDDING_MODEL` | `intfloat/multilingual-e5-base` | Model embedding cho Policy RAG |
| `POLICY_CONFIDENCE_OK` / `POLICY_CONFIDENCE_DISCLAIMER` | `0.82` / `0.80` | Ngưỡng độ tin cậy đã hiệu chỉnh thực nghiệm cho model trên — xem mục 6 |

Khi chạy trực tiếp bằng Python trên máy local (không qua Docker), **không cần set** `ORDER_SERVICE_URL`/`USER_SERVICE_URL`/`PROMOTION_SERVICE_URL`/`SEARCH_SERVICE_URL` nếu các service đó cũng đang chạy ở `localhost` với đúng port mặc định ở trên — giá trị mặc định đã trỏ đúng.

---

## 5. Test nhanh bằng curl (không cần đăng nhập)

```bash
curl -X POST http://localhost:8002/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "test-1", "message": "Chính sách đổi trả hàng lỗi thế nào?"}'
```

Kết quả trả về JSON `{"message": "...", "intent": "...", "products": [...]}` .

Muốn test các câu cần đăng nhập (tra đơn hàng, điểm thưởng, voucher, bảo hành), thêm 2 header lấy từ token đăng nhập thật (Local Storage của FE hoặc Network tab):

```bash
curl -X POST http://localhost:8002/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -H "X-User-Id: <sub trong token>" \
  -d '{"session_id": "test-1", "message": "Đơn #1 khi nào giao tới?"}'
```

### Test qua giao diện thật

Chatbot đã được nối sẵn với widget chat trên FE (`FE/src/features/chatbot/components/AIChatbotWidget.jsx` → gọi `/api/v1/chatbot/message` qua gateway `:8080`). Chỉ cần chatbot-service đang chạy + gateway + FE đang chạy + đã đăng nhập → mở icon chat trên web và gõ thử, không cần cấu hình gì thêm ở FE.

---

## 6. Giới hạn hiện tại (để biết trước, không phải lỗi)

- **Intent & Sentiment chính dùng DeepSeek** (`app/services/nlu/classifier.py`) — chỉ rơi về heuristic từ khoá (`app/services/nlu/heuristics.py`, chưa fine-tune PhoBERT thật như thiết kế) khi không có `DEEPSEEK_API_KEY` hoặc lệnh gọi lỗi.
- **Tra sản phẩm** (`product_search`/`price_inquiry`) là "contains"-search của product-service (không phải semantic search) — câu diễn đạt tự nhiên không trúng tên/từ khoá sản phẩm dễ trả về rỗng. Thẻ sản phẩm cũng thiếu category vì product-service chưa trả `categoryName` đầy đủ.
- **4 tool tra cứu chỉ đọc** (order/points/voucher/warranty) — không có tool huỷ đơn hay bất kỳ hành động ghi/thay đổi nào. Khi khách hỏi huỷ đơn, bot chỉ hướng dẫn tự làm trên web.
- **Ngưỡng confidence 0.82/0.80** được đo thực nghiệm cho `intfloat/multilingual-e5-base` — nếu đổi `POLICY_EMBEDDING_MODEL`, nên đo lại (chạy vài câu hỏi liên quan/không liên quan qua `policy_rag_service.retrieve()` rồi xem điểm số) trước khi tin ngưỡng cũ.
- **RAGAS eval** (`scripts/run_ragas_eval.py`) cần thêm `pip install ragas datasets` (không có trong nhóm cài đặt tối thiểu) và mặc định cần `OPENAI_API_KEY` cho LLM giám khảo của RAGAS (không liên quan tới DeepSeek dùng để sinh câu trả lời).
