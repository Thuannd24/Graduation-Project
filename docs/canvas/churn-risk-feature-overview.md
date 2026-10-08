# Báo cáo tính năng Churn Risk AI — trình bày kèm phản biện

> **Đối tượng đọc:** hội đồng bảo vệ, người phản biện, người tiếp quản dự án. Không cần biết trước về dự án.
> **Mốc số liệu:** 2026-10-06. Mọi con số dưới đây đo trên dữ liệu hành vi thật (REES46) trừ khi ghi rõ
> "tổng hợp". Các số cũ đã bị rút lại nằm ở mục 12.
>
> **Quy ước mức chứng cứ** (gắn vào từng khẳng định quan trọng):
> - ✅ **ĐÃ ĐO** — có con số, truy ngược được tới log hoặc file kết quả.
> - ⚠️ **GIẢ ĐỊNH / SUY LUẬN** — hợp lý nhưng chưa đo trực tiếp.
> - ❌ **CHƯA KIỂM CHỨNG** — nói thẳng là chưa biết.
>
> **Nguồn truy ngược:** [`churn-risk-log.md`](churn-risk-log.md) (nhật ký theo ngày, ghi là *"Log mục
> <ngày>"*), [`rees46-transform-mapping.md`](rees46-transform-mapping.md), và các file kết quả thô
> `data/experiment-results/behavior_patterns/*.json` (nằm ở máy phát triển, **không** đưa lên git do
> `.gitignore` loại thư mục `data/`; mọi số quan trọng đã được chép vào log, là phần được commit).
> Các file khác: [`churn-risk-roadmap.md`](churn-risk-roadmap.md) (việc còn lại),
> [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) (kế hoạch 7 phase hạ tầng).

---

## 0. Tóm tắt

**Bài toán.** Khách hàng ngừng mua thì cửa hàng mất doanh thu, nhưng ngân sách khuyến mãi luôn có hạn nên
không thể tặng voucher cho tất cả. Cần (1) biết khách nào có nguy cơ ngừng mua, (2) chọn đúng người đáng
cứu nhất trong ngân sách, (3) làm việc đó tự động.

**Giải pháp.** Chấm xác suất rời bỏ cho từng khách bằng Logistic Regression đã hiệu chỉnh, xếp hạng theo
*tổn thất kỳ vọng* (`xác suất × giá trị khách hàng`), cắt theo ngân sách, rồi phát sự kiện để engine
campaign có sẵn (Camunda) tự phát voucher.

**Kết quả chính** (chi tiết và nguồn ở các mục sau):

| # | Kết quả | Con số | Mức | Mục |
|---|---|---|---|---|
| 1 | Sức phân biệt của model (AUC, grouped CV tách user) | **0,7354 ± 0,0138** | ✅ | 5 |
| 2 | Xếp theo tổn thất kỳ vọng so với xếp theo xác suất thuần (cùng ngân sách) | **12,75× – 60,27×** doanh thu rủi ro giữ được | ✅ (nhạy với tỉ giá giả định, xem 6.2) | 6 |
| 3 | Model vs rule tốt nhất tìm được | **Hòa về F1** (−0,0001, trong nhiễu 0,0031); model có AUC cao nhất; rule **không xếp hạng được** | ✅ | 5.2 |
| 4 | 9 thuật toán khác (CatBoost, XGBoost, LightGBM, RF, SVM, KNN…) | không cái nào vượt sàn nhiễu so với Logistic Regression; 4 cái **kém hơn** | ✅ | 5.1 |
| 5 | Mở rộng đặc trưng (7 khối ứng viên) | cả 7 bị loại; gộp cả 7 chỉ +0,0044 | ✅ (2 khối chưa đo được, xem 4.3) | 4 |
| 6 | Cảnh báo sớm theo chuỗi sự kiện giỏ hàng (24 giờ → 7 ngày) | AUC 0,6321 → **0,6486** khi thêm đặc trưng trình tự | ✅ (biên mỏng, xem 7) | 7 |
| 7 | Đường chấm điểm thật (HTTP) sau khi sửa kiến trúc | từ treo 53+ phút xuống **25,4 giây**; chạy trọn vòng không lỗi | ✅ | 8 |

**Năm giới hạn lớn nhất — nói trước để không phải bị bới ra:**
1. Dữ liệu là hành vi thật nhưng của **một sàn khác** (REES46), ánh xạ sang catalog Tiki — không phải khách
   của hệ thống này (mục 2).
2. Nhãn là *"không mua lại trong 60 ngày"*, **không** phải "rời bỏ vĩnh viễn"; cửa sổ 60 ngày do dữ liệu chỉ
   dài 151 ngày ép buộc (mục 3.4).
3. Model **không thắng rule tốt nhất về F1**; luận điểm cần AI dựa vào năng lực xếp hạng, không dựa vào độ
   chính xác phân loại (mục 5.2).
4. **Chưa có vòng phản hồi:** hệ thống chưa biết voucher có thật sự giữ được khách hay không (mục 11).
5. Demo trực tiếp trên dữ liệu này **không phát ra voucher nào** — đúng theo dữ liệu, không phải lỗi
   (mục 8.4).

---

## 1. Tính năng làm gì

User đăng nhập → xem sản phẩm, thêm giỏ hàng → **không thanh toán** → hệ thống tự phát hiện dấu hiệu có
thể rời bỏ → **tự động** kích hoạt chiến dịch khuyến mãi (voucher/email) cho đúng user đó, không cần admin
rà từng khách. Admin vào tab **Coupon Code** tạo campaign với trigger "Nguy cơ rời bỏ (AI)" → dựng hành
động → activate; từ đó hệ thống tự chạy.

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

**AI chỉ ở đúng một bước.** Mọi bước còn lại là hạ tầng hoặc rule:

| Bước | Có phải AI? |
|---|---|
| Ghi nhận hành vi (xem SP, thêm giỏ) → Kafka → bảng `user_events` | ❌ ETL thuần |
| Tính 11 đặc trưng cho mọi khách (`feature_store`) | ❌ thống kê thuần, không học |
| **Chấm xác suất rời bỏ + gán phân khúc** (`train.py`, `risk_scoring.py`) | ✅ **duy nhất bước này** |
| Lọc "vừa bỏ giỏ trong 24 giờ" (`risk_scheduler.py`) | ❌ rule tay, **cố ý** (mục 6.1) |
| Publish sự kiện, tìm campaign, chạy Camunda | ❌ workflow engine |

---

## 2. Dữ liệu

### 2.1 Quyết định và lý do

**Chốt (2026-10-02, chủ dự án):** catalog = Tiki thật · hành vi + giao dịch = **REES46 đa ngành 12/2019–4/2020
đã transform** vào schema hệ thống · mỗi lớp dữ liệu lấy từ **một** nguồn thật, không trộn nguồn thứ hai.
Bộ sinh dữ liệu tổng hợp chỉ còn dùng cho unit test. *(Log mục 2026-10-02 chiều)*

**Vì sao bỏ bộ sinh tổng hợp** — ✅ đo được: đối chiếu với hành vi thật cho thấy bộ sinh lệch ở lõi động
lực mua/rời bỏ: tỉ lệ khách mua lặp không mua lại trong 60 ngày là **0,24** (bộ sinh) so với **0,54**
(REES46); lượt xem/ngày sau lần mua cuối của nhóm rời bỏ là **0,60** so với **0,18**. Lý do sâu hơn: với dữ
liệu tổng hợp, model chỉ chứng minh được việc *"phục hồi cấu trúc do chính mình đặt vào"* — vòng tròn.
*(Log mục 2026-10-01 "Hành vi TRƯỚC/SAU churn")*

**Các phương án đã xét và loại:**

| Phương án | Vì sao loại | Bằng chứng |
|---|---|---|
| Bộ sinh tham số đặt tay | Lệch lõi động lực (số trên); không kiểm chứng được gì độc lập | Log 2026-10-01 |
| Bộ sinh neo BG/NBD (Online Retail II) | Đã làm và hiệu chỉnh xong, nhưng chủ dự án chọn transform dữ liệu thật thay vì mô phỏng | Log 2026-10-01, 2026-10-02 |
| Olist (marketplace Brazil) | Chỉ ~3% khách mua lặp; churn 97,3% thoái hóa; không có clickstream | ✅ 2.801/93.897 user có ≥2 đơn; churn 0,9729 — Log 2026-08-03 |
| RetailRocket | Chỉ 3 loại sự kiện (xem/thêm giỏ/mua) → không đủ để kiểm giả thuyết thứ tự hành vi | Log 2026-08-04 |
| REES46 Cosmetics | Một ngành duy nhất; chỉ dùng cho các thí nghiệm nghiên cứu riêng | Log 2026-10-02 |

### 2.2 Quy mô

✅ **332.347 user · 102.004 đơn · 7.378.602 sự kiện.** Sau khi lọc dân số huấn luyện (≥ 2 đơn DELIVERED):
panel **31.458 dòng / 10.501 user** (từ 774.301 dòng ứng viên). Khi chấm điểm thật: **17.737** trên
**332.349** user thuộc dân số hợp lệ (5,3%). *(Log mục 2026-10-05, 2026-10-06)*

### 2.3 Ba lỗi của chính nguồn REES46 đã phát hiện và xử lý

Không dùng nguồn "như tải về" — kiểm tra trước khi tin. *(mapping §6.1, §6.2, §9)*

| Lỗi | Bằng chứng đo | Xử lý |
|---|---|---|
| Log giỏ hàng bị ghi thiếu ở 10–11/2019 | Lượt mua có thêm giỏ đúng SP trong phiên: **36,5%** (10/2019) so với **99,0%** (12/2019) | Chỉ dùng 12/2019–4/2020 |
| Mã danh mục sai từ 12/2019 | Trong 75.892 SP có mặt ở cả 10/2019 và 12/2019, chỉ **19,7%** giữ `category_id` nhưng brand khớp **98,3%** | Lập bảng tham chiếu ngành từ 10–11/2019; SP mới suy từ brand |
| 4 ngày mất gần hết log mua hàng | 01/01, 02/01, 20/04, 21/04/2020: lượt mua tụt về 0–3.574 (bình thường ~29.000/ngày) trong khi xem/giỏ bình thường | Loại 4 ngày khỏi dữ liệu **mua hàng**, giữ view/cart; không suy đoán số thay thế |

### 2.4 Các giả định khi ánh xạ (⚠️) và hệ quả

- **Giá = giá thật (USD) × 25.000.** Chi tiêu tuyệt đối là *đơn vị quy đổi*, chỉ có nghĩa tương đối. Mọi
  kết quả dùng `monetary` được trình bày dưới dạng **tỉ lệ**, không neo vào số VNĐ.
- **Sản phẩm ánh xạ sang catalog Tiki theo danh mục + giá gần nhất** — tên/giá hiển thị có thể không khớp
  sản phẩm thật. Không ảnh hưởng đặc trưng (không dùng tên SP).
- **Mua = `DELIVERED`; nguồn không có huỷ/hoàn/mã giảm giá** ⇒ `cancel_rate` và `discount_dependency`
  **luôn bằng 0** trong dữ liệu này (✅ permutation importance đúng 0,0). Xem 4.3 về việc này có mất gì không.
- Dữ liệu được **dịch nguyên tuần về hiện tại** nên mọi mốc rơi vào khoảng 2026-05-03 → 2026-10-01 và
  **dừng ở 2026-10-01** (hệ quả ở mục 8.4).

---

## 3. Định nghĩa bài toán

### 3.1 Nhãn hiện tại — `churn_label_v3_orders_60d_min2_rees46real` ✅

- 5 mốc cắt cách đều, **61–137 ngày trước cuối dữ liệu**; tại mỗi mốc, đặc trưng chỉ tính từ dữ liệu *đến
  mốc đó*.
- **Nhãn = 1 nếu user không đặt đơn nào trong 60 ngày sau mốc.**
- Chỉ tính user có **≥ 2 đơn `DELIVERED`** tại mốc.
- Kết quả: 31.458 dòng, tỉ lệ nhãn 1 = **0,6311**.

### 3.2 Vì sao nhãn lấy từ *đơn hàng*, không từ *hoạt động* (xem/mua)

Bản đầu dùng nhãn "không có hoạt động nào (xem **hoặc** mua) trong 30 ngày tới". Vấn đề — ✅ đo được: đặc
trưng mạnh nhất (`category_diversity_viewed`, lấy từ `user_events`) cùng nguồn với nhãn; khi xáo trộn nó,
AUC tụt **0,2253**, áp đảo mọi đặc trưng khác (**7,9×** đặc trưng hạng nhì). Bài toán thành "đang hoạt động có
tiếp tục hoạt động không" — AUC 0,93 nhưng phản ánh *tính bền của hoạt động*, không phải dự đoán rời bỏ.
Quét 12 biến thể nhãn (cửa sổ 60/90/120 ngày × nguồn nhãn × lọc dân số) rồi chọn nhãn *orders*.
*(Log mục 2026-07-28 "Nghi vấn về định nghĩa nhãn"; 2026-08-01 "Tầng 0.2")*

**Điều không được khẳng định:** phần lớn mức giảm độ áp đảo (0,2253 → ~0,09) đến từ việc *lùi mốc cắt*,
không phải từ việc đổi nguồn nhãn (so cùng bộ mốc, `activity` vs `orders` gần như không đổi: 0,0925 vs
0,0895). Chỉ được nói *"đã giảm độ tập trung, đặc trưng đơn hàng bắt đầu có vai trò"*, **không** nói
*"đã phá tautology"*. *(Log 2026-08-01)*

### 3.3 Vì sao chỉ tính khách có ≥ 2 đơn

- **Ngữ nghĩa:** khách chưa từng mua hoặc mới mua 1 lần không phải "khách mua hàng đã rời bỏ", và không
  phải đối tượng campaign cứu khách.
- **Bằng chứng nó quan trọng** ✅: khi dân số gồm cả khách chưa từng mua (`monetary ≈ 0`), lợi thế xếp theo
  tổn thất kỳ vọng bị *thổi lên* (8,04× ở K=25); sau khi siết ≥ 2 đơn còn **2,18×** (dữ liệu tổng hợp lúc đó).
  Con số cũ đã bị rút lại (mục 12). *(Log 2026-08-01)*
- **Hệ quả:** model chỉ có nghĩa với 5,3% khách (17.737/332.349). Chấm điểm ngoài dân số này là *ngoại suy*,
  nên đường production lọc đúng dân số này ở tầng 0.

### 3.4 Vì sao cửa sổ 60 ngày — và đây là điểm yếu có thật

- **Lý do thực tế:** dữ liệu chỉ dài ~151 ngày; lưới cutoff gốc (cửa sổ 120 ngày + 5 mốc) cần ≥ 390 ngày.
  60 ngày là lựa chọn duy nhất còn đủ 5 mốc có nghĩa. *(Log 2026-10-05)*
- **Điểm yếu:** trước đó đã loại cửa sổ 60 ngày trên dữ liệu tổng hợp vì nhiễu Poisson — ✅ dự đoán
  `e^−1 ≈ 0,37` khách khỏe bị dán nhãn churn, đo được **0,3751**. Trên REES46, tỉ lệ nhãn 1 là **0,6311**; tức
  nhãn mang nghĩa *"không mua lại trong 60 ngày"*, không phải "bỏ đi vĩnh viễn".
- **Bằng chứng về khoảng cách giữa hai khái niệm** (dữ liệu **tổng hợp**, có ground truth ẩn): trong số dòng
  bị gắn churn@120 ngày, chỉ **24,6%** là đã rời bỏ thật, **75,4%** còn sống nhưng mua chậm; trần AUC
  (oracle) = 0,879. *(Log 2026-10-02, `churn_signal_decomposition.json`)*
- ❌ **Chưa kiểm chứng** trên dữ liệu thật: không có ground truth "rời bỏ thật" nên tỉ lệ 75% này không đo
  được trên REES46.
- **Nhãn cố định theo chu kỳ ngành** ✅ (dữ liệu tổng hợp): nhóm mua nhanh bị gắn churn **35,0%**, nhóm chậm
  **49,5%** trong khi tỉ lệ rời bỏ thật gần bằng nhau (10,6% vs 11,1%) — chênh lệch là hiện vật của cửa sổ.
  Có 4 phương án (A–D: cửa sổ theo ngành, theo nhịp riêng, điểm BG/NBD, churn theo ngành); **chưa phương án
  nào được áp dụng**. *(Log 2026-10-02 tiếp)*

### 3.5 Cách đánh giá — vì sao grouped CV

Mỗi fold: tập test là các user **được giữ lại** ở mốc gần nhất; tập train là các user **khác** ở các mốc
**cũ hơn** ⇒ vừa tách user (model không nhận diện được user đã thấy) vừa giữ nhân quả thời gian. Báo
**mean ± std** qua 5 fold.

Lý do và bằng chứng: AUC đầu tiên (0,9313) tính khi train/test chung user. Giả thuyết "đã bị thổi lên" **sai về
độ lớn** — ✅ đo được: chung user cho 0,9402, tách user cho 0,9381, tức rò rỉ chỉ **+0,0021**. Giá trị thật
của việc chuyển sang grouped CV là cho ra **sàn nhiễu (±0,026)**, nhờ đó biết mọi "cải thiện" dưới ~0,05 là
nhiễu. *(Log 2026-07-28)* Trên dữ liệu thật: chung user 0,7357 so với tách user 0,7354 (chênh **0,0003**, từ
`retrain_rees46_real.json`) — không có dấu hiệu rò rỉ.

---

## 4. Đặc trưng — vì sao 11 là đủ

### 4.1 Danh sách

| Nhóm | Đặc trưng |
|---|---|
| Từ đơn hàng (`orders`) | `recency`, `frequency`, `monetary`, `avg_order_value`, `cancel_rate`, `discount_dependency` |
| Từ hành vi (`user_events`) | `recent_view_count`, `days_since_last_activity`, `cart_abandon_count`, `view_to_cart_conversion_rate`, `category_diversity_viewed` |

Định nghĩa một lần tại `AI/shared-common/shared_common/features/`, dùng chung cho KMeans và Logistic Regression.

### 4.2 Model thật sự dựa vào đâu ✅ *(`ablation_rees46_real.json`)*

| Đặc trưng | AUC tụt khi xáo trộn |
|---|---:|
| `days_since_last_activity` | **0,1441 ± 0,011** |
| `recency` | 0,0134 |
| `frequency` | 0,0045 |
| `category_diversity_viewed` | 0,0032 |
| 7 đặc trưng còn lại | ≈ 0 |

L1 path: **3 đặc trưng** (`category_diversity_viewed`, `days_since_last_activity`, `recency`) cho AUC **0,7316**,
so với 11 đặc trưng **0,7354** — chênh 0,0038, nhỏ hơn sàn nhiễu 0,0138. **Đọc đúng:** model dựa gần như hoàn
toàn vào *độ mới của hoạt động*. Hệ số Logistic Regression **không** dùng để đọc độ quan trọng vì đa cộng tuyến
(đã có bằng chứng: `cart_abandon_count` hệ số lớn thứ 2 nhưng permutation importance ≈ 0 — Log 2026-07-28).

### 4.3 Đã thử mở rộng và bị loại ✅

Tiêu chí đặt trước: giữ một khối đặc trưng chỉ khi **ΔAUC > sàn nhiễu** (std AUC của baseline = 0,0138), kèm
**đối chứng âm** (khối cố ý vô nghĩa) để kiểm tra chính bộ đo.

| Khối | ΔAUC | Kết luận |
|---|---:|---|
| `abandon_shape` | +0,0004 | loại |
| `gap_dispersion` (khoảng cách giữa các lần mua) | +0,0016 | loại |
| `session` | +0,0007 | loại |
| `noise_control` (**đối chứng âm**) | **+0,0032** | loại — cao hơn cả 3 khối "thật" ở trên |
| `review`, `voucher` | 0,0000 | ❌ **chưa đo được** (xem dưới) |
| `temporal_rhythm` | 0,0000 | ❌ **chưa điều tra** (xem dưới) |
| **Gộp cả 7 khối (28 đặc trưng)** | +0,0044 | loại (= 0,32× sàn nhiễu) |

Đối chứng âm ăn điểm cao hơn các khối thật chính là bằng chứng các ΔAUC dương nhỏ không phân biệt được với
việc thêm đặc trưng vô nghĩa.

**Không được đọc quá mức:**
- `review`, `voucher`: nguồn REES46 không có dữ liệu này nên hai khối nhận *giá trị mặc định hằng số* ⇒
  ΔAUC đúng 0,0000 là "**chưa đo được**", không phải "không có tín hiệu".
- `temporal_rhythm` có tính thật từ sự kiện nhưng ΔAUC đúng 0,0000 và mọi metric trùng baseline tới 4 chữ
  số — dấu hiệu hai đặc trưng gần như hằng số hoặc không vào được model; nguyên nhân **chưa được ghi/kiểm tra**.
- `cancel_rate` (hằng số 0 trong REES46) được kiểm riêng trên Online Retail II (hóa đơn huỷ thật, 39.224 dòng /
  3.479 khách): ΔAUC **+0,0011 ± 0,0013** (Logistic), +0,0001 ± 0,0025 (Gradient Boosting) — **không đạt** tiêu
  chí đặt trước; đặc trưng huỷ đơn có tín hiệu riêng (AUC 0,56–0,63) nhưng trùng thông tin với RFM
  (khách có huỷ churn *ít* hơn: 34,1% vs 51,8%). ⇒ Bỏ nó **không mất gì đo được**. *(Log 2026-10-02 chiều)*

**Vì sao không thêm đặc trưng xu hướng/độ dốc tần suất** (đề xuất ban đầu bị loại): trên bộ sinh tổng hợp
chúng đọc thẳng cơ chế sinh (λ tụt bậc) → suy luận vòng tròn. *(Log 2026-07-28)*

---

## 5. Mô hình

### 5.1 Vì sao Logistic Regression ✅ *(`algorithm_comparison_full_rees46_real.json`)*

**Lý do chọn ban đầu** (2026-07-27, trước khi có số đo): cho xác suất hiệu chỉnh tốt, ít tham số (an toàn với
mẫu nhỏ), giải thích được hệ số. **Kiểm chứng sau đó** — 10 thuật toán trên *cùng fold* grouped CV, cùng
panel 31.458 dòng:

| Thuật toán (năm) | AUC | ΔAUC so với LR | Kết luận |
|---|---:|---:|---|
| **Logistic Regression (1958)** | **0,7354 ± 0,0138** | — | production |
| Random Forest (2001) | 0,7436 | +0,0082 | trong nhiễu |
| CatBoost (2017) | 0,7430 | +0,0076 | trong nhiễu |
| XGBoost (2014) | 0,7381 | +0,0027 | trong nhiễu |
| GradientBoosting sklearn (2001) | 0,7372 | +0,0018 | trong nhiễu |
| LightGBM (2017) | 0,7368 | +0,0014 | trong nhiễu |
| Decision Tree đơn (1984) | 0,7232 | −0,0122 | **kém hơn** |
| KNN (1967) | 0,7194 | −0,0160 | **kém hơn** |
| Gaussian Naive Bayes | 0,7155 | −0,0199 | **kém hơn** |
| SVM RBF (1995) | 0,7099 | −0,0255 | **kém hơn** (và mất 411,8 giây) |

Chênh lệch tốt nhất (+0,0082) = **0,59×** sàn nhiễu. **Lập luận:** không có thuật toán nào cho lợi ích đo được,
nên chọn mô hình *đơn giản nhất, giải thích được, cho xác suất hiệu chỉnh được*. Nhất quán với 4.2: nếu chỉ
~3 đặc trưng mang tín hiệu thì model phức tạp không có gì thêm để khai thác.
**Giới hạn:** siêu tham số các model đối chứng được cố định trong script (vd Random Forest 300 cây, độ sâu 6),
**không tune**; kết luận là "ở cấu hình hợp lý, không hơn", không phải "không bao giờ hơn". Trên dữ liệu
tổng hợp trước đó cũng cho kết quả cùng chiều (LightGBM 0,7340 so với LR 0,7521 — `diagnose_model_ceiling.py`,
ghi trong bản overview ở commit `a12c881`, không có trong log). *(Log 2026-10-05 "Tầng 2.3")*

### 5.2 Vì sao không dùng rule if-else ✅ *(`rule_benchmark_rees46_real.json`)*

**Nguyên tắc chống tự lừa mình:** không chọn một rule yếu rồi đánh bại nó. Benchmark **quét lưới** để tìm rule
TỐT NHẤT ở 3 mức (rule 1 biến; rule 2 điều kiện AND; cây quyết định sâu 1/2/3 — tập rule *do máy tìm*), chọn
ngưỡng trên tập train, đo trên tập test, cùng bộ fold với model. Từng có lỗi thiết kế ở lần chạy đầu (rule
được tune ngưỡng còn model đo ở 0,5 — khi đó model *thua*); đã sửa để cả hai cùng tune. *(Log 2026-08-01)*

| Phương pháp | F1 | AUC |
|---|---:|---:|
| Rule viết tay `days_inactive>7 AND cart_abandon>=1` | 0,187 | — |
| Rule viết tay `recency>30 AND cart_abandon>=2` (RFM kinh điển) | 0,066 | — |
| Rule viết tay `recency>90` | 0,016 | — |
| Rule 1 biến tối ưu (`recency >= 4`) | 0,8179 | 0,6889 |
| Rule 2 biến AND tối ưu (`recency>=2 AND frequency>=2`) | 0,8187 | — |
| Cây quyết định sâu 3 (rule mạnh nhất tìm được) | **0,8245** | 0,733 |
| **Model (LR + hiệu chỉnh isotonic)** | 0,8244 | **0,7352** |

**Đọc đúng, không tô hồng:**
1. **Model KHÔNG thắng rule tốt nhất về F1** (−0,0001, nằm trong nhiễu 0,0031).
2. **Cảnh báo về chính thước đo F1:** tỉ lệ nhãn 1 là 0,6311, nên một "model" đoán *tất cả đều churn* đã
   đạt F1 ≈ **0,774** (tính từ tỉ lệ nhãn, không phải số đo). F1 0,82 chỉ hơn mốc tầm thường ~0,05 ⇒ F1 ở đây
   nén sai khác. (Cùng bài học đã gặp ở RetailRocket: F1 0,8238 cho "đoán tất cả" — Log 2026-08-04.)
3. **Model có AUC cao nhất** trong mọi phương pháp (0,7352), nhưng chênh với cây sâu 3 (0,733) rất nhỏ.
4. **Rule viết tay "vài câu if/else" thua xa** (F1 0,016–0,187): rule tốt phải được quét lưới + chia fold +
   giữ tập test — tức chính bộ máy của ML.
5. **Luận điểm chính — năng lực, không phải độ chính xác:** rule trả nhãn nhị phân, không có xác suất liên
   tục để nhân với giá trị khách hàng nên **không thể phân bổ ngân sách theo tổn thất kỳ vọng** (mục 6.2). Đây là
   khác biệt về năng lực, không phụ thuộc bộ dữ liệu hay lượt lấy mẫu.
   *Đã hiệu chỉnh một lập luận sai của chính mình:* từng viết "rule không phân mức được" — **sai**; rule xếp
   tầng được (cây sâu 2 cho 4 bậc điểm, model cho 207 bậc, tại K=50 rule có 48 người đồng hạng so với 2).
   Khác biệt là *độ mịn của thứ tự*, không phải "làm được / không làm được". *(Log 2026-08-04)*

**Vì sao kết quả này không phụ thuộc may rủi:** margin F1 giữa model và rule đã dao động qua 3 lượt đo —
+0,0519 (vượt nhiễu, dữ liệu tổng hợp lần 1), +0,0171 (trong nhiễu, tổng hợp lần 2 sau khi seed lại), −0,0001
(dữ liệu thật). Margin F1 **giòn** nên không dùng làm luận điểm; luận điểm "rule không xếp hạng được" đứng
vững ở cả 3 lượt.

**Khi nào rule là đủ, khi nào cần AI** (để không nói "AI luôn hơn"):
- ✅ Dữ liệu thật RetailRocket, bài toán bỏ giỏ hàng (69.332 mẫu): xếp hạng bằng 1 đặc trưng tốt nhất đạt AUC
  0,6592; cây sâu 2 (mức người viết tay được) 0,6987; model đầy đủ **0,7447** — hơn rule viết tay được **+0,046 =
  3,4× sàn nhiễu**. Với churn dài hạn (dữ liệu **tổng hợp**), 1 đặc trưng đã cho 0,7494 so với model 0,7738
(**0,4× nhiễu**) ⇒ rule đủ.
  *(Log 2026-08-04)*
- ✅ Thí nghiệm có kiểm soát (dữ liệu **tổng hợp**, hai "sự thật" trên cùng tập 20.000 phiên): khi sự thật có dạng
  rule, model chỉ hơn **+0,0008** (rule đủ); khi sự thật là tương tác 3 chiều + thứ tự, model hơn **+0,0997 =
  10× nhiễu**. Chứng minh *"nếu hành vi thật có dạng này thì rule thất bại"*, **không** chứng minh hành vi thật
  có dạng đó. *(Log 2026-08-04 "Thí nghiệm CÓ KIỂM SOÁT")*

### 5.3 Vì sao phải hiệu chỉnh xác suất, và vì sao isotonic

`LogisticRegression(class_weight="balanced")` khiến model ước lượng xác suất dưới tiên nghiệm 50/50 thay vì tỉ
lệ thật. Hiệu chỉnh là biến đổi đơn điệu nhưng **phi tuyến** nên AUC và thứ hạng theo `P` thuần *không đổi*,
còn thứ hạng theo **`P × giá trị`** thì *đổi* — đó là lý do mục 6.2 phụ thuộc trực tiếp vào bước này.

✅ So 4 phương án trong cùng cách chia fold (dữ liệu tổng hợp, 2026-07-31): model thô dự đoán trung bình
**0,4217** trong khi thực tế **0,2420** (thổi phồng ~1,74×).

| Phương án | ECE | Brier | AUC |
|---|---:|---:|---:|
| thô | 0,1797 | 0,1308 | 0,9316 |
| dịch tiên nghiệm | 0,0819 | 0,0976 | 0,9316 |
| Platt | 0,0726 | 0,0956 | 0,9316 |
| **isotonic** | **0,0391** | **0,0906** | 0,9314 |

`isotonic` giảm ECE **4,6×**, AUC không đổi (không có dấu hiệu overfit); lặp lại trên lượt dữ liệu khác: ECE
0,1709 → 0,0674. Phép kiểm tra tự động: AUC giống hệt nhau cho các biến đổi đơn điệu ngặt, đúng lý thuyết.
**Giới hạn:** ❌ trên dữ liệu REES46 thật, phép so sánh 4 phương án **chưa chạy lại** và ECE/Brier **chưa đo**;
production dùng lại phương pháp `isotonic` (`CalibratedClassifierCV`, 5 fold), tức là *giả định* nó vẫn tốt.

### 5.4 Ngưỡng 0,38 và vì sao nghiêng về recall

| Điểm vận hành (model đã hiệu chỉnh) | Precision | Recall | F1 |
|---|---:|---:|---:|
| Ngưỡng 0,5 | 0,7501 | 0,8902 | 0,8142 |
| **Ngưỡng 0,38 (đề xuất, đang dùng)** | 0,7208 | **0,9653** | 0,8253 |

*(Chưa hiệu chỉnh, ngưỡng 0,5: precision 0,7969 / recall 0,7344 / F1 0,7643 — đây là số "đầu bảng" của
`retrain_rees46_real.json`; không phải điểm vận hành thật.)*

**Lý do chọn điểm nghiêng recall:** ngưỡng chỉ định nghĩa *bể ứng viên*; số người thật sự nhận voucher do
ngân sách + xếp hạng quyết định. Bỏ sót ở cửa vào là mất hẳn, thừa ở cửa vào thì tầng xếp hạng lọc được ⇒
đúng **với điều kiện còn tầng xếp hạng phía sau** (bỏ tầng đó thì phải quay lại ngưỡng 0,5). Ngưỡng **đọc từ
metadata của chính model đang chạy**, không hardcode: ngưỡng tối ưu đổi theo định nghĩa nhãn và từng lần train
(0,24 → 0,26 → 0,38), nên hardcode sẽ âm thầm lạc hậu; model chưa hiệu chỉnh tự lùi về ngưỡng 0,5 kèm cảnh báo
(đã test cả hai nhánh). *(Log 2026-08-01)*

### 5.5 Phân khúc — KMeans, và vì sao gán nhãn theo tỉ lệ churn đo được

✅ **4 cụm** trên 11 đặc trưng; panel 31.458 dòng *(số dòng, không phải số user)*:

| Phân khúc | Số dòng | **Tỉ lệ churn đo được** | monetary TB (VNĐ) | recency TB (ngày) |
|---|---:|---:|---:|---:|
| **At Risk** | 8.570 | **0,8426** | 32.416.654 | **50,5** |
| Loyal Regulars | 10.265 | 0,6711 | 40.570.520 | 19,5 |
| Lapsed | 5.523 | 0,5602 | 15.175.844 | 16,2 |
| VIP Champions | 7.100 | 0,3731 | 75.312.825 | 11,0 |

At Risk có tỉ lệ churn **2,26×** VIP Champions (chênh **0,4695** ≫ ngưỡng cảnh báo 0,10), silhouette **0,3484**.

**Vì sao gán nhãn theo tỉ lệ churn đo được:** cách đầu (khớp 4 "archetype" vẽ tay) ✅ đã *gán sai thật* — nhóm
giá trị cao nhất bị gọi `New Customers`, `At Risk` rơi vào nhóm giá trị thấp nhất ⇒ phát voucher sai đối
tượng. Guard cảnh báo khoảng cách khớp đã bắt được lỗi này. Panel huấn luyện *có nhãn* nên không cần đoán:
`At Risk` = cụm có churn rate đo được cao nhất. Có cảnh báo tự động nếu chênh lệch < 0,10 (khi đó cổng
segment gần như vô ích). *(Log 2026-08-01 "Phân khúc bị hỏng")*

**Giới hạn:** ❌ **`k = 4` là lựa chọn thiết kế từ đầu** (khớp 4 archetype), log **không** có thí nghiệm quét
`k`. Silhouette 0,3484 là cấu trúc cụm *vừa phải*, không sắc nét. Bằng chứng cho giá trị của cổng segment là
độ chênh churn rate 0,4695, không phải chất lượng cụm. Dùng `QuantileTransformer` thay `MinMaxScaler` cho
KMeans vì giá trị mặc định 9999 kéo giãn thang làm 99% user dồn về gần 0 (silhouette tổng hợp 0,286 → 0,303).

---

## 6. Từ dự đoán đến quyết định

### 6.1 Bốn tầng lọc, và vì sao đúng thứ tự này

| Tầng | Việc | Là AI/rule | Lý do |
|---|---|---|---|
| 0 | Dân số ≥ 2 đơn DELIVERED | rule | khớp dân số huấn luyện, tránh ngoại suy (3.3) |
| 1 | Segment "At Risk" **và** xác suất ≥ ngưỡng | AI | cổng có cơ sở đo được (5.5) |
| 2 | Vừa bỏ giỏ hàng trong 24 giờ | rule | **AI quyết định ai đáng lo, rule quyết định *khi nào* nhắc** |
| 3 | Xếp hạng theo `P × monetary`, cắt `RISK_MAX_VOUCHERS_PER_SCAN` | quyết định | ngân sách luôn có hạn |

Thứ tự **lọc → xếp hạng → cắt ngân sách là bắt buộc**: cắt trước thì suất voucher rơi vào người rồi bị rule
thời điểm loại, lãng phí ngân sách. ✅ Kiểm chứng: `rank 1` có P=0,7265 xếp *trên* `rank 6` có P=0,9505 vì
giá trị 943.879.000₫ so với 273.538.000₫ — xếp theo xác suất thuần sẽ đảo ngược cặp này. *(Log 2026-07-28)*

### 6.2 Xếp theo tổn thất kỳ vọng ✅ *(`retrain_rees46_real.json`, `metrics.classifier.ranking`)*

`expected_loss = P(churn) × monetary`. Một khách P=0,95 mua 200 nghìn không đáng bằng khách P=0,70 mua 5 triệu.
Phần doanh thu-đang-rủi-ro thu được trong top K (tổng **283.950.553.000₫**, 10.501 user, xác suất đã hiệu chỉnh):

| K | Xếp theo `P` | Xếp theo `P × monetary` | **Hệ số nhân** | precision@K (theo P / theo tổn thất) |
|---:|---:|---:|---:|---|
| 25 | 0,15% | 9,04% | **60,27×** | 0,96 / 0,92 |
| 50 | 0,34% | 11,40% | **33,53×** | 0,98 / 0,82 |
| 100 | 0,84% | 15,44% | **18,38×** | 0,97 / 0,79 |
| 200 | 1,84% | 23,46% | **12,75×** | 0,95 / 0,78 |

Xếp theo xác suất thuần đúng nhãn (precision 0,95–0,98) nhưng chọn trúng nhiều khách giá trị nhỏ, gần như không
cứu được doanh thu; xếp theo tổn thất kỳ vọng đánh đổi một ít precision lấy 12–60× doanh thu. Lợi thế lớn nhất
khi **ngân sách chật** và giảm dần khi ngân sách rộng (đúng chỗ nó có ích trong thực tế).

**Điều kiện và độ nhạy — phải nói cùng với con số:**
- ⚠️ `monetary` = tổng giá trị đơn lịch sử × tỉ giá giả định 25.000, không phải giá trị vòng đời khách hàng thật.
  Chỉ trình bày như một **tỉ lệ**, không neo vào số VNĐ.
- ⚠️ Hệ số rất **nhạy với phân phối giá trị**: cùng phép đo cho 3,7–7,7× (tổng hợp, gồm khách chưa mua), 1,5–2,2×
  (tổng hợp, ≥ 2 đơn), 12,75–60,27× (dữ liệu thật). Khác nhau là do dân số và phân phối `monetary`, không phải
  do lỗi tính — nhưng nó cho thấy con số **không phải hằng số của phương pháp**.
- ❌ **Chưa kiểm tra hòa điểm.** `_ranking_metrics` dùng `nlargest(k, …)` mặc định `keep='first'` (hòa điểm ⇒ lấy
  theo thứ tự xuất hiện, không theo giá trị). Hiệu chỉnh isotonic tạo các "bậc thang" xác suất nên có thể có
  nhiều khách cùng `P` ở top; số lượng hòa điểm **chưa đo, chưa ghi log**. Nếu có, cột "theo `P`" (0,15%–1,84%)
  một phần phản ánh việc chọn tùy tiện trong nhóm hòa điểm, làm hệ số nhân bị phóng đại. Chưa biết mức độ.

### 6.3 Next-Best-Action

Campaign Builder đã có sẵn node điều kiện `Condition_ChurnRiskTier` (rẽ nhánh theo % xác suất đã hiệu chỉnh) và
nhiều loại action (voucher %, tiền, freeship, điểm thưởng, nâng hạng, email) — admin kéo-thả được luồng "rủi ro
cao → voucher mạnh, vừa → freeship" mà không cần code. Đã kiểm chứng bằng harness Java `validate()` + `compile()`
ra BPMN XML hợp lệ (7.311 ký tự, đủ `exclusiveGateway` + 2 `conditionExpression`). **Chưa có:** campaign mẫu dựng
sẵn; chưa chạy process instance thật; nhánh rẽ theo **ngưỡng % người đặt**, chưa theo 4 phân khúc KMeans — tức
vẫn là "rule trên con số AI", chưa phải chính sách học được từ hiệu quả thật. *(Log 2026-08-03 "Tầng 3")*

---

## 7. Phát hiện bổ sung — cảnh báo sớm theo chuỗi giỏ hàng

**Động cơ (chủ dự án chỉ ra):** nhãn 60/120 ngày chỉ "thấy" khách khi cơ hội gần như đã mất; tín hiệu nằm ở
*liên kết dữ liệu* (thêm giỏ → xem sản phẩm khác → thêm giỏ tiếp) hơn là con số gộp.

✅ **Đo độ muộn** (REES46 Cosmetics, **3.570.193** lượt thêm giỏ): 74,7% giỏ không bao giờ thành đơn (cùng SP, 30
ngày). Trong số giỏ **có** mua lại: **52,5% trong 1 giờ, 76,3% trong 24 giờ, 91,3% trong 7 ngày**; khả năng
quay lại mua cùng SP rơi từ 13,9% (sau 1 giờ) xuống 2,9% (sau 7 ngày). *(`cart_recovery.json`)*

✅ **Thí nghiệm** (REES46 trong DB hệ thống; 133.404 episode giỏ, quan sát 24 giờ → nhãn "mua lại đúng SP trong 7
ngày", tỉ lệ dương 5,61%; GroupKFold theo user; cùng pipeline LR):

| Bộ đặc trưng | AUC |
|---|---:|
| Set A — đếm/gộp 24 giờ (4 đặc trưng, không thứ tự) | 0,6321 ± 0,0091 |
| **Set A+B — thêm 7 đặc trưng liên kết/trình tự** | **0,6486 ± 0,0047** |
| Set A + đối chứng âm ngẫu nhiên | 0,6314 ± 0,0095 |

ΔAUC = **+0,0165**; đối chứng âm không nhích (−0,0007). Mạnh nhất: `viewed_same_item_again` (quay lại xem chính SP đã
thêm giỏ; tụt 0,0422), tiếp theo `n_distinct_items_viewed_obs` (0,0265), `last_event_is_other_view` (0,0255).

**Giới hạn cần nói thẳng:** ΔAUC = **1,8×** std của Set A, vượt tiêu chí "> 1× sàn nhiễu" đang dùng nhưng **chưa
đạt** mức "> 2× std" đã dùng ở thí nghiệm huỷ đơn (tiêu chí không đồng nhất giữa các thí nghiệm). AUC 0,65 yếu hơn
model churn (0,735) và là bài toán khác (mốc 7 ngày, cấp episode) — **dùng cho nghiên cứu/minh họa, không thay
model production**; chưa thử model phi tuyến. Lịch sử: giả thuyết "thứ tự hành vi mang thông tin" từng **bị bác
bỏ** trên RetailRocket (ΔAUC −0,0009; nguyên nhân đo được: chỉ 3 loại sự kiện nên bigram trùng với số đếm) và nay
được ủng hộ ở đích ngắn hạn trên REES46 (nhiều loại sự kiện hơn, có phiên thật).

---

## 8. Độ tin cậy khi vận hành

### 8.1 Cơ chế an toàn đã xây — và sự cố thật sinh ra chúng

| Cơ chế | Sự cố/lý do đã đo |
|---|---|
| **Grouped CV** | AUC chỉ có một con số, không biết nhiễu (3.5) |
| **Retrain gate**: chấp nhận model mới nếu `AUC mới ≥ AUC cũ − std cũ`; bỏ qua khi đổi định nghĩa nhãn hoặc lần đầu | Đã từ chối thật khi AUC tụt 0,8415 → 0,7745 sau reseed (2026-08-03); `latest` không đổi, artifact vẫn lưu đủ |
| **Guard chống nhiễm dữ liệu** (`_assert_panel_not_contaminated`) | ✅ Trộn dữ liệu Olist (2016–2018) với tổng hợp (2025–2026) cho **AUC 0,9908 giả** — model chỉ cần học "user thuộc nguồn nào". **Retrain gate cho qua** (gate chống *tụt* chất lượng, không chống *thổi phồng* giả) và model rác đã thay model production; phải khôi phục `latest.json` thủ công. Guard chặn khi *đồng thời* churn > 0,90 và > 50% user có đơn cuối cũ hơn mốc cắt sớm nhất; đã test cả nhánh chặn (HTTP 500) lẫn nhánh cho qua |
| **Tách huấn luyện khỏi vận hành** | `risk_scheduler` chỉ `predict`, không bao giờ refit: nếu model tự fit mỗi lần gọi, tâm cụm dịch chuyển và user "At Risk" giờ này có thể hết "At Risk" giờ sau chỉ vì khởi tạo lại |
| **Model card** (`GET /api/v1/models/card`) | Trả version, nhãn, metric, ngưỡng, giới hạn trong một lần gọi — đọc lại những gì registry đã lưu, không tính gì mới |
| **Bài học "build giả"** | `docker compose build` với Dockerfile kiểu `COPY target/*.jar` chỉ đóng gói lại jar cũ, không chứng minh code mới compile — lặp 3 lần mới rút thành quy tắc: `mvn package` JDK 17 tường minh, kiểm mtime jar, rồi mới build image |

### 8.2 Vì sao cần feature store ✅ *(Log 2026-10-06)*

Khi dữ liệu nhỏ (342 user), `predict()` tự chạy SQL tổng hợp mỗi lần — đủ nhanh để không ai để ý. Trên 332.347
user / 7,37 triệu sự kiện, câu `COUNT(DISTINCT category_id) GROUP BY user_id` **treo hơn 53 phút** (hai bản chạy
song song do scheduler + lần gọi thử, phải `KILL` tay). Đã có index đúng cho phần lọc nhưng `COUNT DISTINCT`
cần cột nằm ngoài index nên phải dựng bảng tạm + sắp xếp (đã thử: thêm index không cứu được).

Phát hiện này **chỉ có được vì gọi thật qua HTTP**: pipeline *huấn luyện* đã được viết lại bằng pandas từ
2026-10-05, nhưng pipeline *phục vụ* là một đường code khác, vẫn dùng SQL cũ. **Giải pháp:** tính trước 11 đặc
trưng bằng pandas (công thức đã xác minh khớp 100% SQL gốc trên mẫu user), lưu vào bảng `user_feature_vectors`,
`risk_scheduler` làm mới mỗi chu kỳ (1 giờ), `predict()` chỉ đọc bảng. **Đánh đổi chấp nhận:** dữ liệu chấm điểm
chỉ mới bằng lần làm mới gần nhất (endpoint trả `computed_at`). **Kết quả đo:** `GET /admin/analytics/segmentation`
= **200 OK trong 25,4 giây** (môi trường lúc đó đang chậm bất thường; chạy lại trong chu kỳ chỉ còn đọc bảng).

### 8.3 Hai lỗi production tìm được khi kiểm tra thật

1. **Chặn event loop:** `run_risk_scan()` là hàm `async` nhưng chạy thẳng code đồng bộ vài phút bên trong, làm
   consumer Kafka nền (cùng event loop) bỏ lỡ heartbeat. Sửa: tách phần tính toán đồng bộ, chạy qua thread pool.
2. **Lỗi dtype tuỳ phiên bản thư viện** (lỗi thật gây sai kết quả): `numpy.datetime64 + pd.Timedelta` có thể trả
   về `pd.Timestamp`, khiến `np.searchsorted` báo `'<' not supported between 'int' and 'Timestamp'`. Container
   production dùng numpy 2.2.6 (lỗi), máy phát triển numpy 2.4.6 (không lỗi). Chỉ lộ ra khi test qua container
   thật. Sửa: dùng `np.timedelta64`. **Bài học:** "đã test bằng Python trực tiếp" ≠ "đã test qua production" khi
   phiên bản thư viện hai môi trường khác nhau.

Môi trường: `.wslconfig` giới hạn VM Docker 2GB RAM cho cả MariaDB, Kafka, Elasticsearch, Keycloak, MongoDB, Redis,
PostgreSQL và forecast-service gây swap-thrashing (`free -h` trong VM: còn < 1GB, swap 85%) làm Docker tự treo —
không liên quan code. Tăng tạm lên 7GB để chạy kiểm tra, sau đó đã trả về 2GB.

### 8.4 Kết quả kiểm tra chạy thật cuối cùng

```
Risk scan done: 332.349 user chấm điểm → 17.737 trong dân số hợp lệ (≥ 2 đơn DELIVERED)
 → 10.563 at-risk → 0 đủ điều kiện (có bỏ giỏ hàng trong 24h) → 0 published
 [ngưỡng 0,38, model đã hiệu chỉnh = true]
```

**`published = 0` là đúng theo dữ liệu, không phải lỗi:** dữ liệu REES46 đóng băng đến 2026-10-01, trong khi quy
tắc tầng 2 so với đồng hồ thật (`NOW()`); khi chạy ở ngày sau đó, không user nào "vừa bỏ giỏ trong 24 giờ". Toàn
bộ chuỗi (chấm điểm → lọc dân số → lọc thời điểm → xếp hạng ngân sách → gọi Kafka producer) đã chạy không lỗi
qua đường HTTP mà production/FE thật đi qua.

**Đã kiểm chứng đến đâu:** luồng *voucher thật* (event → Camunda → voucher → hiển thị trên FE, đăng nhập bằng user
thật) đã verify ngày 2026-07-27 **với model cũ**. Với model và dữ liệu REES46 hiện tại, chuỗi chạy tới bước gọi
Kafka producer nhưng **chưa phát ra event nào** (do `published = 0`), nên đoạn Kafka → Camunda → voucher **chưa
được chạy lại** với dữ liệu hiện tại. Cũng chưa khởi động toàn bộ 9 service Java (eureka, gateway và 7 service
nghiệp vụ) cùng FE để test trọn vòng — đã chủ động giới hạn phạm vi kiểm tra trong forecast-service.

---

## 9. Bảng tra nhanh: quyết định → lý do → bằng chứng

| Quyết định | Phương án đã xét | Vì sao chọn | Bằng chứng | Mức |
|---|---|---|---|---|
| Dữ liệu = REES46 transform, mỗi lớp một nguồn | Bộ sinh tổng hợp; BG/NBD; Olist; RetailRocket | Bộ sinh lệch lõi (0,24 vs 0,54); tổng hợp thì chỉ "phục hồi cấu trúc tự đặt" | Log 2026-10-01/02 | ✅ |
| Dùng 12/2019–4/2020 | Dùng 10–11/2019 | Log giỏ 10–11 hỏng (36,5% vs 99,0%) | mapping §6.1 | ✅ |
| Nhãn từ `orders` | Nhãn `activity` | Cùng nguồn với đặc trưng mạnh nhất (7,9×) | Log 2026-07-28, 08-01 | ✅ |
| Chỉ ≥ 2 đơn | Mọi khách | Ngữ nghĩa + tránh phóng đại hệ số xếp hạng (8,04× → 2,18×) | Log 2026-08-01 | ✅ |
| Cửa sổ 60 ngày | 120 ngày | Dữ liệu chỉ 151 ngày (bị ép) | Log 2026-10-05 | ✅ lý do · ❌ chất lượng nhãn |
| Grouped CV tách user + nhân quả | Chia ngẫu nhiên | Cho ra sàn nhiễu ±0,0138 | Log 2026-07-28 | ✅ |
| 11 đặc trưng | +7 khối ứng viên | Cả 7 trong nhiễu; gộp +0,0044 | `ablation_rees46_real.json` | ✅ (2 khối chưa đo được) |
| Logistic Regression | 9 thuật toán khác | Không cái nào vượt nhiễu; 4 kém hơn; giải thích được | `algorithm_comparison_full…json` | ✅ (không tune siêu tham số) |
| Không dùng rule thay model | Rule 1/2 biến, cây sâu 1–3 | Rule không xếp hạng được; F1 hòa | `rule_benchmark_rees46_real.json` | ✅ |
| Hiệu chỉnh isotonic | Thô, dịch tiên nghiệm, Platt | ECE 0,1797 → 0,0391 | Log 2026-07-31 | ✅ trên tổng hợp · ❌ chưa đo trên thật |
| Ngưỡng 0,38 nghiêng recall | Ngưỡng 0,5 | Có tầng xếp hạng phía sau lọc lại | Log 2026-08-01, JSON | ✅ |
| KMeans k=4, gán nhãn theo churn | Khớp archetype | Archetype gán sai nhóm; chênh churn 0,4695 | Log 2026-08-01 | ✅ gán nhãn · ❌ chọn k |
| Xếp hạng `P × monetary` | Xếp theo `P` | 12,75–60,27× doanh thu giữ được | `retrain_rees46_real.json` | ✅ (nhạy giả định; hòa điểm chưa kiểm) |
| Rule tay cho tầng "thời điểm" | AI cho cả thời điểm | AI quyết định ai, rule quyết định khi nào | Log 2026-07-27 | ⚠️ thiết kế, chưa so sánh |
| Feature store | Chỉ đổi SQL → pandas tại chỗ | Đọc tức thời không phụ thuộc quy mô; chấp nhận độ trễ ≤ 1 giờ | Log 2026-10-06 | ✅ 25,4 giây |
| Không có vòng phản hồi trong phạm vi đồ án | Xây bảng outcome | Không đánh giá được: dữ liệu tổng hợp thì vòng tròn, dữ liệu thật chỉ ~10 user đăng nhập được | Log 2026-07-28 | ⚠️ chỉ thiết kế |

---

## 10. Phản biện dự kiến

**1. "AUC 0,735 có đáng gọi là hiệu quả không?"**
Ở mức vừa phải, không xuất sắc, và không nên nói khác. Cái mang lại giá trị không phải độ chính xác phân loại mà
là xác suất liên tục đã hiệu chỉnh để xếp hạng theo giá trị (mục 6.2). Mốc tham chiếu cùng panel: rule 1 biến tốt
nhất 0,6889, cây sâu 3 0,733. Hai bộ dữ liệu thật độc lập cho AUC cùng bậc: REES46 **0,7354**, Olist **0,7564 ± 0,0413**
(Olist có tỉ lệ nhãn 97,3% nên chỉ AUC so sánh được — Log 2026-08-03).

**2. "Cây quyết định sâu 3 đạt F1 bằng model — dùng rule cho đơn giản?"**
Đúng là F1 hòa (0,8245 vs 0,8244). Nhưng (a) rule trả nhãn nhị phân nên không xếp hạng được, không phân bổ ngân sách
theo tổn thất kỳ vọng được; (b) chiếc cây đó phải do máy tìm (quét lưới + CV) — rule viết tay thật chỉ đạt F1
0,016–0,187; (c) F1 bị nén vì tỉ lệ nhãn 0,63 (mốc "đoán tất cả" đã 0,774).

**3. "Sao không dùng XGBoost/mạng nơ-ron?"**
Đã thử 9 thuật toán: tốt nhất nhỉnh +0,0082 (0,59× nhiễu), 4 thuật toán kém hơn rõ. Chỉ ~3 đặc trưng mang tín hiệu
nên không còn gì để model phức tạp khai thác. Thừa nhận: không tune siêu tham số. Mạng nơ-ron/chuỗi không thử cho
churn dài hạn; ở đích ngắn hạn chỉ dùng LR (chưa thử phi tuyến).

**4. "Khách trong dữ liệu không phải khách của hệ thống — kết quả chuyển giao được không?"**
Chưa chứng minh. Hành vi và giao dịch là thật nhưng của một sàn khác (REES46), ánh xạ sang catalog Tiki theo danh
mục + giá. Bằng chứng gián tiếp: hai bộ dữ liệu thật độc lập (REES46, Olist) cho AUC cùng bậc. Không có dữ liệu thật
của chính hệ thống (chỉ ~10 user đăng nhập được).

**5. "Nhãn 60 ngày có đo đúng 'rời bỏ' không?"**
Không — nhãn là *không mua lại trong 60 ngày*. Cửa sổ do dữ liệu ngắn ép buộc. Trên dữ liệu tổng hợp có ground
truth, 75,4% dòng bị gắn churn@120 ngày vẫn còn sống; trên dữ liệu thật không đo được. Các phương án nhãn động theo
chu kỳ ngành/khách đã được đề xuất (A–D) nhưng chưa áp dụng.

**6. "Hệ số nhân 60× có thật không? Có bị thổi phồng không?"**
Con số tính đúng từ out-of-fold đã hiệu chỉnh, nhưng phải đọc kèm: (a) tỉ giá giả định nên chỉ có nghĩa tương đối;
(b) rất nhạy với phân phối giá trị (cùng phép đo từng cho 3,7×, 1,5–2,2×, nay 12,75–60,27×; số cũ đã rút lại);
(c) **chưa kiểm tra hòa điểm** khi xếp theo `P` — nếu isotonic tạo nhiều khách cùng `P` ở top thì cột "theo `P`"
bị tính thấp và hệ số bị phóng đại, mức độ chưa biết.

**7. "Vì sao tin rằng không cần thêm đặc trưng?"**
Có đối chứng âm (+0,0032, cao hơn 3 khối thật) cho thấy bộ đo không phân biệt được khối thật với khối vô nghĩa; gộp 7
khối chỉ +0,0044 (0,32× nhiễu); L1 path 3 đặc trưng ≈ 11 đặc trưng. Hạn chế: `review`/`voucher` không có dữ liệu
nguồn (chưa đo được), `temporal_rhythm` ΔAUC đúng 0 chưa điều tra, và ở đích ngắn hạn (7 ngày) đặc trưng trình tự **có**
giúp — kết luận "đủ" chỉ áp dụng cho nhãn 60 ngày cấp user.

**8. "Có rò rỉ dữ liệu không?"**
Đã kiểm: đặc trưng chỉ tính đến mốc cắt; train/test tách user và train ở mốc cũ hơn; so với chia chung user AUC chỉ
chênh 0,0003 (0,7357 vs 0,7354). Từng có ca nhiễm thật (AUC 0,9908 giả do trộn hai nguồn) và đã dựng guard chặn.

**9. "Vì sao ngưỡng 0,38?"**
Tune trên thang đã hiệu chỉnh theo F1, và chọn điểm nghiêng recall (0,9653) vì phía sau còn tầng xếp hạng theo ngân
sách. Ngưỡng lấy từ metadata model, không hardcode.

**10. "Phân khúc k=4 dựa vào đâu?"**
Chọn từ thiết kế (khớp 4 nhóm nghiệp vụ), **không** quét `k`. Cái đo được là giá trị của cổng: At Risk churn 0,8426 so
với VIP 0,3731 (chênh 0,4695); silhouette 0,3484 là cụm vừa phải. Gán nhãn theo churn đo được sau khi cách khớp
archetype gán sai nhóm.

**11. "Đã chạy thật end-to-end chưa? Sao `published = 0`?"**
Chuỗi chấm điểm → lọc → xếp hạng → gọi Kafka đã chạy thật qua HTTP không lỗi (mục 8.4). `published = 0` vì dữ liệu đóng
băng đến 2026-10-01 nên không có ai "vừa bỏ giỏ 24 giờ" so với đồng hồ thật. Luồng Kafka → Camunda → voucher đã verify
2026-07-27 với model cũ, chưa chạy lại với dữ liệu hiện tại.

**12. "Voucher có thật sự giữ được khách không?"**
Chưa biết. Hệ thống không học từ kết quả campaign; không đo được uplift (ai tự quay lại vs ai cần voucher). Chỉ có thiết
kế bảng theo dõi outcome. 74,7% giỏ không bao giờ thành đơn và nhiều người sẽ tự quay lại, nên nếu không có nhóm đối
chứng thì không phân biệt được hiệu quả voucher với hành vi vốn có.

**13. "Dữ liệu chấm điểm có cũ không (feature store)?"**
Có, tối đa một chu kỳ quét (mặc định 1 giờ); đánh đổi có chủ đích, endpoint trả `computed_at`. Lý do: cách cũ treo 53+
phút trên quy mô thật.

**14. "Hệ thống có an toàn về phân quyền không?"**
Có một lỗ hổng đã xác minh (2026-10-07, `SecurityConfig.java:41-45`, `application.yml:146`): gateway chỉ yêu cầu ADMIN/STAFF
cho `/api/v1/admin/**`; các route `/api/v1/risk/**` và `/api/v1/models/**` của forecast-service chỉ yêu cầu *đã đăng
nhập*, nên khách đăng nhập gọi được `trigger-scan` và `train` qua gateway. Chưa sửa.

**15. "Có lúc nào kết quả bị sai mà bạn không phát hiện?"**
Có, và đã ghi lại — mục 12 liệt kê các con số/khẳng định đã rút: AUC 0,93 (đổi bài toán, không phải rò rỉ), 0,84 "lạc quan do
mẫu nhỏ", hệ số 3,7–7,7×, "rule không phân mức được", "tăng feature thì rule không theo kịp", giả thuyết thứ tự hành vi...

---

## 11. Điều chưa chứng minh (tổng hợp)

- ❌ Kết quả có chuyển giao sang khách thật của hệ thống không (chỉ có hành vi thật của sàn khác).
- ❌ Nhãn 60 ngày so với "rời bỏ thật" trên dữ liệu thật (không có ground truth); chưa áp dụng nhãn động.
- ❌ Chất lượng hiệu chỉnh trên dữ liệu thật (chưa đo ECE/Brier; chưa so lại 4 phương án).
- ❌ Mức độ hòa điểm khi xếp theo xác suất, và ảnh hưởng của nó tới hệ số nhân 12,75–60,27×.
- ❌ `k = 4` cho KMeans (không quét `k`).
- ❌ `review`, `voucher` (không có dữ liệu nguồn); nguyên nhân ΔAUC đúng 0 của `temporal_rhythm`.
- ❌ Hiệu quả thật của voucher/campaign (không có vòng phản hồi, không có nhóm đối chứng).
- ❌ Đoạn Kafka → Camunda → voucher với model/dữ liệu hiện tại (chưa phát ra event nào); chưa chạy trọn 9 service Java và FE.
- ❌ Siêu tham số các thuật toán đối chứng chưa tune; model phi tuyến chưa thử ở đích 7 ngày.
- ⚠️ Chi tiêu (`monetary`) dựa trên tỉ giá giả định 25.000; sản phẩm ánh xạ xấp xỉ.
- ⚠️ Tiêu chí "vượt sàn nhiễu" không đồng nhất giữa các thí nghiệm (1× std ở ablation/cảnh báo sớm, 2× std ở thí nghiệm huỷ đơn).
- ⚠️ Chỉ đúng với user đã đăng nhập (khách vãng lai dùng chung định danh `anonymous`, bị bỏ qua có chủ đích); phần lớn user REES46
  là tài khoản nội bộ `rees_<id>@rees46.internal`, không đăng nhập được qua FE thật.
- ⚠️ Lỗ hổng phân quyền route `/api/v1/risk/**`, `/api/v1/models/**` (câu 14).

---

## 12. Các con số và khẳng định đã rút lại

Ghi để minh bạch — mỗi mục là một lần số đo hoặc lập luận của chính dự án bị sửa.

| Đã từng nói | Thực tế đo được | Log |
|---|---|---|
| AUC 0,9313/0,9381 là "thành tích" | Bài toán dễ do nhãn cùng nguồn đặc trưng; nhãn mới cho 0,84 (đổi bài toán, **không** phải rò rỉ) | 2026-07-28, 08-01 |
| "Rò rỉ train/test chung user thổi AUC lên" | Chỉ +0,0021; giá trị thật của grouped CV là cho ra sàn nhiễu | 2026-07-28 |
| AUC 0,8405 ± 0,0268 | Lạc quan do mẫu nhỏ (learning curve: 0,7928 ở 85 user → 0,7521 ở 340 user, std co 3×); hội tụ ~0,75 | `diagnose_model_ceiling.py`, bản overview ở commit `a12c881` (không có trong log) |
| "Đổi nhãn đã phá được tautology" | Phần lớn do lùi mốc cắt, không do đổi nguồn nhãn | 2026-08-01 |
| Xếp hạng tổn thất kỳ vọng hơn 3,7–7,7× (K=50: 4,04×) | Hiện vật của việc gộp khách chưa mua; sau khi siết ≥ 2 đơn: 1,5–2,2×; trên dữ liệu thật: 12,75–60,27× | 2026-08-01, 10-05 |
| "Rule trả nhãn nhị phân nên không phân mức được" | Sai: rule xếp tầng được; khác biệt là độ mịn (4 vs 207 bậc) | 2026-08-04 |
| "Tăng feature thì rule không bắt kịp" | Sai hướng: 11 → 26 đặc trưng làm AUC giảm (0,7461 → 0,7373) | 2026-08-04 |
| "Thứ tự hành vi là thứ rule bất lực" | Bị bác trên RetailRocket (ΔAUC −0,0009); được ủng hộ ở đích 7 ngày trên REES46 (+0,0165) | 2026-08-04, 10-05 |
| Model hơn rule +0,0519 F1 (vượt nhiễu) | Giòn: +0,0171 (trong nhiễu) sau reseed; −0,0001 trên dữ liệu thật | 2026-08-03, 10-05 |
| Cơ chế "phân vân" (bỏ giỏ ×2,5 trước churn) | Gỡ: tỉ lệ (bỏ giỏ/thêm giỏ) churn ÷ đối chứng = 0,983 [0,925; 1,062] | 2026-10-01 |
| "Retrain gate bảo vệ production" | Chỉ chống *tụt*; AUC giả 0,9908 vẫn lọt — nên dựng thêm guard nhiễm dữ liệu | 2026-08-03 |
| "`docker compose build` xong là code mới đã compile" | Sai (đóng gói lại jar cũ), lặp 3 lần | 2026-08-03 |
| "Hành vi không mang thông tin thêm vì rời bỏ độc lập với hành vi" | Sai: hành vi thêm +0,017 AUC (tổng hợp) | 2026-10-02 |

---

## Phụ lục A. Vận hành và tái lập

```bash
curl -X POST http://localhost:8004/api/v1/models/train          # nơi DUY NHẤT model được fit
curl -X POST http://localhost:8004/api/v1/risk/trigger-scan     # chạy risk-scan ngay (bình thường theo lịch)
curl        http://localhost:8004/api/v1/admin/analytics/segmentation   # phân bố phân khúc + computed_at
curl        http://localhost:8004/api/v1/models/card            # model card
curl -X POST http://localhost:8004/api/v1/models/rule-benchmark # Rule vs AI
curl -X POST http://localhost:8004/api/v1/models/calibration    # so sánh hiệu chỉnh
curl -X POST http://localhost:8004/api/v1/models/ablation       # khối đặc trưng + permutation + L1 path
```

Script thí nghiệm trên dữ liệu thật: `AI/forecast-service/app/training/experiments/`
`retrain_on_real_rees46.py`, `ablation_on_real_rees46.py`, `rule_benchmark_on_real_rees46.py`,
`algorithm_comparison_full_on_real_rees46.py`, `cart_sequence_early_warning.py`. Dùng lại nguyên văn logic gốc
(`train.py`, `rule_benchmark.py`, `ablation.py`) qua wrapper mỏng.

## Phụ lục B. Giới hạn môi trường khi tái lập

- Truy vấn SQL tổng hợp gốc không chạy nổi trên quy mô thật (mục 8.2) — các script thực nghiệm dùng bản pandas
  (`fast_panel_builder.py`, `fast_candidates_builder.py`) đã xác minh khớp công thức gốc trên mẫu user.
- Docker/WSL2 cần RAM đủ (mục 8.3); kết nối DB dùng `127.0.0.1` (`localhost` treo trên Docker Desktop).
- Hướng dẫn chuyển sang máy khác: [`churn-ai-setup-anywhere.md`](churn-ai-setup-anywhere.md) (nằm ở nhánh
  `feat/multi-category-catalog`).
