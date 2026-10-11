# Text Search — Tìm Kiếm Ngữ Nghĩa Bằng Văn Bản Tiếng Việt

> Cập nhật 2026-10-11 theo code nhánh `feat/image-search-ai` (commit `ea338a1`).

> Tài liệu kỹ thuật của chức năng tìm kiếm văn bản trong `AI/search-service` (FastAPI, cổng 8001). Hệ thống dùng kiến trúc **tìm kiếm lai (Hybrid Search)**: tìm theo từ khoá (Sparse — BM25 trên Elasticsearch) và tìm theo ngữ nghĩa (Dense — `multilingual-e5-large` + FAISS), gộp bằng **Reciprocal Rank Fusion (RRF)**. Không có bước xếp hạng lại (re-ranking). Số liệu đo chi tiết: [search-evaluation.md](search-evaluation.md).

> **Lưu ý quan trọng:** trang tìm kiếm của website **chưa gọi** endpoint này. `SearchPage.jsx` dùng `productApi.searchProducts` → `GET /api/v1/public/products/search` của **product-service**; chatbot cũng gọi thẳng product-service. `GET /search` và `GET /search/suggest` của search-service hiện chưa có FE nào gọi.

---

## 📌 Trạng Thái Cài Đặt

| Thành phần | Trạng thái | Ghi chú |
| :--- | :--- | :--- |
| Dense retrieval `multilingual-e5-large` (1024-d) + FAISS | Đã cài đặt & đã đo | [search-evaluation.md](search-evaluation.md) §3.2 |
| BM25 trên Elasticsearch (fallback MariaDB `LIKE`) | Đã cài đặt & đã đo | Đo khi ES chạy bình thường; fallback chưa đo |
| Hybrid RRF (k = 60, không trọng số) — `GET /search` | Đã cài đặt & đã đo (in-process) | Chưa tích hợp vào FE |
| Autocomplete `GET /search/suggest` | Đã cài đặt, chưa đo | Không có FE gọi |
| Sản phẩm tương tự `GET /search/similar/{product_id}` | Đã cài đặt, chưa đo | Dùng chung với visual search |
| Cross-encoder re-ranking, fine-tune e5, PhoBERT, analyzer tiếng Việt | Thiết kế, chưa cài đặt | Xem §7 |

---

## 1. Kiến Trúc Tìm Kiếm Lai (Hybrid Search)

| Phương thức | Công nghệ trong code | Điểm mạnh | Điểm yếu |
| :--- | :--- | :--- | :--- |
| **Sparse (Keyword)** | BM25 trên Elasticsearch index `products` | Khớp chính xác tên, mã máy, dung lượng; rất nhanh | Không hiểu từ đồng nghĩa / nhu cầu |
| **Dense (Semantic)** | `intfloat/multilingual-e5-large` + FAISS `IndexFlatIP` | Hiểu ý định, từ đồng nghĩa | Chậm hơn trên CPU; có thể lệch ở mã sản phẩm cụ thể |
| **Hybrid Fusion** | Reciprocal Rank Fusion | Không cần chuẩn hoá thang điểm của hai nguồn | Nguồn yếu có thể kéo kết quả xuống (§6) |

```
[ Query q, top_k (mặc định 10) ]
       │
       ├────────────────────────────────┐
       ▼                                ▼
[ Dense: e5-large ]              [ Sparse: BM25 / Elasticsearch ]
"query: " + q → FAISS            multi_match, fuzziness AUTO
       │ top_k×3 ứng viên               │ top_k×3 ứng viên
       └───────────────┬────────────────┘
                       ▼
        [ Reciprocal Rank Fusion, k = 60 ]
                       ▼
     [ Metadata MariaDB + lọc min_price / max_price ]
                       ▼
     [ Tối đa top_k kết quả (có thể ít hơn sau khi lọc giá) ]
```

Mã nguồn: `app/services/{hybrid_search, text_search, catalog, faiss_store}.py`.

---

## 2. Dense Retrieval (Truy Xuất Ngữ Nghĩa)

* **Model:** `intfloat/multilingual-e5-large`, vector **1024 chiều**, dùng nguyên bản (không fine-tune).
* **Prefix bắt buộc của e5:** câu tìm kiếm mã hoá dạng `"query: " + q`, tài liệu dạng `"passage: " + …`.
* **Passage của mỗi sản phẩm** (`build_index.py`): `tên. Thương hiệu {brand}. Danh mục {category}. {mô tả}` — mô tả được bỏ thẻ HTML và cắt 800 ký tự. Mỗi sản phẩm 1 vector (1.123 vector ở lần đo, [search-evaluation.md](search-evaluation.md) §1).
* **Index:** FAISS `IndexFlatIP` trên vector đã L2-normalize ⇒ cosine, tìm chính xác. Index được build tay bằng `scripts/build_index.py` và service tự nạp lại trong ≤ 30 giây.
* **Khi chưa có text index:** dense trả rỗng (không nạp e5) và hybrid **âm thầm chỉ còn BM25**, response không báo điều này.

---

## 3. Sparse Retrieval (BM25 Trên Elasticsearch)

* **Index:** `products`, do product-service đồng bộ (`ProductDocument.java`), dùng **mapping mặc định** — không có analyzer tiếng Việt, không tách từ ghép.
* **Truy vấn thật** (`catalog.bm25_search`):
  * `multi_match` trên `name^3, brand^2, categoryName^2, description`, `fuzziness: AUTO`, lọc `active = true`.
  * `name`, `description` là trường `Text` (analyzer chuẩn của ES). `brand`, `categoryName` là trường **`Keyword`** ⇒ boost của hai trường này chỉ có tác dụng khi câu truy vấn trùng (gần đúng) **toàn bộ** giá trị, ví dụ cả câu là "Samsung".
* **Fallback khi ES lỗi:** đánh dấu ES "down" trong 30 giây và chuyển sang MariaDB: đếm số từ (tối đa 8) của câu truy vấn xuất hiện trong `products.name` bằng `LIKE`, sắp theo số từ khớp rồi `sales_count`. Đây không phải BM25.

---

## 4. Gộp Kết Quả (Reciprocal Rank Fusion — RRF)

$$\text{RRF}(d) = \sum_{m \in \{\text{dense},\ \text{bm25}\}} \frac{1}{k + \text{rank}_m(d)}, \quad k = 60$$

* `rank` tính từ 1; hai nguồn có **trọng số bằng nhau** (`RRF_K` cấu hình được qua biến môi trường).
* Mỗi nguồn lấy `top_k × 3` ứng viên (30 khi `top_k = 10`).
* Sau khi gộp: lấy metadata từ MariaDB (bỏ sản phẩm đã ẩn), lọc giá, dừng khi đủ `top_k`. Nếu bộ lọc giá loại nhiều, kết quả có thể **ít hơn** `top_k`.
* `match_reason` cho biết sản phẩm đến từ `bm25`, `dense` hay `bm25+dense`.

---

## 5. Các Endpoint

Router được mount ở cả `/api/v1/...` (gateway yêu cầu đăng nhập) và `/api/v1/public/...` (công khai); gateway giới hạn thời gian **30 giây**.

| Endpoint | Mô tả |
| :--- | :--- |
| `GET /search?q=…&top_k=10&min_price=…&max_price=…` | Hybrid search như §1. Response `{query_understood, total, items[{id, name, price, image, score, match_reason}]}` trong envelope `{code, message, data}`. `query_understood` hiện chỉ là danh sách từ tách theo khoảng trắng, không có NLU |
| `GET /search/suggest?q=…` | Gợi ý tên sản phẩm: cần ≥ 2 ký tự, `match_phrase_prefix` trên `name` (sắp theo điểm rồi `salesCount`), fallback `LIKE` trên MariaDB, trả tối đa **5** tên |
| `GET /search/similar/{product_id}?top_k=10` | Đọc `product_similarities` (MongoDB) đã tính sẵn: 0.6 × cosine ảnh + 0.4 × cosine text, top-20/sản phẩm — chi tiết ở [visual-search.md](visual-search.md) §7 |

`PRELOAD_MODELS=false` nên request đầu tiên phải nạp e5-large; request này có thể vượt giới hạn 30 giây của gateway.

---

## 6. Kết Quả Đo (Tóm Tắt)

Đo in-process (không qua HTTP), CPU-only, 200 sản phẩm, seed 42. Chi tiết: [search-evaluation.md](search-evaluation.md) §3.2, §4.3.

| Loại truy vấn | BM25 | Dense | Hybrid |
| :--- | :---: | :---: | :---: |
| *name* (tên đầy đủ) — MRR | **0.995** | 0.953 | 0.968 |
| *short* (4 từ đầu) — Hit@10 | 97.5% | 97.5% | **99.5%** |
| *intent* (27 câu nhu cầu) — CatP@10 | 63.7% | **90.7%** | 84.4% |
| Độ trễ p50 | 15–38 ms | 327–381 ms | 353–406 ms |

* Truy vấn *name* là **tra cứu sản phẩm đã biết** (câu truy vấn chính là tên sản phẩm), nên BM25 gần như tuyệt đối là điều dễ hiểu — không đại diện cho truy vấn thực tế.
* Hybrid **không phải lúc nào cũng tốt nhất**: với truy vấn nhu cầu, Dense tốt hơn Hybrid vì BM25 kéo xuống; Hybrid chỉ nhỉnh ở recall sâu.
* e5-large trên CPU tốn ~350 ms/truy vấn — gần như toàn bộ độ trễ của Hybrid.

---

## 7. Hướng Phát Triển (Chưa Cài Đặt)

* **RRF có trọng số** (dense > bm25) hoặc chọn chế độ theo loại truy vấn — cần bộ truy vấn lớn hơn 27 câu để tránh overfit.
* **Tích hợp vào FE:** cho `SearchPage` gọi `GET /search` và ô tìm kiếm gọi `/search/suggest`.
* **Cross-encoder re-ranking** (vd `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`) trên top ứng viên sau RRF — đánh đổi thêm độ trễ trên CPU.
* **Fine-tune e5** bằng `MultipleNegativesRankingLoss` (in-batch negatives) trên cặp (truy vấn, sản phẩm) lấy từ log tìm kiếm hoặc sinh bằng LLM.
* **Model nhẹ hơn:** `multilingual-e5-base` (768-d) để giảm độ trễ — cần đo lại chất lượng ([search-evaluation.md](search-evaluation.md) §4.4); PhoBERT nếu chỉ phục vụ tiếng Việt.
* **Analyzer tiếng Việt cho Elasticsearch** (vd `icu_tokenizer`, tách từ ghép bằng `underthesea`) và đổi `brand` / `categoryName` sang trường `Text` (hoặc multi-field) để boost có tác dụng với từng từ.
