# TEST CASE — AI ENGINE SERVICE (search / chatbot / recs / forecast)

> **Trạng thái (cập nhật 2026-10-11):** Các service AI (`AI/search-service`, `AI/chatbot-service`, `AI/recs-service`, `AI/forecast-service`) **đã nối dữ liệu/model thật cho phần lớn chức năng** — search trả kết quả thật từ FAISS + Elasticsearch, chatbot gọi DeepSeek thật. Phần **còn là dữ liệu minh họa (demo)** chỉ gồm **demand forecasting** và **anomaly detection** của forecast-service. File này **chưa có test case chi tiết** theo format `UT-AI-<SERVICE>-xxx` / `IT-AI-<SERVICE>-xxx` — sẽ bổ sung sau.

## 🐞 Bug đã phát hiện và sửa ngay (không thuộc phạm vi test)

`AI/forecast-service/app/services/rfm.py` dùng type hint `Dict[str, Any]` nhưng thiếu `from typing import Dict, Any` → **crash ngay lúc khởi động** (`NameError`), làm sập toàn bộ `forecast-service` (mọi endpoint `/forecast`, `/anomaly`, `/rfm/trigger`, `/pricing/predict` đều không dùng được, không chỉ RFM). **Đã sửa** — thêm dòng import thiếu.

## Ghi chú nhanh mức độ hoàn thiện thật (để tham khảo khi viết test)

| Service | Trạng thái |
|---|---|
| `search-service` (:8001) | Kết quả **thật**: tìm văn bản hybrid = BM25 trên Elasticsearch index `products` + dense (multilingual-e5-large trên FAISS), hợp nhất bằng RRF; tìm ảnh bằng CLIP trên FAISS. Trả sản phẩm có thật trong catalog |
| `chatbot-service` (:8002) | Gọi **DeepSeek thật**: NLU (intent + sentiment + order_id) bằng một lời gọi LLM ở chế độ JSON (`response_format = json_object`), chỉ rơi về heuristic từ khóa khi không cấu hình LLM hoặc lời gọi lỗi; RAG sản phẩm/chính sách; intent `complaint` trả `escalate` để chuyển nhân viên |
| `recs-service` (:8003) | Trả sản phẩm có thật từ catalog. SASRec chỉ chạy khi nạp được file trọng số đã huấn luyện (`MODEL_WEIGHTS_PATH`, mặc định `data/models/sasrec.pt`); nếu không, rơi về Recency/Popularity. `cross-sell` chưa có bước tính đồng mua nên hiện trả Popularity |
| `forecast-service` (:8004) | Churn-risk/segmentation dùng model thật (`/admin/analytics/segmentation`, risk-scan phát `ChurnRiskDetectedEvent` lên `user-risk-events`). **Demand forecasting** (`/forecast`, `/admin/analytics/demand-forecasting`) và **anomaly detection** (`/admin/analytics/anomalies`) vẫn là **dữ liệu minh họa** — response mang cờ `is_demo_data: true` kèm `note` |

Khi viết test case chi tiết, theo đúng format các service khác (`UT-AI-<SERVICE>-xxx` / `IT-AI-<SERVICE>-xxx`); với 2 endpoint demo của forecast-service, test nên kiểm tra cờ `is_demo_data` thay vì giá trị số.
