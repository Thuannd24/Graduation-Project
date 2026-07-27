# data-seed

Sinh dữ liệu user/order/hành vi **tổng hợp** (synthetic) để mở khóa phần ML của tính năng churn-risk
detection. Xem thiết kế đầy đủ ở [`docs/canvas/churn-risk-implementation-plan.md`](../../docs/canvas/churn-risk-implementation-plan.md) Phase 3.

## Vì sao cần tool này

`KMeans`/classifier cần dữ liệu đủ lớn để có ý nghĩa thống kê (tối thiểu vài trăm user có lịch sử
mua). Hệ thống hiện chỉ có vài chục user/đơn tạo tay khi test — không đủ. Script này sinh ~500 user,
~3.000 đơn hàng trải trên 12 tháng, và hành vi (xem/thêm giỏ) nhất quán với đơn hàng, theo tiến
trình có **tham số ẩn** (tần suất mua, độ nhạy giá, xu hướng rời bỏ theo thời gian) — trạng thái
"rời bỏ" xuất hiện tự nhiên từ mô phỏng, không dán nhãn tay lên user nào (tránh suy luận vòng tròn
khi đánh giá model ở Phase 5).

## ⚠️ Giới hạn quan trọng

Dữ liệu là **tổng hợp**, không phải hành vi người dùng thật. Metric đo được từ model train trên
dữ liệu này phản ánh *"model có phục hồi được cấu trúc sinh dữ liệu hay không"*, **không phải**
*"model dự đoán đúng hành vi người thật"*. Nói rõ điều này khi báo cáo/bảo vệ đồ án.

## Yêu cầu trước khi chạy

1. `infra-mariadb` đang chạy: `docker compose -f BE/docker-compose-infra.yml up -d mariadb`
2. Đã import catalog sản phẩm: xem `tools/catalog-import/` (cần có sản phẩm `active=1` trong
   `ecommerce_product_db.products`)
3. Muốn có user đăng nhập demo thật (`--demo-users > 0`, mặc định 10): `infra-keycloak` cũng phải
   chạy.

## Cài đặt & chạy

```bash
cd tools/data-seed
npm install
cp .env.example .env   # chỉnh nếu port/credential khác mặc định

npm run seed:dry-run    # chỉ in thống kê, không ghi DB — kiểm tra phân bố trước khi ghi thật
npm run seed            # ghi DB thật (từ chối nếu đã seed từ trước)
npm run seed:force      # xoá seed cũ rồi sinh lại (idempotent)
npm run cleanup         # chỉ xoá, không sinh lại
```

Tham số tuỳ chỉnh: `node seed.mjs --users 500 --demo-users 10 --months 12 --seed 42`.

## Cấu trúc

- `lib/random.mjs` — PRNG có seed (reproducible) + lấy mẫu phân phối (Poisson, log-normal, Pareto)
- `lib/profiles.mjs` — sinh tham số ẩn từng user (λ mua hàng, có rời bỏ hay không, tháng rời bỏ...)
- `lib/catalog.mjs` — nạp sản phẩm/category thật từ `ecommerce_product_db`
- `lib/simulate.mjs` — mô phỏng đơn hàng + hành vi theo tháng, dựa trên tham số ẩn
- `lib/users.mjs` — tạo user (10 qua Keycloak Admin API để login thật, còn lại chỉ trong DB)
- `lib/writeData.mjs` — ghi `orders`/`order_items`/`user_events` vào `ecommerce_order_db`
- `lib/cleanupData.mjs` — xoá dữ liệu seed (nhận diện qua email `*@seed.internal`/`demo_user_*@demo.local`)

## Xác minh sau khi seed

```sql
-- Phân bố recency/frequency phải lệch thật (không phẳng đều)
SELECT user_id, COUNT(*) AS orders, SUM(total_amount) AS spent
FROM ecommerce_order_db.orders GROUP BY user_id ORDER BY spent DESC LIMIT 20;

SELECT COUNT(*) FROM ecommerce_order_db.user_events;
```
