# Visual Search — Tìm Kiếm Sản Phẩm Bằng Hình Ảnh

> Hướng dẫn thiết kế và tài liệu kỹ thuật chi tiết của hệ thống tìm kiếm sản phẩm bằng hình ảnh (Visual Search). Hệ thống sử dụng mô hình nhận diện vật thể YOLOv8 để định vị và cắt (crop) sản phẩm chính từ ảnh đầu vào, kết hợp mô hình mã hóa ảnh (Image Encoder) để trích xuất đặc trưng vector và tìm kiếm láng giềng gần nhất bằng thư viện FAISS.

---

## 📌 Tổng Quan Hệ Thống

Hệ thống cho phép người dùng tải lên hình ảnh sản phẩm thực tế và ngay lập tức tìm kiếm các mặt hàng tương đồng trong kho mà không cần gõ từ khóa.

```
[ Ảnh đầu vào của user ]
           │
           ▼
[ YOLOv8 - Nhận diện ] ──► (Xác định Bounding Box lớn nhất)
           │
           ▼
[ Crop & Tiền xử lý ] ──► (Cắt sản phẩm + Thêm 10% padding + Resize 224x224)
           │
           ▼
[ Image Encoder ] ──► (Trích xuất vector đặc trưng 512-dim / 768-dim)
           │
           ▼
[ FAISS Vector Store ] ──► (Tìm kiếm Top-K láng giềng gần nhất - Cosine Similarity)
           │
           ▼
[ Kết quả trả về ] ──► (Top sản phẩm khớp kèm theo bounding box gốc để vẽ khung)
```

---

## 1. YOLOv8 — Định Vị & Cắt Sản Phẩm (Detect & Crop)

Khi người dùng chụp ảnh thực tế, ảnh thường chứa nhiều chi tiết nhiễu (nền nhà, đồ vật xung quanh). Nếu đưa trực tiếp ảnh này vào mô hình mã hóa đặc trưng, độ chính xác sẽ giảm mạnh do mô hình học cả những đặc trưng nhiễu của môi trường.

### So sánh các phiên bản YOLOv8 (Pretrained COCO)
Với hầu hết danh mục sản phẩm e-commerce phổ biến (quần áo, giày dép, điện thoại, túi xách), mô hình YOLOv8 sẵn có đã nhận diện rất tốt mà không cần huấn luyện lại.

| Phiên bản | Kích thước file | Độ chính xác (mAP) | Tốc độ xử lý | Khuyến nghị sử dụng |
| :--- | :---: | :---: | :---: | :--- |
| **YOLOv8n** (Nano) | 3.2MB | 37.3 | < 1ms / ảnh | Phù hợp thiết bị cấu hình yếu, mobile client |
| **YOLOv8s** (Small) | 11.2MB | 44.9 | ~2ms / ảnh | Cân bằng tốt giữa tốc độ và độ chính xác |
| **YOLOv8m** (Medium)| 25.9MB | 50.2 | ~5ms / ảnh | **Khuyến nghị sử dụng trên server** ⭐ |
| **YOLOv8l** (Large) | 43.7MB | 52.9 | ~10ms / ảnh | Ưu tiên độ chính xác tuyệt đối |

### Logic Cắt Ảnh Tự Động (Crop Pipeline)
1. **Chạy nhận diện:** Đặt ngưỡng `confidence >= 0.25` và ngưỡng loại bỏ hộp trùng lặp `IoU = 0.45`.
2. **Chọn vật thể chính:** Nếu phát hiện nhiều vật thể, tính toán diện tích (Area) của từng Bounding Box và lựa chọn box có diện tích lớn nhất làm sản phẩm chính cần tìm kiếm.
3. **Thêm biên an toàn (Padding):** Cộng thêm `10%` kích thước biên vào mỗi cạnh để tránh cắt mất viền ngoài sản phẩm.
4. **Xử lý dự phòng (Fallback):** Nếu YOLOv8 không nhận diện được vật thể nào, hệ thống tự động sử dụng toàn bộ ảnh gốc và thực hiện cắt tâm (Center Crop 90%).

---

## 2. Image Encoder (Mã Hóa Đặc Trưng Hình Ảnh)

Image Encoder biến đổi bức ảnh sản phẩm đã crop sang một vector số thực đại diện cho các thông tin về kiểu dáng, màu sắc, họa tiết của sản phẩm đó.

### So sánh các mô hình mã hóa ảnh

| Mô hình | Kiến trúc chính | Chiều Vector (Dim) | Điểm mạnh | Điểm yếu | Khuyến nghị |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **CLIP (ViT-B/32)** | Vision-Language | 512 | Hỗ trợ tìm kiếm đa phương thức (ảnh + text), pretrained mạnh. | Kích thước file lớn hơn CNN thông thường. | **Khuyến nghị cho tìm kiếm đa phương thức** ⭐ |
| **DINOv2 (ViT-S/14)**| Self-supervised ViT | 384 | Trích xuất đặc trưng chi tiết vượt trội, không cần gán nhãn khi train. | Chỉ hỗ trợ ảnh, không mã hóa chung với văn bản. | **Khuyến nghị cho tìm kiếm thuần ảnh** ⭐ |
| **EfficientNet-B3** | CNN Encoder | 1536 | Dung lượng rất nhẹ, tốc độ suy luận nhanh nhất, dễ chạy trên CPU. | Khả năng nắm bắt đặc trưng hình học yếu hơn ViT. | Phù hợp khi thiết bị không có GPU |

### Huấn luyện Triplet Loss với DINOv2
Để tối ưu hóa sâu mô hình cho một danh mục sản phẩm cụ thể:
* **Triplet Mining:** Xây dựng tập dữ liệu huấn luyện gồm các bộ ba:
  * **Anchor (A):** Ảnh gốc của sản phẩm A.
  * **Positive (P):** Ảnh chụp ở góc khác hoặc trong điều kiện ánh sáng khác của chính sản phẩm A.
  * **Negative (N):** Ảnh của sản phẩm khác thuộc danh mục khác.
* **Loss Function:** Áp dụng `TripletMarginLoss` với margin `0.3` để kéo gần khoảng cách vector giữa Anchor và Positive, đồng thời đẩy xa khoảng cách với Negative.

---

## 3. Tìm Kiếm Vectơ Với FAISS (Facebook AI Similarity Search)

FAISS thực hiện tìm kiếm láng giềng gần nhất (Approximate Nearest Neighbors - ANN) cực nhanh bằng cách so sánh tích vô hướng (Inner Product) của query vector đã chuẩn hóa với toàn bộ vector kho hàng.

### Chọn loại FAISS Index phù hợp theo quy mô

| Loại Index | Độ chính xác | Tốc độ tìm kiếm | Dung lượng RAM | Phù hợp khi |
| :--- | :---: | :---: | :---: | :--- |
| **IndexFlatIP** | **100% (Exact match)**| **$O(N)$** | Thấp | Catalog `< 50.000` sản phẩm (Đồ án nên dùng) ⭐ |
| **IndexIVFFlat** | ~95% | $O(\sqrt{N})$ | Thấp | Catalog từ `50.000` đến `500.000` sản phẩm |
| **IndexHNSW32** | ~96% | $O(\log N)$ | Cao | Catalog `> 500.000` sản phẩm, yêu cầu tốc độ tối đa |

---

## 4. Quy Trình Đánh Giá & API Serving

### Các chỉ số đánh giá chất lượng tìm kiếm ảnh

| Metric | Phương pháp tính toán | Ngưỡng đạt |
| :--- | :--- | :---: |
| **Recall@10** | Tỷ lệ ảnh chính xác của cùng một sản phẩm xuất hiện trong Top-10 kết quả trả về. | **> 0.70** |
| **mAP@10** | Mean Average Precision tại Top-10. Đánh giá tính chính xác của thứ tự sắp xếp kết quả. | **> 0.60** |
| **Latency** | Thời gian phản hồi API từ khi nhận ảnh đến khi trả kết quả (bao gồm cả YOLO detect + Crop + Encode + FAISS). | **< 300ms** |

### So sánh hiệu năng thực tế (Benchmark)

| Mô hình mã hóa | Recall@5 | Recall@10 | mAP@10 | Tốc độ suy luận (Inference) |
| :--- | :---: | :---: | :---: | :---: |
| **CLIP ViT-B/32** | **0.71** | **0.83** | **0.67** | ~50ms |
| **DINOv2 ViT-S/14**| 0.68 | 0.80 | 0.64 | ~45ms |
| **EfficientNet-B3** | 0.52 | 0.67 | 0.51 | ~20ms |

### Thiết kế API Serving (FastAPI)
* `POST /search/image`
  * Nhận file ảnh từ client tải lên.
  * Trả về danh sách Top-10 sản phẩm tương đồng kèm tọa độ Bounding Box của sản phẩm chính phát hiện được trên ảnh gốc.
  * Latency: `< 250ms` (với model load sẵn trong RAM khi khởi động server).
* `GET /items/{item_id}/similar`
  * Trả về danh sách sản phẩm tương đồng về mặt hình ảnh với sản phẩm đang xem. Kết quả được tính toán offline hàng ngày và lưu cache để đạt thời gian phản hồi cực nhanh `< 20ms`.

> [!TIP]
> **Điểm cộng tối đa (Tìm kiếm đa phương thức - Multi-modal Search):** Sử dụng sức mạnh kết hợp của mô hình **CLIP**: Mã hóa ảnh query bằng Image Encoder thành $v_{\text{img}}$, mã hóa đoạn mô tả đi kèm (ví dụ: *"màu đen"*) bằng Text Encoder thành $v_{\text{txt}}$. Tính toán vector truy vấn tổng hợp:
> $$v_{\text{query}} = 0.7 \times v_{\text{img}} + 0.3 \times v_{\text{txt}}$$
> Thực hiện tìm kiếm trên FAISS bằng $v_{\text{query}}$. Người dùng có thể tìm kiếm thông minh dạng: Tải lên ảnh chiếc túi xách + gõ thêm *"màu hồng"* để tìm các sản phẩm tương tự có màu hồng.
