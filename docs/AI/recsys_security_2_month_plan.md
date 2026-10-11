# Kế hoạch Nghiên cứu & Thực thi (2 Tháng)
*Phân công: Hành vi (Behavior Tracking), AI Recommendation (SASRec) & Security (Mini SIEM/SOAR).*
*Thời gian: 09/10/2025 - 08/12/2025*
# Kế hoạch Nghiên cứu & Thực thi 3 Thành viên (2 Tháng)

| Ngày (Dự kiến) | Nội dung công việc (Copy vào Google Sheets) | Ghi chú / Mục tiêu đầu ra (Deliverables) |
| :--- | :--- | :--- |
| **GIAI ĐOẠN 1** | **XÂY DỰNG HỆ THỐNG THEO DÕI HÀNH VI (BEHAVIOR TRACKING)** | *Mục tiêu: Thu thập Micro-behaviors làm mỏ vàng Data.* |
| 09/10 - 11/10 | Thiết kế lược đồ Data (Schema) cho User Event. | Định nghĩa cấu trúc log: view, add_to_cart, remove_from_cart, purchase. |
| 12/10 - 14/10 | Code Producer/Consumer Kafka thu thập Clickstream. | Hứng event thời gian thực từ API Gateway/Frontend đẩy vào Kafka Topic. |
| 15/10 - 17/10 | Setup Centralized Database (ELK hoặc MongoDB) lưu trữ Log. | Đảm bảo Log hành vi và Security Log được gom về một chỗ (Centralized Logging). |
| **GIAI ĐOẠN 2** | **XÂY DỰNG MINI SIEM/SOAR (BẢO VỆ DỮ LIỆU & HỆ THỐNG)** | *Mục tiêu: Lọc sạch Data rác và tự động phòng thủ.* |
| 18/10 - 20/10 | Viết Rules SIEM phát hiện Bot Clickstream & Brute-force. | Bắt dính các hành vi bất thường (VD: Spam 50 clicks/giây, Scan API liên tục). |
| 21/10 - 23/10 | Xây dựng luồng SOAR tự động phản ứng (Automated Response). | Code cơ chế chọc vào API Gateway để tự động Block IP của kẻ tấn công/Bot. |
| 24/10 - 26/10 | Dựng Dashboard Giám sát & Làm sạch (Cleanse) Dữ liệu. | Gắn cờ (flag) các event từ Bot để loại bỏ, đảm bảo Data hành vi sạch 100% cho AI. |
| **GIAI ĐOẠN 3** | **AI RECOMMENDATION PIPELINE (SASREC)** | *Mục tiêu: Mô hình hóa Dữ liệu Hành vi thành Gợi ý.* |
| 27/10 - 29/10 | Tiền xử lý dữ liệu hành vi (Preprocessing) cho PyTorch. | Padding, Truncation, Tokenization biến chuỗi clickstream thành tensor matrix. |
| 30/10 - 01/11 | Code & Train mô hình SASRec (Sampled Softmax). | Chạy train, tối ưu Loss function, đảm bảo không tràn RAM (CPU training). |
| 02/11 - 04/11 | Đánh giá AI Offline (Tính toán NDCG@10, Hit Rate, Coverage). | Chứng minh AI đánh bại thuật toán "Gợi ý đồ vừa xem" (Recency baseline). |
| 05/11 - 07/11 | Dựng Model Serving qua FastAPI. | Dựng API `/predict` nhận `user_id`, trả về list 10 `item_id` (Latency < 200ms). |
| **GIAI ĐOẠN 4** | **TÍCH HỢP HỆ THỐNG & TỐI ƯU MLOps** | *Mục tiêu: Đưa 3 mảnh ghép lên Production.* |
| 08/11 - 10/11 | Spring Boot gọi AI API & Caching bằng Redis. | BE Java gọi FastAPI, map kết quả ra sản phẩm thật. Cache kết quả 15p giảm tải. |
| 11/11 - 13/11 | Dựng Fallbacks Mechanism (Popularity/Recency). | Cơ chế dự phòng: Tự động trả về Hàng bán chạy nếu AI lỗi hoặc timeout. |
| 14/11 - 16/11 | Kiểm thử E2E: Kịch bản Bot cào data vs Hệ thống AI. | Giả lập Bot spam -> SIEM cảnh báo -> SOAR chặn IP -> AI không bị nhiễu model. |
| **GIAI ĐOẠN 5** | **VIẾT BÁO CÁO & CHUẨN BỊ BẢO VỆ** | *Mục tiêu: Đóng gói tài liệu học thuật.* |
| 17/11 - 20/11 | Viết Báo cáo: Kiến trúc Behavior Tracking & Mini SIEM/SOAR. | Vẽ sơ đồ luồng Kafka. Trình bày rules phát hiện Bot & cơ chế tự Block IP. |
| 21/11 - 24/11 | Viết Báo cáo: Kiến trúc SASRec, Toán học & Tối ưu. | Bê nguyên các luận điểm học thuật (Self-Attention, Masking) vào báo cáo. |
| 25/11 - 28/11 | Viết Báo cáo: Đánh giá Hệ thống MLOps. | Giải thích NDCG, Coverage, vai trò của Redis Cache và Fallback. |
| 29/11 - 02/12 | Tích hợp BE/FE toàn bộ team, Cross-check fix bugs. | Test chéo để đảm bảo Flow mua hàng từ FE sinh ra đúng event đẩy vào Kafka. |
| 03/12 - 08/12 | Mock-Defense, làm Slide & Luyện tập cãi hội đồng. | Xoáy vào liên kết: SIEM diệt Bot -> Data Hành vi Sạch -> AI SASRec chính xác. |
*Thời gian: 09/10/2025 → 08/12/2025 | Block: 2-3 ngày/task*

> **Phân công:**
> - 👤 **Người 1 (P1):** Recommendation (SASRec) + Behavior Tracking
> - 👤 **Người 2 (P2):** Churn Risk (Forecast) + Security (Mini SIEM/SOAR)
> - 👤 **Người 3 (P3):** AI Chatbot (RAG + Intent Classification + Sentiment)
> - 📝 **Cả 3:** Viết báo cáo + PTTK (Phân tích Thiết kế) **song song** từ đầu

---

## GIAI ĐOẠN 1: NGHIÊN CỨU + THIẾT KẾ (09/10 → 20/10)

| Ngày | P1 - Recommend + Behavior | P2 - Churn + SIEM/SOAR | P3 - Chatbot AI | Chung (Cả 3) |
|:---|:---|:---|:---|:---|
| 09/10 - 11/10 | Nghiên cứu SASRec paper (Self-Attention, Causal Masking). Đọc `production_reference` file 4, 5. | Nghiên cứu Churn Prediction (Isotonic Calibration, Expected Loss). Đọc file 6. | Nghiên cứu kiến trúc RAG (Retrieval-Augmented Generation), Intent Classification (PhoBERT). | **PTTK:** Vẽ Use Case Diagram tổng hệ thống. Xác định Actor & Boundary. |
| 12/10 - 14/10 | Thiết kế Schema `UserEvent` (view, cart, remove_cart, purchase, impression). Thiết kế Kafka Topic. | Thiết kế Feature Store cho Churn (RFM: Recency, Frequency, Monetary). Thiết kế Detection Rules cho SIEM. | Thiết kế Flow RAG: Query → Retrieve → Generate. Thiết kế Intent taxonomy (hỏi giá, tra cứu, khiếu nại...). | **PTTK:** Vẽ Class Diagram cho từng Microservice. |
| 15/10 - 17/10 | Thiết kế API Contract cho `recs-service` (`/recommend`). Thiết kế luồng Clickstream Kafka → DB. | Thiết kế API Contract cho `forecast-service` (`/rfm/trigger`, `/churn/score`). Thiết kế luồng Alert SIEM. | Thiết kế API Contract cho `chatbot-service` (`/chat` SSE, `/chat/sessions/history`). | **PTTK:** Vẽ Sequence Diagram cho các luồng chính (Mua hàng, Gợi ý, Chat, Churn Alert). |
| 18/10 - 20/10 | Thiết kế Evaluation Plan (NDCG, HR, Coverage, Recency baseline). | Thiết kế Dashboard SIEM & cơ chế SOAR (Auto-block IP). Thiết kế pipeline Churn scoring. | Thiết kế Redis Memory cho session chat. Chọn LLM (Gemini 1.5 Flash). | **PTTK:** Vẽ Deployment Diagram (Docker, Kafka, DB). Review chéo thiết kế của nhau. |

---

## GIAI ĐOẠN 2: XÂY DỰNG DATA PIPELINE + CỐT LÕI (21/10 → 07/11)

| Ngày | P1 - Recommend + Behavior | P2 - Churn + SIEM/SOAR | P3 - Chatbot AI | Chung (Cả 3) |
|:---|:---|:---|:---|:---|
| 21/10 - 23/10 | Code Kafka Producer/Consumer thu thập Clickstream từ API Gateway. | Setup Centralized Logging (ELK/Kafka). Gom Security log + Access log về 1 chỗ. | Code module Embedding (Chunk sản phẩm → Vector). Setup Vector Store. | **Báo cáo:** Viết Chương 1 - Giới thiệu đề tài, Mục tiêu, Phạm vi. |
| 24/10 - 26/10 | Code Preprocessing: Biến raw Clickstream → chuỗi item sequence (Padding, Truncation). | Code Detection Rules SIEM: Brute-force, Bot Clickstream (>50 click/s), API Scan. | Code Intent Classifier (PhoBERT fine-tune hoặc rule-based). Code Sentiment Analyzer. | **Báo cáo:** Viết Chương 2 - Cơ sở lý thuyết (mỗi người viết phần mình). |
| 27/10 - 29/10 | Code & Train SASRec model (PyTorch, Sampled Softmax, Causal Masking). | Code luồng SOAR: Khi Rule bị vi phạm → Tự động gọi API Gateway block IP. | Code RAG Pipeline: User query → Retrieve từ Vector Store → Prompt LLM (Gemini). | **Báo cáo:** Tiếp tục Chương 2. |
| 30/10 - 01/11 | Tiếp tục Train SASRec. Tối ưu hyperparameters (d_model, n_heads, lr). | Code Churn Scoring Pipeline: Trích xuất RFM features → Logistic Regression → Isotonic Calibration. | Code Streaming SSE response. Code Redis session memory (lưu lịch sử chat). | **Báo cáo:** Viết Chương 3 - Phân tích & Thiết kế (đưa các diagram PTTK vào). |
| 02/11 - 04/11 | Đánh giá Offline: Tính NDCG@10, Hit Rate@10, Coverage. So sánh vs Recency baseline. | Đánh giá Churn: Tính Brier Score, ECE (trước/sau Isotonic). Tính Expected Loss = P(churn) × Monetary. | Test Chatbot end-to-end: Hỏi giá, hỏi tồn kho, hỏi chính sách. Đo chất lượng trả lời. | **Báo cáo:** Tiếp tục Chương 3. |
| 05/11 - 07/11 | Dựng FastAPI Model Serving (`/recommend`). Đảm bảo latency < 200ms. | Dựng FastAPI Serving (`/churn/score`, `/rfm/trigger`). Dựng Dashboard SIEM (Kibana/Grafana). | Dựng FastAPI Serving (`/chat` SSE, `/chat/sessions/history`). | **Báo cáo:** Viết Chương 4 - Triển khai & Cài đặt (mỗi người viết phần code mình). |

---

## GIAI ĐOẠN 3: TÍCH HỢP HỆ THỐNG + TỐI ƯU (08/11 → 19/11)

| Ngày | P1 - Recommend + Behavior | P2 - Churn + SIEM/SOAR | P3 - Chatbot AI | Chung (Cả 3) |
|:---|:---|:---|:---|:---|
| 08/11 - 10/11 | Tích hợp Spring Boot Java gọi Python FastAPI (Recs). Map item_id → Product chi tiết. | Tích hợp Churn Score → Kafka → Camunda Workflow (gửi voucher tự động). | Tích hợp Chatbot API với Frontend (React). Xử lý UI streaming chat. | **Báo cáo:** Tiếp tục Chương 4. |
| 11/11 - 13/11 | Dựng Fallback Mechanism: AI sập → trả về Popularity/Recency. Xử lý Anonymous Users (ItemKNN). | Tích hợp SIEM cảnh báo → SOAR Block IP. Gắn cờ (flag) Bot event để P1 loại khỏi training data. | Xử lý edge cases: Câu hỏi ngoài phạm vi, Prompt injection, Rate limiting chat. | **Báo cáo:** Viết Chương 5 - Đánh giá & Kết quả (mỗi người viết metric của mình). |
| 14/11 - 16/11 | Cache kết quả Recommend bằng Redis (TTL 15 phút). Tối ưu không gọi AI mỗi lần reload. | Kiểm thử kịch bản tấn công: Giả lập Bot spam click → SIEM detect → SOAR block → AI data sạch. | Tối ưu latency chat (streaming chunk size). Cache frequent queries. | **Báo cáo:** Tiếp tục Chương 5. |
| 17/11 - 19/11 | Test E2E luồng: User click → Kafka event → AI gợi ý → FE hiển thị. | Test E2E luồng: User hành vi → RFM score → Churn alert → Camunda gửi voucher. | Test E2E luồng: User hỏi → Intent classify → RAG retrieve → LLM stream trả lời. | **Chung:** Cross-test chéo giữa 3 người. Fix bugs tích hợp. |

---

## GIAI ĐOẠN 4: HOÀN THIỆN BÁO CÁO + DEMO + BẢO VỆ (20/11 → 08/12)

| Ngày | P1 - Recommend + Behavior | P2 - Churn + SIEM/SOAR | P3 - Chatbot AI | Chung (Cả 3) |
|:---|:---|:---|:---|:---|
| 20/11 - 22/11 | Viết báo cáo phần Behavior Tracking (Luồng Kafka, Schema, Micro-behaviors). | Viết báo cáo phần SIEM/SOAR (Detection Rules, Dashboard, Auto-response). | Viết báo cáo phần Chatbot (RAG Architecture, Intent Classification, Streaming). | **Chung:** Review chéo bài viết của nhau. Thống nhất format. |
| 23/11 - 25/11 | Viết báo cáo phần SASRec (Toán học: Self-Attention, Sampled Softmax, Causal Masking). | Viết báo cáo phần Churn (Isotonic Regression, Expected Loss, Camunda integration). | Viết báo cáo phần Sentiment Analysis + Redis Memory Management. | **Chung:** Viết phần Kiến trúc Tổng thể (Architecture Overview) chung cả nhóm. |
| 26/11 - 28/11 | Viết báo cáo phần Đánh giá RecSys (NDCG, HR, Coverage, Popularity Bias). | Viết báo cáo phần Đánh giá Churn (Brier Score, ECE, ROI Marketing). | Viết báo cáo phần Đánh giá Chatbot (Response quality, Latency, User satisfaction). | **Chung:** Viết Kết luận + Hướng phát triển. Hoàn thiện Mục lục, Tài liệu tham khảo. |
| 29/11 - 01/12 | Fix bugs cuối cùng. Chuẩn bị demo kịch bản: "User browse → AI recommend". | Fix bugs cuối cùng. Chuẩn bị demo kịch bản: "Bot tấn công → SIEM chặn" + "Churn alert". | Fix bugs cuối cùng. Chuẩn bị demo kịch bản: "User hỏi chatbot → AI trả lời streaming". | **Chung:** Chạy thử TOÀN BỘ hệ thống (Docker Compose). Quay video backup demo. |
| 02/12 - 04/12 | Làm Slide bảo vệ phần Recommend + Behavior (5-7 slides). | Làm Slide bảo vệ phần Churn + SIEM/SOAR (5-7 slides). | Làm Slide bảo vệ phần Chatbot AI (5-7 slides). | **Chung:** Ghép slide. Làm slide Tổng quan Kiến trúc + Slide Q&A. |
| 05/12 - 08/12 | Mock-Defense: Tập trả lời "Tại sao SASRec? Tại sao Sampled Softmax? Coverage nghĩa là gì?" | Mock-Defense: Tập trả lời "False Positive SOAR? Isotonic vs Platt? Expected Loss tính sao?" | Mock-Defense: Tập trả lời "RAG vs Fine-tuning? Hallucination? PhoBERT vs Rule-based?" | **Chung:** Tổng duyệt Demo + Slide. Luyện trình bày 15-20 phút. Phân vai trả lời Q&A. |
