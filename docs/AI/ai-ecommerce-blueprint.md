# Blueprint AI — Bản Thiết Kế Kiến Trúc AI Hệ Thống Thương Mại Điện Tử

> **Chiến lược cốt lõi:** Train nhiều mô hình cạnh tranh → Đánh giá trên cùng tập dữ liệu → So sánh bằng các chỉ số đo lường (Metrics) → Lựa chọn mô hình tối ưu nhất để triển khai (Deploy).

---

## 📌 Tổng Quan Hệ Thống

Hệ thống đề xuất chia làm **5 module AI** chính với tổng cộng **13 mô hình** được đề xuất huấn luyện và đối sánh:

| Module | Các mô hình đề xuất huấn luyện | Metric so sánh chính | Mô hình khuyến nghị (mạnh nhất) |
| :--- | :--- | :--- | :--- |
| **Visual Search** | DINOv2, CLIP, EfficientNet-B3 | Recall@10, mAP | **CLIP** (nếu truy vấn đa phương thức text+image) |
| **Text Search** | PhoBERT, multilingual-e5-large, MiniLM-L12 | MRR@10, NDCG@10 | **multilingual-e5-large** |
| **Recommendation** | SASRec, GRU4Rec, BERT4Rec | HR@10, NDCG@10 | **SASRec** |
| **Demand Forecast** | Prophet, LightGBM, LSTM | MAE, RMSE, MAPE | **LightGBM** (dữ liệu dạng bảng/chuỗi thời gian) |
| **Anomaly Detection** | Isolation Forest, LSTM-AE, One-Class SVM | F1, Precision, Recall | **LSTM Autoencoder** |
| **Sentiment / NLP** | PhoBERT, ViSoBERT, XLM-RoBERTa | F1-macro, Accuracy | **PhoBERT-sentiment** |

> [!WARNING]
> **Lưu ý quan trọng:** Mô hình "mạnh nhất" ở trên là khuyến nghị dựa trên các benchmark tiêu chuẩn. Kết quả thực tế sẽ phụ thuộc vào tập dữ liệu đặc thù của dự án. Luôn thực hiện đánh giá độc lập trên tập *Validation Set* của riêng bạn trước khi đưa ra quyết định cuối cùng.

### Quy Trình So Sánh Mô Hình Đạt Chuẩn Đồ Án
1. **Bước 1 — Phân chia dữ liệu (Data Splitting):** Chia tập dữ liệu theo tỷ lệ **70% Train / 15% Validation / 15% Test**. Tuyệt đối giữ nguyên tập *Test Set* cô lập, chỉ dùng để đánh giá ở bước cuối cùng.
2. **Bước 2 — Huấn luyện song song (Parallel Training):** Huấn luyện từng mô hình trên cùng một tập *Train Set*, tinh chỉnh siêu tham số (Hyperparameter tuning) trên tập *Validation Set*. Khuyên dùng **MLflow** hoặc **TensorBoard** để theo dõi (track) các phiên thí nghiệm.
3. **Bước 3 — Đánh giá & Lựa chọn (Evaluation & Selection):** Chạy kiểm thử trên tập *Test Set* một lần duy nhất. Lựa chọn mô hình có metric cao nhất đồng thời đáp ứng được yêu cầu về thời gian phản hồi (Latency) trong môi trường thực tế.

---

## 1. Visual Search (Tìm kiếm bằng hình ảnh)

* **Mục tiêu:** Người dùng tải ảnh lên → Hệ thống tự động tìm các sản phẩm tương tự trong danh mục bán hàng.

### Đối sánh các mô hình

| Model | Kiến trúc | Ưu điểm | Hạn chế | Độ khó huấn luyện | Hiệu suất dự kiến (Recall@10) | Khuyến nghị |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **CLIP (OpenAI)** | Vision-Language | Mã hóa cả ảnh lẫn văn bản trong cùng một không gian vectơ. Hỗ trợ tìm kiếm đa phương thức (ví dụ: gõ "tìm áo này màu đỏ"). Pretrained rất mạnh. | Kích thước nặng hơn DINOv2. Không tối ưu sâu cho bài toán Product Retrieval thuần túy nếu không fine-tune. | Trung bình | **78% - 85%** | **Khuyến nghị** ⭐ |
| **DINOv2 (Meta)** | Self-supervised ViT | Trích xuất đặc trưng ảnh chất lượng cực kỳ cao. Không cần gán nhãn. Rất thích hợp fine-tune với kiến trúc Loss Triplet. | Chỉ mã hóa hình ảnh, không hỗ trợ truy vấn trực tiếp bằng văn bản. | Trung bình | **75% - 82%** | |
| **EfficientNet-B3** | CNN Encoder | Rất nhẹ, tốc độ trích xuất nhanh nhất. Phù hợp để tinh chỉnh (fine-tune) nhanh trên các tập dữ liệu nhỏ. | Đặc trưng trích xuất yếu hơn các kiến trúc Transformer. Kém hiệu quả đối với ảnh có nền phức tạp. | Dễ | **62% - 70%** | |

### Các bước thực nghiệm & So sánh
1. Chuẩn bị khoảng **1.000 – 5.000 ảnh sản phẩm**, xây dựng tập nhãn chuẩn (ground truth) phục vụ kiểm thử (mỗi ảnh truy vấn đầu vào tương ứng với danh sách ID sản phẩm đúng).
2. Trích xuất đặc trưng (embedding) toàn bộ ảnh sản phẩm trong catalog bằng từng mô hình → Lưu trữ vào các chỉ mục vectơ **FAISS** độc lập.
3. Chạy tập test truy vấn ảnh → Lấy ra Top-10 kết quả gần nhất từ FAISS → Tính toán chỉ số **Recall@10** và **mAP**.
4. So sánh Recall@10 cùng với thời gian suy luận (Inference Latency). Lựa chọn mô hình tối ưu.

### Pipeline xử lý chung
* **Tiền xử lý (Preprocessing):** Resize ảnh về kích thước chuẩn $224 \times 224$ hoặc $336 \times 336$, chuẩn hóa (normalize). Sử dụng thư viện **Albumentations** để tăng cường dữ liệu (augmentation) khi train.
* **Mã hóa kho hàng (Catalog Encoding):** Tiến hành mã hóa offline một lần duy nhất cho toàn bộ catalog và lưu trữ vector. Cập nhật thêm (incremental update) khi có sản phẩm mới.
* **Tìm kiếm thời gian thực (Query Search):** Mã hóa ảnh người dùng tải lên, tìm kiếm láng giềng gần nhất trên FAISS với thời gian phản hồi lý tưởng `< 50ms`.

> [!TIP]
> **Điểm cộng tối đa cho đồ án:** Sử dụng mô hình **CLIP** để hiện thực hóa tính năng tìm kiếm nâng cao: Kết hợp ảnh tải lên + đoạn text mô tả điều chỉnh (ví dụ: *"tìm áo này nhưng màu xanh"*). Đây là điểm nhấn công nghệ rất mạnh và hiếm gặp ở các đồ án thông thường.

---

## 2. Text Search (Tìm kiếm bằng văn bản ngữ nghĩa)

* **Mục tiêu:** Người dùng nhập từ khóa hoặc câu mô tả dài → Tìm sản phẩm khớp chính xác về mặt ngữ nghĩa (Semantic Search).

### Đối sánh các mô hình

| Model | Kiến trúc | Ưu điểm | Hạn chế | Độ khó huấn luyện | Hiệu suất dự kiến (MRR@10) | Khuyến nghị |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **multilingual-e5-large** | Dense Retrieval | Đạt trạng thái SOTA trên nhiều bảng xếp hạng đa ngôn ngữ. Hỗ trợ tiếng Việt xuất sắc mà không cần tinh chỉnh nhiều. | Kích thước lớn (~560MB), tài nguyên tính toán yêu cầu cao hơn MiniLM. | Trung bình | **0.78 - 0.85** | **Khuyến nghị** ⭐ |
| **PhoBERT + SimCSE** | Sentence Embedding | Tối ưu hóa hoàn toàn cho ngữ pháp và ngữ nghĩa tiếng Việt. Fine-tune không giám sát thông qua SimCSE tương đối thuận tiện. | Chỉ hỗ trợ tiếng Việt. Cần phải fine-tune thêm trên tập dữ liệu e-commerce để tối ưu hóa khả năng tìm kiếm sản phẩm. | Trung bình | **0.72 - 0.80** | |
| **paraphrase-MiniLM-L12** | Lightweight Dense | Tốc độ xử lý cực nhanh (~90ms/query), dung lượng nhẹ, tiết kiệm tài nguyên. Phù hợp để làm demo nhanh. | Độ chính xác ngữ nghĩa kém hơn e5. Tiếng Việt chưa thực sự tối ưu. | Dễ | **0.60 - 0.68** | |

### Các bước thực nghiệm & So sánh
1. Xây dựng tập dữ liệu kiểm thử: Khoảng **300 – 500 cặp truy vấn** (ví dụ: *"tai nghe không dây chống ồn"* → tương ứng với danh sách mã sản phẩm đúng).
2. Tạo embedding cho toàn bộ tiêu đề và mô tả sản phẩm trong database, nạp vào chỉ mục FAISS.
3. Thực hiện truy vấn trên tập test → Tìm Top-10 kết quả → Tính toán chỉ số **MRR@10** và **NDCG@10**.
4. So sánh hiệu năng tổng hợp (độ chính xác và Latency mức P95). Nếu sai lệch độ chính xác không đáng kể, nên ưu tiên chọn mô hình có thời gian xử lý nhanh hơn.

### Kiến trúc Hybrid Search (Khuyến nghị triển khai thực tế)
Kết hợp song song mô hình ngữ nghĩa **Dense Retrieval** tốt nhất (ví dụ: *e5-large*) và công cụ tìm kiếm từ khóa truyền thống **BM25**, sau đó gộp điểm số bằng thuật toán **Reciprocal Rank Fusion (RRF)**:
* **BM25 phát huy thế mạnh khi:** Người dùng gõ tên sản phẩm rất cụ thể (ví dụ: *"iPhone 15 Pro Max 256GB"*).
* **Dense Retrieval phát huy thế mạnh khi:** Người dùng gõ câu mô tả nhu cầu chung (ví dụ: *"áo ấm mùa đông cho trẻ em da nhạy cảm"*).

---

## 3. Recommendation System (Hệ thống gợi ý hành vi)

* **Mục tiêu:** Đưa ra đề xuất sản phẩm cá nhân hóa dựa trên lịch sử xem, nhấn chọn, hoặc mua hàng của người dùng trong phiên hiện tại (Session-based Recommendation).

### Đối sánh các mô hình

| Model | Kiến trúc | Ưu điểm | Hạn chế | Độ khó huấn luyện | Hiệu suất dự kiến (HR@10) | Khuyến nghị |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **SASRec** | Self-Attention Transformer | Đạt hiệu năng hàng đầu (SOTA) cho bài toán gợi ý theo phiên. Tốc độ train nhanh, dung lượng nhẹ. Nhờ cơ chế Attention nên nắm bắt hành vi chuỗi dài rất tốt. | Gặp khó khăn đối với bài toán Khởi động lạnh (Cold-start - người dùng mới chưa có dữ liệu hành vi). | Trung bình | **0.65 - 0.72** | **Khuyến nghị** ⭐ |
| **GRU4Rec** | Recurrent (GRU) | Mô hình tiên phong trong gợi ý theo phiên. Cấu trúc đơn giản, hiệu quả đối với các phiên tương tác ngắn. | Khả năng ghi nhớ chuỗi hành vi dài kém hơn SASRec. Khó song song hóa tối đa trong quá trình huấn luyện. | Trung bình | **0.58 - 0.65** | |
| **BERT4Rec** | Bidirectional Transformer | Sử dụng cơ chế Cloze-task (mã hóa hai chiều bằng cách che một số sản phẩm trong chuỗi). Hiểu ngữ cảnh hai chiều rất tốt. | Quá trình huấn luyện chậm. Quá trình suy luận (inference) phức tạp hơn vì cần tạo vị trí che (mask) ở cuối chuỗi. | Khó | **0.66 - 0.74** | |

### Tập dữ liệu tối thiểu cần chuẩn bị
* `user_id` & `item_id`: Định danh người dùng và sản phẩm (Bắt buộc).
* `timestamp`: Thời điểm tương tác (Bắt buộc).
* `session_id`: Phân nhóm các hành động trong cùng một phiên tương tác (Bắt buộc).
* `action_type`: Nhãn hành động như *view*, *add_cart*, *purchase* để gán trọng số ưu tiên khác nhau (Khuyên dùng).

### Giải quyết vấn đề Cold-start (Người dùng mới)
* Đối với người dùng chưa có lịch sử hoạt động, hệ thống sẽ tự động chuyển sang chế độ dự phòng (fallback): Gợi ý các sản phẩm phổ biến nhất (Popularity-based) hoặc gợi ý dựa trên danh mục sản phẩm đang xem (Content-based).

> [!TIP]
> **Ý tưởng nâng cao điểm đồ án:** Tích hợp mô hình gợi ý **SASRec** kết hợp với thông tin **Phân khúc khách hàng RFM** (được phân loại từ mô hình phân cụm K-Means ở Admin Dashboard). Bằng cách nhúng thêm đặc trưng phân khúc (Segment Embedding) vào đầu vào của mô hình gợi ý, kết quả đề xuất sẽ mang tính cá nhân hóa vượt trội.

---

## 4. Dự báo nhu cầu & Phát hiện giao dịch bất thường (AI Admin Dashboard)

* **Mục tiêu:** Hỗ trợ người quản trị dự báo doanh thu kho hàng trong 30 ngày tiếp theo và phát hiện sớm các hành vi gian lận giao dịch theo thời gian thực.

### A. Dự báo nhu cầu tồn kho (Demand Forecasting)

| Model | Kiến trúc | Ưu điểm | Hạn chế | Độ khó huấn luyện | Hiệu suất dự kiến (MAPE) | Khuyến nghị |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **LightGBM + Features** | Gradient Boosting | Hiệu năng vượt trội đối với dữ liệu chuỗi thời gian dạng bảng. Dễ dàng thêm các đặc trưng lịch lễ tết, khuyến mãi, thời tiết. | Không hỗ trợ ước lượng khoảng tin cậy (uncertainty intervals) một cách tự nhiên. Yêu cầu thiết kế đặc trưng kỹ lưỡng. | Trung bình | **8% - 15%** | **Khuyến nghị** ⭐ |
| **Prophet (Facebook)** | Additive Model | Tự động xử lý tốt xu hướng (trend), tính mùa vụ (seasonality) và các ngày lễ. Cài đặt đơn giản, hỗ trợ vẽ khoảng tin cậy rất trực quan. | Kém chính xác hơn đối với chuỗi thời gian biến động mạnh và có nhiều biến ngoại vi phức tạp. | Dễ | **12% - 20%** | |
| **LSTM / Temporal Fusion Transformer** | Deep Learning | Học được các mẫu phi tuyến cực kỳ phức tạp. Mô hình TFT đạt hiệu năng SOTA cho dự báo đa biến. | Yêu cầu lượng lớn dữ liệu lịch sử để hội tụ. Tốc độ huấn luyện chậm và khó tinh chỉnh tham số. | Khó | **7% - 13%** (nếu đủ data) | |

### B. Phát hiện giao dịch bất thường (Anomaly Detection)

| Model | Kiến trúc | Ưu điểm | Hạn chế | Độ khó huấn luyện | Hiệu suất dự kiến (F1-score) | Khuyến nghị |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **LSTM Autoencoder** | Deep Learning AE | Học được cấu trúc hành vi bình thường dạng chuỗi thời gian. Phát hiện cực kỳ hiệu quả các bất thường về lưu lượng hoặc tần suất giao dịch đột biến. | Thời gian huấn luyện lâu. Cần một lượng lớn dữ liệu "sạch" (không chứa bất thường) để làm tập huấn luyện ban đầu. | Trung bình | **0.78 - 0.88** | **Khuyến nghị** ⭐ |
| **Isolation Forest** | Ensemble Tree | Tốc độ tính toán rất nhanh. Triển khai đơn giản với vài dòng code của thư viện Scikit-learn. Hoạt động tốt trên dữ liệu đa chiều dạng bảng phẳng. | Khả năng bắt các mẫu phụ thuộc chuỗi thời gian kém hơn LSTM-AE. Khó xác định ngưỡng (threshold) phân loại ranh giới. | Dễ | **0.65 - 0.75** | |
| **One-Class SVM** | Kernel SVM | Cơ sở toán học chặt chẽ. Hiệu quả ngay cả khi tập dữ liệu huấn luyện không quá lớn. | Tốc độ tính toán chậm dần khi kích thước dữ liệu tăng cao. Ít được dùng phổ biến trong môi trường production thực tế. | Trung bình | **0.60 - 0.70** | |

> [!TIP]
> **Gợi ý làm giàu dữ liệu (Feature Enrichment):** Tích hợp dữ liệu thời tiết thực tế bằng cách gọi **OpenWeatherMap API** (nhiệt độ/lượng mưa ảnh hưởng trực tiếp đến hành vi mua sắm các sản phẩm thời trang, thiết bị làm mát/sưởi) và nạp danh sách ngày lễ truyền thống của Việt Nam làm các đặc trưng đầu vào cho mô hình **LightGBM**. Việc này giúp cải thiện sai số dự báo (MAPE) thêm từ 3% đến 5%.

---

## 5. Trợ lý Chatbot AI & Phân tích sắc thái ý kiến khách hàng (NLP Tasks)

* **Mục tiêu:** Chatbot tự động trả lời tư vấn sản phẩm sử dụng kiến trúc RAG, đồng thời chạy phân tích cảm xúc (Sentiment Analysis) để kịp thời chuyển tiếp cuộc trò chuyện cho nhân viên hỗ trợ nếu khách hàng đang giận dữ.

### Kiến trúc RAG Chatbot tổng thể
```
[ Khách hàng nhập câu hỏi ]
           │
           ▼
[ Bộ phân loại Intent Classifier ] ──(Hỏi đáp sản phẩm)──► [ Truy xuất thông tin sản phẩm - FAISS ]
                                                                        │
                                                                        ▼
                                                       [ Gộp Context vào Prompt - LangChain ]
                                                                        │
                                                                        ▼
                                                       [ Mô hình sinh câu trả lời - LLM ]
                                                                        │
                                                                        ▼
                                                       [ Phân tích sắc thái cảm xúc - Sentiment Model ]
                                                                        │
                                       ┌────────────────────────┴────────────────────────┐
                                       ▼                                                 ▼
                        (Bình thường/Tích cực)                                   (Tiêu cực/Bức xúc)
                                       │                                                 │
                                       ▼                                                 ▼
                        [ Chatbot phản hồi user ]                        [ Chuyển tiếp cho nhân viên hỗ trợ ]
```

### So sánh các mô hình phân tích cảm xúc (Sentiment Analysis)

| Model | Kiến trúc | Ưu điểm | Hạn chế | Độ khó huấn luyện | Hiệu suất dự kiến (F1-macro) | Khuyến nghị |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **PhoBERT-sentiment** | BERT (Tiếng Việt) | Được tối ưu hóa sâu cho bài toán phân tích cảm xúc tiếng Việt. Hiểu ngữ cảnh địa phương cực kỳ tốt. | Chỉ hỗ trợ tiếng Việt. Cần tinh chỉnh thêm một ít dữ liệu hội thoại bán hàng (e-commerce domain). | Dễ | **0.88 - 0.93** | **Khuyến nghị** ⭐ |
| **ViSoBERT** | BERT (Vi Social) | Huấn luyện trên lượng lớn dữ liệu mạng xã hội Việt Nam. Hiểu ngôn ngữ mạng, từ viết tắt và tiếng lóng (slang) rất tốt. | Cộng đồng hỗ trợ và tài liệu hướng dẫn ít phổ biến hơn PhoBERT. | Dễ | **0.86 - 0.91** | |
| **XLM-RoBERTa-large** | Multilingual BERT | Hỗ trợ đa ngôn ngữ, mô hình pretrained khổng lồ và rất mạnh mẽ. Thích hợp khi dữ liệu gán nhãn ít (few-shot learning). | Kích thước mô hình rất nặng (~1.1GB), yêu cầu tài nguyên GPU lớn và tốc độ suy luận chậm hơn PhoBERT. | Trung bình | **0.84 - 0.90** | |

### So sánh các nhà cung cấp mô hình ngôn ngữ lớn (LLM Provider) cho khâu sinh phản hồi (Generation)

| Nhà cung cấp | Mô hình khuyên dùng | Chính sách sử dụng miễn phí | Tốc độ phản hồi | Chất lượng câu trả lời | Đánh giá chung |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Google Gemini** | `gemini-1.5-flash` | **Rất hào phóng** (Free API Key tốc độ cao) | Nhanh | Tốt | **Lựa chọn tối ưu nhất cho đồ án** 🥇 |
| **Groq API** | `llama-3.1-70b` | Có gói miễn phí giới hạn | Cực kỳ nhanh | Tốt | Phù hợp để trình diễn demo tương tác thời gian thực. |
| **OpenAI** | `gpt-4o-mini` | Không có gói miễn phí (cần nạp tiền) | Trung bình | Rất tốt | Tốt nếu dự án có sẵn ngân sách kinh phí. |
| **Ollama (Local)** | `qwen2.5` hoặc `llama3.2` | Miễn phí hoàn toàn | Phụ thuộc cấu hình GPU máy local | Khá | Phù hợp khi muốn demo offline hoàn toàn không cần Internet. |

> [!TIP]
> **Điểm cộng tối đa:** Tự xây dựng thêm một bộ phân loại ý định nhỏ (**Intent Classifier**) bằng cách tinh chỉnh PhoBERT trên 6 nhãn cơ bản: *tìm_sản_phẩm*, *hỏi_giá*, *tra_đơn_hàng*, *khiếu_nại*, *hỏi_chính_sách*, *khác*. Nhờ đó, chatbot có thể đưa ra các luồng phản hồi thông minh, gọi API tương ứng thay vì chỉ sinh câu trả lời văn bản đơn thuần.
