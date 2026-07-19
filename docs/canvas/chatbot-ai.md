# Chatbot AI — Hệ Thống Tư Vấn Sản Phẩm Thông Minh

> Tài liệu kỹ thuật chi tiết về kiến trúc RAG, phân loại ý định (Intent Classification), phân tích cảm xúc (Sentiment Analysis), tích hợp mô hình ngôn ngữ lớn (LLM) và điều phối chuyển tiếp (Escalation).

---

## 📌 Tổng Quan Hệ Thống

| Chỉ số | Thông số cấu hình |
| :--- | :--- |
| **Kiến trúc chính** | Retrieval-Augmented Generation (RAG) |
| **Số lượng nhãn Intent** | 6 nhóm (phân loại bằng PhoBERT Classifier hoặc LLM) |
| **Mô hình Sentiment** | PhoBERT-sentiment (ONNX Optimized) |
| **LLM Provider** | Google Gemini (Gemini 1.5 Flash) |
| **Giao thức truyền tải** | Server-Sent Events (SSE) Streaming |

---

## 1. Kiến Trúc RAG (Retrieval-Augmented Generation)

Kiến trúc RAG cho phép LLM không trả lời từ bộ nhớ tĩnh mà chủ động tìm kiếm các thông tin liên quan từ Knowledge Base (cơ sở tri thức) của cửa hàng trước khi sinh câu trả lời. Điều này đảm bảo tính chính xác và khả năng cập nhật của thông tin sản phẩm.

### Đối so sánh giữa Fine-tuning và RAG

| Đặc tính | Fine-tuning LLM trực tiếp | Kiến trúc RAG (Khuyên dùng) |
| :--- | :--- | :--- |
| **Yêu cầu dữ liệu** | Cần hàng nghìn ví dụ Q&A chất lượng cao. | Chỉ cần tài liệu mô tả sản phẩm/FAQ dạng văn bản thô. |
| **Chi phí huấn luyện** | Rất tốn tài nguyên GPU và thời gian huấn luyện. | Không cần huấn luyện lại LLM, chi phí cực thấp hoặc miễn phí. |
| **Khả năng cập nhật** | Khi danh mục sản phẩm thay đổi → Bắt buộc phải huấn luyện lại. | Chỉ cần cập nhật Vector Database (khoảng vài giây). |
| **Độ chính xác** | Dễ gặp hiện tượng ảo tưởng (hallucination) về giá/tồn kho. | Trả lời dựa trên dữ liệu thực tế, có thể trích dẫn nguồn cụ thể. |

### Pipeline RAG đầy đủ
1. **Pre-processing (Tiền xử lý):** Phân loại câu hỏi của người dùng vào 1 trong 6 intent chính thông qua *Intent Classifier*.
2. **Retrieval (Truy xuất):**
   * Nếu là văn bản: Truy vấn hybrid (e5-large + BM25) để tìm Top-5 đoạn mô tả liên quan từ Knowledge Base.
   * Nếu có ảnh đính kèm: Chạy *Visual Search* để tìm Top-5 sản phẩm tương đồng.
3. **Context Build (Xây dựng ngữ cảnh):** Gộp nội dung truy xuất được + lịch sử hội thoại gần nhất (tối đa 10 lượt) + thông tin khách hàng để thiết lập Prompt.
4. **Generation (Sinh câu trả lời):** Gọi API mô hình ngôn ngữ lớn (Gemini 1.5 Flash hoặc GPT-4o-mini) để sinh câu trả lời tự nhiên dưới dạng stream.
5. **Post-processing & Escalation (Hậu xử lý & Chuyển tiếp):** Phân tích sắc thái cảm xúc tin nhắn người dùng qua *Sentiment Analyzer*. Nếu chỉ số tiêu cực (negative score) vượt ngưỡng `0.75` liên tiếp, hệ thống sẽ cảnh báo admin và đề xuất kết nối nhân viên thật.

### Request Flow Chi Tiết
```
[User Message] ──► [Redis: Load Chat History & Postgres: User Profile]
                      │
                      ▼
             [Intent Classifier] ──► (Phân loại vào 6 nhãn)
                      │
                      ▼
             [RAG Retrieval Engine] ──► (asyncio.gather: Text + Visual Search)
                      │
                      ▼
             [Prompt Assembly] ──► (System prompt + Context + History)
                      │
                      ▼
             [LLM API Call] ──► (Stream response về Frontend qua SSE)
                      │
                      ▼
             [Sentiment Analyzer] ──► (Negative > 0.75? ──► Webhook Alert Support Agent)
```

---

## 2. Knowledge Base & Vector Store

Knowledge Base (KB) là toàn bộ cơ sở dữ liệu tri thức mà chatbot được phép tiếp cận để phục vụ khách hàng.

### Các nguồn dữ liệu trong Knowledge Base

| Nguồn dữ liệu | Nội dung chi tiết | Định dạng | Tần suất cập nhật |
| :--- | :--- | :--- | :--- |
| **Product Catalog** | Tên sản phẩm, mô tả chi tiết, giá bán, màu sắc, kích cỡ, chất liệu, số lượng tồn kho. | JSON từ DB | Cập nhật real-time khi có thay đổi sản phẩm |
| **FAQ & Chính sách** | Quy trình đổi trả hàng, chính sách vận chuyển, bảo hành, các hình thức thanh toán, chương trình khuyến mãi. | Markdown/JSON | Cập nhật khi có thay đổi chính sách lớn |
| **Mẫu đơn hàng** | Trạng thái xử lý đơn hàng, thời gian giao hàng dự kiến của từng đối tác vận chuyển. | JSON | Khi liên kết thêm đối tác vận chuyển mới |
| **Cẩm nang chọn lựa** | Hướng dẫn chọn size quần áo/giày dép, mẹo sử dụng và bảo quản sản phẩm. | Markdown | Cập nhật định kỳ theo mùa |

### Chiến lược Chunking (Chia nhỏ tài liệu)
Để embedding có thể biểu diễn chính xác thông tin chi tiết và không làm vượt quá giới hạn ngữ cảnh (Context Window) của LLM:
* **Mô tả sản phẩm:** Khuyến nghị độ dài **300–500 tokens / chunk** (Overlap: 50 tokens). Mỗi sản phẩm nên nằm gọn trong 1 chunk chính kèm theo metadata như `item_id`, `category`, `price_range` để lọc (filtering) trước khi tìm kiếm.
* **FAQ:** Khuyến nghị **200–300 tokens / chunk** (Overlap: 30 tokens).
* **Chính sách dài:** Khuyến nghị **400–600 tokens / chunk** (Overlap: 80 tokens).

### Lựa chọn cơ sở dữ liệu Vector (Vector Store)
* **FAISS (Khuyên dùng cho đồ án):** Lưu trữ dạng file cục bộ kết hợp ánh xạ JSON. Ưu điểm là rất nhẹ, tốc độ truy vấn cực nhanh và không cần cài đặt thêm dịch vụ chạy ngầm.
* **Qdrant:** Thích hợp khi cần lọc metadata phức tạp trên quy mô lớn. Yêu cầu chạy dịch vụ Docker riêng biệt.
* **ChromaDB:** Tích hợp tốt với LangChain, hỗ trợ lưu trữ bền vững tự động nhưng hiệu năng giảm khi lượng dữ liệu cực lớn.

---

## 3. Intent Classification (Phân loại ý định)

### 6 nhóm Intent chính và hướng xử lý

| Intent | Ví dụ câu hỏi | Hướng xử lý của hệ thống | Cần RAG? |
| :--- | :--- | :--- | :---: |
| **product_search** | *"Tìm cho tôi áo khoác gió"* hoặc *"Có giày size 40 không?"* | Gọi Text Search + Visual Search → RAG → LLM | **Có (Full RAG)** |
| **price_inquiry** | *"Cái này giá bao nhiêu?"* hoặc *"Có giảm giá không?"* | Truy vấn trực tiếp bảng giá trong DB + RAG | **Có (DB Query)** |
| **order_tracking** | *"Đơn hàng #1234 của tôi khi nào giao?"* | Query bảng đơn hàng bằng `user_id` → Trả về template | **Không** |
| **policy_faq** | *"Chính sách đổi trả hàng lỗi thế nào?"* | Truy xuất từ FAQ Knowledge Base → LLM sinh câu trả lời | **Có (FAQ KB)** |
| **complaint** | *"Hàng giao bị nứt vỡ rồi"* hoặc *"Ship quá chậm"* | Ghi nhận lỗi hệ thống → Phản hồi xin lỗi theo mẫu + Chuyển ngay cho nhân viên | **Không (Chuyển tiếp ngay)** |
| **general_chat** | *"Chào bạn"* hoặc *"Bạn là ai?"* | LLM phản hồi trực tiếp lời chào xã giao | **Không** |

### Phương pháp triển khai bộ phân loại Intent

* **Cách 1: Fine-tune PhoBERT Classifier (Khuyến nghị):**
  * Tinh chỉnh mô hình phân loại với classification head đầu ra gồm 6 nhãn trên tập dữ liệu từ **1.500 – 3.000 câu ví dụ** (khoảng 300 - 500 câu cho mỗi intent).
  * **Tham số cấu hình huấn luyện:** Model `vinai/phobert-base`, epochs: `5–10`, learning rate: `2e-5`, batch size: `16`, max length: `128 tokens`.
  * **Ưu điểm:** Tốc độ suy luận cực kỳ nhanh (`< 10ms`), chạy hoàn toàn offline độc lập, độ chính xác cao.
* **Cách 2: LLM Zero-shot Classification:**
  * Sử dụng Prompt hướng dẫn LLM trả về đúng tên intent từ danh sách có sẵn.
  * **Ưu điểm:** Triển khai ngay lập tức không cần tập dữ liệu huấn luyện.
  * **Nhược điểm:** Tốn tài nguyên API, làm tăng thời gian phản hồi thêm khoảng `50ms - 100ms` cho mỗi lượt chat.

---

## 4. Sentiment Analysis (Phân tích cảm xúc)

Hệ thống phân tích sắc thái cảm xúc tin nhắn đầu vào của khách hàng để đo lường mức độ hài lòng và kịp thời can thiệp khi có xung đột.

### So sánh các mô hình tiếng Việt

| Model | Bộ dữ liệu Pretrained | F1-macro | Latency | Dung lượng | Đánh giá / Khuyến nghị |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **PhoBERT-sentiment** | 20GB văn bản tiếng Việt | **0.88 - 0.93** | **~25ms** | 135MB | **Tốt nhất cho tiếng Việt** 🥇 |
| **ViSoBERT** | Dữ liệu mạng xã hội Việt Nam | 0.86 - 0.91 | ~25ms | 130MB | Hiểu tốt các từ viết tắt, tiếng lóng, icon |
| **XLM-RoBERTa-large** | Dữ liệu đa ngôn ngữ | 0.84 - 0.90 | ~60ms | 1.1GB | Dung lượng rất nặng, suy luận chậm |

### Quy trình huấn luyện & Tối ưu hóa PhoBERT-sentiment
1. **Chuẩn bị dữ liệu:** Sử dụng tập dữ liệu **UIT-VSFC** (16.175 mẫu) và **VLSP 2016 SA** (khoảng 5.000 mẫu review công nghệ/thương mại điện tử). Gán nhãn thành 3 lớp: `0: negative`, `1: neutral`, `2: positive`.
2. **Cấu hình Trainer:** epochs: `5`, batch size: `16`, learning rate: `2e-5`, warmup ratio: `0.1`, metric lựa chọn model tốt nhất: `f1_macro`.
3. **Tối ưu hóa tốc độ (Inference Optimization):** Xuất mô hình sang định dạng **ONNX** để chạy trên thư viện `onnxruntime`. Thời gian xử lý giảm mạnh từ **~25ms xuống còn ~8ms** trên mỗi tin nhắn.

### Quy tắc chuyển tiếp hỗ trợ (Escalation Logic)

| Điều kiện kích hoạt | Hành động của hệ thống | Dữ liệu gửi kèm |
| :--- | :--- | :--- |
| **Điểm Negative > 0.75 (1 lần)** | Gắn nhãn cảnh báo (warning) nội bộ để theo dõi. | — |
| **Điểm Negative > 0.75 (2 lần liên tiếp)** | Gửi thông báo đề xuất chuyển sang chat với nhân viên thật. | Session ID, thông tin khách hàng |
| **Intent phân loại là `complaint`** | Tự động chuyển tiếp lập tức không cần xét điểm cảm xúc. | Lịch sử mua hàng, chi tiết đơn hàng lỗi |
| **User nhấn nút "Gặp nhân viên"** | Chuyển tiếp lập tức. | Toàn bộ lịch sử cuộc trò chuyện |
| **Chatbot báo "Tôi chưa rõ" 3 lần liên tiếp** | Tự động chuyển tiếp. | Danh sách các câu hỏi chưa được giải đáp |

---

## 5. Tích Hợp Mô Hình Ngôn Ngữ Lớn (LLM) & Vận Hành

### So sánh các mô hình sinh phản hồi (Generation)

| Mô hình | Nhà cung cấp | Giới hạn gói miễn phí | Độ tương thích tiếng Việt | Cửa sổ ngữ cảnh | Đánh giá chung |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **gemini-1.5-flash** | Google | **15 RPM, 1 triệu tokens/ngày** | Rất tốt | 1.000.000 tokens | **Lựa chọn tối ưu cho đồ án** 🥇 |
| **llama-3.1-70b** | Groq | Có gói miễn phí giới hạn | Tốt | 128.000 tokens | Tốc độ sinh chữ cực nhanh |
| **gpt-4o-mini** | OpenAI | Chỉ có $5 tín dụng trải nghiệm ban đầu | Rất tốt | 128.000 tokens | Chất lượng xuất sắc nhưng tốn phí |

### Quản lý bộ nhớ hội thoại (Memory Management)
Để tránh hiện tượng tràn cửa sổ ngữ cảnh (Context Window) và tiết kiệm chi phí gọi API khi cuộc trò chuyện kéo dài:
* **Cơ chế Sliding Window:** Chỉ gửi kèm tối đa **10 lượt chat gần nhất** trong Prompt.
* **Tóm tắt hội thoại (Summarization):** Khi số lượng lượt chat vượt quá 10, hệ thống sử dụng một tiến trình chạy ngầm gọi LLM để tóm tắt ngắn gọn toàn bộ nội dung thảo luận trước đó thành một đoạn văn 3-4 câu, sau đó inject đoạn tóm tắt này vào đầu System Prompt.
* **Lưu trữ Redis:** Lịch sử chat được lưu trong Redis dưới dạng list với key `chat:{session_id}:history`. Sử dụng lệnh `LTRIM` để giới hạn độ dài danh sách. Thiết lập thời gian sống (TTL) là **24 giờ**.

### Giao thức truyền tải thời gian thực (Streaming với SSE)
Sử dụng giao thức **Server-Sent Events (SSE)** thông qua FastAPI `StreamingResponse` để truyền tải câu trả lời từ LLM về frontend dưới dạng từng từ xuất hiện dần (giống ChatGPT), thay vì bắt người dùng phải đợi mô hình hoàn thành toàn bộ câu phản hồi dài.

> [!TIP]
> **Tính năng chủ động gợi ý (Proactive Recommendation):** Nếu khách hàng di chuyển giữa các trang sản phẩm hoặc ở lại một trang quá 3 phút mà không thực hiện hành động thêm vào giỏ hàng, frontend sẽ tự động kích hoạt chatbot mở lời chào hỏi: *"Tôi thấy bạn đang quan tâm sản phẩm này, tôi có thể hỗ trợ chọn size hoặc màu sắc cho bạn không?"*. Việc này giúp tăng tỷ lệ chuyển đổi (Conversion Rate) thực tế của cửa hàng.
