# Đánh giá search-service (text + visual) trên catalog thật

> Ngày đo: 2026-09-24 · Nhánh `feat/image-search-ai` · Script: `AI/search-service/scripts/evaluate.py` (seed 42, 200 sản phẩm)
> Môi trường: Docker Desktop, CPU-only (không GPU), container giới hạn 11.5 GB RAM.

## 1. Dữ liệu & index

| Thành phần | Giá trị |
|---|---|
| Catalog | 1.123 sản phẩm active (MariaDB `ecommerce_product_db`), 19 danh mục |
| Ảnh | ảnh chính + `product_images` (trung bình ~9 ảnh/sản phẩm) — CDN R2 |
| Text index | `intfloat/multilingual-e5-large` (1024-d), 1.123 vector — passage = tên + thương hiệu + danh mục + mô tả |
| Image index | `clip-ViT-B-32` (512-d), 3 ảnh đầu/sản phẩm = 3.110 vector, 0 ảnh lỗi |
| Keyword | Elasticsearch 8.10 index `products` (product-service đồng bộ), BM25 `name^3, brand^2, categoryName^2, description` |
| Similar items | trộn cosine ảnh 60% + text 40%, top-20/sản phẩm → MongoDB `product_similarities` (1.123 document) |
| Thời gian build | text ≈ 25 phút (e5-large trên CPU) · ảnh ≈ 7–8 phút (có cache) |

## 2. Phương pháp

**Visual** — gọi HTTP endpoint thật `POST /api/v1/public/search/image` (upload → decode → CLIP → FAISS → metadata):

- *seen*: truy vấn bằng ảnh chính (đã có trong index) — kiểm tra pipeline.
- *held-out*: truy vấn bằng ảnh thứ 4 của sản phẩm — **không có trong index**.
- *held-out + augment*: ảnh thứ 4 bị cắt 70%, giảm sáng 10–30%, xoay ±12° (mô phỏng ảnh người dùng tự chụp).

**Text** — so sánh 3 chế độ: BM25 (ES), Dense (e5 + FAISS), Hybrid (RRF k=60):

- *name*: tên sản phẩm đầy đủ · *short*: 4 từ đầu, bỏ RAM/dung lượng (vd "samsung galaxy s26 ultra") · *no-accent*: *short* bỏ dấu.
- *intent*: 27 truy vấn nhu cầu viết tay có nhãn danh mục (vd "laptop văn phòng mỏng nhẹ", "sạc dự phòng").

**Chỉ số**

- Hit@k: đúng sản phẩm nằm trong top-k.
- Tie@k: như Hit@k nhưng chấp nhận sản phẩm có ảnh **giống hệt từng byte** với ảnh truy vấn (xem 4.1).
- Fam@k: đúng dòng sản phẩm (bỏ qua khác RAM/dung lượng, vd S26 Ultra 256GB ≈ 512GB).
- MRR, CatP@k: tỉ lệ kết quả top-k cùng danh mục.

## 3. Kết quả

### 3.1. Visual search (n = 200)

| Truy vấn | Hit@1 | Tie@1 | Fam@1 | Hit@5 | Fam@5 | Hit@10 | MRR | CatP@5 |
|---|---|---|---|---|---|---|---|---|
| seen (ảnh trong index) | 78.5% | **97.0%** | 87.5% | 96.0% | 99.0% | 99.5% | 0.862 | 92.3% |
| held-out | 35.0% | 48.5% | 44.0% | 56.0% | 63.0% | 71.5% | 0.445 | 82.0% |
| held-out + augment | 21.0% | 26.5% | 25.5% | 38.5% | 44.5% | 49.5% | 0.293 | 65.2% |

Latency (HTTP, CPU): p50 ≈ 150 ms, p95 ≈ 350 ms khi máy rảnh.

### 3.2. Text search (n = 200)

| Truy vấn / chế độ | Hit@1 | Hit@5 | Hit@10 | MRR | CatP@5 | p50 |
|---|---|---|---|---|---|---|
| name / BM25 | **99.0%** | 100% | 100% | 0.995 | 92.5% | 38 ms |
| name / Dense | 91.5% | 100% | 100% | 0.953 | 94.2% | 381 ms |
| name / Hybrid | 93.5% | 100% | 100% | 0.968 | 94.1% | 406 ms |
| short / BM25 | 54.5% | 90.0% | 97.5% | 0.693 | 91.9% | 17 ms |
| short / Dense | 58.5% | 93.0% | 97.5% | 0.718 | 93.8% | 373 ms |
| short / Hybrid | 58.5% | 93.0% | **99.5%** | 0.725 | 93.4% | 353 ms |
| no-accent / BM25 | 55.0% | 89.5% | 97.5% | 0.691 | 91.8% | 15 ms |
| no-accent / Dense | 57.0% | 90.0% | 95.0% | 0.701 | 91.7% | 327 ms |
| no-accent / Hybrid | 57.0% | 91.5% | 98.5% | 0.711 | 93.1% | 359 ms |

Hit@1 của *short* thấp là do truy vấn rút gọn khớp nhiều bản cùng dòng (Fam@1 ≈ 67–70%, Fam@5 ≈ 93–96%).

**Truy vấn nhu cầu (27 câu) — CatP@10**

| BM25 | Dense | Hybrid |
|---|---|---|
| 63.7% | **90.7%** | 84.4% |

BM25 gần như hỏng ở truy vấn không chứa đúng từ trong tên: "laptop văn phòng mỏng nhẹ" 0%, "máy tính để bàn" 0%, "samsung galaxy màn hình lớn" 0%, "macbook" 20%. Dense xử lý tốt, chỉ yếu ở "loa bluetooth" (40% — catalog chỉ có 3 loa).

## 4. Phát hiện

### 4.1. Dữ liệu: nhiều sản phẩm dùng chung ảnh
406/1.123 sản phẩm có ảnh giống hệt từng byte với sản phẩm khác (280 nhóm) — chủ yếu máy cũ dùng chung ảnh stock và các bản khác dung lượng. Với các sản phẩm này, **không mô hình ảnh nào phân biệt được**, nên Hit@1 "strict" đánh giá thấp hệ thống: *seen* Hit@1 = 78.5% nhưng Tie@1 = 97.0% (pipeline đúng; 3% còn lại là ảnh gần giống nhưng không trùng byte).

### 4.2. Visual search: tốt ở mức danh mục, trung bình ở mức sản phẩm
Ảnh chưa từng thấy vẫn trả đúng danh mục 82% (CatP@5) nhưng chỉ đúng sản phẩm 48.5% (Tie@1). Với ảnh người dùng tự chụp (augment), độ chính xác giảm rõ (Tie@1 26.5%, CatP@5 65%). Nguyên nhân chính: CLIP ViT-B/32 zero-shot không được huấn luyện để phân biệt các mẫu điện thoại/laptop rất giống nhau. Hướng cải thiện: bật YOLO crop, index nhiều ảnh hơn/sản phẩm, model lớn hơn (ViT-L/14) hoặc fine-tune (DINOv2/triplet).

### 4.3. Hybrid không phải lúc nào cũng tốt nhất
- Truy vấn theo tên: BM25 tốt nhất (Hit@1 99%) và nhanh gấp ~10 lần.
- Truy vấn nhu cầu: Dense tốt nhất (90.7%); Hybrid (84.4%) bị BM25 kéo xuống.
- Hybrid chỉ nhỉnh ở recall sâu (short Hit@10 99.5%).
- ⇒ Cân nhắc RRF có trọng số (dense > bm25) hoặc chọn chế độ theo loại truy vấn — cần bộ truy vấn lớn hơn để tinh chỉnh, tránh overfit 27 câu.

### 4.4. Hiệu năng
e5-large trên CPU: ~350 ms/truy vấn và 25 phút để build 1.123 sản phẩm. `multilingual-e5-base` (768-d) dự kiến nhanh ~3 lần — nên đo lại chất lượng nếu đổi.

### 4.5. `matchScore` hiển thị gây hiểu nhầm
`matchScore = (cos + 1) / 2 × 100`, nhưng cosine CLIP gần như luôn trong khoảng 0.7–1.0. Đo trên 120 truy vấn held-out: top-1 **đúng** có cosine trung vị 0.965, top-1 **sai** cũng có trung vị 0.939 ⇒ badge hiển thị ~97% cho cả kết quả sai. Không nên trình bày con số này như "% khớp"; nên đổi nhãn thành "độ tương đồng" hoặc chỉ dùng để sắp xếp.

### 4.6. Lỗi đã sửa trong quá trình test
| Lỗi | Ảnh hưởng | Sửa |
|---|---|---|
| Build ảnh giữ toàn bộ ảnh đã decode trong RAM (~2 MB/ảnh) | Tiến trình bị kill giữa chừng ở ảnh 2.595/3.110 | Tải + encode theo lô 128, thu nhỏ ≤448 px, giải phóng e5 trước khi nạp CLIP → RAM ổn định ~1.6 GB |
| Lỗi DNS tạm thời khi tải ảnh CDN | 8 ảnh lỗi | Retry 3 lần có backoff → 0 lỗi |
| PNG nền trong suốt bị đổi thành nền đen | 73 ảnh chính (6.5%) | Ghép nền trắng — đo lại: **không khác biệt có ý nghĩa** (Tie@1 held-out 48.5% → 46.5%, trong biên nhiễu n=200) |

## 5. Tái lập

```bash
docker exec -it ai-search-service python scripts/build_index.py              # build đầy đủ
docker exec -it ai-search-service python scripts/evaluate.py --samples 200 --out /data/eval.json
```

`--index-images` của `evaluate.py` phải bằng `--max-images` lúc build (mặc định 3), để ảnh held-out thật sự nằm ngoài index.
