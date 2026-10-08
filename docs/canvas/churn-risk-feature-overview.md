# Báo cáo tính năng Churn Risk AI — trình bày kèm phản biện

> Tài liệu mô tả tính năng (feature overview) — khác với
> [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) (kế hoạch triển khai
> theo phase, dành cho lúc code). File này để giải thích tính năng cho người đọc sau (báo cáo,
> bảo vệ đồ án), tập trung vào **AI được dùng chính xác ở đâu**.
>
> **Cập nhật toàn bộ 2026-10-06.** Mọi số liệu trong bản này đo trên **dữ liệu hành vi THẬT**
> (REES46 — một sàn TMĐT thật, 12/2019–4/2020, transform vào đúng schema hệ thống), không còn là
> bộ sinh tổng hợp (synthetic) như các bản trước. Toàn bộ pipeline từ chấm điểm tới phát voucher đã
> được xác minh chạy thật qua HTTP (không chỉ gọi hàm Python), tìm và sửa 2 lỗi production thật
> trong quá trình đó. Số liệu cũ (bộ sinh) được giữ lại ở cuối mỗi mục dạng trích dẫn khi có giá trị
> so sánh phương pháp.

---

## 0. Tóm tắt

**Bài toán.** Khách hàng ngừng mua thì cửa hàng mất doanh thu, nhưng ngân sách khuyến mãi luôn có hạn nên
không thể tặng voucher cho tất cả. Cần (1) biết khách nào có nguy cơ ngừng mua, (2) chọn đúng người đáng
cứu nhất trong ngân sách, (3) làm việc đó tự động.

**Giải pháp.** Chấm xác suất rời bỏ cho từng khách bằng Logistic Regression đã hiệu chỉnh, xếp hạng theo
*tổn thất kỳ vọng* (`xác suất × giá trị khách hàng`), cắt theo ngân sách, rồi phát sự kiện để engine
campaign có sẵn (Camunda) tự phát voucher.

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
                                        │ behavior_consumer.py        │  ghi bảng user_events
                                        │ (ghi nhận hành vi thô)       │  (MySQL) + Redis (recs-service)
                                        └─────────────────────────────┘
                                                      │
                                        (định kỳ, mỗi chu kỳ scan — KHÔNG mỗi request)
                                                      ▼
                                        ┌──────────────────────────────────────┐
                                        │ risk_scheduler.py                     │
                                        │  → feature_store.refresh()            │  tính trước 11 đặc
                                        │    (pandas, vài giây–vài phút)        │  trưng, lưu bảng riêng
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

`feature_store.refresh()` là phần mới thêm 2026-10-06 (xem mục 3.7) — tính trước 11 đặc trưng bằng
pandas rồi lưu vào bảng `user_feature_vectors`, thay vì để `risk_scoring.predict()` tự chạy SQL
tổng hợp mỗi lần gọi (cách cũ treo 25–40+ phút trên quy mô dữ liệu thật, xem mục 3.7).

## 3. AI được dùng chính xác ở đâu — KHÔNG ở đâu khác

```
FE (xem SP / giỏ hàng) ── X-User-Id (Keycloak UUID) ──▶ product-service / order-service ──▶ Kafka
                                                        (product-viewed-events, cart-updated-events)
                                                                          │
                                                                          ▼
                                                       forecast-service (Python)
                                                       behavior_consumer ─▶ bảng user_events
                                                                          │
                                                  (định kỳ, mỗi chu kỳ scan — không mỗi request)
                                                                          ▼
                       risk_scheduler: feature_store.refresh() ─▶ risk_scoring.predict()   ★ AI ở đây ★
                         tầng 0  dân số ≥ 2 đơn DELIVERED          (khớp dân số huấn luyện)
                         tầng 1  segment "At Risk" + xác suất ≥ ngưỡng        ← AI
                         tầng 2  vừa bỏ giỏ hàng trong 24 giờ                 ← rule (thời điểm)
                         tầng 3  xếp hạng theo tổn thất kỳ vọng, cắt ngân sách ← quyết định
                                                                          │ publish
                                                                          ▼
                                       Kafka user-risk-events ──▶ promotion-service (Camunda 7)
                                                                  rule cứng: event đến → chạy workflow
                                                                          ▼
                                                           Voucher / Email cá nhân hóa
```

| Bước | File | Có phải AI không? |
|---|---|---|
| Ghi nhận hành vi (xem SP, thêm giỏ) | `ProductController.java`, `CartServiceImpl.java` | ❌ Chỉ là ghi log (ETL) |
| Đưa hành vi vào DB | `AI/forecast-service/app/kafka/behavior_consumer.py` | ❌ Chỉ copy dữ liệu, không tính toán |
| Tính trước 11 đặc trưng, lưu bảng | `AI/shared-common/shared_common/features/feature_store.py` | ❌ Tổng hợp/thống kê thuần, không học |
| **Tính điểm rủi ro rời bỏ** | `AI/forecast-service/app/training/train.py` + `app/services/risk_scoring.py` | ✅ **CHỈ ĐÂY** |
| Lọc điều kiện kích hoạt (có bỏ giỏ hàng gần đây) | `AI/forecast-service/app/services/risk_scheduler.py` | ❌ Rule tay (`if... then...`) |
| Publish sự kiện, tìm campaign, chạy Camunda | `risk_producer.py`, `PromotionKafkaConsumer.java`, `CampaignTriggerService.java` | ❌ Automation/workflow engine thuần |

| Bước | Có phải AI? |
|---|---|
| Ghi nhận hành vi (xem SP, thêm giỏ) → Kafka → bảng `user_events` | ❌ ETL thuần |
| Tính 11 đặc trưng cho mọi khách (`feature_store`) | ❌ thống kê thuần, không học |
| **Chấm xác suất rời bỏ + gán phân khúc** (`train.py`, `risk_scoring.py`) | ✅ **duy nhất bước này** |
| Lọc "vừa bỏ giỏ trong 24 giờ" (`risk_scheduler.py`) | ❌ rule tay, **cố ý** (mục 6.1) |
| Publish sự kiện, tìm campaign, chạy Camunda | ❌ workflow engine |

**Mô hình 1 — KMeans clustering (không giám sát):** tự nhóm user thành 4 cụm hành vi dựa trên
**11 đặc trưng** (không phải rule tay `if recency > 30 ngày`). Việc **gán nhãn** cho cụm dùng chính
`churn_label` đo được: cụm có **tỉ lệ churn thực đo cao nhất** được gọi `At Risk`, 3 cụm còn lại đặt
tên theo hạng giá trị. Đo thực trên dữ liệu REES46 thật (10.501 user):

| Phân khúc | Số user | **Tỉ lệ churn đo được** | monetary TB (VNĐ) | recency TB (ngày) |
|---|---|---|---|---|
| **At Risk** | 8.570 | **0,8426** | 32.416.654 | **50,5** |
| Loyal Regulars | 10.265 | 0,6711 | 40.570.520 | 19,5 |
| Lapsed | 5.523 | 0,5602 | 15.175.844 | 16,2 |
| VIP Champions | 7.100 | 0,3731 | 75.312.825 | 11,0 |

Nhóm `At Risk` có tỉ lệ churn **2,26×** nhóm `VIP Champions` (chênh lệch 46,95 điểm %), silhouette
0,3484 — nên việc dùng `segment` làm cổng lọc là **có cơ sở đo được**, không phải phỏng đoán. Ranh
giới tự dịch chuyển theo phân bố dữ liệu thật, không cố định trong code.

**Mô hình 2 — Logistic Regression (có giám sát) + hiệu chỉnh xác suất:** dự đoán **xác suất** user sẽ
churn (0,0–1,0), train trên nhãn sinh theo temporal split (xem mục 3.3) — cho phép đánh giá bằng
precision/recall/AUC, thứ mà rule tay không có. Xác suất được **hiệu chỉnh** (isotonic) vì bản thô bị
lệch hệ thống, và toàn bộ tầng quyết định (xếp hạng theo tổn thất kỳ vọng) dựa trên xác suất này.

**Kết quả grouped CV (5 fold, tách user + nhân quả thời gian), model đang chạy production:**

| Chỉ số | Giá trị |
|---|---|
| AUC | **0,7354 ± 0,0138** |
| F1 | 0,7643 |
| Precision / Recall | 0,7969 / 0,7344 |
| Ngưỡng cắt đề xuất (thang đã hiệu chỉnh) | 0,38 |

11 đặc trưng đầu vào (định nghĩa 1 lần duy nhất tại
`AI/shared-common/shared_common/features/`, dùng chung cho cả 2 model):

| Phương án | Vì sao loại | Bằng chứng |
|---|---|---|
| Bộ sinh tham số đặt tay | Lệch lõi động lực (số trên); không kiểm chứng được gì độc lập | Log 2026-10-01 |
| Bộ sinh neo BG/NBD (Online Retail II) | Đã làm và hiệu chỉnh xong, nhưng chủ dự án chọn transform dữ liệu thật thay vì mô phỏng | Log 2026-10-01, 2026-10-02 |
| Olist (marketplace Brazil) | Chỉ ~3% khách mua lặp; churn 97,3% thoái hóa; không có clickstream | ✅ 2.801/93.897 user có ≥2 đơn; churn 0,9729 — Log 2026-08-03 |
| RetailRocket | Chỉ 3 loại sự kiện (xem/thêm giỏ/mua) → không đủ để kiểm giả thuyết thứ tự hành vi | Log 2026-08-04 |
| REES46 Cosmetics | Một ngành duy nhất; chỉ dùng cho các thí nghiệm nghiên cứu riêng | Log 2026-10-02 |

**Đã thử mở rộng thêm 7 khối đặc trưng ứng viên** (hình dạng bỏ giỏ, độ phân tán khoảng cách mua,
đối chứng âm, session, review, voucher, nhịp thời gian) qua `ablation.py` trên dữ liệu thật — **tất
cả đều LOẠI** (ΔAUC dưới sàn nhiễu 0,0138, kể cả gộp cả 7 khối lại ΔAUC chỉ +0,0044). Kết luận: 11
đặc trưng hiện tại là đủ, không phải vì bộ sinh giả lập thiếu đa dạng (dữ liệu giờ là hành vi thật).

### 3.2. Vì sao 2 model, không phải 1 rule if-else — đo bằng số, không lập luận suông

**Nguyên tắc để không tự lừa mình:** không tự chọn một rule yếu rồi đánh bại nó. Benchmark
(`rule_benchmark.py`) **quét lưới** tìm rule TỐT NHẤT ở 3 mức phức tạp — rule 1 biến, rule 2 điều
kiện AND, và cây quyết định giới hạn độ sâu (tập rule **tối ưu do máy tìm**) — trên cùng bộ fold
grouped CV với model.

| Phương pháp | F1 | AUC (xếp hạng) |
|---|---:|---:|
| Rule viết tay `days_inactive>7 AND cart_abandon>=1` (ví dụ sách giáo khoa) | 0,187 | không xếp hạng được |
| Rule viết tay `recency>30 AND cart_abandon>=2` (RFM kinh điển) | 0,066 | không xếp hạng được |
| Rule viết tay `recency>90` | 0,016 | không xếp hạng được |
| Rule 1 biến, quét lưới (`recency>=4`) | 0,8179 | 0,6889 |
| Rule 2 điều kiện AND, quét lưới (`recency>=2 AND frequency>=2`) | 0,8187 | không xếp hạng được |
| Cây quyết định sâu 3 (rule mạnh nhất tìm được) | **0,8245** | 0,733 |
| **Model (LR 11 đặc trưng + hiệu chỉnh)** | 0,8244 | **0,7352** (cao nhất) |

**Kết luận, đúng những gì số liệu cho thấy — không tô hồng:**

1. **Model KHÔNG thắng rule tốt nhất về F1** (0,8244 so với 0,8245 — chênh −0,0001, nằm trong sàn
   nhiễu 0,0031). Rule mà người ta thực sự viết tay thì thảm hại (F1 0,016–0,187), nhưng rule được
   quét lưới/cây quyết định tìm ra thì ngang ngửa model.
2. **Model thắng rõ về AUC** — khả năng xếp hạng liên tục, cao nhất trong mọi phương pháp.
3. **Rule KHÔNG xếp hạng được — đây là luận điểm chính, không phụ thuộc F1 bằng hay hơn.** Rule trả
   nhãn nhị phân ⇒ không có xác suất liên tục để nhân với giá trị khách hàng ⇒ **không thể phân bổ
   ngân sách voucher theo tổn thất kỳ vọng** (mục 3.5), bất kể F1 bao nhiêu. Đây là khác biệt về
   **NĂNG LỰC** (rule không có cơ chế sinh xác suất liên tục), không phụ thuộc bộ dữ liệu — nên là
   chỗ dựa chắc nhất khi bảo vệ, thay vì so F1.

**Đã thử thêm 9 thuật toán khác** (CatBoost, LightGBM, XGBoost, GradientBoosting, RandomForest, SVM,
cây quyết định đơn, KNN, Gaussian Naive Bayes — trải 70 năm phát triển ML) trên cùng fold: nhóm
boosting hiện đại nhỉnh hơn LR một chút (+0,0014 đến +0,0082) nhưng **không vượt sàn nhiễu**; nhóm
cổ điển hơn (SVM, KNN, Naive Bayes, cây đơn) **kém hơn LR rõ rệt** (−0,012 đến −0,026). Kết luận:
Logistic Regression là lựa chọn tốt nhất trong nhóm dễ giải thích, không có thuật toán nào thắng có
ý nghĩa thống kê.

### 3.3. Định nghĩa nhãn churn và cách đánh giá

Nhãn churn **không** dán tay lên user nào. Định nghĩa hiện tại
(`LABEL_VERSION = churn_label_v3_orders_60d_min2_rees46real`):

- Sinh từ **5 mốc thời gian cắt** (61–137 ngày trước cuối dữ liệu, cách đều). Tại mỗi mốc, tính đặc
  trưng từ dữ liệu **đến mốc đó**.
- **Nhãn = 1 nếu user không ĐẶT ĐƠN nào trong 60 ngày sau mốc.**
- Chỉ tính trên **user có ≥2 đơn `DELIVERED`** — user chưa từng mua hoặc mới mua 1 lần thì không thể
  là "khách mua hàng đã rời bỏ".

Panel thu được: **31.458 dòng / 10.501 user / tỉ lệ churn 0,6311**.

> **Vì sao 60 ngày, không phải 120 như thiết kế gốc:** dữ liệu REES46 thật chỉ trải ~151 ngày
> (12/2019–4/2020), không đủ cho lưới mốc cắt gốc (cần ≥390 ngày cho cửa sổ 120 ngày). Cửa sổ 60
> ngày là lựa chọn duy nhất còn đủ 5 mốc cắt có nghĩa trên khoảng dữ liệu này.

**Cách chia tập đánh giá — grouped CV, tách theo user:** mỗi fold, tập test là các user **được giữ
lại** tại mốc gần nhất; tập train là các user **khác** ở các mốc **cũ hơn**. Vừa tách user (model
không thể nhận diện user đã thấy) vừa giữ nhân quả thời gian (không train trên tương lai). Báo
**mean ± std** qua 5 fold.

**Dữ liệu nguồn: transform từ sàn TMĐT thật, không phải mô phỏng.** Catalog (sản phẩm, danh mục,
giá) là Tiki thật; hành vi + giao dịch là **REES46 đa ngành** (12/2019–4/2020, 332.347 user /
102.004 đơn / 7.378.602 sự kiện) — một sàn TMĐT thật khác, ánh xạ vào đúng schema hệ thống theo quy
tắc xác định (danh mục + giá gần nhất). Đây là thay đổi kiến trúc lớn nhất của dự án (2026-10-02):
trước đó mọi số liệu đo trên bộ sinh synthetic (tự mô phỏng tham số), nay toàn bộ feature engineering
và model được re-baseline hoàn toàn trên hành vi người dùng thật. Chi tiết mapping schema và 3 lỗi
đã phát hiện/sửa trong chính nguồn REES46 (log giỏ hàng thiếu trước 12/2019, mã danh mục sai từ
12/2019, 4 ngày mất log đơn hàng): [`rees46-transform-mapping.md`](rees46-transform-mapping.md).

Campaign Builder đã có sẵn node điều kiện `Condition_ChurnRiskTier` (rẽ nhánh theo % xác suất đã hiệu chỉnh) và
nhiều loại action (voucher %, tiền, freeship, điểm thưởng, nâng hạng, email) — admin kéo-thả được luồng "rủi ro
cao → voucher mạnh, vừa → freeship" mà không cần code. Đã kiểm chứng bằng harness Java `validate()` + `compile()`
ra BPMN XML hợp lệ (7.311 ký tự, đủ `exclusiveGateway` + 2 `conditionExpression`). **Chưa có:** campaign mẫu dựng
sẵn; chưa chạy process instance thật; nhánh rẽ theo **ngưỡng % người đặt**, chưa theo 4 phân khúc KMeans — tức
vẫn là "rule trên con số AI", chưa phải chính sách học được từ hiệu quả thật. *(Log 2026-08-03 "Tầng 3")*

`LogisticRegression(class_weight="balanced")` khiến model ước lượng hậu nghiệm dưới **tiên nghiệm
50/50** thay vì tỉ lệ thật. Hiệu chỉnh là biến đổi đơn điệu nhưng **phi tuyến**, nên AUC và xếp-hạng-
theo-`P`-thuần *không đổi*, còn xếp hạng theo **`P × giá trị khách hàng`** thì **đổi** (là phép
nhân) — đây là lý do mục 3.5 (tầng quyết định) phụ thuộc trực tiếp vào bước này.

Phương pháp `isotonic` được chọn (so với Platt scaling và nguyên trạng) từ trước, tiếp tục dùng cho
model re-baseline trên dữ liệu thật — model bundle mang cờ `calibrated: true`. Ngưỡng cắt tune
**trên thang đã hiệu chỉnh** (0,38), không phải thang thô. `risk_scoring.effective_threshold()` đọc
ngưỡng từ **metadata của chính model đang chạy** thay vì hardcode, vì ngưỡng tối ưu đổi theo định
nghĩa nhãn và theo mỗi lần train; gặp model chưa hiệu chỉnh thì tự lùi về ngưỡng an toàn 0,5 kèm
cảnh báo.

✅ **Đo độ muộn** (REES46 Cosmetics, **3.570.193** lượt thêm giỏ): 74,7% giỏ không bao giờ thành đơn (cùng SP, 30
ngày). Trong số giỏ **có** mua lại: **52,5% trong 1 giờ, 76,3% trong 24 giờ, 91,3% trong 7 ngày**; khả năng
quay lại mua cùng SP rơi từ 13,9% (sau 1 giờ) xuống 2,9% (sau 7 ngày). *(`cart_recovery.json`)*

Đây là chỗ AI làm được việc mà rule **về nguyên tắc** không làm được (xem mục 3.2 điểm 3). Ngân sách
marketing luôn có hạn: nếu chỉ phát được K voucher, chọn ai?

`expected_loss = P(churn) × monetary` — tổn thất kỳ vọng. Xếp theo đại lượng này thay vì theo xác
suất thuần, vì một khách `P=0,95` mua 200k không đáng bằng khách `P=0,70` mua 5tr.

Đo được trên dữ liệu thật (`revenue_recall@K` = phần doanh thu-đang-rủi-ro thu được trong top K,
tổng doanh thu rủi ro 283.950.553.000đ trên 10.501 user):

| Ngân sách K | Xếp theo `P` | Xếp theo `P × monetary` | Hệ số nhân |
|---|---:|---:|---:|
| 25 | 0,15% | 9,04% | **60,27×** |
| 50 | 0,34% | 11,40% | **33,53×** |
| 100 | 0,84% | 15,44% | **18,38×** |
| 200 | 1,84% | 23,46% | **12,75×** |

Hệ số nhân này cao hơn nhiều so với ước lượng ban đầu trên dữ liệu synthetic (từng đo 1,09×–2,18×)
— vì phân phối giá trị đơn hàng thật lệch mạnh hơn: xếp theo xác suất thuần tuy vẫn đúng nhãn
(precision@K 0,95–0,98) nhưng chọn trúng rất nhiều khách churn giá trị nhỏ, gần như không cứu được
doanh thu nào. Đây là số liệu mạnh nhất để bảo vệ luận điểm "cần AI" — không phụ thuộc việc model có
thắng rule về F1 hay không (mục 3.2).

**Next-Best-Action theo tầng xác suất:** admin có thể cấu hình nhiều hành động khác nhau theo dải
xác suất trong CÙNG 1 campaign (vd 0–20%: chỉ gửi email, 20–50%: voucher nhỏ, còn lại: voucher lớn)
qua node điều kiện `Condition_ChurnRiskTier` trong Campaign Builder — hạ tầng này **đã có sẵn trong
code** (nhiều loại action: voucher %/tiền mặt/freeship, nâng hạng, điểm thưởng, email), admin kéo-
thả dùng ngay không cần code thêm. Hai điểm chưa có: (1) chưa dựng sẵn campaign mẫu nào để demo, (2)
nhánh rẽ theo **ngưỡng % xác suất** người tự đặt, chưa rẽ theo đúng 4 phân khúc KMeans — tức đây vẫn
là "rule trên con số AI", chưa phải "chính sách học được từ hiệu quả thật" (cần vòng phản hồi đo kết
quả campaign — xem `churn-risk-roadmap.md` Tầng 4, hiện chỉ có thiết kế, không thực nghiệm được
trong phạm vi đồ án).

### 3.6. Không refit liên tục — tách huấn luyện khỏi vận hành

Một lỗi thường gặp: nếu model tự fit lại mỗi lần được gọi, tâm cụm dịch chuyển liên tục → user
"At Risk" giờ này có thể hết "At Risk" giờ sau chỉ vì khởi tạo lại, không phải vì hành vi đổi thật.
Thiết kế ở đây tách biệt:
- `POST /api/v1/models/train` — nơi DUY NHẤT model được fit, chạy tay/định kỳ.
- `risk_scheduler.py` — chỉ **predict** bằng model đã lưu (`shared_common/registry.py`), không
  bao giờ tự fit lại.

### 3.7. Feature store — vì sao cần, và 2 bug production đã tìm/sửa (2026-10-06)

Khi dữ liệu còn nhỏ (bộ sinh synthetic, ~342 user), `risk_scoring.predict()` tự chạy SQL tổng hợp
(`COUNT DISTINCT`, `GROUP BY user_id`...) mỗi lần cần chấm điểm — đủ nhanh để không ai để ý. Trên
quy mô dữ liệu thật (332.347 user / 7,3 triệu sự kiện), **đúng những câu SQL đó treo 25–40+ phút,
có lần không bao giờ xong** — phát hiện khi kiểm tra lại bằng cách gọi thật endpoint admin qua HTTP
(không chỉ gọi hàm Python, vốn dễ bỏ sót vấn đề hiệu năng/môi trường thật).

**Giải pháp — feature store:** tính trước 11 đặc trưng bằng pandas-trong-RAM (đọc dữ liệu 1 lần,
tính vector hoá — vài giây đến vài phút tuỳ tải máy, so với 25–40+ phút của SQL tổng hợp), lưu vào
bảng `user_feature_vectors` tự quản lý bởi chính forecast-service. `risk_scheduler` làm mới bảng
này mỗi chu kỳ quét (1 giờ); `risk_scoring.predict()` chỉ đọc bảng đã tính sẵn — nhanh, không phụ
thuộc quy mô dữ liệu đang lớn dần. Đánh đổi: dữ liệu chấm điểm chỉ mới bằng lần làm mới gần nhất
(không phải tức thời tuyệt đối) — chấp nhận được vì tần suất quét vốn đã theo giờ, không theo giây.

**Hai lỗi thật tìm được khi verify bằng HTTP thật** (không xuất hiện khi test bằng script Python
trực tiếp):

1. Hàm quét rủi ro chạy code tính toán đồng bộ (vài phút) ngay trong hàm `async`, chặn event loop
   khiến tiến trình nền lắng nghe Kafka bị rớt kết nối. Sửa: tách phần tính toán, chạy qua thread
   pool riêng.
2. Lỗi tính toán thật: 1 phép cộng ngày-giờ cho kết quả khác kiểu dữ liệu tuỳ phiên bản thư viện
   `numpy` — bản cài trong môi trường chạy thật (production) bị lỗi, bản cài trên máy phát triển thì
   không, nên không lộ ra khi test bằng script thông thường. Sửa bằng cách ép kiểu dữ liệu tường
   minh, không phụ thuộc phiên bản.

**Kết quả xác minh cuối — chạy thật qua HTTP, không giả lập:**

```
332.349 user chấm điểm → 17.737 trong dân số hợp lệ → 10.563 at-risk →
0 đủ điều kiện (có bỏ giỏ hàng trong 24h) → 0 published
```

0 published là **kết quả đúng theo dữ liệu**, không phải lỗi: dữ liệu REES46 là lịch sử đóng băng
tới 2026-10-01, trong khi đồng hồ hệ thống thật đã là ngày sau đó — quy tắc "vừa bỏ giỏ hàng trong
24h gần nhất" tự nhiên không có gì để khớp trên một tập dữ liệu lịch sử tĩnh. Toàn bộ chuỗi logic
(tính điểm → lọc dân số → lọc theo thời điểm → xếp hạng ngân sách → gọi Kafka) đã chạy đúng, không
lỗi, qua đúng con đường mà production/FE thật sự đi qua.

## 4. Các thành phần hệ thống liên quan

| Service | Vai trò trong tính năng này |
|---|---|
| `product-service`, `order-service` (Java) | Ghi nhận hành vi thô, publish Kafka |
| `forecast-service` (Python/FastAPI) | Toàn bộ AI: ingest hành vi, feature store, train, predict, publish sự kiện rủi ro |
| `promotion-service` (Java/Camunda 7) | Nhận sự kiện, chạy campaign đã cấu hình sẵn (BPMN) |
| FE Campaign Builder (tab **"Coupon Code"**, tên hiển thị không khớp tên chức năng thật) | Nơi admin dựng campaign với trigger "Nguy cơ rời bỏ (AI)" |

---

```bash
# 1. Train model (nơi DUY NHẤT model được fit)
curl -X POST http://localhost:8004/api/v1/models/train

# 2. Chạy risk-scan (bình thường chạy tự động theo lịch, gọi tay để test/demo)
curl -X POST http://localhost:8004/api/v1/risk/trigger-scan

# 3. Xem phân bố phân khúc + độ mới dữ liệu
curl http://localhost:8004/api/v1/admin/analytics/segmentation

# 4. Model card — tóm tắt model đang chạy, metric, giới hạn, trong 1 lần gọi
curl http://localhost:8004/api/v1/models/card

# 5. Xem Process Instance Camunda đã chạy
# Camunda Cockpit: http://localhost:8087/camunda/app/cockpit/
```

**`published = 0` là đúng theo dữ liệu, không phải lỗi:** dữ liệu REES46 đóng băng đến 2026-10-01, trong khi quy
tắc tầng 2 so với đồng hồ thật (`NOW()`); khi chạy ở ngày sau đó, không user nào "vừa bỏ giỏ trong 24 giờ". Toàn
bộ chuỗi (chấm điểm → lọc dân số → lọc thời điểm → xếp hạng ngân sách → gọi Kafka producer) đã chạy không lỗi
qua đường HTTP mà production/FE thật đi qua.

```bash
curl -X POST http://localhost:8004/api/v1/models/rule-benchmark   # Rule vs AI (mục 3.2)
curl -X POST http://localhost:8004/api/v1/models/calibration      # Hiệu chỉnh xác suất (mục 3.4)
curl -X POST http://localhost:8004/api/v1/models/ablation         # Mở rộng đặc trưng: ΔAUC + permutation importance + L1 path
```

Admin tạo campaign qua FE: **Coupon Code** → New Campaign → Trigger = "Nguy cơ rời bỏ (AI)" →
Action = tặng voucher/gửi email → Activate.

## 6. Giới hạn đã biết (nói rõ khi báo cáo)

- **Hành vi/giao dịch là REES46 THẬT (transform, không mô phỏng) nhưng là MỘT SÀN KHÁC**, chỉ phủ
  12/2019–4/2020 (~151 ngày), ánh xạ sang catalog Tiki thật theo quy tắc xác định (danh mục + giá
  gần nhất) — không phải người dùng Tiki thật mua hàng Tiki thật.
- **Dữ liệu là lịch sử đóng băng**, trong khi quy tắc thời điểm (`has_recent_abandoned_cart`) so với
  đồng hồ thật (`NOW()`) — nên demo trực tiếp trên dữ liệu này sẽ không bao giờ thấy voucher được
  phát (xem mục 3.7), dù toàn bộ logic đã verify đúng. Muốn demo thấy voucher thật cần nạp thêm dữ
  liệu có mốc thời gian gần ngày chạy demo, hoặc đổi cách tính "gần đây" sang neo theo dữ liệu thay
  vì đồng hồ hệ thống — chưa làm, ngoài phạm vi đồ án.
- **Chỉ áp dụng cho khách có ≥2 đơn `DELIVERED`.** Chấm điểm ngoài dân số đó là **ngoại suy**.
- **Cửa sổ nhãn 60 ngày** (không phải 120 như thiết kế gốc) — do dữ liệu thật chỉ trải ~151 ngày.
- **Mở rộng đặc trưng đã thử và KHÔNG thành công trên nhãn 60-120 ngày** (7 khối, kể cả
  `gap_dispersion`, đều không vượt sàn nhiễu — xem mục 3.1). Ở đích NGẮN HẠN khác (24h quan sát → dự
  đoán mua lại trong 7 ngày, cấp episode giỏ hàng chứ không phải nhãn churn cấp-user), feature trình
  tự/liên kết (có quay lại xem chính sản phẩm đã thêm giỏ không, nhịp sự kiện...) **CÓ** vượt sàn
  nhiễu (ΔAUC +0,0165) — xác nhận giả thuyết "liên kết dữ liệu quan trọng hơn thông tin đơn lẻ" đúng
  ở phạm vi ngắn hạn, dù chưa thay đổi model production (AUC 0,65 còn yếu hơn model chính 0,735,
  dùng cho mục đích nghiên cứu/báo cáo).
- **Hệ số Logistic Regression KHÔNG đọc được như độ quan trọng** do đa cộng tuyến — dùng permutation
  importance thay thế (mạnh nhất: `days_since_last_activity`, áp đảo hoàn toàn các feature còn lại).
- **Lệch phiên bản thư viện giữa môi trường dev và production** (vd model train bằng scikit-learn
  1.9.1, container chạy 1.7.2; numpy 2.2.6 trong container từng gây lỗi searchsorted mà numpy 2.4.6
  trên máy dev không gặp — đã sửa, xem mục 3.7) — cảnh báo chung: khác biệt phiên bản thư viện có
  thể che giấu bug, không nên coi "đã test bằng script" là tương đương "đã test qua production".
- **Chưa có vòng phản hồi từ kết quả campaign.** Model không học từ việc voucher có hiệu quả hay
  không — cần bảng theo dõi outcome; xem `churn-risk-roadmap.md` Tầng 4 (hiện chỉ có thiết kế, không
  thực nghiệm được trong phạm vi đồ án do thiếu dữ liệu outcome thật).
- Chỉ hoạt động chính xác với **user đã đăng nhập** (có Keycloak UUID thật); phần lớn user REES46
  transform là tài khoản nội bộ (`rees_<id>@rees46.internal`), không đăng nhập được qua FE thật —
  demo end-to-end bằng tài khoản thật cần dùng đúng nhóm nhỏ user có thể đăng nhập (đã verify E2E
  với user thật trước đây, 2026-07-27, trên dữ liệu cũ).
- Voucher/email cần `user-service` chạy để resolve `userId` sang thông tin liên hệ — nếu service
  này không chạy, campaign vẫn trigger đúng (Camunda Process Instance vẫn chạy) nhưng bước phát
  voucher cuối cùng sẽ bị bỏ qua.

## Xem thêm

- [`churn-risk-log.md`](churn-risk-log.md) — **nhật ký làm việc theo timeline**: mọi số đo, mọi thứ
  đã thử và bị loại, kèm lý do. Đây là nơi tra cứu khi cần con số gốc của bất kỳ bảng nào ở trên.
- [`rees46-transform-mapping.md`](rees46-transform-mapping.md) — chi tiết việc chuyển dữ liệu REES46
  thật thành dữ liệu hệ thống (schema mapping, 3 lỗi nguồn đã phát hiện/sửa).
- [`churn-risk-roadmap.md`](churn-risk-roadmap.md) — kế hoạch dài hạn xếp theo thứ tự phụ thuộc, kèm
  trạng thái ĐÃ XONG/CÒN LẠI cập nhật tới 2026-10-06.
- [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) — kế hoạch/nhật ký
  triển khai chi tiết theo 7 phase (hạ tầng Kafka/Camunda/FE), kèm ghi chú lệch phát sinh khi code.
- [`recommendation-complete.md`](recommendation-complete.md) — blueprint gốc (ý tưởng ban đầu).
