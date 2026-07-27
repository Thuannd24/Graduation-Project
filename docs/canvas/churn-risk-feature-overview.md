# Tính năng: Phát hiện nguy cơ rời bỏ & tự động kích hoạt campaign

> Tài liệu mô tả tính năng (feature overview) — khác với
> [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) (kế hoạch triển khai
> theo phase, dành cho lúc code). File này để giải thích tính năng cho người đọc sau (báo cáo,
> bảo vệ đồ án), tập trung vào **AI được dùng chính xác ở đâu**.

## 1. Tính năng làm gì (góc nhìn người dùng cuối)

User đăng nhập → xem sản phẩm, thêm giỏ hàng → **không thanh toán** → hệ thống tự phát hiện đây
là dấu hiệu có thể rời bỏ (churn) → **tự động** kích hoạt 1 chiến dịch khuyến mãi cá nhân hóa
(voucher/email) cho đúng user đó, không cần admin phải rà soát thủ công từng khách hàng.

Kết quả nhìn thấy được: admin vào **Coupon Code** (tab campaign builder trên FE) tạo 1 campaign
với trigger "Nguy cơ rời bỏ (AI)" → dựng hành động (tặng voucher/gửi email) → activate → từ đó về
sau, hệ thống tự chạy, admin không cần làm gì thêm cho từng khách hàng cụ thể.

## 2. Sơ đồ luồng hoạt động

```
FE (xem SP / giỏ hàng)
   │  HTTP request có header X-User-Id (Keycloak UUID)
   ▼
product-service / order-service  ──publish──▶  Kafka
   (ProductViewedEvent /                        (product-viewed-events,
    CartUpdatedEvent)                            cart-updated-events)
                                                      │
                                                      ▼
                                        forecast-service (Python)
                                        ┌─────────────────────────────┐
                                        │ behavior_consumer.py        │  ghi Redis (lịch sử xem,
                                        │ (ghi nhận hành vi thô)       │  dùng chung với recs-service)
                                        └─────────────────────────────┘  + bảng user_events (MySQL)
                                                      │
                                        (định kỳ, KHÔNG mỗi request)
                                                      ▼
                                        ┌─────────────────────────────┐
                                        │ risk_scheduler.py            │
                                        │  → risk_scoring.predict()    │  ★★★ AI Ở ĐÂY (mục 3) ★★★
                                        │  → lọc "At Risk" + xác suất  │
                                        │    + có bỏ giỏ hàng gần đây  │
                                        └─────────────────────────────┘
                                                      │  publish
                                                      ▼
                                        Kafka (user-risk-events)
                                                      │
                                                      ▼
                                promotion-service (Java, Camunda 7)
                                ┌─────────────────────────────────────┐
                                │ PromotionKafkaConsumer                │
                                │  → CampaignTriggerService             │  rule cứng, KHÔNG phải AI
                                │  → tìm campaign khớp trigger           │  (if event đến → chạy workflow)
                                │  → chạy Process Instance Camunda      │
                                └─────────────────────────────────────┘
                                                      │
                                                      ▼
                                  Voucher / Email cá nhân hóa cho user
```

## 3. AI được dùng chính xác ở đâu — KHÔNG ở đâu khác

Đây là điểm quan trọng nhất khi giải thích tính năng: **chỉ 1 bước trong toàn bộ pipeline là AI
thật (machine learning tự học từ dữ liệu)**, mọi bước còn lại là hạ tầng/automation thuần.

| Bước | File | Có phải AI không? |
|---|---|---|
| Ghi nhận hành vi (xem SP, thêm giỏ) | `ProductController.java`, `CartServiceImpl.java` | ❌ Chỉ là ghi log (ETL) |
| Đưa hành vi vào Redis/DB | `AI/forecast-service/app/kafka/behavior_consumer.py` | ❌ Chỉ copy dữ liệu, không tính toán |
| **Tính điểm rủi ro rời bỏ** | `AI/forecast-service/app/training/train.py` + `app/services/risk_scoring.py` | ✅ **CHỈ ĐÂY** |
| Lọc điều kiện kích hoạt (có bỏ giỏ hàng gần đây) | `AI/forecast-service/app/services/risk_scheduler.py` | ❌ Rule tay (`if... then...`) |
| Publish sự kiện, tìm campaign, chạy Camunda | `risk_producer.py`, `PromotionKafkaConsumer.java`, `CampaignTriggerService.java` | ❌ Automation/workflow engine thuần |

### 3.1. Cơ chế AI cụ thể: 2 mô hình học máy phối hợp

**Mô hình 1 — KMeans clustering (không giám sát):** tự nhóm user thành 4 cụm hành vi dựa trên
**11 đặc trưng** (không phải rule tay `if recency > 30 ngày`), rồi gán nhãn ngữ nghĩa (`VIP
Champions`, `At Risk`, `New Customers`, `Potential Loyalists`) bằng cách so sánh trung bình từng
cụm với trung bình toàn cục. Ranh giới "thế nào là rủi ro" **tự dịch chuyển theo phân bố dữ liệu
thật**, không cố định trong code.

**Mô hình 2 — Logistic Regression (có giám sát):** dự đoán **xác suất** user sẽ churn (0.0–1.0),
train trên nhãn sinh theo temporal split (xem mục 3.3) — cho phép đánh giá bằng precision/recall/
AUC, thứ mà rule tay không có.

11 đặc trưng đầu vào (định nghĩa 1 lần duy nhất tại
`AI/shared-common/shared_common/features/`, dùng chung cho cả 2 model):

| Nhóm | Đặc trưng |
|---|---|
| Từ đơn hàng (`orders`) | recency, frequency, monetary, avg_order_value, cancel_rate, discount_dependency |
| Từ hành vi (`user_events`) | recent_view_count, days_since_last_activity, cart_abandon_count, view_to_cart_conversion_rate, category_diversity_viewed |

### 3.2. Vì sao 2 model, không phải 1 rule if-else

Một rule tay kiểu `if days_since_last_activity > 7 and cart_abandon: at_risk = true` **hoàn toàn
làm được**, và với 1 biến thì rule tay còn dễ kiểm soát hơn. Giá trị thật của ML xuất hiện khi có
**nhiều biến tương tác cùng lúc** (11 chiều) — ranh giới "thế nào là rủi ro" không phải 1 ngưỡng
đơn, mà là 1 mặt phân cách nhiều chiều mà con người đoán tay rất dễ sai. KMeans tìm ranh giới đó
từ đúng phân bố dữ liệu của hệ thống này, và **tự cập nhật lại mỗi lần train** (không đứng yên như
ngưỡng viết cứng) khi hành vi khách hàng thay đổi theo thời gian.

### 3.3. Tránh suy luận vòng tròn khi đánh giá model

Nhãn churn **không** dán tay lên user nào — sinh từ 6 mốc thời gian cắt (60–210 ngày trước hiện
tại, cách nhau 30 ngày): tại mỗi mốc, tính feature từ dữ liệu **đến mốc đó**, nhãn = 1 nếu user
**không hoạt động gì** trong 30 ngày sau mốc. Mốc gần nhất giữ lại làm tập test (temporal holdout,
không random split) — mô phỏng đúng tình huống thật: model chỉ thấy quá khứ, đánh giá trên
"tương lai" so với lúc train.

**Kết quả đo được trên dữ liệu seed thật** (500 user, xem mục 5): `precision=0.62, recall=0.97,
f1=0.76, AUC=0.93, silhouette=0.29`. AUC 0.93 nghĩa là model phân biệt tốt user sẽ churn với
user không churn — cao hơn nhiều so với đoán ngẫu nhiên (AUC 0.5).

### 3.4. Không refit liên tục — tách huấn luyện khỏi vận hành

Một lỗi thường gặp: nếu model tự fit lại mỗi lần được gọi, tâm cụm dịch chuyển liên tục → user
"At Risk" giờ này có thể hết "At Risk" giờ sau chỉ vì khởi tạo lại, không phải vì hành vi đổi thật.
Thiết kế ở đây tách biệt:
- `POST /api/v1/models/train` — nơi DUY NHẤT model được fit, chạy tay/định kỳ (vd hàng ngày).
- `risk_scheduler.py` — chỉ **predict** bằng model đã lưu (`shared_common/registry.py`), không
  bao giờ tự fit lại.

## 4. Các thành phần hệ thống liên quan

| Service | Vai trò trong tính năng này |
|---|---|
| `product-service`, `order-service` (Java) | Ghi nhận hành vi thô, publish Kafka |
| `forecast-service` (Python/FastAPI) | Toàn bộ AI: ingest hành vi, train, predict, publish sự kiện rủi ro |
| `promotion-service` (Java/Camunda 7) | Nhận sự kiện, chạy campaign đã cấu hình sẵn (BPMN) |
| FE Campaign Builder (tab **"Coupon Code"**, tên hiển thị không khớp tên chức năng thật) | Nơi admin dựng campaign với trigger "Nguy cơ rời bỏ (AI)" |

## 5. Vận hành / kiểm thử

```bash
# 1. Sinh dữ liệu (nếu chưa có) — xem tools/data-seed/README.md
node tools/data-seed/seed.mjs --demo-users 10

# 2. Train model (nơi DUY NHẤT model được fit)
curl -X POST http://localhost:8004/api/v1/models/train

# 3. Chạy risk-scan (bình thường chạy tự động theo lịch, gọi tay để test/demo)
curl -X POST http://localhost:8004/api/v1/risk/trigger-scan

# 4. Xem Process Instance Camunda đã chạy
# Camunda Cockpit: http://localhost:8087/camunda/app/cockpit/
```

Admin tạo campaign qua FE: **Coupon Code** → New Campaign → Trigger = "Nguy cơ rời bỏ (AI)" →
Action = tặng voucher/gửi email → Activate.

## 6. Giới hạn đã biết (nói rõ khi báo cáo)

- **Dữ liệu seed là tổng hợp (synthetic)** — metric (AUC 0.93...) đo việc model có phục hồi được
  cấu trúc sinh dữ liệu hay không, **không phải** đo việc dự đoán đúng hành vi người thật.
- Chỉ hoạt động chính xác với **user đã đăng nhập** (có Keycloak UUID thật) — khách vãng lai dùng
  chung 1 định danh `anonymous`, bị bỏ qua có chủ đích.
- Voucher/email cần `user-service` chạy để resolve `userId` (Keycloak UUID) sang thông tin liên hệ
  — nếu service này không chạy, campaign vẫn trigger đúng (Camunda Process Instance vẫn chạy)
  nhưng bước phát voucher cuối cùng sẽ bị bỏ qua.

## Xem thêm

- [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) — kế hoạch/nhật ký
  triển khai chi tiết theo 7 phase, kèm ghi chú lệch phát sinh khi code.
- [`recommendation-complete.md`](recommendation-complete.md) — blueprint gốc (ý tưởng ban đầu,
  trước khi có phát hiện về thiếu dữ liệu/hạ tầng dẫn tới bản kế hoạch thực tế ở trên).
