# TEST CASE — AI ENGINE SERVICE (search / chatbot / recs / forecast)

> **Trạng thái:** Các service AI (`AI/search-service`, `AI/chatbot-service`, `AI/recs-service`, `AI/forecast-service`) hiện **chưa triển khai đầy đủ** — phần lớn endpoint đang trả dữ liệu mock/hard-code, chưa nối vào Elasticsearch/model thật. Vì vậy **chưa viết test case chi tiết** cho phần này — sẽ bổ sung khi các service được hoàn thiện thật.

## 🐞 Bug đã phát hiện và sửa ngay (không thuộc phạm vi test)

`AI/forecast-service/app/services/rfm.py` dùng type hint `Dict[str, Any]` nhưng thiếu `from typing import Dict, Any` → **crash ngay lúc khởi động** (`NameError`), làm sập toàn bộ `forecast-service` (mọi endpoint `/forecast`, `/anomaly`, `/rfm/trigger`, `/pricing/predict` đều không dùng được, không chỉ RFM). **Đã sửa** — thêm dòng import thiếu.

## Ghi chú nhanh mức độ hoàn thiện thật (để tham khảo khi triển khai tiếp)

| Service | Trạng thái |
|---|---|
| `search-service` | Embedding thật (SentenceTransformer/CLIP) + thuật toán fusion thật, nhưng nguồn dữ liệu để search vẫn là mock, chưa nối Elasticsearch thật |
| `chatbot-service` | Luồng RAG (Redis history, gọi search-service, build prompt, SSE) đã nối thật, nhưng phân loại intent/sentiment chỉ là keyword heuristic, chưa load model PhoBERT |
| `recs-service` | Logic cold-start (SASRec vs popularity) có thật và nối Redis, nhưng "SASRec" chạy trọng số random nếu chưa có file model huấn luyện; phần cross-sell/popularity còn là mock |
| `forecast-service` | Anomaly detection (Isolation Forest) và pricing rule-based là logic thật; demand forecasting vẫn là mock (sine + noise), không dựa dữ liệu bán hàng thật |

Khi bắt đầu triển khai thật cho từng phần trên, quay lại yêu cầu viết test case chi tiết theo đúng format các service khác (`UT-AI-<SERVICE>-xxx` / `IT-AI-<SERVICE>-xxx`).
