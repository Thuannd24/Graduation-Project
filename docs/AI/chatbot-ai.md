# Chatbot AI — "Aura", trợ lý tư vấn AuraTech

> Tài liệu mô tả **đúng hệ thống đang chạy thật** trong `AI/chatbot-service` (không phải bản thiết kế ban đầu). Mọi số liệu, tên model, ngưỡng cấu hình trong file này đều lấy trực tiếp từ code — nếu code đổi mà quên cập nhật file này thì coi như file này sai, không phải ngược lại.
>
> Cập nhật lần gần nhất: sau đợt tái cấu trúc + vá lỗi độ chính xác toàn diện (xem mục 9 — lịch sử các lỗi đã sửa).

---

## 0. Tổng quan — khác gì so với bản thiết kế ban đầu

| Hạng mục | Thiết kế ban đầu (tài liệu cũ) | Thực tế đang chạy |
| :--- | :--- | :--- |
| Phân loại Intent | Fine-tune PhoBERT Classifier | **1 lệnh gọi LLM (DeepSeek)**, PhoBERT chỉ còn là fallback từ khoá khi LLM lỗi |
| Sentiment | PhoBERT-sentiment (ONNX) | **Cùng 1 lệnh gọi LLM ở trên** trả luôn sentiment, fallback từ khoá khi LLM lỗi |
| LLM sinh câu trả lời | Gemini 1.5 Flash / GPT-4o-mini | **DeepSeek (`deepseek-chat`) — nhà cung cấp DUY NHẤT** cho cả NLU lẫn sinh câu trả lời |
| Giao thức trả về | SSE streaming (chữ hiện dần) | **JSON thường 1 cục**, không có streaming thật (FE gọi POST thường, không phải EventSource) |
| Vector Store chính sách | FAISS (đề xuất) | **FAISS thật, đã dùng đúng như đề xuất** ✅ |
| Vector Store sản phẩm | Hybrid e5-large + BM25 | **Không có** — gọi thẳng API search "chứa chuỗi" của product-service, không phải semantic search |
| Tool-calling | 5 tool, có `cancel_order` (LLM tự quyết định gọi) | **4 tool đọc dữ liệu thật** (không có tool ghi/huỷ nào) + định tuyến bằng code, không phải LLM tự chọn tool |
| Đánh giá RAGAS | Đã tích hợp | Có script (`scripts/run_ragas_eval.py`) nhưng cần cài thêm `ragas`/`datasets`, chưa chạy thường xuyên |
| Tóm tắt hội thoại dài | Có (summarization khi > 10 lượt) | **Không có** — chỉ cắt bớt (sliding window), không tóm tắt |

---

## 1. Kiến trúc tổng thể

```
FE (AIChatbotWidget.jsx)
  │  POST /api/v1/chatbot/message  { session_id, message }
  ▼
Gateway :8080  (CircuitBreaker riêng "ai-chatbot-cb", timeout 60s)
  ▼
chatbot-service :8002  →  handle_chat_message()
  │
  ├─ 1. Lấy 10 lượt chat gần nhất từ Redis (trước khi phân loại, để NLU thấy ngữ cảnh)
  ├─ 2. NLU: 1 lệnh gọi DeepSeek → {intent, sentiment, order_id, account_topic}
  ├─ 3. Lưu tin nhắn user vào Redis
  ├─ 4. Định tuyến theo intent (code quyết định, KHÔNG phải LLM tự chọn tool):
  │     ├─ order_tracking / order_action → gọi thẳng order/user/promotion-service (KHÔNG qua LLM)
  │     ├─ off_topic                     → câu từ chối cố định (KHÔNG qua LLM)
  │     ├─ product_search / price_inquiry → product-service search + lấy thông số chi tiết
  │     ├─ policy_faq                    → FAISS retrieve + tính điểm tin cậy
  │     └─ complaint / general_chat      → không có context riêng
  ├─ 5. Ghép system prompt (nội quy + context vừa lấy + tên khách nếu đã đăng nhập)
  ├─ 6. Gọi DeepSeek sinh câu trả lời cuối (dùng lại lịch sử đã lấy ở bước 1)
  └─ 7. Lưu câu trả lời vào Redis → trả JSON {message, intent, products, card}
```

File chính: [chatbot.py](../../AI/chatbot-service/app/api/endpoints/chatbot.py) — hàm `handle_chat_message` là điểm vào duy nhất, viết dạng `def` (sync) chứ không phải `async def`, để FastAPI chạy nó trong thread pool (mọi lệnh gọi bên trong đều là `requests.*` chặn luồng, không có `await` thật nào).

---

## 2. NLU — Phân loại ý định + cảm xúc trong 1 lệnh gọi

File: [app/services/nlu/classifier.py](../../AI/chatbot-service/app/services/nlu/classifier.py)

Không dùng model phân loại riêng (PhoBERT) như thiết kế ban đầu. Thay vào đó, **1 lệnh gọi DeepSeek duy nhất** với `response_format: json_object`, trả về đúng lúc: intent, sentiment, order_id, account_topic.

**8 nhãn intent** (nhiều hơn 6 nhãn trong thiết kế cũ — tách `order_action` ra khỏi `order_tracking` vì luồng xử lý khác hẳn nhau):

| Intent | Mô tả | Có gọi LLM lần 2? |
| :--- | :--- | :---: |
| `product_search` | Tìm/so sánh/tư vấn sản phẩm | Có |
| `price_inquiry` | Hỏi giá 1 sản phẩm cụ thể | Có |
| `order_tracking` | Tra trạng thái đơn hàng cụ thể | **Không** |
| `order_action` | Muốn huỷ đơn / hỏi điểm-voucher-bảo hành **của chính mình** | **Không** |
| `policy_faq` | Hỏi chính sách/quy định chung — nhãn **mặc định** cho mọi câu hỏi về AuraTech không khớp nhãn khác | Có |
| `complaint` | Than phiền, khiếu nại | Có (rồi gắn `intent: "escalate"` khi trả về FE) |
| `off_topic` | Hoàn toàn không liên quan AuraTech — nhãn **hiếm gặp nhất** | **Không** |
| `general_chat` | Chào hỏi, cảm ơn, hỏi bot là ai | Có |

Điểm quan trọng trong prompt (`NLU_SYSTEM_PROMPT`):
- **Có đọc 2 tin nhắn gần nhất** để suy luận câu trả lời cộc lốc (ví dụ khách gõ "#1" ngay sau khi Aura hỏi "cho biết mã đơn hàng" — nếu không có ngữ cảnh này, NLU sẽ hiểu sai thành `general_chat`).
- Phân biệt rõ "muốn huỷ đơn thật" (`order_action`) với "hỏi về hậu quả huỷ đơn" như hoàn tiền/voucher (`policy_faq`) — dù cả 2 đều có chữ "huỷ".
- Ưu tiên `policy_faq` hơn `off_topic` khi phân vân — tránh từ chối oan các câu hỏi AuraTech không điển hình (quên mật khẩu, tìm cửa hàng, nhân viên báo sai giá...).

**Fallback khi LLM lỗi/hết credit**: [heuristics.py](../../AI/chatbot-service/app/services/nlu/heuristics.py) — thuần từ khoá tiếng Việt, chỉ chạy khi lệnh gọi DeepSeek thất bại (thường do hết credit hoặc lỗi mạng, xảy ra không thường xuyên). Độ chính xác thấp hơn LLM nhiều, chỉ để hệ thống không "chết đứng" khi DeepSeek gặp sự cố.

---

## 3. RAG cho sản phẩm — keyword search, KHÔNG phải semantic search

File: [app/services/rag/product_rag.py](../../AI/chatbot-service/app/services/rag/product_rag.py)

Không có vector store cho sản phẩm (khác thiết kế ban đầu). Lý do: catalog sản phẩm thay đổi liên tục (thêm hàng, sửa giá, hết hàng) — gọi thẳng API tìm kiếm sống của product-service (`GET /api/v1/public/products/search`) đảm bảo luôn thấy dữ liệu mới nhất ngay lập tức, không cần đánh index lại.

**Luồng xử lý 1 câu hỏi sản phẩm:**
1. **Tách câu so sánh**: nếu câu chứa "vs", "so sánh", "cái nào hơn"... thì tách thành 2 nửa, tìm riêng từng nửa rồi gộp kết quả — tránh việc 2 tên sản phẩm khác hãng "tranh nhau" trong 1 lượt tìm khiến 1 bên biến mất.
2. **Lọc từ khoá**: bỏ từ đệm tiếng Việt (kể cả không dấu: "may" ↔ "máy"), chuẩn hoá số hiệu Samsung ("s 24" → "s24") — **không** áp dụng cho iPhone/Redmi/iPad vì tên thật của các dòng này vẫn có dấu cách.
3. **5 bước dò tìm** từ cụ thể → chung chung dần, dừng ngay khi có kết quả.
4. **Lấy thêm thông số kỹ thuật**: gọi song song (không tuần tự) `GET /api/v1/public/products/{id}` cho từng sản phẩm tìm được để lấy field `attributes` (RAM, CPU, camera...) — API search không có sẵn field này.

**Hạn chế đã biết**: đây vẫn là so khớp chuỗi, không hiểu ngữ nghĩa. Câu hỏi như "sản phẩm nào bán chạy nhất" không thể trả lời đúng vì "độ bán chạy" không phải thuộc tính có thể tìm bằng từ khoá.

---

## 4. RAG cho chính sách — FAISS thật

File: [app/services/rag/policy_rag.py](../../AI/chatbot-service/app/services/rag/policy_rag.py)

Đây là phần **đúng với thiết kế ban đầu**: dữ liệu chính sách (`data/policies/all-policies.json`) được băm nhỏ, encode bằng model embedding đa ngôn ngữ **`intfloat/multilingual-e5-base`** (build bằng [scripts/build_policy_index.py](../../AI/chatbot-service/scripts/build_policy_index.py)), lưu vào FAISS index tại `data/index/policy.index`.

**Ngưỡng độ tin cậy** (khác số trong thiết kế ban đầu — đã hiệu chỉnh lại theo đo đạc thực tế trên model này, xem [config.py](../../AI/chatbot-service/app/core/config.py)):

| Điểm tương đồng cosine | Hành động |
| :--- | :--- |
| ≥ **0.82** | Trả lời bình thường, có trích dẫn tên tài liệu nguồn |
| 0.80 – 0.82 | Trả lời kèm câu cảnh báo "thông tin có thể chưa đầy đủ" |
| < 0.80 | Từ chối, không gọi LLM, đề nghị gọi hotline |

**Nạp sẵn lúc khởi động** ([main.py](../../AI/chatbot-service/app/main.py) — `@app.on_event("startup")`): lần đầu load model mất ~30-45 giây (tải/nạp model embedding), nếu để tự nạp lúc có câu hỏi đầu tiên sẽ vượt quá timeout của gateway. Nên service luôn trả lời được chính sách ngay từ request đầu tiên sau khi khởi động xong.

**Hạn chế đã biết**: câu hỏi gõ không dấu vẫn có tỷ lệ bị từ chối oan cao hơn (điểm tương đồng rớt dưới ngưỡng) vì model embedding hoạt động kém hơn với văn bản không dấu — chưa có cách sửa rẻ tiền cho việc này.

**Khi thêm/sửa nội dung chính sách**: phải chạy lại `python scripts/build_policy_index.py` rồi **restart chatbot-service** — service đang chạy không tự phát hiện file thay đổi.

---

## 5. Tool-calling — 4 tool đọc dữ liệu thật, không có tool ghi

File: [app/services/tools.py](../../AI/chatbot-service/app/services/tools.py). Khác thiết kế ban đầu ở điểm quan trọng: **LLM không tự quyết định gọi tool nào** — code (`chatbot.py`) định tuyến cứng theo `intent`/`account_topic` mà NLU trả về, sau đó gọi tool tương ứng và đưa kết quả thẳng cho khách, **không qua LLM tổng hợp lại**. An toàn hơn cách để LLM tự "quyết định gọi API" vì không có rủi ro LLM bịa tham số hoặc gọi nhầm.

| Tool | API gọi | Kích hoạt bởi | Cần đăng nhập? |
| :--- | :--- | :--- | :---: |
| `get_order_status` | `GET /api/v1/orders/{id}` (order-service) | `order_tracking` có mã đơn | Có |
| `get_warranty_info` | `GET /api/v1/orders/warranty/me` | `order_action` + `account_topic=warranty` | Có |
| `get_loyalty_points` | `GET /api/v1/users/me/loyalty/points` | `order_action` + `account_topic=points` | Có |
| `get_user_vouchers` | `GET /api/v1/promotions/vouchers/me` | `order_action` + `account_topic=voucher` | Có |

**Không có tool `cancel_order` thật.** Khi `account_topic=cancel`, hệ thống trả về **hướng dẫn tĩnh** (`CANCEL_ORDER_GUIDE`) để khách tự huỷ trên web/app — đúng theo yêu cầu bảo mật ban đầu ("không có tool nào có thể ghi/thay đổi dữ liệu").

**Xác thực**: mọi tool nhận `X-User-Id`, `X-User-Roles`, `Authorization` forward từ gateway (đã verify JWT qua Keycloak) — chatbot-service không tự tin vào `user_id` do client gửi trong body, chỉ tin header do gateway xác thực.

---

## 6. LLM Provider — chỉ DeepSeek

File: [app/services/llm_client.py](../../AI/chatbot-service/app/services/llm_client.py)

Một hàm `generate_text()` duy nhất gọi `deepseek-chat` qua REST API thuần (`requests`, không SDK) — dùng cho **cả 2** việc: NLU (bước 2) và sinh câu trả lời cuối (bước 6). Không có Gemini/OpenAI dự phòng dù comment cũ ở vài chỗ từng nói vậy.

**Khi DeepSeek lỗi/hết credit**: NLU rơi về heuristic từ khoá (mục 2), câu trả lời cuối rơi về mock — hiển thị thẳng đoạn context RAG vừa lấy được (không phải câu chung chung vô nghĩa), nên vẫn kiểm tra được routing/retrieval dù văn phong không tự nhiên.

**Rủi ro timeout**: 1 tin nhắn cần LLM đi qua **2 lệnh gọi DeepSeek tuần tự**, mỗi lệnh timeout 30s → nếu DeepSeek chậm (không lỗi, chỉ chậm), tổng có thể chạm 60 giây. Gateway có route riêng cho chatbot (`ai-chatbot-cb`, timeout 60s, tách khỏi `ai-engine-cb` dùng chung cho search/recommendations/forecast) để chịu được mức này mà không cắt ngang request.

---

## 7. Quản lý hội thoại

File: [app/services/memory.py](../../AI/chatbot-service/app/services/memory.py)

- Lưu trong Redis, key `chat:{session_id}:history`, dạng list JSON.
- **Sliding window**: giữ tối đa 10 lượt (20 tin nhắn) gần nhất — **không có tóm tắt (summarization)** khi vượt quá, chỉ cắt bớt tin cũ nhất.
- TTL 24 giờ, tự xoá.
- 2 tin gần nhất được đưa vào cả lệnh gọi NLU lẫn lệnh gọi sinh câu trả lời cuối (lấy 1 lần dùng chung, không gọi Redis 2 lần trong 1 request).

---

## 8. Guardrails thực tế

- **Off-topic**: chặn bằng nhãn intent `off_topic` (LLM quyết định, không phải keyword-match embedding như thiết kế cũ nói).
- **Ngưỡng tin cậy chính sách**: xem mục 4 (0.82 / 0.80, không phải 0.75/0.65 như thiết kế cũ).
- **Chống bịa**: system prompt (`data/system-prompt.md`) yêu cầu chỉ trả lời dựa trên context, nói rõ "chưa có thông tin" nếu không có — không có bước "cross-check số liệu" tự động nào khác.
- **Escalate cảm xúc tiêu cực**: hiện chỉ `logger.warning` khi sentiment_score > 0.80, **chưa** thực sự gửi thông báo Slack/Zalo nào (khác thiết kế cũ nói "Webhook Alert"). Cũng chưa có cơ chế đếm "2 lần tiêu cực liên tiếp" — mỗi lần vượt ngưỡng là 1 lần log độc lập.
- **`intent: "escalate"`**: chỉ gắn khi intent là `complaint`, để FE bật flow chuyển nhân viên có sẵn.

---
