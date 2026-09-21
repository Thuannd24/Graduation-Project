# Báo cáo Review — Chatbot Service

> Ngày review: 2026-08-06
> Phạm vi: toàn bộ `AI/chatbot-service/` — kiến trúc, luồng xử lý, nơi lưu dữ liệu, chất lượng code.
> Đã test thật với BE đang chạy (order/user/promotion-service) và Gemini API thật, không phải chỉ đọc code.

---

## 1. Nơi lưu dữ liệu — trả lời trực tiếp: FAISS hay MongoDB?

**Không dùng MongoDB.** `shared_common` có sẵn `get_mongo_client()` nhưng chatbot-service không gọi tới nó ở đâu cả (đã `grep` toàn bộ code để xác nhận). Mongo chỉ được các service AI khác dùng (ví dụ search-service cho catalog sản phẩm).

Chatbot-service dùng **2 nơi lưu trữ**, mỗi nơi cho một loại dữ liệu khác nhau:

| Dữ liệu | Lưu ở đâu | Tồn tại bao lâu | File liên quan |
|---|---|---|---|
| Lịch sử hội thoại (10 lượt gần nhất) | **Redis**, key `chat:{session_id}:history`, dạng list JSON string | TTL 24 giờ, tự xoá | `app/services/memory.py` |
| Nội dung chính sách đã vector hoá (Policy RAG) | **File cục bộ**: FAISS index (`data/index/policy.index`) + metadata JSON (`data/index/policy_meta.json`) | Vĩnh viễn trên đĩa, build lại bằng `scripts/build_policy_index.py` khi sửa `data/policies/*.md` | `app/services/policy_rag.py` |
| Đơn hàng / điểm thưởng / voucher / bảo hành | **Không lưu ở chatbot-service** — gọi thẳng API thật của order/user/promotion-service (BE) mỗi lần hỏi, không cache | — | `app/services/tools.py` |

---

## 2. Kiến trúc & luồng xử lý 1 request chat

```
POST /api/v1/chat  {session_id, message, [user_id]}
Header: X-User-Id, X-User-Roles, Authorization  (do API Gateway verify JWT rồi inject/forward)
        │
        ▼
1. Intent Classifier (heuristic từ khóa)  →  1 trong 7 nhãn
        │
        ▼
2. Sentiment Analyzer (heuristic từ khóa) →  negative/neutral/positive
        │
        ▼
3. Lưu tin nhắn user vào Redis
        │
        ▼
4. Định tuyến theo intent:
   ├─ order_tracking / order_action  → gọi thẳng order/user/promotion-service (đọc, có JWT)
   │                                    → trả lời ngay, KHÔNG gọi LLM
   ├─ general_chat + off-topic       → trả câu từ chối cố định, KHÔNG gọi LLM
   ├─ policy_faq                     → FAISS retrieve → tính confidence
   │                                    → confidence THẤP: trả câu "chưa rõ" cố định, KHÔNG gọi LLM
   │                                    → confidence ĐỦ: đưa context vào prompt → gọi Gemini
   ├─ product_search / price_inquiry → gọi search-service lấy context → gọi Gemini
   └─ complaint / general_chat khác  → gọi Gemini (không có context bổ sung)
        │
        ▼
5. Lưu câu trả lời bot vào Redis
        │
        ▼
Response JSON: {message, intent, products}
```

Điểm quan trọng: **không phải mọi câu hỏi đều gọi LLM.** Các nhánh tra cứu đơn hàng/điểm/voucher/bảo hành và các nhánh "từ chối" (off-topic, confidence thấp) trả lời tức thì bằng code, không tốn chi phí gọi Gemini và không có rủi ro AI bịa thông tin nhạy cảm (tiền, đơn hàng).

---

## 3. Điểm mạnh

- **Guardrail thật, không phải hình thức**: câu hỏi ngoài phạm vi bị chặn bằng keyword-check trước khi tới LLM; câu hỏi chính sách không có context liên quan bị chặn bằng ngưỡng similarity (đã đo thực nghiệm, không chỉ copy số từ tài liệu thiết kế).
- **Không có tool nào có thể ghi/thay đổi dữ liệu** — cả 4 tool tra cứu đều là GET, huỷ đơn chỉ trả text hướng dẫn. Đúng yêu cầu bảo mật đặt ra từ đầu.
- **Bảo mật xác thực đúng chuẩn microservices thật**: đã phát hiện và sửa việc order/user/promotion-service tự verify JWT qua Keycloak (không chỉ tin header) — forward đúng `Authorization` gốc, không tự chế token giả.
- **Retrieval đã đo bằng số liệu thật**, không tin mù ngưỡng từ tài liệu thiết kế — phát hiện ngưỡng gốc (0.75/0.65) sai hoàn toàn với model đang dùng và tự hiệu chỉnh lại bằng dữ liệu thực tế.
- **Có graceful fallback**: nếu Gemini lỗi/hết quota, hệ thống không crash mà lùi về hiển thị đúng context vừa tra được (không phải câu trả lời bịa).
- **Cấu hình tách khỏi code**: mọi API key, URL service đều qua `.env`/biến môi trường, không có secret hay đường dẫn tuyệt đối hard-code trong code.

---

## 4. Đã tìm thấy và ĐÃ SỬA trong lần review này

| # | File | Mức độ | Vấn đề | Đã sửa thành |
|---|---|---|---|---|
| 1 | `app/services/memory.py` | **Cao** | `get_history()` cắt danh sách (`[:max_turns*2]`) SAU KHI đã reverse — nếu gọi với `max_turns` nhỏ hơn số lượng lưu trữ tối đa (20), sẽ trả về các tin nhắn CŨ NHẤT thay vì gần nhất. Chưa lộ ra vì hiện tại chỉ gọi với giá trị mặc định (10) đúng bằng giới hạn lưu trữ. | Cắt bằng `LRANGE` (giới hạn số lượng lấy từ Redis) trước khi reverse, không cắt sau. |
| 2 | `app/services/sentiment.py` | **Cao** | Từ khoá `"lỗi"` và `"hoàn tiền"` bị tính là tiêu cực, nhưng đây cũng là từ vựng cốt lõi của các câu hỏi chính sách hoàn toàn bình thường ("chính sách đổi trả hàng lỗi", "hoàn tiền thế nào") — gây sai sentiment liên tục cho câu hỏi phổ biến nhất của domain này. | Bỏ 2 từ overload này khỏi danh sách tiêu cực. |
| 3 | `app/services/rag.py` | **Cao** | Gọi Gemini qua SDK `google-generativeai` — SDK này **đã bị Google deprecated hoàn toàn**; model `gemini-1.5-flash` hard-code cũng đã bị ngừng hỗ trợ. | Viết lại gọi Gemini qua REST API thuần (`requests`, không cần SDK), model lấy từ config, dùng alias `gemini-flash-latest` để tự động theo model mới nhất, tránh bị gãy lần nữa khi Google đổi tên model. |
| 4 | `AI/*` (toàn bộ) | **Cao** | API key đang phải set qua export biến môi trường tạm (mất khi restart), không có nơi lưu chung. | Tạo `AI/.env` (gitignored) dùng chung cho mọi service AI + `AI/.env.example` làm template, nạp bằng `python-dotenv` trong `shared_common/config.py` và `chatbot-service/app/core/config.py`. |
| 5 | `app/main.py` | Trung bình | `allow_origins=["*"]` kết hợp `allow_credentials=True` — tổ hợp này **sai theo chuẩn CORS** (browser sẽ từ chối). | Đổi sang danh sách origin cụ thể, đọc từ `CORS_ALLOWED_ORIGINS` trong `.env`. |
| 6 | `app/main.py` | Thấp | Block `if __name__ == "__main__":` không bao giờ chạy được (file này luôn được import, không bao giờ chạy trực tiếp — entrypoint thật là `main.py` ở gốc project). | Xoá code chết. |
| 7 | `app/services/prompt.py` | Thấp | Method `format_llm_messages()` không còn được gọi ở bất kỳ đâu sau khi đổi cách gọi Gemini. | Xoá method + import không dùng. |
| 8 | `app/services/rag.py` | Thấp | Import `prompt_builder_service` nhưng không dùng trong file. | Xoá import thừa. |
| 9 | `app/services/policy_rag.py` | Thấp | Docstring của `classify_confidence()` ghi cứng số 0.75/0.65 — đã lệch với giá trị thật (0.82/0.80) sau khi hiệu chỉnh. | Sửa docstring, tham chiếu tới config thay vì ghi số cứng. |
| 10 | `app/services/tools.py` | Thấp | 2 định nghĩa top-level dính liền nhau, thiếu dòng trắng theo PEP8. | Thêm dòng trắng. |

Toàn bộ đã **build lại, restart service, gọi thử API thật** để xác nhận không có gì hỏng sau khi sửa (xem log/kết quả test cuối buổi làm việc).

---

## 5. Hạn chế còn tồn tại — chưa sửa trong lần này (cần biết trước)

Đây là những điểm **chưa đạt "chuẩn dự án lớn"** nhưng đòi hỏi công việc lớn hơn (huấn luyện model, chờ team khác), không phải sửa code nhanh được:

1. **Intent Classifier & Sentiment Analyzer đều là heuristic từ khoá, không phải model ML thật.** Tài liệu thiết kế (`docs/canvas/chatbot-ai.md`) yêu cầu fine-tune PhoBERT — hiện `self.model = None` ở cả 2 file, chỉ chạy if/else. Đủ dùng để demo nhưng dễ đoán sai câu diễn đạt lạ. Cần: tạo tập dữ liệu 1.500–3.000 câu gán nhãn rồi train (khuyến nghị dùng Google Colab, đã trao đổi trước đó).
2. **Thẻ sản phẩm thiếu ảnh/brand/category.** `search-service` (service AI khác, ngoài phạm vi review này) hiện chỉ trả `id/name/price/score`. Cần sửa ở `search-service`, không phải chatbot-service.
3. **Cơ chế "2 lần tiêu cực liên tiếp thì escalate"** trong tài liệu thiết kế chưa cài — hiện chỉ log warning khi negative > 0.80, chưa đếm số lần liên tiếp và chưa thực sự bắn thông báo Slack/Zalo (`ESCALATION_WEBHOOK_URL` có trong config nhưng chưa được gọi ở đâu).
4. **`/chat/sessions/escalate`** endpoint chỉ log rồi trả `SUCCESS`, không thực sự gọi bất kỳ hệ thống thông báo nào — là stub từ trước, chưa nối vào notification-service thật.
5. **RAGAS eval** (`scripts/run_ragas_eval.py`) cần cài thêm `ragas`/`datasets` (không nằm trong nhóm cài đặt tối thiểu) và có thể cần thêm cấu hình để dùng Gemini làm giám khảo thay vì OpenAI (mặc định của RAGAS).

---

## 6. Khuyến nghị tiếp theo (không bắt buộc, xếp theo độ ưu tiên)

1. Nếu muốn dùng đúng thiết kế ban đầu (PhoBERT thật) — đây là phần đáng đầu tư nhất cho báo cáo đồ án, nên làm trước khi bảo vệ.
2. Cài đặt cơ chế đếm sentiment tiêu cực liên tiếp trong Redis (giống cách lưu history) để hoàn thiện logic escalate đúng thiết kế.
3. Nối `/chat/sessions/escalate` với notification-service thật (BE) nếu muốn demo tính năng "chuyển nhân viên" hoạt động thật, không chỉ trả JSON giả.
