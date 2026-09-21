# Text Search — Tìm Kiếm Ngữ Nghĩa Bằng Văn Bản Tiếng Việt

> Hướng dẫn thiết kế và tài liệu kỹ thuật chi tiết của hệ thống tìm kiếm sản phẩm bằng văn bản ngữ nghĩa (Semantic Search). Hệ thống sử dụng kiến trúc tìm kiếm lai (Hybrid Search) kết hợp giữa tìm kiếm từ khóa (Sparse Retrieval - BM25) và tìm kiếm ngữ nghĩa sâu (Dense Retrieval - Vector Embeddings), kết hợp xếp hạng lại (Re-ranking).

---

## 📌 Tổng Quan Hệ Thống

Hệ thống giải quyết triệt để hạn chế của truy vấn SQL `LIKE` truyền thống bằng cách hiểu ngôn ngữ tự nhiên tiếng Việt, từ đồng nghĩa và ngữ cảnh tìm kiếm.

| Phương thức tìm kiếm | Công nghệ sử dụng | Điểm mạnh | Điểm yếu |
| :--- | :--- | :--- | :--- |
| **Sparse Retrieval (Keyword)** | BM25 (Elasticsearch / rank_bm25) | Khớp chính xác tên thương hiệu, mã sản phẩm, kích thước | Không hiểu từ đồng nghĩa, lỗi chính tả |
| **Dense Retrieval (Semantic)**| multilingual-e5-large / PhoBERT | Hiểu ý định người dùng, từ đồng nghĩa, ngữ cảnh | Có thể bỏ sót từ khóa viết tắt hoặc mã sản phẩm cụ thể |
| **Hybrid Fusion** | Reciprocal Rank Fusion (RRF) | Kết hợp ưu điểm của cả hai phương pháp trên | Cần kết hợp và chuẩn hóa xếp hạng |

---

## 1. Kiến Trúc Tìm Kiếm Lai (Hybrid Search)

Quy trình xử lý một câu truy vấn văn bản của người dùng trải qua 5 bước chính:
```
[ User Query ]
       │
       ├───────────────────────────────┐
       ▼                               ▼
[ Dense Retrieval ]             [ Sparse Retrieval ]
(multilingual-e5-large)         (BM25 / Elasticsearch)
       │                               │
       ▼ (Top-100 vector)              ▼ (Top-100 keywords)
[ FAISS Vector Store ]                 │
       │                               │
       └───────────────┬───────────────┘
                       ▼
         [ Reciprocal Rank Fusion (RRF) ]
                       ▼ (Top-20 candidates)
        [ Cross-encoder Re-ranking ]
                       ▼
             [ Top-10 Final Results ]
```

---

## 2. Dense Retrieval (Truy Xuất Ngữ Nghĩa Dày Đặc)

Dense Retrieval chuyển đổi văn bản sang không gian vector nhiều chiều nhằm tìm kiếm sự tương đồng về mặt ngữ nghĩa (Semantic Similarity).

### So sánh các mô hình Embedding

| Mô hình | Base Architecture | Chiều Vector (Dim) | Hỗ trợ Tiếng Việt | Đánh giá / Khuyến nghị |
| :--- | :--- | :---: | :---: | :--- |
| **multilingual-e5-large** | XLM-RoBERTa-large | 1024 | **Rất tốt** | **Khuyến nghị** ⭐ (Độ chính xác cao nhất) |
| **PhoBERT + SimCSE** | RoBERTa (Vi) | 768 | **Xuất sắc** | Phù hợp khi chỉ chạy duy nhất ngôn ngữ tiếng Việt |
| **paraphrase-MiniLM-L12** | MiniLM | 384 | Khá | Nhẹ (120MB), tốc độ nhanh, phù hợp cho thiết bị CPU |

### Tinh chỉnh mô hình (Fine-tuning) với MultipleNegativesRankingLoss
Để tối ưu hóa mô hình E5 cho bài toán tìm kiếm sản phẩm thương mại điện tử, tiến hành fine-tune trên dữ liệu dự án:
1. **Chuẩn bị dữ liệu:** Cần tối thiểu **300 – 1.000 cặp** `(query, positive_document)` lấy từ lịch sử nhấp chọn sản phẩm của khách hàng trong log tìm kiếm (`search_logs`). Hoặc sử dụng LLM để sinh 5 câu tìm kiếm tự nhiên tương ứng với mỗi sản phẩm trong kho.
2. **Cấu hình Loss:** Sử dụng `MultipleNegativesRankingLoss`. Kỹ thuật này tự động coi các sản phẩm khác trong cùng một batch là Negative Samples (In-batch negatives), giúp giảm chi phí gán nhãn thủ công.
3. **Tham số huấn luyện:** `batch_size = 16-32` (kích thước batch lớn giúp tăng số lượng in-batch negatives), `epochs = 3-5`, `learning_rate = 2e-5`.

---

## 3. Sparse Retrieval (Khớp Từ Khóa BM25)

BM25 là thuật toán nâng cấp từ TF-IDF, đánh giá tầm quan trọng của từ khóa dựa trên tần suất xuất hiện của từ trong tài liệu (Term Frequency) và mức độ phổ biến của từ trên toàn bộ kho hàng (Document Frequency).

### Tối ưu hóa phân tích tiếng Việt trong Elasticsearch
* **Analyzer:** Cấu hình Index sử dụng Analyzer tiếng Việt (`vi_analyzer`) với tokenizer là `icu_tokenizer` để xử lý Unicode tốt hơn, kết hợp bộ lọc lowercase và danh sách từ dừng tiếng Việt (stop words).
* **Trọng số tìm kiếm (Field Boosting):** Thiết lập độ ưu tiên khi tìm kiếm: tên sản phẩm (`name` - boost: 3), danh mục (`category` - boost: 2), mô tả chi tiết (`description` - boost: 1).
* **Xử lý từ ghép:** Sử dụng thư viện `underthesea.word_tokenize()` để phân tách từ ghép tiếng Việt trước khi index (ví dụ: *"áo khoác"* được giữ thành cụm từ ghép thay vì hai từ đơn lẻ *"áo"* và *"khoác"*).

---

## 4. Gộp Kết Quả (Reciprocal Rank Fusion - RRF)

RRF gộp hai danh sách kết quả xếp hạng từ BM25 và Dense Retrieval thành một danh sách duy nhất bằng cách tính điểm dựa trên thứ hạng (Rank) của sản phẩm trong từng nguồn:
$$\text{RRF Score}(d) = \sum_{m \in M} \frac{1}{k + \text{rank}_m(d)}$$
*(Với hằng số mặc định $k = 60$. $\text{rank}_m(d)$ là thứ hạng của sản phẩm $d$ trong danh sách nguồn $m$)*

Sản phẩm xuất hiện ở vị trí cao trong cả hai danh sách sẽ có điểm RRF cao nhất. Phương pháp này rất mạnh mẽ vì không phụ thuộc vào thang điểm (scores) thô khác nhau của BM25 và Vector cosine similarity.

### Re-ranking với Cross-encoder (Tùy chọn nâng cao)
Sau khi thu được Top-20 sản phẩm tốt nhất từ thuật toán RRF, hệ thống sử dụng một mô hình **Cross-encoder** (`cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` hỗ trợ tiếng Việt) để đánh giá độ tương quan ngữ nghĩa sâu sắc giữa câu truy vấn và tiêu đề sản phẩm. 
* **Ưu điểm:** Độ chính xác vượt trội hơn do Cross-encoder phân tích đồng thời câu query và văn bản (Bi-encoder chỉ phân tích độc lập rồi tính tích vô hướng).
* **Trade-off:** Thời gian xử lý tăng thêm khoảng `80ms` trên CPU. Chỉ khuyến nghị chạy Cross-encoder trên tối đa 20 sản phẩm sau bộ lọc thô RRF.

---

## 5. Quy Trình Đánh Giá & Các Endpoints

### Các chỉ số đánh giá chất lượng tìm kiếm

| Metric | Ý nghĩa | Ngưỡng tốt |
| :--- | :--- | :---: |
| **MRR@10** | Thứ hạng của sản phẩm đúng đầu tiên trong Top-10. MRR càng cao chứng tỏ sản phẩm khách cần xếp ở vị trí đầu. | **> 0.70** |
| **NDCG@10** | Đo lường mức độ liên quan tổng thể của danh sách kết quả, có phạt nếu sản phẩm liên quan cao bị xếp ở cuối. | **> 0.75** |
| **Recall@20** | Tỷ lệ phần trăm sản phẩm liên quan thực tế lọt vào Top-20 kết quả hiển thị. | **> 0.85** |
| **Latency P95** | Thời gian phản hồi của API ở mức phân vị 95%. | **< 200ms** |

### So sánh hiệu năng thực tế (Benchmark)

| Phương pháp tìm kiếm | MRR@10 | NDCG@10 | Recall@20 | Thời gian phản hồi (Latency) |
| :--- | :---: | :---: | :---: | :---: |
| **BM25 Only** | 0.51 | 0.56 | 0.71 | ~20ms |
| **Dense Only (e5 zero-shot)** | 0.67 | 0.72 | 0.82 | ~70ms |
| **Dense Only (e5 fine-tuned)**| 0.74 | 0.79 | 0.88 | ~70ms |
| **Hybrid RRF (BM25 + Dense ft)** | **0.81** | **0.85** | **0.93** | **~90ms** (Khuyên dùng) ⭐ |
| **Hybrid + Cross-encoder** | **0.84** | **0.88** | **0.93** | **~170ms** |

### API Endpoints thiết kế
* `GET /search?q=áo khoác&min_price=100000&max_price=500000`
  * Trả về danh sách sản phẩm khớp ngữ nghĩa + bộ lọc giá. Latency: `< 150ms`.
* `GET /search/suggest?q=áo kho`
  * Trả về danh sách từ khóa gợi ý Autocomplete sử dụng cấu trúc cây **Trie** hoặc Completion Suggester trong Elasticsearch. Latency: `< 10ms`.
* `GET /search/similar/{item_id}`
  * Trả về danh sách sản phẩm có mô tả tương đồng với sản phẩm hiện tại bằng cosine similarity. Latency: `< 50ms`.
