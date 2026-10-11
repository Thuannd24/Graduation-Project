# Visual Search — Tìm Kiếm Sản Phẩm Bằng Hình Ảnh

> Cập nhật 2026-10-11 theo code nhánh `feat/image-search-ai` (commit `ea338a1`).

> Tài liệu kỹ thuật của chức năng tìm kiếm sản phẩm bằng hình ảnh trong `AI/search-service` (FastAPI, cổng 8001). Pipeline đang chạy: ảnh upload → chuẩn hoá → mã hoá bằng **CLIP ViT-B/32 (512 chiều)** → tìm kiếm **chính xác** trên FAISS `IndexFlatIP` → gộp kết quả theo sản phẩm → lấy metadata từ MariaDB. YOLOv8 đã có code nhưng **mặc định tắt và chưa được đánh giá**. Số liệu đo chi tiết: [search-evaluation.md](search-evaluation.md).

---

## 📌 Trạng Thái Cài Đặt

| Thành phần | Trạng thái | Ghi chú |
| :--- | :--- | :--- |
| CLIP ViT-B/32 + FAISS `IndexFlatIP`, index **tất cả** ảnh của sản phẩm | Đã cài đặt & đã đo | [search-evaluation.md](search-evaluation.md) §3.1, §5 |
| `POST /search/image` + modal upload trên FE (cắt vùng phía trình duyệt) | Đã cài đặt & đã đo (qua HTTP) | FE gửi `top_k=50` |
| YOLOv8 detect & crop | Đã cài đặt, chưa đo | `YOLO_ENABLED=false` mặc định; mọi số đo đều chạy khi YOLO **tắt** |
| Tìm kiếm đa phương thức ảnh + text (`POST /search/multimodal`) | Đã cài đặt, chưa đo | Không có FE gọi |
| Sản phẩm tương tự (`GET /search/similar/{product_id}`) | Đã cài đặt, chưa đo | Không có FE gọi |
| DINOv2 / EfficientNet, fine-tune Triplet loss, FAISS IVF/HNSW | Thiết kế, chưa cài đặt | Xem §11 |

---

## 1. Tổng Quan Pipeline

```
[ Ảnh người dùng — VisualSearchModal (FE) ]
           │  (tuỳ chọn) cắt ngay trên trình duyệt: "Toàn ảnh" hoặc "Vùng giữa" (60% giữa ảnh)
           ▼
POST /api/v1/public/search/image?top_k=50   (qua API Gateway :8080)
           │
           ▼
[ Đọc & chuẩn hoá ] ──► ≤ 10MB, xoay theo EXIF, PNG nền trong suốt → ghép nền trắng, đưa về RGB
           │
           ▼
[ YOLOv8 crop ] ──► chỉ chạy khi YOLO_ENABLED=true (mặc định: bỏ qua, cropBox = null)
           │
           ▼
[ CLIP ViT-B/32 ] ──► vector 512 chiều, L2-normalize
           │
           ▼
[ FAISS IndexFlatIP ] ──► inner product = cosine; tìm chính xác, lấy max(top_k×20, 200) vector gần nhất
           │
           ▼
[ Gộp theo sản phẩm ] ──► mỗi sản phẩm giữ điểm cao nhất trong các ảnh của nó → top_k sản phẩm
           │
           ▼
[ Metadata MariaDB ] ──► tên, giá hiệu lực, ảnh đại diện; bỏ sản phẩm đã ẩn (active = 0)
```

Mã nguồn chính: `app/api/endpoints/search.py`, `app/services/{visual_search, faiss_store, image_loader, yolo_crop, catalog}.py`.

---

## 2. Xây Dựng Chỉ Mục Ảnh (`scripts/build_index.py`)

Chỉ mục được build **offline, chạy tay**; service không tự build.

| Bước | Chi tiết trong code |
| :--- | :--- |
| Nguồn ảnh | `products.image_url` + bảng `product_images` (sắp `is_primary DESC, sort_order ASC`, bỏ URL trùng) của sản phẩm active trong MariaDB |
| Số ảnh / sản phẩm | `--max-images 0` (mặc định) = **tất cả ảnh**. Lần đo gần nhất: 10.287 vector cho 1.123 sản phẩm ([search-evaluation.md](search-evaluation.md) §1) |
| Tải ảnh | Cache trên đĩa (`DATA_DIR/img_cache`), retry 3 lần cho lỗi mạng/5xx, bỏ qua 4xx; ảnh lỗi bị bỏ qua thay vì dừng build |
| Tiền xử lý | Như ảnh upload (EXIF, nền trắng cho PNG trong suốt), thu nhỏ cạnh dài ≤ 448 px |
| Encode | Tải + encode theo lô 128 ảnh để RAM ổn định |
| Ghi file | `item_index.faiss` + `idx2product_image.json` (ghi file tạm rồi rename) |
| Nạp lại | Service so `mtime` tối đa 1 lần / 30 giây và tự nạp index mới, không cần restart |

Cùng lần chạy, script còn build text index (e5) và ghi `product_similarities` (§7), trừ khi truyền `--skip-text` / `--skip-similar`.

```bash
docker exec -it ai-search-service python scripts/build_index.py              # đầy đủ
docker exec -it ai-search-service python scripts/build_index.py --skip-text  # chỉ ảnh (+ similar)
```

---

## 3. Image Encoder — CLIP ViT-B/32

* Model `clip-ViT-B-32` (sentence-transformers), vector **512 chiều**, dùng **zero-shot** — không fine-tune trên dữ liệu dự án.
* Vector được L2-normalize khi encode, nên inner product trên FAISS chính là cosine similarity.
* CLIP mã hoá được cả ảnh và text trong cùng không gian, làm nền cho tìm kiếm đa phương thức (§8).
* `PRELOAD_MODELS=false` (mặc định, cả trong `docker-compose.yml`): model chỉ được nạp ở request đầu tiên (xem §10).

---

## 4. Tìm Kiếm Vector Với FAISS

* Index là **`IndexFlatIP`** — brute-force, **tìm chính xác** (không phải Approximate NN) trên vector đã chuẩn hoá. Với catalog cỡ vài nghìn sản phẩm, Flat index đủ nhanh nên chưa cần IVF/HNSW.
* Một sản phẩm có nhiều vector (nhiều ảnh). Khi tìm, service lấy dư `max(top_k×20, 200)` vector, gộp theo `productId` và **giữ điểm cao nhất** (max) của mỗi sản phẩm, rồi trả top_k sản phẩm.
* Các cách gộp khác (top-2, log-sum-exp) và TTA đã thử nhưng không cải thiện trên tập TEST nên không áp dụng ([search-evaluation.md](search-evaluation.md) §5.3).
* Index chưa được build ⇒ endpoint trả **503** thay vì nạp CLIP vô ích.

---

## 5. YOLOv8 — Detect & Crop (Đã Cài Đặt, Mặc Định Tắt)

Code ở `app/services/yolo_crop.py`; chỉ chạy khi đặt `YOLO_ENABLED=true`.

| Tham số | Giá trị mặc định (`core/config.py`) |
| :--- | :--- |
| Weights | `yolov8m.pt` (pretrained COCO) — **không có sẵn trong repo/image**; nếu nạp lỗi, service ghi log và tắt crop, không thử lại |
| Ngưỡng | `confidence = 0.25`, `IoU = 0.45` |
| Chọn vật thể chính | Box có **diện tích × confidence** lớn nhất |
| Padding | +10% kích thước box mỗi phía, kẹp trong biên ảnh |
| Fallback | Không có box, YOLO lỗi, hoặc vùng cắt < 8 px ⇒ dùng **nguyên ảnh**, `cropBox = null` |
| Đầu ra | `cropBox = {x, y, width, height}` theo % ảnh đã upload; FE quy đổi về ảnh gốc để vẽ khung |

YOLO **chưa được bật trong bất kỳ lần đo nào** và chưa được kiểm chứng trên catalog (chủ yếu điện thoại, laptop, phụ kiện). Container chạy CPU-only. Hiện người dùng tự khoanh vùng bằng preset "Vùng giữa" trên FE thay cho YOLO.

---

## 6. API Serving (FastAPI)

Router được mount ở cả `/api/v1/...` (gateway yêu cầu đăng nhập) và `/api/v1/public/...` (công khai). Gateway route `ai-search` dùng circuit breaker `ai-engine-cb`, giới hạn thời gian **30 giây**.

| Endpoint | Mô tả | FE gọi? |
| :--- | :--- | :--- |
| `POST /api/v1/public/search/image` (alias `/search/similar-image`) | Multipart, field `image` (hoặc `file`); query `top_k` mặc định 10 | Có — `aiApi.searchByImage` gửi `top_k=50` |
| `POST /api/v1/public/search/multimodal` | Form `q` + ảnh; xem §8 | Không |
| `GET /api/v1/public/search/similar/{product_id}?top_k=10` | Đọc sản phẩm tương tự đã tính sẵn; xem §7 | Không |

**Response** (envelope chung `{code, message, data}`; FE tự bóc `data`; giá trị trong ví dụ là minh hoạ):

```json
{
  "code": "SUCCESS",
  "message": "Success",
  "data": {
    "total": 1,
    "items": [
      { "id": "101", "name": "…", "price": 23990000, "image": "https://…", "score": 0.9412, "matchScore": 97 }
    ],
    "cropBox": null
  }
}
```

* `score` = cosine CLIP; `price` = giá hiệu lực (giá sale nếu có). `/search/similar/{id}` trả cùng dạng item nhưng không có `cropBox`.
* `matchScore = round((score + 1) / 2 × 100)`. Đây **không** phải xác suất đã hiệu chỉnh: top-1 **sai** có cosine trung vị 0.939 ⇒ ≈ 97%, gần bằng top-1 **đúng** (0.965 ⇒ ≈ 98%) ([search-evaluation.md](search-evaluation.md) §4.5). Vấn đề này **chưa sửa** trong code.
* Lỗi: `422` thiếu file, `400` ảnh rỗng / > 10MB / không phải ảnh, `503` chưa có index, `500` lỗi khác (body dạng `{"detail": …}`).
* Độ trễ đo qua HTTP trên CPU, sau khi model đã nạp: p50 ≈ 150 ms, p95 ≈ 350 ms (index 3 ảnh/SP, [search-evaluation.md](search-evaluation.md) §3.1); p50 = 111 ms với index tất cả ảnh (§5.2).

---

## 7. Sản Phẩm Tương Tự (Item-to-Item)

* `build_index.py` tính cho mỗi sản phẩm: vector ảnh = trung bình các ảnh (đã chuẩn hoá), vector text = e5. Độ tương tự = **0.6 × cosine ảnh + 0.4 × cosine text** (thiếu một trong hai thì dùng cái còn lại), lấy **top-20**.
* Kết quả ghi đè toàn bộ collection MongoDB `product_similarities`; `GET /search/similar/{product_id}` chỉ đọc lại (top_k mặc định 10).
* Chỉ được làm mới khi chạy lại `build_index.py` (không có lịch tự động). Hiện chưa có FE hay service nào khác đọc dữ liệu này (`ProductSimilarityRepository` của product-service chưa được dùng).

---

## 8. Tìm Kiếm Đa Phương Thức (Ảnh + Text)

`POST /search/multimodal` encode ảnh và câu `q` bằng CLIP, rồi tìm bằng:

$$v_{\text{query}} = \text{normalize}(0.7 \times v_{\text{img}} + 0.3 \times v_{\text{txt}})$$

(trọng số đọc từ `MM_IMAGE_WEIGHT` / `MM_TEXT_WEIGHT`). Lưu ý: text encoder của `clip-ViT-B-32` được huấn luyện trên chú thích **tiếng Anh**, nên mô tả tiếng Việt như *"màu hồng"* **không đáng tin cậy**. Endpoint chưa có FE gọi và chưa được đánh giá.

---

## 9. Kết Quả Đo (Tóm Tắt)

Tất cả đo khi **YOLO tắt**, CPU-only. Chi tiết, giao thức và giới hạn: [search-evaluation.md](search-evaluation.md).

| Giao thức | Index | Kết quả | Nguồn |
| :--- | :--- | :--- | :--- |
| Ảnh đã có trong index (kiểm tra pipeline) | 3 ảnh/SP | Tie@1 97.0% | §3.1 |
| Ảnh chưa thấy (ảnh #4) | 3 ảnh/SP | Hit@10 71.5%, Tie@1 48.5%, CatP@5 82.0% | §3.1 |
| Ảnh chưa thấy + augment (mô phỏng ảnh tự chụp) | 3 ảnh/SP | Hit@10 49.5%, Tie@1 26.5% | §3.1 |
| Ảnh cuối, tập TEST 431 SP (offline) | **Tất cả ảnh (cấu hình production)** | Tie@1 37.8%, Tie@5 52.7%, CatP@5 69.5% | §5.2 |
| Ảnh cuối, qua HTTP, 300 mẫu | Tất cả ảnh | Tie@1 36.7%, p50 111 ms | §5.2 |

Hai giao thức (ảnh #4 và ảnh cuối) **không so trực tiếp được** với nhau. Kết luận chính: hệ thống tìm đúng **danh mục** khá tốt nhưng đúng **sản phẩm** ở mức trung bình; lỗi chủ yếu là nhầm giữa các đời máy gần giống nhau — giới hạn của CLIP zero-shot.

---

## 10. Vấn Đề Đã Biết

| Vấn đề | Ảnh hưởng |
| :--- | :--- |
| Không có lịch build lại index | Sản phẩm/ảnh mới **không tìm được** cho tới khi chạy tay `build_index.py`; `product_similarities` cũng cũ theo |
| `PRELOAD_MODELS=false` | Request đầu tiên phải nạp CLIP (và tải model nếu chưa có cache); có thể vượt giới hạn 30 giây của gateway ⇒ trả fallback |
| `SearchPage.jsx` luôn hiện nhãn "YOLO v8 detected" khi có ảnh upload | Gây hiểu nhầm vì YOLO đang tắt (`cropBox` từ server luôn `null`) |
| `SearchPage.jsx` mặc định lọc giá `≤ 50.000.000` (`DEFAULT_MAX_PRICE`) | Sản phẩm giá cao hơn bị ẩn khỏi kết quả ảnh dù server đã trả về |
| Badge "Độ khớp: x%" dùng `matchScore` | Không phản ánh độ tin cậy (§6) |
| Nhiều sản phẩm dùng chung ảnh giống hệt | Không mô hình ảnh nào phân biệt được ([search-evaluation.md](search-evaluation.md) §4.1) |

---

## 11. Hướng Phát Triển (Phương Án Đã Cân Nhắc, Chưa Cài Đặt)

* **Bật và đánh giá YOLO** với cùng giao thức trong search-evaluation.md, so sánh với preset "Vùng giữa".
* **Encoder khác:** CLIP lớn hơn (ViT-L/14), **DINOv2** (đặc trưng thuần ảnh, tự giám sát) hoặc **EfficientNet** (nhẹ, hợp CPU) — chưa có thí nghiệm nào trong dự án.
* **Fine-tune / metric learning** (Triplet loss, adapter) trên các ảnh của cùng một sản phẩm: Anchor = một ảnh, Positive = ảnh khác góc của cùng sản phẩm, Negative = ảnh sản phẩm khác — nhắm vào lỗi nhầm đời máy.
* **FAISS IVF/HNSW** khi catalog tăng đủ lớn để Flat index chậm.
* **Build lại index tự động** (theo lịch hoặc theo sự kiện thay đổi sản phẩm).
* **CLIP đa ngôn ngữ** (vd `clip-ViT-B-32-multilingual-v1`) nếu muốn hỗ trợ mô tả tiếng Việt cho multimodal.
