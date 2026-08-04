# Roadmap dài hạn — AI Churn Risk & Tầng quyết định Marketing

> **Cách dùng file này.** Đây là kế hoạch dài hạn, xếp theo **thứ tự phụ thuộc** — không phải theo
> độ hấp dẫn. Mỗi việc có *tiêu chí thành công đo được* và *tiêu chí DỪNG*. Việc ở tầng trên chưa
> xong thì việc ở tầng dưới **không đo được**, làm trước là lãng phí.
>
> Phân vai: [`churn-risk-feature-overview.md`](churn-risk-feature-overview.md) = tính năng làm gì ·
> [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) = plan Phase 0–7 đã xong ·
> [`churn-risk-log.md`](churn-risk-log.md) = timeline thực tế + mọi số đo · **file này** = đi đâu tiếp.
>
> Mọi con số dưới đây là **đo thật** trên run `20260728T094356024384`, không phải mục tiêu ước lượng.

---

## 1. Chẩn đoán hiện trạng — cơ sở của toàn bộ roadmap

**Đã có và chạy thật:** behavior event → AI scoring (KMeans + Logistic Regression) → Kafka →
Camunda BPMN → phát voucher → FE hiển thị. Kiểm chứng E2E với user đăng nhập thật (2026-07-27).

**Tầng đo lường đã đạt chuẩn:** grouped CV tách user + nhân quả thời gian, báo mean ± std;
permutation importance; L1 path; đối chứng âm. Đây là tài sản dùng lại được cho mọi thí nghiệm sau.

**Ba vấn đề gốc, xếp theo mức độ chặn đường:**

| # | Vấn đề | Bằng chứng | Chặn cái gì |
|---|---|---|---|
| **A** | **Xác suất chưa được kiểm định hiệu chỉnh** | Không có phép đo calibration nào trong repo. `class_weight='balanced'` fit trên phân bố đã cân bằng lại (base rate thật 0.1883) ⇒ hậu nghiệm bị **thổi phồng hệ thống** | Toàn bộ tầng quyết định. `expected_loss = P × monetary` là **phép nhân**, nên lệch phi tuyến của P **đổi thứ hạng** giữa các user có `monetary` khác nhau — khác với xếp theo P thuần (đơn điệu, miễn nhiễm) |
| **B** | **Nhãn gần như tautology** | Nhãn = "không hoạt động (xem HOẶC mua) 30 ngày tới"; feature mạnh nhất = "số category **xem** 30 ngày qua", permutation importance **0.2253** so với 0.0285 của hạng nhì. Cùng nguồn `user_events`, hai cửa sổ kề nhau | Mọi việc mở rộng feature. Đã chứng minh: 3/3 block thất bại, đối chứng âm (+0.0033) ăn điểm cao hơn cả 2 block thật |
| **C** | **Nguồn dữ liệu thiếu cấu trúc** | `product_reviews` 0 dòng · `issued_vouchers` 1 dòng · `session_id` NULL 61.694/61.694 · timestamp phân bố ĐỀU (không có nhịp ngày/tuần) · giảm giá luôn đúng 10% | ~60% mọi roadmap feature. Không sửa thì các feature đó *không thể đo*, chứ không phải "đo ra kém" |

**Một kết quả đã vững, cần bảo vệ:** xếp hạng theo tổn thất kỳ vọng giữ được **3,7–7,7× doanh thu
đang rủi ro** so với xếp theo xác suất thuần, cùng ngân sách voucher. Đây là năng lực rule-based
**không có cách nào** làm (không có xác suất thì không nhân được với giá trị khách hàng). **Nhưng con
số này phụ thuộc vấn đề A** — phải đo lại sau khi hiệu chỉnh.

---

## 2. Nguyên tắc xuyên suốt

1. **Đo trước khi xây.** Không thêm feature/model nào mà chưa có thước đo phát hiện được nó vô dụng.
2. **Luôn có đối chứng âm.** Đã cứu một lần: nó cho thấy ΔAUC +0.0019 của block "thật" là nhiễu.
3. **So delta với sàn nhiễu, không so với 0.** Sàn hiện tại **±0.0265 AUC**.
4. **Khai báo mức vòng tròn** của mọi feature, đối chiếu với `tools/data-seed/lib/profiles.mjs`.
5. **Không thêm feature vào bài toán đã bão hòa.** Sửa bài toán trước (vấn đề B).
6. **Kết quả âm là kết quả.** Ghi cả cái đã thử và bị loại — đó là nội dung báo cáo tốt.

---

## Tầng 0 — Sửa nền đo lường (CHẶN ĐƯỜNG, làm trước tiên)

### 0.1. Kiểm định & hiệu chỉnh xác suất  ⬅ *ưu tiên cao nhất toàn roadmap*

**Vì sao trước cả việc sửa nhãn:** đây là việc duy nhất có thể làm cho một kết quả **đã báo cáo** trở
thành sai. Cụ thể: mô hình fit với `class_weight='balanced'` ước lượng hậu nghiệm dưới tiên nghiệm
50/50, không phải 18,83% thật. Hiệu chỉnh về tiên nghiệm thật là phép dịch **odds** nhân hằng số:

```
odds_thật = odds_model × π/(1−π)     với π = 0.1883
```

Đây là biến đổi **đơn điệu nhưng phi tuyến** trên thang xác suất. Hệ quả chính xác:
- Xếp hạng theo `P` thuần: **không đổi** (đơn điệu).
- Xếp hạng theo `P × monetary`: **đổi** — vì P bị co giãn khác nhau ở các mức khác nhau.
- Ngưỡng 0.5 hiện tại **không phải** mốc "50% khả năng churn" ⇒ giải thích được precision 0.6334 /
  recall 0.9760 (model over-predict churn một cách hệ thống).

**Việc:** thêm module đo calibration — reliability curve + Brier score + ECE, tính trên out-of-fold
prediction đã có sẵn. So 3 phương án: (a) nguyên trạng, (b) hiệu chỉnh tiên nghiệm bằng công thức
odds, (c) `CalibratedClassifierCV` (Platt / isotonic) lồng trong grouped CV. Rồi **tính lại bảng
xếp hạng** ở cả 3.

**Tiêu chí thành công:** ECE giảm rõ rệt; và trả lời được "3,7–7,7× có còn đúng sau hiệu chỉnh
không". **Tiêu chí DỪNG:** nếu nguyên trạng đã calibrated tốt (ECE nhỏ), ghi lại và bỏ qua (b)/(c).

**Rủi ro cần nói thẳng:** kết quả có thể làm **giảm** con số 3,7–7,7×. Vẫn phải làm — một con số
sai có lợi cho mình thì tệ hơn là không có số nào.

### 0.2. Định nghĩa lại nhãn churn

**Việc:** chạy chẩn đoán **không phá hoại** trước khi đổi production — tính nhãn ở lưới phương án
(cửa sổ 60/90/120 ngày) × (chỉ đơn hàng / đơn hoặc hoạt động) × (mọi user / chỉ user ≥2 đơn
DELIVERED), báo **base rate** và **AUC grouped CV** từng phương án.

**Vì sao cần lưới thay vì chọn thẳng 60 ngày (đề xuất đầu của tôi, đã tự sửa):** `lambdaBase ~
lognormal(log 0.5, 0.9)` ⇒ user trung vị mua ~0,5 đơn/tháng. Với cửa sổ 60 ngày,
`P(không đơn | λ=0,5) = e^−1 ≈ 0,37` ⇒ **37% user khỏe mạnh bị dán nhãn churn do nhiễu Poisson**.
AUC sẽ tụt vì nhiễu nhãn không giảm được, không phải vì model yếu.

**Điều kiện kỹ thuật:** `CUTOFF_DAYS_AGO` phải dịch để mỗi mốc còn đủ cửa sổ quan sát nhãn trong quá
khứ (cửa sổ 90 ngày ⇒ mốc gần nhất ≥ ~150 ngày trước; dữ liệu trải 361 ngày nên vẫn đủ 6 mốc).

**Tiêu chí thành công:** chọn được phương án vừa có base rate hợp lý (~15–30%) vừa **tách nguồn
feature khỏi nguồn nhãn** (nhãn từ `orders`, feature chủ yếu từ `user_events`). **Tiêu chí DỪNG:**
nếu mọi phương án đều cho base rate quá lệch hoặc AUC sập về ~0.5, nghĩa là dữ liệu synthetic không
đủ giàu — chuyển sang Tầng 1 trước rồi quay lại.

**Khi đổi:** tăng `FEATURE_VERSION`, chạy lại `train` + `ablation`, ghi lại số cũ để đối chiếu.

---

## Tầng 1 — Sửa nguồn dữ liệu (mở khoá phần lớn roadmap feature)

### 1.1. Sửa write-path `session_id` (lỗi thật, không phải thiếu seed)

[`behavior_consumer.py:45`](../../AI/forecast-service/app/kafka/behavior_consumer.py#L45) hardcode
`"session_id": None` cho `ProductViewedEvent` kèm ghi chú *"chưa track session cho guest"*. Đường
cart (dòng 58) có đọc `payload.get("sessionId")` nhưng DB vẫn NULL toàn bộ.

**Việc:** product-service phát kèm `sessionId`; FE gửi session id ổn định; bỏ hardcode None. Đây là
tiền đề cho **mọi** feature theo session, và cũng sửa luôn chất lượng gợi ý của recs-service (dùng
chung `session:{sid}:history`).

**Tiêu chí thành công:** tỉ lệ `session_id` NULL trên event MỚI < 5%; `events_per_session` > 1.

### 1.2. Làm giàu bộ sinh dữ liệu — **bằng tham số ẩn, không bằng dán nhãn**

Đây là nút cổ chai thật của mọi việc mở rộng feature. Nguyên tắc bắt buộc, giống Phase 3 gốc: thêm
**tham số ẩn** cho mỗi user và để cấu trúc *tự xuất hiện*; **không** sinh feature tương quan trực
tiếp với nhãn (sinh review tỉ lệ với retention thì model chỉ tìm lại chính seeder).

| Bổ sung | Tham số ẩn đề xuất | Mở khoá |
|---|---|---|
| `session_id` + phiên có cụm thời gian | độ dài phiên, số phiên/tuần | Toàn bộ nhóm feature session |
| Nhịp giờ/ngày trong tuần | giờ hoạt động ưa thích, thiên lệch cuối tuần | Entropy hoạt động, đều đặn hành vi |
| Review sau khi mua | xu hướng review (độc lập với churn), thiên lệch điểm | `review_count`, `avg_rating_given` |
| Lịch sử voucher + độ sâu biến thiên | độ nhạy giá (đã có) → chọn mức giảm | `voucher_usage_rate`, và **là tiền đề của uplift modeling** |
| Lặp xem có chủ đích | ý định theo sản phẩm | `repeat_view_ratio` (hiện median 1.0 = vô dụng) |

**Tiêu chí thành công:** mỗi bảng/cột mới có phân bố **lệch thật** (không phẳng, không hằng số), và
feature tính từ nó có phương sai > 0 trên ≥80% user. **Tiêu chí DỪNG:** nếu một bổ sung chỉ tái tạo
thông tin đã có (kiểm tra bằng tương quan Spearman > 0.9 với feature hiện có), bỏ.

---

## Tầng 2 — Mô hình hoá lại (chỉ có nghĩa sau Tầng 0)

### 2.1. Re-baseline toàn bộ trên nhãn mới
Chạy lại `train` + `ablation` + 3 block ứng viên đã có. Kỳ vọng trung thực: **AUC sẽ thấp hơn 0.9379**
— đó là dấu hiệu bài toán đã thật, không phải hồi quy chất lượng.

### 2.2. Benchmark Rule vs AI (hướng 1 — giờ mới đo được)
**Cách làm đúng:** quét **lưới ngưỡng** để lấy **rule TỐT NHẤT** theo F1, rồi mới so với model. Tự
chọn một rule yếu rồi đánh bại nó thì người phản biện sẽ nói baseline được dựng để thua.

**Cảnh báo từ dữ liệu hiện có:** L1 path cho thấy ~2 feature đạt AUC 0.9309 ± 0.0201, không phân
biệt được với 11 feature ⇒ **chiều hữu dụng thực tế ~2**, nên rule 2 biến có thể tiệm cận AI. Bằng
chứng ablation đang **chống lại** kỳ vọng của hướng 1. Sau khi sửa nhãn (0.2) mới biết điều này còn
đúng không. **Tiêu chí DỪNG:** nếu rule tốt nhất vẫn tiệm cận model, **chấp nhận và công bố** — rồi
chuyển trọng tâm luận điểm sang Tầng 3 (nơi AI thắng về *năng lực*, không phải về *độ chính xác*).

### 2.3. So sánh thuật toán (Random Forest / XGBoost / LightGBM)
**Chỉ làm sau 2.1 và 2.2.** Với ~500 user độc lập, mô hình phi tuyến nhiều tham số rất dễ overfit;
grouped CV ± std sẽ phát hiện. **Tiêu chí thành công:** ΔAUC > sàn nhiễu. Nếu không đạt, ghi lại là
"đã thử, LR đủ" — đó là kết luận hợp lệ và có giá trị (bảo vệ được lựa chọn LR ban đầu).

### 2.4. Dọn feature không đóng góp
7/11 feature có permutation importance ≈ 0 hoặc âm (`cart_abandon_count` **−0.0011** dù coef LR
+2.99). Sau khi sửa nhãn, đo lại rồi cân nhắc bỏ hẳn khỏi `FEATURE_COLUMNS`. Model gọn hơn = dễ
giải thích, ít bất định hệ số hơn, và "chứng minh N feature là đủ" là kết quả mạnh.

---

## Tầng 3 — Tầng quyết định (nơi AI thắng rule về NĂNG LỰC)

Đây là nơi luận điểm "vì sao cần AI" vững nhất, **không phụ thuộc** việc AI có chính xác hơn rule.

### 3.1. Phân bổ ngân sách theo tổn thất kỳ vọng — mở rộng cái đã có
Đã chạy: `expected_loss = P × monetary`, cắt theo `RISK_MAX_VOUCHERS_PER_SCAN`. **Mở rộng:** đưa
**chi phí** vào bài toán — `giá trị kỳ vọng = P × monetary × P(voucher hiệu quả) − chi phí voucher`.
Chừng nào chưa có Tầng 4 thì `P(voucher hiệu quả)` là hằng số giả định — **phải khai báo rõ là giả
định**, không được trình bày như số đo.

**Phụ thuộc:** 0.1 (calibration). **Tiêu chí thành công:** báo lại bảng revenue-recall@K sau hiệu chỉnh.

### 3.2. Next Best Action từ 4 phân khúc đã học
4 phân khúc giờ dùng được thật (VIP 1146 · New 759 · At Risk 727 · Hibernating 368, `match_distance`
đều < 2.5). Ánh xạ **phân khúc → loại hành động**, và loại hành động đến từ cấu trúc *học được*
(unsupervised), không phải chuỗi `if/else` trên xác suất.

**Đã có sẵn hạ tầng:** `segment`, `churnProbability`, `expectedLoss`, `riskRank`, `monetary` đều đã
được đẩy vào Camunda process variables ⇒ admin dựng nhánh điều kiện trong campaign builder **không
cần code thêm**. Việc còn lại là thiết kế campaign mẫu + đo.

**Tiêu chí DỪNG:** nếu ánh xạ vẫn là bảng tra do người chọn, **nói thẳng như vậy** — chỉ có phân khúc
là học được, còn chính sách là do người. Chính sách *học được* cần Tầng 4.

### 3.3. Cá nhân hoá mức ưu đãi
**Phụ thuộc cứng vào Tầng 4** (cần uplift: ai *sẽ tự quay lại* vs ai *cần voucher mới quay lại*).
Làm trước Tầng 4 thì chỉ là rule trên `discount_dependency` — đúng thứ đang cố chứng minh là kém.
**Chưa làm.**

---

## Tầng 4 — Vòng phản hồi (giá trị dài hạn lớn nhất, đo được ít nhất hiện nay)

**Trạng thái trung thực:** *không thể đánh giá* trong phạm vi đồ án. Dữ liệu synthetic thì phải tự
viết luôn model phản hồi rồi AI học lại chính nó (vòng tròn hoàn toàn); dữ liệu thật chỉ có ~10 user
đăng nhập được. Giá trị nằm ở **kiến trúc**, không ở thực nghiệm.

**Nên làm (kiến trúc, rẻ, không cần dữ liệu):**
1. Bảng `campaign_outcomes`: `user_id, campaign_id, voucher_code, issued_at, expired_at, redeemed_at, next_order_at, outcome`.
2. Event khi voucher được dùng / hết hạn → cập nhật outcome (đã có Kafka + Camunda, chỉ thêm listener).
3. Job quy kết: user có đơn trong N ngày sau khi nhận voucher không.
4. Hook: lần train sau đọc thêm `campaign_outcomes`.

**Tiêu chí thành công (kiến trúc):** một voucher đi hết vòng và có 1 dòng outcome đúng. **Tiêu chí
thành công (học máy):** chỉ khi tích đủ ≥ vài trăm outcome thật — ngoài phạm vi đồ án. Ghi vào báo
cáo dưới mục "hướng phát triển" **kèm thiết kế cụ thể**, không hứa kết quả.

---

## Tầng 5 — Vận hành (làm dần, không chặn ai)

| Việc | Vì sao | Tiêu chí |
|---|---|---|
| Giám sát drift feature | Model chỉ predict, không refit; phân bố lệch đi thì im lặng sai | Cảnh báo khi PSI/KS của feature vượt ngưỡng |
| Lịch retrain + gate | Hiện train chạy tay | Retrain tự động, **chỉ thay model nếu AUC mới ≥ AUC cũ − std** |
| Model card | Trả lời "model nào, feature version nào, metric bao nhiêu, giới hạn gì" | 1 trang sinh tự động từ `run_log.jsonl` |
| Sửa `FutureWarning` | `rfm.py:62`, `behavior.py:133` sẽ đổi hành vi ở pandas mới | Không còn warning |
| Bỏ endpoint dữ liệu giả | `/admin/analytics/{anomalies,segmentation}` đang trả **dữ liệu hardcode** | Nối vào số thật hoặc xoá — giữ lại là rủi ro trình bày số giả như số thật |

---

## 3. Phân tầng theo mục tiêu

**Cần cho bảo vệ đồ án (thứ tự này, không đổi):**
0.1 hiệu chỉnh xác suất → 0.2 sửa nhãn → 2.1 re-baseline → 2.2 benchmark rule vs AI →
3.1 phân bổ ngân sách (đo lại) → 4 kiến trúc feedback loop (thiết kế, không thực nghiệm) →
5 model card + xoá endpoint giả.

**Dài hạn thật (sau đồ án):** 1.1 + 1.2 làm giàu dữ liệu → 2.3 so sánh thuật toán → 2.4 dọn feature →
3.2 NBA → 4 thực nghiệm feedback loop → 3.3 cá nhân hoá mức ưu đãi → 5 drift + retrain gate.

**KHÔNG làm, và vì sao:**

| Không làm | Lý do |
|---|---|
| Thêm feature vào nhãn hiện tại | Đã chứng minh bão hòa: 3/3 block thất bại, đối chứng âm ăn điểm cao hơn |
| Feature trend/slope tường minh | Đọc thẳng cơ chế sinh (λ tụt bậc) → vòng tròn |
| Neo4j / GNN / SASRec training | Quá tay cho ~500 user; không giải quyết vấn đề A/B/C nào |
| Microservice AI mới | Vấn đề hiện tại là chất lượng bài toán, không phải thiếu chỗ chạy code |
| Cá nhân hoá mức ưu đãi trước Tầng 4 | Không có uplift thì chỉ là rule đội lốt AI |

---

## 4. Rủi ro lớn nhất của roadmap này

**Sửa nhãn (0.2) có thể làm AUC tụt mạnh và benchmark rule-vs-AI vẫn không nghiêng về AI.** Nếu xảy
ra, đó **không phải thất bại** — đó là câu trả lời trung thực cho câu hỏi ban đầu, và luận điểm
chuyển sang: *AI ở hệ thống này không thắng rule về độ chính xác phân loại, mà thắng về **năng lực
ra quyết định** — xác suất hiệu chỉnh cho phép xếp hạng theo tổn thất kỳ vọng và phân bổ ngân sách
tối ưu, việc rule-based về nguyên tắc không làm được.* Luận điểm đó đã có **số đo** hậu thuẫn
(3,7–7,7×, chờ xác nhận lại sau 0.1) và không phụ thuộc vào việc AUC cao hơn rule.

Chuẩn bị sẵn cả hai kết cục ngay từ đầu là cách duy nhất để không phải viết lại báo cáo giữa đường.
