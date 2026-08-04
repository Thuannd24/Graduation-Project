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
                                        ┌──────────────────────────────────────┐
                                        │ risk_scheduler.py                     │
                                        │  → risk_scoring.predict()             │ ★★ AI Ở ĐÂY (mục 3) ★★
                                        │  tầng 0: dân số ≥2 đơn DELIVERED      │ (khớp dân số train)
                                        │  tầng 1: segment "At Risk" + xác suất │ ← AI
                                        │          đã hiệu chỉnh ≥ ngưỡng       │
                                        │  tầng 2: có bỏ giỏ hàng gần đây       │ ← rule (thời điểm)
                                        │  tầng 3: xếp hạng theo tổn thất kỳ    │ ← quyết định
                                        │          vọng, cắt theo ngân sách     │   (mục 3.5)
                                        └──────────────────────────────────────┘
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
**11 đặc trưng** (không phải rule tay `if recency > 30 ngày`). Việc **gán nhãn** cho cụm thì dùng
chính `churn_label` đo được: cụm có **tỉ lệ churn thực đo cao nhất** được gọi `At Risk`, 3 cụm còn
lại đặt tên theo hạng giá trị (`VIP Champions` → `Loyal Regulars` → `Lapsed`). Đo thực:

| Phân khúc | Số dòng | **Tỉ lệ churn đo được** | monetary TB | recency TB |
|---|---|---|---|---|
| **At Risk** | 262 | **0.4618** | 111.598.531 | **62.9** |
| Lapsed | 360 | 0.4139 | 101.402.514 | 53.8 |
| VIP Champions | 549 | 0.1439 | 238.873.286 | 26.4 |
| Loyal Regulars | 266 | 0.1053 | 218.180.801 | 15.9 |

Nhóm `At Risk` có tỉ lệ churn **4,4×** nhóm `Loyal Regulars` (chênh lệch 0.3565) — nên việc dùng
`segment` làm cổng lọc là **có cơ sở đo được**, không phải phỏng đoán. Ranh giới tự dịch chuyển theo
phân bố dữ liệu thật, không cố định trong code.

> Cách gán nhãn cũ (so trung bình từng cụm với trung bình toàn cục, rồi khớp với 4 "archetype" tự vẽ)
> **đã bị loại sau khi đo thấy nó sai**: nó từng gán nhãn `New Customers` cho nhóm giá trị **cao
> nhất**, và đẩy `At Risk` vào nhóm giá trị **thấp nhất** → phát voucher sai đối tượng. Lý do: các
> archetype đó giả định tồn tại nhóm "chưa từng mua", vốn không còn sau khi siết dân số (mục 3.3).
> Panel huấn luyện **có nhãn**, nên gán theo tỉ lệ churn đo được thì không cần đoán.

**Mô hình 2 — Logistic Regression (có giám sát) + hiệu chỉnh xác suất:** dự đoán **xác suất** user sẽ
churn (0.0–1.0), train trên nhãn sinh theo temporal split (xem mục 3.3) — cho phép đánh giá bằng
precision/recall/AUC, thứ mà rule tay không có. Xác suất được **hiệu chỉnh** (mục 3.5) vì bản thô bị
lệch hệ thống, và toàn bộ tầng quyết định (xếp hạng theo tổn thất kỳ vọng) dựa trên xác suất này.

11 đặc trưng đầu vào (định nghĩa 1 lần duy nhất tại
`AI/shared-common/shared_common/features/`, dùng chung cho cả 2 model):

| Nhóm | Đặc trưng |
|---|---|
| Từ đơn hàng (`orders`) | recency, frequency, monetary, avg_order_value, cancel_rate, discount_dependency |
| Từ hành vi (`user_events`) | recent_view_count, days_since_last_activity, cart_abandon_count, view_to_cart_conversion_rate, category_diversity_viewed |

### 3.2. Vì sao 2 model, không phải 1 rule if-else — **đo bằng số, không lập luận suông**

Bản trước của mục này chỉ lập luận bằng lời. Nay đã có benchmark thật
(`AI/forecast-service/app/training/rule_benchmark.py`, endpoint `POST /api/v1/models/rule-benchmark`).

**Nguyên tắc để không tự lừa mình:** không tự chọn một rule yếu rồi đánh bại nó. Benchmark **quét lưới**
tìm rule TỐT NHẤT ở 3 mức phức tạp — rule 1 biến (mọi feature × 2 chiều × 19 mốc phân vị), rule 2 điều
kiện AND (55 cặp × 4 chiều × lưới 9×9 ≈ 17,8k ứng viên/fold), và cây quyết định giới hạn độ sâu (tập
rule **tối ưu do máy tìm**). Mọi phương pháp đều **chọn ngưỡng trên tập train, đo trên tập test**, và
dùng **cùng bộ fold** grouped CV.

> **Số dưới đây đo lại ngày 2026-08-03, sau khi seed lại dữ liệu** (làm giàu session/nhịp giờ — xem
> `churn-risk-log.md` mục Tầng 1). Panel: 332 user / 1.395 dòng / churn rate 0.2401 — khác nhẹ so với
> panel 342 user của model đang chạy production (mục 3.3), vì retrain trên dữ liệu mới bị **retrain
> gate từ chối** (AUC mới thấp hơn ngưỡng an toàn) nên production vẫn giữ model cũ; bảng dưới đây đo
> trên panel MỚI để kiểm tra kết luận rule-vs-AI có đứng vững qua một lượt lấy mẫu khác không. Các số
> L1-path/cây sâu ở cuối mục (từ `ablation.py`) chưa được đo lại trong lượt này, vẫn là số cũ.

| Baseline | F1 | AUC (xếp hạng) |
|---|---|---|
| **Rule viết tay** `days_inactive>7 AND cart_abandon>=1` | **0.108** ± 0.0774 | không xếp hạng được |
| **Rule viết tay** `recency>30 AND cart_abandon>=2` (RFM kinh điển) | **0.0452** ± 0.0585 | không xếp hạng được |
| **Rule viết tay** `recency>90` | 0.41 ± 0.0835 | không xếp hạng được |
| Rule 1 biến, quét lưới → `days_since_last_activity >= 13` (thay đổi theo fold) | 0.5594 ± 0.103 | 0.7494 ± 0.0884 |
| Rule 2 điều kiện AND, quét lưới | **0.5862 ± 0.1285** | không xếp hạng được |
| Cây quyết định sâu 1 | 0.5268 ± 0.1177 | 0.6735 ± 0.0638 |
| Cây quyết định sâu 2 | 0.5268 ± 0.1177 | 0.7502 ± 0.0702 |
| Cây quyết định sâu 3 | 0.4561 ± 0.1001 | 0.6781 ± 0.0924 |
| **Model (LR 11 đặc trưng + hiệu chỉnh)** | 0.6033 ± 0.0492 | 0.7738 ± 0.0596 |

**Kết luận, xếp theo độ mạnh/độ bền của lập luận (đã kiểm tra lại qua 2 lượt lấy mẫu khác nhau):**

1. **Rule KHÔNG xếp hạng được — đây là luận điểm chính, đứng vững ở CẢ 2 lượt đo.** Rule trả nhãn nhị
   phân ⇒ không có xác suất để nhân với giá trị khách hàng ⇒ **không thể phân bổ ngân sách voucher theo
   tổn thất kỳ vọng** (mục 3.5), bất kể F1 bao nhiêu. Đây là khác biệt về **NĂNG LỰC** (rule không có cơ
   chế sinh ra xác suất liên tục), không phụ thuộc bộ dữ liệu hay lượt lấy mẫu nào — nên là chỗ dựa chắc
   nhất khi bảo vệ, thay vì so F1.
2. **Rule mà người ta THỰC SỰ viết tay thì thảm hại.** Ví dụ nêu trong tài liệu này cho F1 chỉ
   **0,108–0,41** tuỳ cách viết; kém xa rule đã quét lưới tìm ra (0,586). Rule tốt phải được **quét lưới
   + chia fold + giữ tập test** để tìm ra — tức đúng bộ máy của ML, không phải "viết vài câu SQL".
3. **Margin F1 model-vs-rule là thật nhưng KHÔNG BỀN qua lượt lấy mẫu khác — phải nói rõ điều này.** Lượt
   đo đầu (dữ liệu seed cũ): model hơn rule tốt nhất +0,0519 F1, vượt sàn nhiễu ±0,0240. Lượt đo lại sau
   khi seed lại dữ liệu (cùng cơ chế sinh, khác lượt lấy mẫu ngẫu nhiên): margin chỉ còn **+0,0171, NẰM
   TRONG sàn nhiễu ±0,0492** — không phân biệt được với ngẫu nhiên. Kết luận trung thực: margin F1 giữa
   model và rule-đã-tối-ưu là **giòn** (nhạy với lượt seed cụ thể), nên **không nên dùng làm luận điểm
   chính**; dùng điểm 1 (năng lực xếp hạng) làm trụ cột thay vì con số F1 đẹp của 1 lần đo.
4. **Model vẫn ổn định hơn rule ở cả 2 lượt** (std F1 model 0,024–0,049 so với 0,077–0,129 của rule) —
   rule rất nhạy với nhóm user cụ thể được đánh giá, model thì không, dù biên độ chênh lệch nhỏ hơn.

**Nhiều chiều có thực sự cần?** Đo bằng L1 path: giữ **1 đặc trưng** → AUC 0.8030 ± 0.0239; giữ **9
đặc trưng** → AUC 0.8414 ± 0.0172. Chênh **0.0384 > sàn nhiễu 0.0297** ⇒ nhiều chiều **có ích thật**.
Ghi chú trung thực: với định nghĩa nhãn cũ (mục 3.3) thì ~2 đặc trưng đã đạt AUC không phân biệt được
với 11 đặc trưng — tức lập luận "mặt phân cách nhiều chiều" khi đó **không** được số liệu ủng hộ. Nó chỉ
đứng vững sau khi sửa định nghĩa nhãn.

Và cây sâu 3 **kém hơn** cây sâu 1/2 (0.6015 vs 0.6370) — thêm độ phức tạp rule không giúp gì, với
~1150 dòng train đã bắt đầu overfit.

### 3.3. Định nghĩa nhãn churn và cách đánh giá

Nhãn churn **không** dán tay lên user nào. Định nghĩa hiện tại (`LABEL_VERSION =
churn_label_v2_orders_120d_min2`):

- Sinh từ **5 mốc thời gian cắt** (150–270 ngày trước hiện tại, cách nhau 30 ngày). Tại mỗi mốc, tính
  đặc trưng từ dữ liệu **đến mốc đó**.
- **Nhãn = 1 nếu user không ĐẶT ĐƠN nào trong 120 ngày sau mốc.**
- Chỉ tính trên **user có ≥2 đơn `DELIVERED`** — user chưa từng mua hoặc mới mua 1 lần thì không thể là
  "khách mua hàng đã rời bỏ", và cũng không phải đối tượng của campaign cứu khách.

Panel thu được: **1437 dòng / 342 user / tỉ lệ churn 0.2624**.

> **Định nghĩa cũ đã bị thay, và đây là lý do — cần nêu khi bảo vệ.** Bản đầu dùng nhãn "không có hoạt
> động nào (**xem HOẶC mua**) trong 30 ngày tới", lấy từ `orders` ∪ `user_events`. Nhưng đặc trưng mạnh
> nhất (`category_diversity_viewed` = số category **xem** trong 30 ngày qua) cũng lấy từ `user_events`
> — **cùng nguồn, hai cửa sổ kề nhau, cùng nghĩa "có hoạt động"**. Bài toán vì thế gần như thành *"user
> đang hoạt động có tiếp tục hoạt động không"*: AUC lên tới 0.93 nhưng mọi thử nghiệm mở rộng đặc trưng
> đều thất bại, và ~2 đặc trưng đã đủ đạt AUC tương đương 11 đặc trưng. Nhãn mới lấy từ `orders` còn đặc
> trưng chủ yếu từ `user_events` ⇒ dự đoán **xuyên nguồn** thật sự. Phương án được chọn bằng cách quét
> lưới 12 biến thể (cửa sổ 60/90/120 × nguồn nhãn × lọc dân số) — endpoint
> `POST /api/v1/models/label-diagnostics`. Cửa sổ 60 ngày bị loại vì với λ trung vị ~0,5 đơn/tháng thì
> `P(không đơn | 60 ngày) = e^−1 ≈ 0,37`, tức ~37% khách khỏe mạnh bị dán nhãn churn do **nhiễu Poisson**.

**Cách chia tập đánh giá — grouped CV, tách theo user:** mỗi fold, tập test là các user **được giữ lại**
tại mốc gần nhất; tập train là các user **khác** ở các mốc **cũ hơn**. Vừa tách user (model không thể
nhận diện user đã thấy) vừa giữ nhân quả thời gian (không train trên tương lai). Báo **mean ± std** qua
5 fold, vì chỉ 1 holdout thì không phân biệt được cải thiện thật với nhiễu.

**Kết quả đo được trên dữ liệu seed** (xem mục 5):

| Chỉ số | Giá trị |
|---|---|
| AUC | **0.8405 ± 0.0268** |
| F1 | 0.6889 ± 0.0240 |
| Precision / Recall (tại ngưỡng tune 0.26) | 0.6147 / 0.7885 |
| Silhouette (KMeans) | 0.2022 |

> Vì sao AUC **thấp hơn** con số 0.93 từng báo: bản đầu chia test theo thời gian nhưng **không tách
> theo user** (~500 user × 6 mốc, hầu hết user có mặt ở cả train và test). Kiểm chứng lại: leakage đó
> chỉ thổi AUC lên **+0.0021** — tức con số 0.93 *không* sai vì leakage. Mức tụt xuống 0.84 là do **đổi
> định nghĩa nhãn** sang bài toán khó và có nghĩa hơn, **không phải hồi quy chất lượng**.
> Giá trị thật của grouped CV là cho ra **±std**: sàn nhiễu ~±0.027, nhờ đó mới kết luận được điều gì là
> cải thiện thật và điều gì là nhiễu.

### 3.4. Hiệu chỉnh xác suất — điều kiện cần để dùng xác suất vào quyết định

`LogisticRegression(class_weight="balanced")` khiến model ước lượng hậu nghiệm dưới **tiên nghiệm
50/50** thay vì tỉ lệ thật. Đo được: model thô dự đoán churn trung bình **0.4217** trong khi thực tế
**0.2420** — thổi phồng ~1,74×, ECE 0.1797, và over-predict ở **mọi** khoảng xác suất.

Điều này **quan trọng chứ không chỉ là thêm một metric**: hiệu chỉnh là biến đổi đơn điệu nhưng **phi
tuyến**, nên AUC và xếp-hạng-theo-`P`-thuần *không đổi*, còn xếp hạng theo **`P × giá trị khách hàng`**
thì **đổi** (là phép nhân). Đo 4 phương án (`POST /api/v1/models/calibration`), `isotonic` tốt nhất:
ECE **0.1797 → 0.0391** (tốt hơn 4,6×), AUC không đổi ⇒ không có dấu hiệu overfit.

Ngưỡng cắt vì vậy phải tune **trên thang đã hiệu chỉnh** (0.26), không phải thang thô (0.61).
`risk_scoring.effective_threshold()` đọc ngưỡng từ **metadata của chính model đang chạy** thay vì
hardcode, vì ngưỡng tối ưu đổi theo định nghĩa nhãn và theo mỗi lần train. Bundle mang cờ `calibrated`;
gặp model chưa hiệu chỉnh thì tự lùi về ngưỡng an toàn 0.5 kèm cảnh báo.

### 3.5. Từ dự đoán sang quyết định — xếp hạng theo tổn thất kỳ vọng

Đây là chỗ AI làm được việc mà rule **về nguyên tắc** không làm được. Ngân sách marketing luôn có hạn:
nếu chỉ phát được K voucher, chọn ai?

`expected_loss = P(churn) × monetary` — tổn thất kỳ vọng. Xếp theo đại lượng này thay vì theo xác suất
thuần, vì một khách `P=0.95` mua 200k không đáng bằng khách `P=0.70` mua 5tr.

Đo được (`revenue_recall@K` = phần doanh thu-đang-rủi-ro thu được trong top K):

| Ngân sách K | Xếp theo `P` | Xếp theo `P × monetary` | Hơn |
|---|---|---|---|
| 25 | 0.1214 | 0.2651 | **2,18×** |
| 50 | 0.2571 | 0.4310 | **1,68×** |
| 100 | 0.4618 | 0.6745 | 1,46× |
| 200 | 0.8117 | 0.8835 | 1,09× |

**Nuance phải nói:** lợi thế lớn nhất khi **ngân sách chật** và **tan biến khi ngân sách rộng** (K=200
gần như không hơn) — hợp lý, vì phủ 200/500 user thì xếp cách nào cũng bắt gần hết. Đúng chỗ nó có ích
trong thực tế.

Rule không có xác suất ⇒ không nhân được với giá trị khách hàng ⇒ chỉ có thể chọn **bừa** K người trong
số bị flag.

**Next-Best-Action theo tầng xác suất (Tầng 3, 2026-08-03):** ngoài việc CÓ trigger hay không, admin có
thể cấu hình **nhiều chiến dịch khác nhau theo dải xác suất** trong CÙNG 1 campaign — vd 0–20%: chỉ gửi
email nhắc, 20–50%: voucher nhỏ, còn lại: voucher lớn. Thêm node điều kiện `Condition_ChurnRiskTier`
trong Campaign Builder, biên dịch thành 1 `exclusiveGateway` Camunda với các nhánh JUEL trên
`churnProbability` (đã hiệu chỉnh) — tái dùng đúng cơ chế gateway N-nhánh có sẵn (giống
`Condition_TotalSpending`), không cần sửa Camunda engine. Đây là điểm khác biệt so với việc chỉ có 1
ngưỡng trigger nhị phân: mức độ rủi ro giờ quyết định được **loại hành động**, không chỉ **có hành động
hay không**. Xem `docs/canvas/churn-risk-log.md` mục Tầng 3 để có bằng chứng kiểm chứng (harness
validate + compile BPMN thật).

### 3.6. Không refit liên tục — tách huấn luyện khỏi vận hành

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

**Các endpoint phân tích** (thuần đo lường — KHÔNG lưu model, KHÔNG đổi hành vi phát voucher):

```bash
# Benchmark Rule vs AI (mục 3.2)
curl -X POST http://localhost:8004/api/v1/models/rule-benchmark

# Kiểm định & hiệu chỉnh xác suất (mục 3.4)
curl -X POST http://localhost:8004/api/v1/models/calibration

# Quét lưới định nghĩa nhãn (mục 3.3)
curl -X POST http://localhost:8004/api/v1/models/label-diagnostics

# Thử nghiệm mở rộng đặc trưng: ΔAUC so với sàn nhiễu + permutation importance + L1 path
curl -X POST http://localhost:8004/api/v1/models/ablation
```

Admin tạo campaign qua FE: **Coupon Code** → New Campaign → Trigger = "Nguy cơ rời bỏ (AI)" →
Action = tặng voucher/gửi email → Activate.

## 6. Giới hạn đã biết (nói rõ khi báo cáo)

- **Dữ liệu seed là tổng hợp (synthetic)** — metric (AUC 0.84...) đo việc model có phục hồi được
  cấu trúc sinh dữ liệu hay không, **không phải** đo việc dự đoán đúng hành vi người thật.
- **Mốc cắt phải lùi về ≥150 ngày** (do cửa sổ nhãn 120 ngày cần đủ thời gian quan sát) ⇒ model học từ
  dữ liệu 5–9 tháng trước, không dùng được dữ liệu gần đây nhất.
- **Chỉ áp dụng cho khách có ≥2 đơn `DELIVERED`.** Đường chấm điểm production lọc đúng dân số này để
  khớp dân số huấn luyện — chấm điểm ngoài dân số đó là **ngoại suy**. Khách chưa mua thuộc bài toán
  onboarding, không phải bài toán này.
- **Cụm tách nhau yếu** (silhouette 0.2022). `segment` vẫn dùng được vì tỉ lệ churn giữa các cụm chênh
  0.3565, nhưng đây không phải phân khúc "sắc nét". Có cảnh báo tự động khi chênh lệch < 0.10.
- **Mở rộng đặc trưng đã thử và KHÔNG thành công.** 6 khối đặc trưng ứng viên (hình dạng bỏ giỏ, độ phân
  tán khoảng cách mua, đối chứng âm, và — sau khi làm giàu seeder ở Tầng 1 — thêm session/review/
  voucher) đều không vượt sàn nhiễu. Nguyên nhân: bộ sinh dữ liệu chỉ có 2 cơ chế gắn với churn (λ tụt
  bậc + tăng bỏ giỏ trước rời bỏ) và 11 đặc trưng hiện tại đã phủ cả hai; 3 khối mới được thiết kế **cố
  ý độc lập với nhãn churn** (tránh suy luận vòng tròn) nên null result là kỳ vọng đúng, không phải đo
  ra kém. `product_reviews`/`issued_vouchers`/`user_events.session_id` nay đã có dữ liệu thật (không
  còn rỗng) — xem `churn-risk-log.md` Tầng 1.2.
- **Hệ số Logistic Regression KHÔNG đọc được như độ quan trọng.** Dữ liệu có đa cộng tuyến nặng
  (`frequency`↔`monetary` ρ=0.877). Ví dụ đo được: `cart_abandon_count` có hệ số lớn thứ 2 nhưng
  permutation importance ≈ **0**. Phải dùng permutation importance (bền với cộng tuyến):
  `category_diversity_viewed` 0.0901 · `frequency` 0.0347 · `days_since_last_activity` 0.0272 ·
  `recent_view_count` 0.0219.
- **Chưa có vòng phản hồi từ kết quả campaign.** Model không học từ việc voucher có hiệu quả hay không —
  cần bảng theo dõi outcome; xem `churn-risk-roadmap.md` Tầng 4. Không đánh giá được trong phạm vi đồ án
  vì dữ liệu synthetic thì phải tự viết luôn cả model phản hồi (vòng tròn), còn dữ liệu thật chỉ có ~10
  user đăng nhập được.
- Chỉ hoạt động chính xác với **user đã đăng nhập** (có Keycloak UUID thật) — khách vãng lai dùng
  chung 1 định danh `anonymous`, bị bỏ qua có chủ đích.
- Voucher/email cần `user-service` chạy để resolve `userId` (Keycloak UUID) sang thông tin liên hệ
  — nếu service này không chạy, campaign vẫn trigger đúng (Camunda Process Instance vẫn chạy)
  nhưng bước phát voucher cuối cùng sẽ bị bỏ qua.

## Xem thêm

- [`churn-risk-log.md`](churn-risk-log.md) — **nhật ký làm việc theo timeline**: mọi số đo, mọi thứ đã
  thử và bị loại, kèm lý do. Đây là nơi tra cứu khi cần con số gốc của bất kỳ bảng nào ở trên.
- [`churn-risk-roadmap.md`](churn-risk-roadmap.md) — kế hoạch dài hạn xếp theo thứ tự phụ thuộc, kèm
  tiêu chí thành công và tiêu chí dừng cho từng việc.
- [`churn-risk-tier0-plan.md`](churn-risk-tier0-plan.md) — plan thi hành Tầng 0 (hiệu chỉnh xác suất +
  định nghĩa lại nhãn), đã hoàn thành.
- [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) — kế hoạch/nhật ký
  triển khai chi tiết theo 7 phase, kèm ghi chú lệch phát sinh khi code.
- [`recommendation-complete.md`](recommendation-complete.md) — blueprint gốc (ý tưởng ban đầu,
  trước khi có phát hiện về thiếu dữ liệu/hạ tầng dẫn tới bản kế hoạch thực tế ở trên).
