# Plan thực thi — Tầng 0: Sửa nền đo lường (churn risk)

> Plan thi hành cho **Tầng 0** của [`churn-risk-roadmap.md`](churn-risk-roadmap.md). Tick checkbox khi
> xong, ghi ghi-chú-lệch ngay dưới mục tương ứng. Mọi số đo đi vào
> [`churn-risk-log.md`](churn-risk-log.md), không ghi ở đây.
>
> Tầng 0 **chặn đường**: chưa xong thì mọi việc mở rộng feature / so sánh thuật toán / cá nhân hoá
> đều không đo được, làm trước là lãng phí.

## Tiến độ

- [x] **0.1 — Kiểm định & hiệu chỉnh xác suất** — XONG, số đo ở [`churn-risk-log.md`](churn-risk-log.md) mục 2026-07-31
  - [x] 0.1.a Module đo calibration (Brier / ECE / reliability curve) trên OOF sẵn có
  - [x] 0.1.b 4 phương án (`raw`/`prior_shift`/`platt`/`isotonic`), so trong cùng một cách chia fold
  - [x] 0.1.c Tính LẠI bảng xếp hạng — bổ sung cả `by_probability` để tỉ số "hơn N lần" nằm trong CÙNG run
  - [x] 0.1.d Endpoint `POST /api/v1/models/calibration` + ghi log
  - **Kết luận:** miscalibration THẬT và nặng (ECE 0.1797, dự đoán trung bình 0.4217 vs thực tế 0.2420
    — thổi phồng ~1,74×). `isotonic` tốt nhất cả 3 mặt (ECE 0.0391 = tốt hơn 4,6×; Brier 0.0906; xếp
    hạng tốt nhất) mà AUC không đổi (0.9314 vs 0.9316) ⇒ không có dấu hiệu overfit.
  - **Rủi ro đã lo KHÔNG xảy ra:** hiệu chỉnh làm con số headline **TĂNG** — K=50: 2,94× → **4,04×**.
  - **Còn lại (việc riêng, cần quyết định):** có đưa calibrator + ngưỡng mới vào `risk_scoring.py`
    (đường phát voucher thật) hay không — xem "Đề xuất áp dụng" cuối mục 0.1.
- [ ] 0.2 — Định nghĩa lại nhãn churn
  - [x] **0.2.a Lưới chẩn đoán (không phá hoại)** — XONG, 12 biến thể, số đo ở
        [`churn-risk-log.md`](churn-risk-log.md) mục 2026-08-01. Đề xuất: **cửa sổ 120 ngày · nguồn
        `orders` · lọc ≥2 đơn DELIVERED** (base rate 0.2624 — biến thể DUY NHẤT vào khoảng mục tiêu
        15–30%; AUC 0.8414 ± 0.0299 — ổn định nhất nhóm `orders`).
        **Cảnh báo trung thực:** so trong cùng bộ cutoff, đổi `activity`→`orders` hầu như KHÔNG giảm
        độ áp đảo của `category_diversity_viewed` (0.0925→0.0895 ở w=120) ⇒ mức tụt so với 0.2253 phần
        lớn do **lùi mốc cắt**, không do tách nguồn nhãn. Không được nói "đã phá được tautology".
  - [x] **0.2.b Đã áp** — 2 điểm mở được giao tự quyết, chốt: siết dân số chấm điểm về ≥2 đơn + chấp
        nhận mốc cắt ≥150 ngày. **Không** tăng `FEATURE_VERSION` (feature không đổi — bump là sai
        nghĩa); thay bằng `LABEL_VERSION = churn_label_v2_orders_120d_min2`.
  - [x] **0.2.c Đã chạy lại `train` + `ablation`** — AUC 0.9315 → 0.8416 ± 0.0303 (đúng dự kiến).
        3 phát hiện ngoài kế hoạch, đã xử lý: (1) con số headline xếp-hạng giảm từ 4,04× xuống
        **1,68×** vì trước đó bị thổi do gộp user chưa từng mua; (2) **chiều hữu dụng TĂNG** — 1 feature
        kém 9 feature 0.0384 > sàn nhiễu, nên lập luận "mặt phân cách nhiều chiều" giờ có số liệu ủng
        hộ; (3) phân khúc hỏng dưới dân số mới → bỏ khớp archetype, gán `At Risk` theo **churn rate đo
        được** (spread 0.3565 ⇒ cổng segment có cơ sở giữ lại).
- [x] **Ngoài kế hoạch: ngưỡng lấy từ metadata của model** thay vì hardcode config — ngưỡng tối ưu đổi
      theo định nghĩa nhãn (v1 → 0.24, v2 → 0.26) nên hardcode sẽ âm thầm lạc hậu.

---

## 0.1 — Kiểm định & hiệu chỉnh xác suất

### Vấn đề (đã xác minh, không phải phỏng đoán)

`_fit_classifier` dùng `LogisticRegression(class_weight="balanced")`. sklearn đặt trọng số
`w_c = n_samples / (n_classes · n_c)`, tức **tổng trọng số 2 lớp bằng nhau** ⇒ model ước lượng hậu
nghiệm dưới **tiên nghiệm 50/50**, không phải base rate thật (đo được: `churn_rate_overall = 0.1883`).
Xác suất trả về vì vậy bị **thổi phồng một cách hệ thống**.

Grep toàn repo: **không có phép đo calibration nào** (`calibrat|brier|reliability` → rỗng).

### Vì sao đây là ưu tiên số 1 của cả roadmap

Đây là việc duy nhất có thể làm một kết quả **đã báo cáo** trở thành sai. Hiệu chỉnh về tiên nghiệm
thật là phép dịch **odds** nhân hằng số:

```
odds_thật = odds_model × π/(1−π)        với π = base rate của tập train
p_thật    = odds_thật / (1 + odds_thật)
```

Đây là biến đổi **đơn điệu nhưng PHI TUYẾN** trên thang xác suất. Hệ quả chính xác:

| Đại lượng | Ảnh hưởng | Vì sao |
|---|---|---|
| AUC | **không đổi** | AUC chỉ phụ thuộc thứ tự; biến đổi đơn điệu bảo toàn thứ tự → dùng làm **phép kiểm tra bug**: nếu AUC lệch thì code sai |
| Xếp hạng theo `P` thuần | **không đổi** | cùng lý do |
| Xếp hạng theo `P × monetary` | **ĐỔI** | phép nhân: P bị co giãn khác nhau ở các mức khác nhau, nên thứ tự tích thay đổi giữa các user có `monetary` khác nhau |
| Ngưỡng 0.5 | **vô nghĩa như hiện tại** | không phải mốc "50% khả năng churn"; giải thích precision 0.6334 / recall 0.9760 (over-predict churn) |

⇒ **Con số 3,7–7,7× doanh thu giữ được phải đo lại.** Nó là kết quả mạnh nhất đã báo cáo, và nó dựa
trên một phép nhân với xác suất chưa được kiểm định.

### Việc cụ thể

**0.1.a — Module đo.** `AI/forecast-service/app/training/calibration.py`:
- `_reliability_curve(y_true, p, n_bins=10)` → mỗi bin: `p_mean`, `observed_rate`, `count`
- `_brier(y_true, p)`, `_ece(y_true, p, n_bins)` (Expected Calibration Error, có trọng số theo số mẫu bin)
- Tất cả tính trên **out-of-fold** prediction — `_evaluate_grouped_cv` đã trả `_oof`, không cần CV mới

**0.1.b — 3 phương án, so trong CÙNG một grouped CV** (không được so chéo giữa các lần chia fold khác nhau):

| Phương án | Cách làm |
|---|---|
| `raw` | nguyên trạng, làm mốc |
| `prior_shift` | công thức odds ở trên, dùng base rate **của tập train từng fold** (không dùng base rate toàn panel — sẽ rò rỉ) |
| `platt` / `isotonic` | `CalibratedClassifierCV(base, method=..., cv=3)` fit **trong tập train của fold**, calibrator học trên phân bố THẬT nên tự map về hậu nghiệm đúng |

Yêu cầu hạ tầng: `_evaluate_grouped_cv` phải trả thêm `train_df` trong `_folds` (hiện chỉ có
`scaler`, `clf`, `test_df`) để phương án `platt`/`isotonic` refit được trong đúng fold đó.

**0.1.c — Tính lại quyết định dưới từng phương án:** bảng `revenue_recall@K` theo `P × monetary`, và
ngưỡng tối ưu. Với xác suất đã hiệu chỉnh thì ngưỡng 0.5 mới có nghĩa "50% khả năng churn".

**0.1.d — Endpoint** `POST /api/v1/models/calibration`, không lưu model (thuần phân tích, giống
`ablation`).

### Tiêu chí thành công

- ECE của phương án tốt nhất **giảm rõ rệt** so với `raw`.
- AUC **giữ nguyên** ở `raw`/`prior_shift`/`platt` (kiểm tra bug). `isotonic` có thể lệch nhẹ do sinh
  giá trị trùng → chấp nhận, phải ghi rõ.
- Trả lời được: **3,7–7,7× còn đúng không** sau hiệu chỉnh.

### Tiêu chí DỪNG

Nếu `raw` đã calibrated tốt (ECE nhỏ) thì ghi lại và **không** đổi gì trong production — chỉ bổ sung
phép đo. Không sửa cái không hỏng.

### Rủi ro phải nói thẳng

Kết quả có thể **làm giảm** con số 3,7–7,7×. Vẫn phải làm: một con số sai có lợi cho mình thì tệ hơn
là không có số nào. Nếu giảm, ghi cả số cũ và số mới vào log kèm lý do.

### Quyết định KHÔNG thay đổi hành vi production ở bước này

`RISK_CHURN_PROBABILITY_THRESHOLD` và pipeline `risk_scoring` **giữ nguyên** cho tới khi có số. Đổi
ngưỡng/thêm calibrator vào đường phát voucher là việc riêng, sau khi 0.1 kết luận.

### Đề xuất áp dụng (sau khi 0.1 đã có số — CHỜ DUYỆT)

Bằng chứng đã đủ để đề xuất, nhưng việc này **đổi hành vi phát voucher thật** nên tách riêng:

1. Train lưu thêm calibrator `isotonic` (fit trong grouped CV, không fit trên toàn panel) vào bundle
   `churn_classifier`; `risk_scoring.predict()` áp calibrator trước khi tính `expected_loss`.
2. Đổi `RISK_CHURN_PROBABILITY_THRESHOLD` 0.5 → **0.23–0.24** *chỉ khi* đã áp calibrator. **Hai việc
   này phải đi cùng nhau** — áp một mà không áp cái kia làm hệ thống sai nặng hơn hiện tại: ngưỡng
   0.5 trên xác suất đã hiệu chỉnh sẽ siết còn precision 0.712/recall 0.736, còn ngưỡng 0.23 trên xác
   suất CHƯA hiệu chỉnh thì bắn gần như mọi user.
3. Tác động dự kiến khi áp cả hai: `expected_loss` đáng tin hơn ⇒ thứ hạng đúng hơn ⇒ cùng 50 voucher
   giữ được 68,6% doanh thu rủi ro thay vì 51,5%.

**ĐÃ LÀM 2026-08-01** — số đo và kiểm chứng ở [`churn-risk-log.md`](churn-risk-log.md) mục 2026-08-01.
Ràng buộc "2 việc phải đi cùng nhau" không để ở dạng tài liệu mà **cài cứng trong code**: bundle mang
cờ `calibrated`, `risk_scoring.effective_threshold()` tự lùi về ngưỡng legacy 0.5 kèm WARNING nếu gặp
bundle chưa hiệu chỉnh. Đã test bằng cách giả lập bundle kiểu cũ.

Ngoài kế hoạch ban đầu, phát hiện thêm một chỗ dễ sai: ngưỡng phải tune trên **OOF đã hiệu chỉnh**
(0.24), không phải OOF thô (0.61) — nên `_calibrated_oof()` là bắt buộc. `train.py` giờ báo cả hai
ngưỡng để không nhầm thang.

---

## 0.2 — Định nghĩa lại nhãn churn

### Vấn đề

Nhãn hiện tại = "không có hoạt động nào (**xem HOẶC mua**) trong 30 ngày tới" (`labels.py`, UNION
`orders` + `user_events`). Feature mạnh nhất = "số category **xem** trong 30 ngày qua", permutation
importance **0.2253** so với 0.0285 của hạng nhì. **Nhãn và feature cùng nguồn `user_events`, hai cửa
sổ kề nhau, cùng nghĩa "có hoạt động"** ⇒ bài toán gần như thành *"user đang hoạt động có tiếp tục
hoạt động không"*.

Bằng chứng bài toán đã bão hoà: 3/3 block feature thất bại, **đối chứng âm (+0.0033) ăn điểm cao hơn
cả 2 block thật** (+0.0019, −0.0010); L1 cho ~2 feature đạt AUC không phân biệt được với 11 feature.

### Vì sao KHÔNG chọn thẳng "60 ngày không đơn" (tự sửa đề xuất ban đầu)

`lambdaBase ~ lognormal(log 0.5, 0.9)` ⇒ user trung vị mua ~0,5 đơn/tháng. Cửa sổ 60 ngày:
`P(không đơn | λ=0,5) = e^−1 ≈ 0,37` ⇒ **~37% user khỏe mạnh bị dán nhãn churn do nhiễu Poisson**.
AUC sẽ tụt vì nhiễu nhãn *không giảm được*, không phải vì model yếu → kết luận lại vô nghĩa theo kiểu khác.

### 0.2.a — Lưới chẩn đoán (không phá hoại, chạy trước khi đổi gì)

`AI/forecast-service/app/training/label_diagnostics.py` + `POST /api/v1/models/label-diagnostics`:

- cửa sổ: **60 / 90 / 120** ngày
- nguồn nhãn: **chỉ `orders`** / **`orders` ∪ `user_events`** (hiện tại)
- lọc dân số: **mọi user** / **chỉ user có ≥2 đơn DELIVERED** (để nhịp mua tồn tại và ước lượng được)

Mỗi tổ hợp báo: `base_rate`, `AUC grouped CV ± std`, và **permutation importance của feature
top-1** — cái cuối để kiểm tra xem tautology đã bị phá hay chưa (nếu
`category_diversity_viewed` vẫn áp đảo 0.2x thì chưa phá được).

**Điều kiện kỹ thuật:** `CUTOFF_DAYS_AGO` phải dịch theo cửa sổ nhãn để mỗi mốc còn đủ thời gian quan
sát nhãn trong quá khứ (cửa sổ 90 ngày ⇒ mốc gần nhất ≥ ~150 ngày trước). Dữ liệu trải 361 ngày
(`oldest_order_days_ago = 361`) nên vẫn đủ 6 mốc.

### 0.2.b/c — Chốt và áp dụng

Chọn phương án vừa có base rate hợp lý (~15–30%) vừa **tách nguồn nhãn khỏi nguồn feature**. Khi đổi:
sửa `labels.py`, **tăng `FEATURE_VERSION`**, chạy lại `train` + `ablation`, ghi cả số cũ lẫn số mới.

### Tiêu chí DỪNG

Nếu mọi tổ hợp đều cho base rate quá lệch hoặc AUC sập về ~0.5 ⇒ dữ liệu synthetic không đủ giàu.
Chuyển sang Tầng 1 (làm giàu seeder) trước, rồi quay lại 0.2.

---

## Kiểm chứng chung

Sau mỗi mục: `docker compose -f AI/docker-compose.yml up -d --build forecast-service` → gọi endpoint
tương ứng → đối chiếu **AUC bất biến** (với biến đổi đơn điệu) làm phép kiểm tra bug → ghi số vào
[`churn-risk-log.md`](churn-risk-log.md).

Không mục nào trong Tầng 0 được thay đổi hành vi phát voucher. Mọi thay đổi production (ngưỡng,
calibrator trong `risk_scoring`) là việc riêng, làm sau khi Tầng 0 có kết luận.
