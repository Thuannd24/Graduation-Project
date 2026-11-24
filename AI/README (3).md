# Hướng dẫn khôi phục churn AI trên máy khác (export 2026-10-06)

File export nằm ở Google Drive, thư mục `churn-ai-export/`:

| File | Nội dung | Kích thước (nén) |
|---|---|---|
| `ai-forecast-service.tar.gz` | Docker image forecast-service (đúng phiên bản thư viện đã verify) | ~325MB |
| `ecommerce_order_db.sql.gz` | Đơn hàng + sự kiện hành vi REES46 thật + bảng feature store | ~147MB |
| `ecommerce_product_db.sql.gz` | Catalog Tiki (sản phẩm, danh mục, biến thể) | ~6MB |
| `ecommerce_promotion_db.sql.gz` | Campaign/voucher | ~17KB |
| `ecommerce_user_db.sql.gz` | Tài khoản user | ~15MB |
| `AI_models.tar.gz` | Model đã train (KMeans + Logistic Regression + hiệu chỉnh) | ~346KB |

## Các bước khôi phục trên máy mới

### 1. Cài đặt nền tảng
- Docker Desktop + WSL2.
- Cấu hình `.wslconfig` theo RAM máy mới (khuyến nghị ≥6GB nếu máy có ≥16GB RAM — **đừng** để mặc
  định 2GB, dễ gây treo/chậm bất thường khi xử lý dữ liệu thật quy mô lớn, xem
  `churn-risk-log.md` mục 2026-10-06).

### 2. Mã nguồn
```bash
git clone <repo> Graduation-Project
cd Graduation-Project
```

### 3. Nạp lại Docker image (KHÔNG rebuild từ Dockerfile)
```bash
docker load -i ai-forecast-service.tar.gz
```
Quan trọng: dùng đúng image đã export, không `docker compose build` lại — rebuild có thể kéo phiên
bản thư viện mới hơn (numpy/pandas/scikit-learn) và gây lỗi khác môi trường production đã verify
(xem bug đã gặp 2026-10-06 trong `churn-risk-log.md`).

### 4. Khởi động hạ tầng (Kafka, MariaDB...)
```bash
cd BE && docker compose -f docker-compose-infra.yml up -d mariadb kafka redis
```

### 5. Khôi phục dữ liệu
```bash
for db in order product promotion user; do
  gunzip -c ecommerce_${db}_db.sql.gz | docker exec -i infra-mariadb mysql -uroot -proot ecommerce_${db}_db
done
```
(Cần tạo sẵn 4 database rỗng trước nếu MariaDB mới hoàn toàn — xem schema init trong
`BE/*/src/main/resources/db/migration/` hoặc để Flyway của các service Java tự tạo khi khởi động,
rồi mới import dữ liệu đè lên.)

### 6. Khôi phục model đã train
```bash
tar -xzf AI_models.tar.gz -C AI/
```

### 7. Chạy forecast-service
```bash
cd AI && docker compose -f docker-compose.yml up -d forecast-service
```

### 8. Kiểm tra
```bash
curl http://localhost:8004/api/v1/models/card              # xem model/metric đang chạy
curl -X POST http://localhost:8004/api/v1/risk/trigger-scan # chạy thử risk-scan thật
curl http://localhost:8004/api/v1/admin/analytics/segmentation
```

## Giới hạn cần biết khi demo trên máy mới

- Dữ liệu REES46 là **lịch sử đóng băng tới 2026-10-01** — nếu đồng hồ máy demo đã qua ngày đó,
  quy tắc "vừa bỏ giỏ hàng gần đây" (`has_recent_abandoned_cart`, so với `NOW()` thật) sẽ **không
  khớp ai cả** → risk-scan chạy đúng nhưng **không phát voucher nào**. Đây là hành vi đúng theo dữ
  liệu, không phải lỗi (xem `churn-risk-feature-overview.md` mục 3.7). Muốn demo thấy voucher được
  phát thật, cần chỉnh đồng hồ hệ thống về trong khoảng dữ liệu (≤ 2026-10-01), hoặc chèn thêm vài
  sự kiện giỏ hàng thủ công với `created_at` = thời điểm hiện tại thật.
- Phần lớn user REES46 là tài khoản nội bộ (`rees_<id>@rees46.internal`), **không đăng nhập được**
  qua FE thật — demo UI khách hàng cần dùng đúng nhóm user thật đã tạo trước đó.
- Xem đầy đủ giới hạn khác: `docs/canvas/churn-risk-feature-overview.md` mục 6.

Chi tiết toàn bộ quá trình xây dựng + mọi số đo: `docs/canvas/churn-risk-log.md`.
