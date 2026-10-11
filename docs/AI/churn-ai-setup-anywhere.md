# Setup tính năng Churn AI trên MÁY BẤT KỲ (từ con số 0)

> Hướng dẫn này giả định máy đang setup **chưa có gì liên quan tới dự án** — chỉ cần Internet. Nếu
> máy đó CHÍNH LÀ máy đã làm việc này (đã có sẵn Docker/dữ liệu), bỏ qua bước 1–2, vào thẳng bước 5.
>
> Phạm vi: chỉ tính năng **churn AI** (dự đoán rủi ro rời bỏ + tự động phát voucher) — không phải
> toàn bộ hệ thống e-commerce. Muốn setup toàn bộ BE/FE, xem [`README.md`](../../README.md) ở gốc
> repo.

## 0. Cần gì trước khi bắt đầu

| Thứ cần | Vì sao | Lấy ở đâu |
|---|---|---|
| Docker Desktop (bật WSL2 nếu Windows) | Chạy MariaDB/Kafka/forecast-service | docker.com |
| Git | Lấy mã nguồn | git-scm.com |
| Tài khoản Google (xem được thư mục Drive export) | Tải dữ liệu + model đã train | — |
| ≥16GB RAM khuyến nghị | Dữ liệu thật ~2,5GB, cần VM đủ RAM | — |

**Trên Windows, sửa cấu hình RAM cho Docker TRƯỚC khi cài** (tránh lỗi đã gặp: VM mặc định quá nhỏ
gây treo khi xử lý dữ liệu 7+ triệu dòng):

Tạo/sửa file `%USERPROFILE%\.wslconfig`:
```ini
[wsl2]
memory=6GB
swap=2GB
```
(Chỉnh `6GB` theo RAM máy thật — khuyến nghị ≥1/3 tổng RAM máy, tối thiểu 4GB.)

## 1. Lấy mã nguồn (GitHub)

```bash
git clone https://github.com/Thuannd24/Graduation-Project.git
cd Graduation-Project
git checkout feat/multi-category-catalog
```

## 2. Lấy dữ liệu + model đã train (Google Drive)

Thư mục Drive `churn-ai-export/` chứa 6 file (~495MB tổng, đã nén):

| File | Nội dung |
|---|---|
| `ai-forecast-service.tar.gz` | Docker image forecast-service (ĐÚNG phiên bản thư viện đã verify — xem bước 4) |
| `ecommerce_order_db.sql.gz` | Đơn hàng + hành vi REES46 thật (332K user, 7,3 triệu sự kiện) + bảng feature store |
| `ecommerce_product_db.sql.gz` | Catalog Tiki (sản phẩm/danh mục/biến thể) |
| `ecommerce_promotion_db.sql.gz` | Campaign/voucher đã cấu hình |
| `ecommerce_user_db.sql.gz` | Tài khoản user |
| `AI_models.tar.gz` | Model đã train (KMeans + Logistic Regression + hiệu chỉnh isotonic) |

Tải cả 6 file về, đặt trong 1 thư mục bất kỳ trên máy mới, vd `~/churn-ai-export/`.

> File Drive là riêng tư — người sở hữu phải tự chia sẻ link/thêm quyền xem cho tài khoản Google
> của người setup máy mới, nếu đó là người khác.

## 3. Khởi động hạ tầng (MariaDB, Kafka, Redis)

```bash
cd Graduation-Project/BE
docker compose -f docker-compose-infra.yml up -d mariadb kafka redis
```

Đợi ~30 giây cho MariaDB khởi động xong (lần đầu sẽ tự tạo 4 database rỗng qua Flyway nếu các
service Java từng chạy qua — nếu MariaDB hoàn toàn mới chưa có schema, chạy nhanh 1 lần
`docker compose up -d` toàn bộ BE rồi tắt lại để Flyway tạo bảng trước khi qua bước 4).

## 4. Nạp Docker image đã export (KHÔNG rebuild)

```bash
cd ~/churn-ai-export
docker load -i ai-forecast-service.tar.gz
```

**Quan trọng — đừng `docker compose build` lại từ Dockerfile.** Rebuild sẽ cài lại thư viện Python
mới nhất (numpy/pandas/scikit-learn), có thể khác bản đã verify và gây lỗi khác máy gốc — đã gặp
thật: `numpy 2.2.6` trong image gốc có bug `searchsorted` mà bản mới hơn không có (xem
[`churn-risk-log.md`](churn-risk-log.md) mục 2026-10-06). Dùng ĐÚNG image đã nạp.

## 5. Khôi phục dữ liệu

```bash
cd ~/churn-ai-export
for db in order product promotion user; do
  gunzip -c ecommerce_${db}_db.sql.gz | docker exec -i infra-mariadb mysql -uroot -proot ecommerce_${db}_db
done
```

Việc này import ~2,5GB dữ liệu (chủ yếu `ecommerce_order_db`) — có thể mất vài phút tuỳ tốc độ máy.

## 6. Khôi phục model đã train

```bash
tar -xzf ~/churn-ai-export/AI_models.tar.gz -C Graduation-Project/AI/
```

## 7. Chạy forecast-service

```bash
cd Graduation-Project/AI
docker compose -f docker-compose.yml up -d forecast-service
```

## 8. Kiểm tra đã chạy đúng

```bash
# Model đang chạy là model nào, train khi nào, metric bao nhiêu
curl http://localhost:8004/api/v1/models/card

# Phân bố 4 phân khúc khách hàng (At Risk / Loyal / VIP / Lapsed) — số liệu thật
curl http://localhost:8004/api/v1/admin/analytics/segmentation

# Chạy thử quét rủi ro + phát voucher thật (có thể mất 1-3 phút)
curl -X POST http://localhost:8004/api/v1/risk/trigger-scan
```

`trigger-scan` trả về dạng:
```json
{"status": "SUCCESS", "scored_users": 332349, "in_population": 17737,
 "at_risk_candidates": 10563, "eligible": 0, "published": 0, ...}
```
Nếu chạy đúng, bạn sẽ thấy số liệu tương tự (không nhất thiết giống hệt nếu dữ liệu import thiếu).

## ⚠️ Vì sao `published` luôn = 0 khi demo

Dữ liệu REES46 là **lịch sử đóng băng tới 2026-10-01**. Quy tắc "có vừa bỏ giỏ hàng gần đây"
(`has_recent_abandoned_cart`) so sánh với đồng hồ THẬT của máy đang chạy (`NOW()`) — nếu máy demo
chạy sau ngày đó (gần như chắc chắn), sẽ không có user nào "vừa" làm gì cả trong 24h gần "hiện tại
thật" → **0 voucher được phát, nhưng đây là ĐÚNG, không phải lỗi.**

Muốn demo thấy voucher thật được phát, chọn 1 trong 2 cách:
1. Chỉnh đồng hồ hệ thống máy demo về trong khoảng dữ liệu (≤ 2026-10-01), HOẶC
2. Chèn thủ công vài dòng `user_events` với `created_at` = thời điểm hiện tại thật (action_type
   `ADD_TO_CART`), cho vài user có sẵn trong bảng `orders` — risk-scan lần sau sẽ thấy và xử lý
   đúng những user đó.

## Giới hạn khác cần biết

- Phần lớn user REES46 là tài khoản nội bộ (`rees_<id>@rees46.internal`), **không đăng nhập được**
  qua FE thật.
- Danh sách đầy đủ mọi giới hạn: [`churn-risk-feature-overview.md`](churn-risk-feature-overview.md)
  mục 6.
- Toàn bộ quá trình xây dựng + mọi số đo gốc: [`churn-risk-log.md`](churn-risk-log.md).
