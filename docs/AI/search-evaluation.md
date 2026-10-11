# Đánh giá search-service (text + visual) trên catalog thật

> Ngày đo: 2026-09-24 · Nhánh `feat/image-search-ai` · Script: `AI/search-service/scripts/evaluate.py` (seed 42, chạy với `--samples 200`; mặc định của script là 150) và `scripts/experiment_visual.py` (mục 5)
> Môi trường: Docker Desktop, CPU-only (không GPU), container giới hạn 11.5 GB RAM. **YOLO tắt (`YOLO_ENABLED=false`) trong mọi lần đo.**
> Tài liệu kỹ thuật liên quan: [visual-search.md](visual-search.md) · [text-search.md](text-search.md). Giới hạn của phép đo: mục 6; nguồn từng con số: mục 7.

## 1. Dữ liệu & index

| Thành phần | Giá trị |
|---|---|
| Catalog | 1.123 sản phẩm active (MariaDB `ecommerce_product_db`), 19 danh mục |
| Ảnh | ảnh chính + `product_images` (trung bình ~9 ảnh/sản phẩm) — CDN R2 |
| Text index | `intfloat/multilingual-e5-large` (1024-d), 1.123 vector — passage = tên + thương hiệu + danh mục + mô tả |
| Image index | `clip-ViT-B-32` (512-d). Mục 3: 3 ảnh đầu/sản phẩm = 3.110 vector. **Hiện tại (mục 5): tất cả ảnh = 10.287 vector**, 0 ảnh lỗi |
| Keyword | Elasticsearch 8.10 index `products` (product-service đồng bộ, mapping mặc định — `brand`, `categoryName` là trường Keyword), BM25 `name^3, brand^2, categoryName^2, description`, `fuzziness: AUTO` |
| Similar items | trộn cosine ảnh 60% + text 40%, top-20/sản phẩm → MongoDB `product_similarities` (1.123 document) |
| Thời gian build | text ≈ 25 phút (e5-large trên CPU) · ảnh ≈ 7–8 phút (có cache) |

## 2. Phương pháp

**Visual** — gọi HTTP endpoint thật `POST /api/v1/public/search/image` (upload → decode → CLIP → FAISS → metadata):

- *seen*: truy vấn bằng ảnh chính (đã có trong index) — kiểm tra pipeline.
- *held-out*: truy vấn bằng ảnh thứ 4 của sản phẩm — URL này **không có trong index** (nhưng có thể trùng byte với ảnh đã index, xem mục 6).
- *held-out + augment*: ảnh thứ 4 bị cắt 70%, giảm sáng 10–30%, xoay ±12° (mô phỏng ảnh người dùng tự chụp).

**Text** — gọi trực tiếp các service trong tiến trình (không qua HTTP), so sánh 3 chế độ: BM25 (ES), Dense (e5 + FAISS), Hybrid (RRF k=60):

- *name*: tên sản phẩm đầy đủ, viết thường — đây là truy vấn **tra cứu sản phẩm đã biết** (known-item) · *short*: 4 từ đầu, bỏ RAM/dung lượng (vd "samsung galaxy s26 ultra") · *no-accent*: *short* bỏ dấu.
- *intent*: 27 truy vấn nhu cầu viết tay có nhãn danh mục (vd "laptop văn phòng mỏng nhẹ", "sạc dự phòng"), cố định trong `evaluate.py`.

**Chỉ số**

- Hit@k: đúng sản phẩm nằm trong top-k.
- Tie@k: như Hit@k nhưng chấp nhận cả sản phẩm **khác** có ảnh **giống hệt từng byte** với ảnh truy vấn (xem 4.1 và giới hạn ở mục 6).
- Fam@k: đúng dòng sản phẩm (bỏ qua khác RAM/dung lượng, vd S26 Ultra 256GB ≈ 512GB).
- MRR, CatP@k: tỉ lệ kết quả top-k cùng danh mục.

## 3. Kết quả

### 3.1. Visual search (n = 200)

> Đo trên **index cũ 3 ảnh đầu/sản phẩm** (3.110 vector), giao thức `--holdout index`, **trước** khi sửa lỗi PNG nền trong suốt (4.6; đo lại sau khi sửa: held-out Tie@1 46.5%). Cấu hình production hiện tại là index **tất cả ảnh** — xem mục 5.2.

| Truy vấn | Hit@1 | Tie@1 | Fam@1 | Hit@5 | Fam@5 | Hit@10 | MRR | CatP@5 |
|---|---|---|---|---|---|---|---|---|
| seen (ảnh trong index) | 78.5% | **97.0%** | 87.5% | 96.0% | 99.0% | 99.5% | 0.862 | 92.3% |
| held-out | 35.0% | 48.5% | 44.0% | 56.0% | 63.0% | 71.5% | 0.445 | 82.0% |
| held-out + augment | 21.0% | 26.5% | 25.5% | 38.5% | 44.5% | 49.5% | 0.293 | 65.2% |

Latency (HTTP, CPU, sau lượt làm nóng nạp CLIP): p50 ≈ 150 ms, p95 ≈ 350 ms khi máy rảnh — giá trị làm tròn từ một lần chạy không lưu output (mục 7).

### 3.2. Text search (n = 200)

> Độ trễ đo trong tiến trình (không gồm HTTP/gateway). Truy vấn *name* là tên sản phẩm nguyên văn nên BM25 gần như tuyệt đối là điều dễ hiểu.

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

**Trạng thái: chưa sửa** — công thức vẫn nằm trong `app/services/visual_search.py` (`_to_match_score`) và FE vẫn hiển thị "Độ khớp: x%" ở `SearchPage.jsx`.

### 4.6. Lỗi đã sửa trong quá trình test
| Lỗi | Ảnh hưởng | Sửa |
|---|---|---|
| Build ảnh giữ toàn bộ ảnh đã decode trong RAM (~2 MB/ảnh) | Tiến trình bị kill giữa chừng ở ảnh 2.595/3.110 | Tải + encode theo lô 128, thu nhỏ ≤448 px, giải phóng e5 trước khi nạp CLIP → RAM ổn định ~1.6 GB |
| Lỗi DNS tạm thời khi tải ảnh CDN | 8 ảnh lỗi | Retry 3 lần có backoff → 0 lỗi |
| PNG nền trong suốt bị đổi thành nền đen | 73 ảnh chính (6.5%) | Ghép nền trắng — đo lại: **không khác biệt có ý nghĩa** (Tie@1 held-out 48.5% → 46.5%, trong biên nhiễu n=200) |

## 5. Cải thiện ảnh chưa từng thấy (thí nghiệm `scripts/experiment_visual.py`)

### 5.1. Giao thức
Giao thức ở mục 3 (index 3 ảnh đầu, test bằng ảnh #4) không so được khi index nhiều ảnh hơn, nên đổi sang:

- Ảnh test = **ảnh cuối** của mỗi sản phẩm có ≥4 ảnh; ảnh này **không bao giờ nằm trong index**.
- Loại 31 sản phẩm có ảnh cuối trùng byte với ảnh khác của chính nó (nếu giữ lại, index sẽ "khớp hộ").
- 862 sản phẩm truy vấn, chia ngẫu nhiên **TUNE 431** (chỉ để chọn cấu hình) và **TEST 431** (chỉ để báo cáo).
- *TEST-PHOTO*: tập con TEST mà ảnh cuối là **ảnh chụp sản phẩm** (lọc zero-shot bằng CLIP, 381/431). Kiểm tra bằng mắt: phần bị loại chủ yếu là ảnh cạnh máy, banner quảng cáo, thẻ AppleCare+. Bộ lọc không hoàn hảo: một số ảnh "Trong hộp có gì" vẫn lọt vào.

Ảnh cuối của sản phẩm thường khó hơn ảnh #4 (ảnh cạnh, ảnh chi tiết, banner), nên các số ở đây **thấp hơn mục 3 và không so trực tiếp được** với mục 3.

### 5.2. Kết quả (TEST, không dùng để chọn cấu hình)

Hàng **"Tất cả ảnh/SP"** là **cấu hình production hiện tại**.

| Cấu hình | TEST Tie@1 | Tie@5 | CatP@5 | TEST-PHOTO Tie@1 | Tie@5 | CatP@5 |
|---|---|---|---|---|---|---|
| 3 ảnh/SP (cũ) | 14.8% | 26.9% | 49.2% | 16.8% | 30.2% | 53.2% |
| **Tất cả ảnh/SP** | **37.8%** | **52.7%** | **69.5%** | **41.2%** | **57.0%** | **71.7%** |
| Tất cả ảnh + gộp `lse(0.02)` (tốt nhất trên TUNE) | 36.4% | 51.5% | 68.2% | 39.6% | 55.9% | 70.7% |

Ảnh người dùng tự chụp (augment), TEST Tie@1: 8.4% → **15.8%** khi index tất cả ảnh.

Kiểm tra lại qua **HTTP endpoint thật** (`evaluate.py --holdout last`, 300 mẫu, index build bằng `--holdout-last`): Tie@1 = **36.7%**, Tie@5 = 52.7%, CatP@5 = 69.7%, p50 = 111 ms. Kết quả khớp thí nghiệm offline (37.8%). Index 10.287 vector (gấp ~3.3 lần) không làm chậm truy vấn.

### 5.3. Kết luận
- **Index tất cả ảnh của sản phẩm: tăng ~2.5 lần** (Tie@1 14.8% → 37.8%). Nguyên nhân chính của lỗi cũ là thiếu góc chụp: người dùng gửi ảnh mặt sau/cạnh trong khi index chỉ có ảnh mặt trước. **Đã áp dụng** (`build_index.py --max-images` mặc định 0 = tất cả).
- **Gộp điểm nhiều ảnh (top2, lse) và TTA (lật ảnh, crop giữa): không cải thiện.** Cấu hình tốt nhất trên TUNE lại kém `max` trên TEST (36.4% so với 37.8%), tức chỉ là nhiễu ⇒ **không áp dụng**, giữ code đơn giản.
- Lỗi còn lại chủ yếu là nhầm giữa các đời máy gần như y hệt nhau (iPhone 13 Pro ↔ 13 Pro Max, S25 Ultra ↔ S24). Đây là giới hạn của CLIP zero-shot. Hướng tiếp theo: huấn luyện adapter/metric learning trên các ảnh của cùng sản phẩm, hoặc thử DINOv2.
- Sửa kèm: FAISS chỉ lấy `top_k×4` vector nên với ~9 ảnh/sản phẩm có thể trả < top_k sản phẩm ⇒ tăng độ sâu lên `max(top_k×20, 200)`.

## 6. Giới hạn và rủi ro rò rỉ

| Vấn đề | Ảnh hưởng tới số liệu |
|---|---|
| **Tie@k chấp nhận "ảnh trùng" của sản phẩm khác** | Bản sao byte-giống-hệt của ảnh truy vấn thuộc sản phẩm khác **có thể nằm trong index**. Vì vậy "ảnh truy vấn không có trong index" chỉ đúng với Hit@k của sản phẩm đích, **không đúng với Tie@k** — Tie@k trộn cả trường hợp khớp ảnh đã thấy. |
| **`--holdout index` (mục 3) không lọc trùng với chính sản phẩm** | Ảnh #4 có thể trùng byte với 1 trong 3 ảnh đầu của chính sản phẩm đó (đã nằm trong index) ⇒ held-out mục 3 có thể bị thổi phồng. Chế độ `--holdout last` và `experiment_visual.py` có lọc (31 sản phẩm bị loại ở mục 5.1); mục 3 chưa đo mức độ. |
| **Chỉ phát hiện trùng byte (MD5)** | Ảnh gần trùng (resize, nén lại, khác URL) không bị lọc ở cả hai giao thức; chỉ ảnh đã có trong cache tải ảnh mới được băm. |
| **TEST-PHOTO lọc bằng chính CLIP** | Tập con được chọn bởi đúng mô hình đang đánh giá ⇒ thiên lệch chọn mẫu, nhiều khả năng có lợi cho CLIP. |
| **Truy vấn text sinh từ tên sản phẩm** | *name* là tên nguyên văn (known-item); *short* / *no-accent* cũng rút từ tên. Chỉ *intent* (27 câu) là truy vấn tự nhiên — quá ít để kết luận chắc. |
| **Cỡ mẫu** | Một lần chạy, seed 42, không có khoảng tin cậy. Với n = 200, khoảng tin cậy 95% quanh 50% xấp xỉ ±7 điểm % (1.96·√(0.25/200)) ⇒ chênh lệch nhỏ (vd 48.5% vs 46.5%) không có ý nghĩa. |
| **Độ trễ** | Một client gọi tuần tự, CPU-only, gọi thẳng service (không qua gateway); text đo trong tiến trình. Không phải load test. |
| **Augment là mô phỏng** | Cắt/giảm sáng/xoay tổng hợp, không phải ảnh người dùng chụp thật. |
| **YOLO tắt** | Không có số liệu nào cho pipeline có YOLO. |
| **Dữ liệu không được đóng băng** | Không lưu snapshot DB/ảnh CDN; file kết quả `--out` không được commit ⇒ catalog thay đổi thì không tái lập chính xác được. |

## 7. Nguồn của từng con số

| Số liệu | Nguồn | Tái lập |
|---|---|---|
| Bảng 3.1, 3.2, Fam@1/Fam@5 của *short*, CatP@10 *intent* và các câu trượt | `evaluate.py --samples 200 --holdout index --index-images 3` (stdout) | Có script |
| Latency 3.1 (p50 ≈ 150 ms, p95 ≈ 350 ms) | `evaluate.py` có in p50/p95, nhưng số trong bài là giá trị làm tròn từ một lần chạy "khi máy rảnh" | Ước lượng, không lưu output |
| 5.1: loại 31, 862 truy vấn, TUNE/TEST 431, TEST-PHOTO 381 | `experiment_visual.py` (stdout) | Có script |
| Bảng 5.2, augment 8.4% → 15.8% | `experiment_visual.py` (stdout) | Có script |
| 5.2 qua HTTP: Tie@1 36.7%, Tie@5 52.7%, CatP@5 69.7%, p50 111 ms | `evaluate.py --samples 300 --skip-text --holdout last` | Có script |
| Mục 1: 1.123 sản phẩm, 3.110 / 10.287 vector, 1.123 document, 0 ảnh lỗi | Log `build_index.py` / `GET /health` | Log không lưu |
| Mục 1: 19 danh mục | Truy vấn DB | Đo thủ công, chưa có script tái lập |
| 4.1: 406/1.123 sản phẩm, 280 nhóm | `evaluate.py` có tính nhóm trùng byte nhưng không in thống kê | Đo thủ công, chưa có script tái lập |
| 4.5: 120 truy vấn, cosine trung vị 0.965 / 0.939 | — | Đo thủ công, chưa có script tái lập |
| 4.6: 73 ảnh PNG (6.5%); đo lại Tie@1 46.5% | Đếm thủ công; chạy lại `evaluate.py` không lưu output | Đo thủ công, chưa có script tái lập |
| 4.6: kill ở ảnh 2.595/3.110, 8 ảnh lỗi, RAM ~1.6 GB; thời gian build 25 phút / 7–8 phút / ~17 phút | Log và quan sát khi chạy | Đo thủ công |
| 4.4: `multilingual-e5-base` nhanh ~3 lần | Dự kiến | **Chưa đo** |

## 8. Tái lập

Lưu ý trước khi chạy:

- `evaluate.py` mặc định `--samples 150 --holdout last`; muốn lặp lại mục 3 phải truyền đủ tham số như bên dưới.
- Mẫu text được rút từ cùng bộ sinh số ngẫu nhiên **sau** mẫu visual ⇒ bảng 3.2 chỉ lặp lại được khi chạy visual + text trong **cùng một lệnh** (không dùng `--skip-visual`).
- Sau mỗi lần build, service nạp index mới trong ≤ 30 giây — đợi đủ trước khi chạy `evaluate.py`.
- Các lệnh build dùng cho đánh giá phải có `--skip-similar` để **không ghi đè** `product_similarities` của production.
- Dùng `--out` để lưu kết quả JSON; `experiment_visual.py` chỉ in ra stdout nên cần lưu log.

```bash
# Mục 3 (giao thức cũ): index 3 ảnh đầu/SP, giữ nguyên text index đã build
docker exec -it ai-search-service python scripts/build_index.py --skip-text --skip-similar --max-images 3
docker exec -it ai-search-service python scripts/evaluate.py --samples 200 --holdout index --index-images 3 --out /data/eval_sec3.json

# Mục 5 offline (cache embedding ở /data/exp, lần đầu ~17 phút, các lần sau vài phút)
docker exec -it ai-search-service python scripts/experiment_visual.py --sheet /data/photo_sheet.jpg

# Mục 5.2 qua HTTP: build index bỏ ảnh cuối → evaluate
docker exec -it ai-search-service python scripts/build_index.py --skip-text --skip-similar --holdout-last
docker exec -it ai-search-service python scripts/evaluate.py --samples 300 --skip-text --holdout last --out /data/eval_holdout_last.json

# NHỚ khôi phục index production (tất cả ảnh)
docker exec -it ai-search-service python scripts/build_index.py --skip-text --skip-similar
```
