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

## Hành vi được neo vào dữ liệu người dùng THẬT (từ 2026-09-22)

Cấu trúc **bên trong mỗi phiên duyệt web** không đoán tay mà lấy mẫu theo đúng phân phối đo được
từ 2 bộ dữ liệu người dùng thật, chỉ lấy thống kê **không phụ thuộc catalog cụ thể** (catalog của
2 bộ đó là mỹ phẩm/sàn tổng hợp, khác catalog điện thoại/laptop của platform):

| Nguồn | Quy mô | Vai trò |
|---|---|---|
| REES46 Cosmetics | 4,5 triệu phiên THẬT (có session_id) | nguồn chính cho cấu trúc phiên |
| Taobao UserBehavior | 100 triệu sự kiện (phiên suy luận) | kiểm chứng chéo |

Số đo + quy tắc đối chiếu 2 nguồn nằm ở **1 chỗ duy nhất**: `lib/behaviorTargets.mjs` (chi tiết:
`docs/canvas/recsys-execution-plan.md` §5.9). Sinh đủ **19 loại hành vi** khớp tracker của hệ thống
(`AI/shared-common/shared_common/contracts.py`), gắn đúng vị trí trong phễu mua hàng.

Tần suất/tháng theo từng user (λ mua hàng, suy giảm khi rời bỏ, "phân vân" trước churn) vẫn là
tiến trình tham số ẩn như ban đầu — phần neo vào dữ liệu thật là **nội dung mỗi phiên**.

## Báo cáo độ trung thực (tự kiểm tra)

Mọi lần chạy (kể cả `--dry-run`) in bảng so dữ liệu SINH RA với số đo thật, bằng **đúng định nghĩa**
đã dùng khi đo REES46/Taobao (`lib/fidelity.mjs`) — cộng các ngưỡng chống tái phát lỗi cũ
(bản trước ép cứng "xem X → thêm giỏ X" 100%, khiến 1 quy tắc tầm thường thắng mọi model).
`--dry-run` trả exit code 2 nếu có mục không đạt → dùng làm cổng kiểm tra trước khi ghi DB thật.

```bash
npm test               # test tự động, KHÔNG cần DB (catalog giả cùng hình dạng catalog thật)
npm run seed:dry-run   # báo cáo độ trung thực trên catalog THẬT, không ghi DB
```

## ⚠️ Giới hạn quan trọng

Dữ liệu là **tổng hợp**, không phải hành vi người dùng thật. Metric đo được từ model train trên
dữ liệu này phản ánh *"model có phục hồi được cấu trúc sinh dữ liệu hay không"*, **không phải**
*"model dự đoán đúng hành vi người thật"*. Nói rõ điều này khi báo cáo/bảo vệ đồ án.

- Cấu trúc phiên khớp số đo thật, nhưng đó là **thống kê biên** (từng chỉ số riêng lẻ) — các tương
  quan phức tạp hơn giữa nhiều chỉ số cùng lúc không được đảm bảo.
- 14 vi hành vi (SEARCH, FILTER_APPLIED, IMPRESSION, SCROLL_DEPTH...) **không có số đo thật** — 2 bộ
  dữ liệu công khai không ghi nhãn các hành vi này. Tần suất là ước lượng có lý do gắn với phễu mua
  hàng (xem comment trong `lib/simulate.mjs`), không phải số đo.

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

Tham số tuỳ chỉnh: `node seed.mjs --users 500 --demo-users 10 --months 12 --seed 42 --chunk 250`.

Sinh **theo lô user** (`--chunk`, mặc định 250): bộ nhớ tỉ lệ theo kích thước lô chứ không theo
tổng số user (bản cũ dồn toàn bộ sự kiện vào 1 mảng — 5.000 user × 19 hành vi ≈ 6,6 triệu object,
tiến trình node >2GB). Mỗi user ~1.500 sự kiện/12 tháng (IMPRESSION chiếm phần lớn).

## Cấu trúc

- `lib/random.mjs` — PRNG có seed (reproducible) + lấy mẫu phân phối (Poisson, log-normal, Pareto)
- `lib/profiles.mjs` — sinh tham số ẩn từng user (λ mua hàng, có rời bỏ hay không, tháng rời bỏ...)
- `lib/catalog.mjs` — nạp sản phẩm/category thật từ `ecommerce_product_db`
- `lib/simulate.mjs` — mô phỏng đơn hàng + hành vi theo tháng (tham số ẩn) + nội dung từng phiên
  (neo vào số đo thật, 19 loại hành vi)
- `lib/behaviorTargets.mjs` — số đo từ dữ liệu người dùng thật + dung sai (nguồn sự thật duy nhất)
- `lib/fidelity.mjs` — đo dữ liệu sinh ra, so với `behaviorTargets.mjs`
- `test/` — test tự động (`npm test`), không cần DB
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
