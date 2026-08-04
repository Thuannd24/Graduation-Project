# Nhật ký làm việc — AI Churn Risk (nhánh `ai/behavoir`)

> Ghi theo **thứ tự thời gian**, chỉ ý chính: thảo luận → chốt plan → code → test → kết quả →
> quyết định tiếp theo. Mục đích là không mất context giữa các buổi và trả lời được "đã làm gì,
> vì sao làm vậy, đo được bao nhiêu" khi bảo vệ.
>
> Phân vai các file: [`churn-risk-feature-overview.md`](churn-risk-feature-overview.md) = tính năng
> làm gì · [`churn-risk-implementation-plan.md`](churn-risk-implementation-plan.md) = plan Phase 0–7
> đã xong · [`churn-risk-roadmap.md`](churn-risk-roadmap.md) = **đi đâu tiếp** (kế hoạch dài hạn,
> xếp theo thứ tự phụ thuộc) · **file này** = timeline thực tế đã diễn ra.
>
> **Quy ước giờ:** mọi mốc giờ trong file là **giờ host (UTC+7)**. Khi tra cứu chéo cần biết container
> chạy UTC, nên `version`/`trained_at` trong `AI/models/**/metadata.json` lệch −7h so với file này
> (vd `trained_at=2026-07-28T09:43:59Z` = **16:43** ở đây). Đã đối chiếu mtime trên host: **không có
> lệch đồng hồ thật**, chỉ là khác múi giờ.

---

## 2026-07-27 — Nghiên cứu, chốt plan, triển khai trọn vẹn Phase 0→7

### Thảo luận & nghiên cứu (buổi sáng)

Mục tiêu đặt ra: user xem sản phẩm → thêm giỏ → không thanh toán → AI phát hiện nguy cơ rời bỏ →
tự động kích hoạt campaign khuyến mãi qua engine Camunda **có sẵn**.

Khảo sát code trước khi viết dòng nào, phát hiện **2 điểm làm plan ban đầu sai giả định**:

1. **Không có dữ liệu để ML (blocking).** `tools/catalog-import/` chỉ seed sản phẩm (~1.123 SP) +
   tồn kho. Toàn repo 0 file `.sql`/dump/fixture, không seeder user/order. Thực tế chỉ vài chục
   user đăng ký tay, gần như không ai có ≥2 đơn → KMeans 4 cụm trên ~30 user là vô nghĩa thống kê.
   ⇒ **Seed dữ liệu trở thành điều kiện tiên quyết**, không phải việc phụ.
2. **21 tính năng AI đã lên kế hoạch trong `docs/` nhưng không chia sẻ tầng nền nào.** 3 quy ước
   Redis key xung đột nhau và lệch blueprint; `recency` có 2 định nghĩa độc lập; không connection
   pooling (mở connection mới mỗi lần gọi → Kafka consumer sẽ sập); `rfm.py`/`anomaly.py` **fit
   lại model mỗi request** → tâm cụm dịch liên tục, user "At Risk" giờ này hết "At Risk" giờ sau
   thuần do khởi tạo lại. ⇒ Đầu tư đúng là **tầng hợp đồng dữ liệu dùng chung**, làm một lần đúng.

### Chốt plan

- Seed **~500 user + ~3.000 đơn + hành vi** (synthetic).
- Mô hình: **KMeans segmentation** (chọn loại campaign) + **Logistic Regression** (xác suất churn →
  quyết định có trigger + ưu tiên). Chọn LR vì cho xác suất hiệu chỉnh tốt, ít tham số (an toàn
  với ~500 mẫu), và **giải thích được hệ số** khi bảo vệ.
- Không làm: Neo4j, SASRec training, microservice mới.
- Nguyên tắc chống suy luận vòng tròn: **không** dán nhãn "at-risk" bằng tay rồi để model tìm lại
  đúng nhãn đó. Sinh dữ liệu từ tiến trình có **tham số ẩn** (λ tần suất mua, độ nhạy giá, một
  phần user có λ giảm dần) → trạng thái rời bỏ *xuất hiện tự nhiên*.
- Nhãn churn = temporal split: feature tính đến mốc T, nhãn = 1 nếu không có hoạt động nào trong
  `(T, T+30 ngày]`; chỉ dùng mốc đã đủ 30 ngày quan sát trong quá khứ → không rò rỉ tương lai.

### Code — Phase 0→7 (chi tiết & ghi chú lệch: xem file plan)

| Phase | Nội dung chính |
|---|---|
| 0 | Sửa `AI/docker-compose.yml` (tên network sai → AI không join được network BE; DB env sai schema), mở route `/api/v1/{rfm,risk,models}/**` ở api-gateway |
| 1 | `shared-common`: `contracts.py` (nguồn sự thật Redis key/Kafka topic), `pool.py` (connection pooling), `features/` (định nghĩa feature **một lần**), `registry.py` (lưu model + version + metrics) |
| 2 | BE Java write-path: `ProductViewedEvent` + producer (product-service), `CartEventProducer` (order-service, dùng DTO `CartUpdatedEvent` đã tồn tại mà chưa từng dùng), entity `UserEvent` |
| 3 | `tools/data-seed/` — Node `.mjs`, idempotent, có `--dry-run`. Chia đôi: ~10 user tạo qua Keycloak Admin API (login thật được, phục vụ demo E2E) + ~490 user insert thẳng DB làm dân số thống kê |
| 4 | `behavior_consumer.py` (aiokafka, chạy nền qua FastAPI lifespan) → ghi Redis sequence + insert `user_events` qua pool. Lợi ích phụ: "sửa" luôn mục Gợi ý cho bạn ở Trang chủ |
| 5 | `app/training/` — panel 6 mốc thời gian, KMeans (k=4) + LR (`class_weight='balanced'`), persist artifact qua registry. Bỏ bug cũ: `rfm.py` sinh 100 user giả khi query lỗi |
| 6 | `risk_scheduler.py` (APScheduler, `max_instances=1`) **chỉ predict**, không refit → phân cụm ổn định. Trigger 2 tầng: AI cho segment + xác suất, rule cho *thời điểm* (có bỏ giỏ gần đây) |
| 7 | `PromotionKafkaConsumer` nghe `user-risk-events` → `Trigger_Event_ChurnRisk`; đăng ký trigger type ở `BpmnCompilerService`/`WorkflowTriggerResolver`/`WorkflowValidatorService`; FE campaign builder thêm node type |

**Điểm dễ mất nếu làm thiếu:** `CampaignTriggerService.resolveEventUniqueId()` phải có nhánh
`Trigger_Event_ChurnRisk` — thiếu thì trả null → chạy không có businessKey → **mất hoàn toàn khả
năng chống trigger trùng trong ngày**.

### Train model — 17:03

Chạy `POST /api/v1/models/train`, version `20260727T100319667590` (1 lần train duy nhất tới nay):

| Metric | Giá trị |
|---|---|
| Precision / Recall / F1 | 0.6230 / 0.9675 / 0.7580 |
| AUC | 0.9313 |
| Silhouette (KMeans) | 0.2861 |
| Train / Test size | 2500 / 500 dòng panel |
| Test churn rate | 0.246 |
| Cluster distribution | VIP Champions 1934 · At Risk 1066 |

Bộ feature: **11 chiều**, `FEATURE_VERSION = churn_v1` (`assembler.py:26-38`) — 6 từ `orders`
(recency, frequency, monetary, avg_order_value, cancel_rate, discount_dependency) + 5 từ
`user_events` (recent_view_count, days_since_last_activity, cart_abandon_count,
view_to_cart_conversion_rate, category_diversity_viewed).

### Test end-to-end — 11:17

Chuỗi kiểm chứng thật, không mô phỏng:

1. `POST /api/v1/risk/trigger-scan` → `{"status":"SUCCESS","at_risk_candidates":116,"published":2}`
2. Log promotion-service: `Issued PERCENT voucher VPC-300365EO userId=501 campaignId=1 15% max=100000`
3. Query DB `ecommerce_promotion_db.issued_vouchers`: `code=VPC-300365EO, discount_percent=15.00,
   max_discount_amount=100000, user_id=501, status=UNUSED, expires_at=2026-08-03 11:17:28`
4. **Kiểm chứng như người dùng thật:** login `demo_customer` qua Keycloak token endpoint → gọi
   đúng route API Gateway `GET /api/v1/promotions/vouchers/me` bằng JWT thật → trả về đúng payload
   mà FE render. Xem trên FE tại `http://localhost:5173/profile?tab=vouchers`.

⇒ Toàn tuyến chạy thật: behavior event → AI scoring → Kafka → Camunda → phát voucher → FE hiển thị.

### Commit & push — 18:26

6 commit chia theo phạm vi, push nhánh `ai/behavoir`. Trước khi stage: grep toàn repo xác nhận
không lẫn secret; `.gitignore` bổ sung `__pycache__/`, `*.egg-info/`, `.claude/scheduled_tasks.lock`.

| Commit | Nội dung |
|---|---|
| `82180f7` | chore: bootstrap agent-toolbox |
| `e5116aa` | feat(ai): churn-risk ML pipeline (KMeans + LR) |
| `6a4bdd5` | feat(be): publish behavior events + trigger churn-risk campaign |
| `7d37a88` | feat(fe): churn-risk trigger trong campaign builder |
| `9b2d280` | docs: overview + implementation plan + ranh giới ML |
| `7b78e4f` | feat(tools): synthetic data-seed |

---

## 2026-07-28 — Phản biện "AI có thật sự cần thiết?" + audit lại chất lượng đo lường

### Thảo luận

Vấn đề nêu ra: hệ thống **chạy được** nhưng **chưa chứng minh được AI tạo giá trị hơn rule-based**
→ dễ bị đánh giá là "thêm AI cho có". Đưa ra 6 hướng phát triển tiếp và cần chấm điểm hướng nào
đáng làm.

### Audit code (đọc code thật, không suy đoán) — 3 phát hiện

1. **Luận điểm "vì sao AI thay vì rule" hiện chỉ là lời văn, chưa có số đo.**
   `churn-risk-feature-overview.md:95-100` đã viết đúng ý ("ranh giới rủi ro là mặt phân cách nhiều
   chiều, không phải 1 ngưỡng đơn") nhưng chưa có rule engine nào từng chạy để so sánh. Grep toàn
   repo: không tồn tại rule-based classifier — chỉ có ngưỡng áp lên *output* model
   (`risk_scheduler.py:52-55`) và `has_recent_abandoned_cart()` dùng để canh **thời điểm** trigger.

2. **Train/test không tách theo user → AUC 0.9313 đang bị thổi lên.** `train.py:119-121` chia test
   theo mốc thời gian, nhưng panel là ~500 user × 6 cutoff = 3000 dòng, nên **hầu hết user trong
   test cũng nằm trong train** (chỉ khác mốc). Feature cùng user ở mốc 90 và 60 ngày tương quan rất
   cao, nhãn thường y hệt → model có thể nhận diện *user* thay vì học *quy luật churn*.
   Hệ quả: cỡ mẫu hiệu dụng là ~500 user (không phải 2500 dòng); chỉ 1 holdout 500 dòng tương quan
   → sai số AUC cỡ ±0.02–0.03, nên 0.9313 → 0.94 là **nhiễu**. **Thêm feature có thể làm AUC tăng
   trong khi tổng quát hóa giảm, và thước đo hiện tại không phát hiện được.**

3. **KMeans khai báo k=4 nhưng chỉ sinh ra 2 nhãn.** `train.py:112` đặt `n_clusters=4`, song
   `_assign_cluster_labels` (`train.py:57-68`) gộp còn 2 tên — nhánh `New Customers` và
   `Potential Loyalists` không bao giờ được gán; **64% dân số (1934/3000) bị gọi là "VIP
   Champions"**; silhouette 0.286 (các cụm tách nhau yếu). Hệ quả: chiều "segment quyết định loại
   campaign" hiện chỉ mang ~1 bit thông tin → Next Best Action không có gì để chọn.

### Chốt hướng đi

| Hướng | Kết luận |
|---|---|
| 5. Ranking / top-N | **Làm** — và nâng thành xếp hạng theo **tổn thất kỳ vọng** `P(churn) × monetary`, không phải xác suất trần. Rule không làm được vì không có xác suất để nhân |
| 3. Next Best Action | **Làm phần lõi** — sửa gán nhãn cụm để lộ 4 phân khúc thật ⇒ action *type* đến từ cấu trúc học được, không phải `if/else`. Bản NBA học policy từ outcome thì cần hướng 6 |
| 2. Mở rộng feature | **Làm sau khi sửa eval.** Ưu tiên feature trực giao với cơ chế sinh dữ liệu (review, voucher usage, session/intent); **tránh** slope tần suất mua (đọc trực tiếp λ → vòng tròn). Thêm theo **khối**, giữ lại bằng L1 path + permutation importance |
| 1. Benchmark Rule vs AI | Tạm để lại — nhưng lưu ý: hạ tầng đo cần cho hướng 2 **chính là** hạ tầng làm hướng 1 gần như miễn phí. Khi làm phải quét grid ngưỡng lấy **rule tốt nhất** rồi mới so, nếu không baseline bị coi là dựng để thua |
| 6. Feedback loop | Tạm để lại — **không đánh giá được** trong phạm vi đồ án: dữ liệu synthetic thì phải tự viết luôn model phản hồi rồi AI học lại chính nó (vòng tròn); dữ liệu thật chỉ có ~10 user login được. Giá trị là *kiến trúc*, nên viết thành mục "hướng phát triển" |

**Thứ tự thực thi đã chốt:** (1) sửa eval — `GroupKFold` theo `user_id`, báo AUC mean ± std →
(2) sửa gán nhãn cụm + xếp hạng theo tổn thất kỳ vọng → (3) mở rộng feature theo khối.

### Code — bước 1 + 2

| File | Thay đổi |
|---|---|
| `app/training/train.py` | Viết lại giao thức đánh giá: `_evaluate_grouped_cv` (mỗi fold test = user giữ lại tại mốc gần nhất, train = user **khác** ở các mốc **cũ hơn** → vừa tách user vừa giữ nhân quả thời gian), báo mean ± std. Giữ `_evaluate_optimistic_split` tái tạo split cũ để **đo** độ lớn leakage. Thêm `_tune_threshold`, `_ranking_metrics`, `_feature_importance`, `_segment_profiles` |
| `app/training/train.py` | `_assign_cluster_labels` đổi từ chuỗi if/elif sang **phân công tối ưu Hungarian** (`scipy.optimize.linear_sum_assignment`) → song ánh, 4 cụm ra đúng 4 nhãn khác nhau. Thêm `recent_view_count` vào chiều nhận dạng (nếu không thì user chưa từng mua đều recency=days_inactive=9999, **không** tách được "mới, còn xem" với "đã nguội hẳn"). Ghi kèm `archetype_match_distance` + cảnh báo khi khớp kém |
| `app/training/train.py` | KMeans đổi `MinMaxScaler` → `QuantileTransformer(normal)`: default 9999 kéo giãn MinMax làm 99% user dồn về gần 0 (silhouette run đầu chỉ 0.286). Vẫn lưu ở key `"scaler"` nên `risk_scoring.py` không phải sửa. **Cố ý KHÔNG đổi pipeline classifier** để delta AUC quy được về đúng nguyên nhân leakage |
| `app/services/risk_scoring.py` | Thêm cột `expected_loss = churn_probability × monetary`. `cluster_labels.get(..., "Unknown")` thay vì `[...]` (cụm rỗng khi fit → KeyError giết cả lần scan) |
| `app/services/risk_scheduler.py` | Thứ tự mới: **lọc → xếp hạng theo tổn thất kỳ vọng → cắt theo ngân sách** (cắt trước khi lọc sẽ đốt suất voucher vào người rồi bị rule loại). Publish thêm `monetary`/`expectedLoss`/`riskRank` |
| `app/core/config.py` | `RISK_MAX_VOUCHERS_PER_SCAN` (default 50, `0` = không giới hạn) |
| `PromotionKafkaConsumer.java` | Đưa `monetary`/`expectedLoss`/`riskRank` vào process variables → BPMN phân nhánh được theo **giá trị** khách hàng, không chỉ theo xác suất |
| `requirements.txt` | Khai `scipy` tường minh (trước là dependency gián tiếp của sklearn) |

Model xuất bản giờ fit trên **toàn bộ** panel; metric báo cáo đến từ grouped CV chứ không từ dữ liệu
model đã thấy — đúng quy ước "CV để đo, full-fit để dùng".

### Test

Docker Desktop không chạy nên **chưa train được trên dữ liệu thật**. Đã test logic offline bằng
panel tổng hợp mô phỏng đúng cấu trúc thật (500 user × 6 mốc, có cả default 9999, tham số ẩn λ với
~30% user giảm dần):

- **Gán nhãn phân khúc**: ra đúng 4 nhãn khác nhau, `At Risk` còn nguyên (hợp đồng với
  `risk_scheduler.AT_RISK_SEGMENT`). Cơ chế cảnh báo hoạt động: tự phát hiện `At Risk` khớp kém
  (khoảng cách 2.916 > 2.5) vì panel tổng hợp không có cụm "giá trị khá + đang nguội" nào thật.
- **Grouped CV**: kiểm chứng 5 fold **không chung user**, train **không** chứa mốc test, pooled OOF
  đúng 1 dòng/user. AUC 0.9064 ± 0.0217.
- **Xếp hạng** (`run_risk_scan`): lọc trước–xếp hạng–cắt ngân sách đúng thứ tự; người bị rule loại
  không được phát; user xác suất cao nhất (0.95) nhưng giá trị bé nhất **không** vào top; `riskRank`
  và `budget=0 (không giới hạn)` đúng.
- **Java**: `mvn compile` promotion-service **PASS** — nhưng phải dùng **JDK 17**. `java` mặc định
  trong máy là JDK 23, Lombok 1.18.30 không chạy được trên đó → 198 lỗi "cannot find symbol" ở các
  file không liên quan. Ghi lại để lần sau không mất thời gian: `JAVA_HOME=C:/Program Files/Java/jdk-17.0.5`.

### Train trên dữ liệu thật — 16:43, version `20260728T094356024384`

Dữ liệu: 3361 đơn / 61.694 event / 500 user / 6 mốc = 3000 dòng panel, churn rate 0.1883.

**Classifier — grouped CV (user-disjoint + nhân quả thời gian):**

| Metric | mean ± std |
|---|---|
| Precision | 0.6368 ± 0.0558 |
| Recall | 0.9760 ± 0.0320 |
| F1 | 0.7692 ± 0.0417 |
| **AUC** | **0.9381 ± 0.0263** |

AUC từng fold: 0.8971 · 0.9368 · 0.9245 · 0.9632 · 0.9691

**❗ Giả thuyết leakage của tôi SAI về độ lớn.** Split cũ (chung user) cho AUC = 0.9402, grouped CV
cho 0.9381 → leakage chỉ thổi lên **+0.0021**, nằm sâu trong ±0.0263. Nghĩa là **con số 0.9313 của
run đầu KHÔNG bị sai lệch đáng kể** — không được viết trong báo cáo rằng "đã phát hiện và sửa
leakage làm AUC giảm".

Cái bước 1 thực sự mang lại là **±std**: fold thấp nhất 0.8971, cao nhất 0.9691. Sàn nhiễu ±0.026
(biên độ ~0.07 giữa các fold) ⇒ **mọi "cải thiện" AUC dưới ~0.05 khi mở rộng feature là nhiễu, không
phải tiến bộ.** Trước đây chỉ có 1 con số nên không thể biết điều này — đây mới là lý do bước 1 cần
thiết, chứ không phải vì leakage.

**Ngưỡng:** đề xuất **0.55** (production vẫn 0.5, chưa đổi). Tại 0.5: precision 0.6321 / recall
0.9760. Tại 0.55: precision 0.6782 / recall 0.9440 — đổi 3.2 điểm recall lấy 4.6 điểm precision.

**Xếp hạng — tổng doanh thu đang rủi ro = 10.008.802.000 ₫:**

| Ngân sách K | rev-recall xếp theo xác suất | rev-recall xếp theo tổn thất kỳ vọng | Hơn |
|---|---|---|---|
| 25 | 0.0473 | 0.3654 | **7,7×** |
| 50 | 0.1509 | 0.5637 | **3,7×** |
| 100 | 0.5457 | 0.7779 | 1,4× |
| 200 | 0.8966 | 0.9068 | 1,0× |

Với đúng **50 voucher**: xếp theo xác suất giữ được 1,51 tỷ doanh thu-đang-rủi-ro; xếp theo tổn thất
kỳ vọng giữ được 5,64 tỷ — **chênh 4,1 tỷ chỉ do đổi cách xếp hạng**, không train lại gì. `precision@K`
giảm (0.80 → 0.46) là **đúng chủ đích**: đang tối ưu doanh thu giữ được, không tối ưu số người bắt đúng.
Đây là việc rule-based không làm được: không có xác suất thì không nhân được với giá trị khách hàng.

**Segmentation:** silhouette **0.3034** (cũ, MinMaxScaler: 0.2861 — cải thiện nhỏ, vẫn là cấu trúc
cụm yếu). Ra đủ 4 nhãn, không nhãn nào khớp kém (<2.5):

| Segment | size | freq | monetary | recency | inactive | views | abandon | dist |
|---|---|---|---|---|---|---|---|---|
| VIP Champions | 1146 | 7.41 | 256.566.113 | 43.6 | 2.7 | 3.44 | 1.07 | 2.158 |
| New Customers | 759 | 2.47 | 90.213.528 | 94.6 | 17.0 | 1.11 | 0.00 | 1.331 |
| At Risk | 727 | 3.78 | 134.551.524 | 128.0 | 22.8 | 0.83 | 0.00 | 2.314 |
| Hibernating | 368 | 0.00 | 0 | 9999.0 | 37.8 | 0.68 | 0.12 | 1.122 |

So với run cũ (2 nhãn, 64% dân số bị gọi là VIP): giờ 4 phân khúc dùng được thật, `At Risk` đúng hình
dạng cần (recency cao nhất trong nhóm có mua, giá trị còn khá → đáng cứu).

**Feature importance (hệ số LR, thang MinMax):**

| Feature | coef | |
|---|---|---|
| `category_diversity_viewed` | −4.4363 | kéo rủi ro xuống |
| `cart_abandon_count` | +2.9923 | đẩy rủi ro lên |
| `days_since_last_activity` | +2.9305 | đẩy rủi ro lên |
| `recent_view_count` | −2.7245 | kéo rủi ro xuống |
| `monetary` | −1.4169 | kéo rủi ro xuống |
| `view_to_cart_conversion_rate` | +1.0589 | đẩy rủi ro lên |
| `frequency` | −1.0298 | kéo rủi ro xuống |
| `avg_order_value` / `cancel_rate` | −0.3482 / −0.3376 | |
| **`recency`** | **+0.2622** | gần như không ảnh hưởng |
| `discount_dependency` | +0.0420 | ~0 |

**Insight đáng giá nhất:** **4 trong 5 feature mạnh nhất đều là feature HÀNH VI** (từ `user_events`),
còn **`recency` — biến kinh điển của RFM — gần như vô dụng (+0.26)**. Tức nếu chỉ làm RFM trên bảng
`orders` như bản đầu thì đã bỏ mất phần lớn tín hiệu. Đây là biện minh định lượng cho toàn bộ công
việc dựng pipeline behavior-tracking (Phase 2 + 4).
*Caveat:* hệ số LR trên tập feature tương quan chỉ đọc được là "liên hệ khi đã kiểm soát các biến
còn lại", không phải nhân quả; kiểm chứng chắc hơn cần permutation importance (thuộc bước 3).

### Kiểm chứng risk-scan trên dữ liệu thật

`POST /api/v1/risk/trigger-scan` → `{at_risk_candidates: 79, eligible: 0, published: 0}`. **0 eligible
là đúng, không phải bug**: rule tầng 2 đòi bỏ giỏ trong 24h, mà giỏ trong seed giờ đã cũ hơn 24h
(hôm qua còn 2 người).

Nên kiểm chứng riêng phần lọc-segment → xếp hạng → cắt ngân sách bằng cách chạy `run_risk_scan` trong
container với rule thời điểm bỏ qua + producer giả (**không publish gì lên Kafka**):
`79 candidates → 79 eligible → 50 published (ngân sách) → 29 skipped_by_budget`. Kiểm tra: `expectedLoss`
giảm dần đúng thứ tự ✓, `riskRank` liên tục 1..50 ✓, tất cả đều `At Risk` ✓, đủ 3 field mới ✓.

Bằng chứng cơ chế hoạt động: **rank 1 có P=0.7265 nhưng xếp trên rank 6 có P=0.9505**, vì giá trị
943.879.000 ₫ so với 273.538.000 ₫ (gấp 3,5×). Xếp theo xác suất thuần sẽ đảo ngược cặp này.

**Chưa kiểm chứng:** E2E đầy đủ qua Camunda → voucher với 3 process variable mới, vì `promotion-service`
hiện không chạy (jar đã build OK bằng JDK 17) và hôm nay không có ai đủ điều kiện. Luồng phát voucher
đã kiểm chứng E2E hôm 2026-07-27; thay đổi Java lần này chỉ *thêm* 3 biến, không đổi đường phát voucher.

**Nợ kỹ thuật phát hiện thêm (sẵn có, không do lần sửa này):** `rfm.py:62` và `behavior.py:133` có
`FutureWarning` — `.fillna()` downcast object dtype sẽ đổi hành vi ở pandas tương lai. Nên sửa trước
khi nâng pandas.

### Bước 3 — Mở rộng feature: kết quả ÂM, và đó là kết quả tốt

**Trước khi viết code, đọc bộ sinh dữ liệu** (`tools/data-seed/lib/{profiles,simulate}.mjs`) để loại
ứng viên bằng bằng chứng thay vì phỏng đoán. Phần lớn danh sách tôi đề xuất ở lượt thảo luận **chứng
minh được là nhiễu hoặc bất khả thi**:

| Ứng viên | Vì sao loại |
|---|---|
| `review_count`, `avg_rating_given` | `product_reviews` có **0 dòng** |
| `voucher_usage_rate` | `issued_vouchers` có **1 dòng** (voucher test hôm qua) |
| Mọi feature theo session | `user_events.session_id` **NULL toàn bộ** 61.694 dòng |
| Entropy giờ/ngày, tỉ lệ cuối tuần | Mọi timestamp sinh bằng `randomTimestamp()` — phân bố ĐỀU trong tháng, không có nhịp ngày/tuần nào tồn tại |
| Độ sâu giảm giá | `discountAmount` luôn đúng 10% — hằng số |
| Herfindahl tập trung category | `preferredCategories` sinh **độc lập** với `willChurn`/`churnMonth` → không mang tín hiệu churn |
| Lặp xem cùng sản phẩm | `pickProduct()` chọn độc lập mỗi lần → đo thật: `repeat_view_ratio` median **1.0**, max 1.667 (gần như không có lượt xem lặp) |

⇒ **2 nhóm cross-service tôi từng xếp ưu tiên cao nhất đều chết vì bảng rỗng.** Generator chỉ có 2
cơ chế gắn với churn (λ tụt bậc 5% từ `churnMonth`; bỏ giỏ ×2.5 trong 2 tháng "phân vân"), và 11
feature hiện tại đã phủ cả hai.

**Harness mới** `app/training/ablation.py` + `POST /api/v1/models/ablation` (không lưu model, không
ảnh hưởng model đang chạy) + `shared_common/features/candidates.py` (9 feature ứng viên, 3 block).
`train.py` được refactor để `_evaluate_grouped_cv`/`_fit_classifier` nhận `feature_columns`.

**Kết quả (baseline = 11 feature production, sàn nhiễu = ±0.0265):**

| Block | +feat | AUC | ± std | ΔAUC | Kết luận |
|---|---|---|---|---|---|
| baseline | — | 0.9379 | 0.0265 | — | — |
| `abandon_shape` | 2 | 0.9398 | 0.0256 | +0.0019 | LOẠI (trong nhiễu) |
| `gap_dispersion` | 4 | 0.9369 | 0.0311 | −0.0010 | LOẠI (trong nhiễu) |
| **`noise_control`** (đối chứng âm) | 3 | 0.9412 | 0.0267 | **+0.0033** | LOẠI (trong nhiễu) |
| tất cả | 9 | 0.9410 | 0.0298 | +0.0031 | LOẠI (trong nhiễu) |

**Điểm quan trọng nhất: đối chứng âm (+0.0033) ăn điểm CAO HƠN cả 2 block "thật"** (+0.0019 và
−0.0010). Đây đúng là công dụng của đối chứng âm — nó chứng minh mấy con ΔAUC dương nhỏ kia không
phân biệt được với việc thêm feature vô nghĩa. Không feature nào được đưa vào production.
*(Nuance trung thực: đối chứng âm không hoàn toàn trơ — `distinct_items_viewed` cũng là proxy khối
lượng hoạt động, nên +0.0033 không phải nhiễu thuần. Kết luận "mọi delta đều trong nhiễu" không đổi.)*

**Permutation importance SỬA bảng hệ số LR — và sửa rất nặng:**

| Feature | AUC tụt khi xáo trộn | coef LR (báo ở trên) |
|---|---|---|
| `category_diversity_viewed` | **0.2253 ± 0.0197** | −4.44 |
| `days_since_last_activity` | 0.0285 ± 0.0090 | +2.93 |
| `recent_view_count` | 0.0070 ± 0.0038 | −2.72 |
| **`cart_abandon_count`** | **−0.0011 ± 0.0025** | **+2.99** |
| 7 feature còn lại | ≈ 0 hoặc âm | |

**`cart_abandon_count` có hệ số LR lớn thứ 2 (+2.99) nhưng đóng góp dự đoán bằng KHÔNG.** Hệ số lớn
chỉ vì đa cộng tuyến — nó bù trừ cho các feature tương quan, không mang tín hiệu độc lập. Đây chính
là cái bẫy đã cảnh báo, giờ có số chứng minh. **Bảng hệ số LR ở mục trên phải đọc kèm bảng này.**

**L1 path — kết quả mạnh nhất của bước 3:**

| C | AUC | ± std | Số feature giữ | Feature |
|---|---|---|---|---|
| 0.01 | 0.9309 | 0.0201 | **1.4** | `category_diversity_viewed`, `recency` |
| 0.03 | 0.9324 | 0.0229 | 2.6 | + `days_since_last_activity` |
| 0.1 | 0.9394 | 0.0261 | 4.2 | + `recent_view_count`, `view_to_cart_conversion_rate`, `discount_dependency` |
| 1.0 | 0.9379 | 0.0260 | 9.0 | |
| 3.0 | 0.9376 | 0.0269 | 10.2 | |

**~2 feature cho AUC 0.9309 ± 0.0201, không phân biệt được với 11 feature (0.9379 ± 0.0265).** Với
đồ án, "chứng minh 2 feature là đủ" là kết quả mạnh hơn nhiều so với "thêm 9 feature nữa".

**⚠ Hệ quả cho hướng 1 (Rule vs AI) — cần biết trước khi viết báo cáo:** nếu chiều hữu dụng thực tế
chỉ ~2, thì luận điểm "ranh giới rủi ro là mặt phân cách 11 chiều" ở
`churn-risk-feature-overview.md:95-100` **yếu hơn tưởng**, và một rule 2 biến có thể tiệm cận AI. Nói
cách khác: bằng chứng ablation đang **chống lại** kỳ vọng của hướng 1, không ủng hộ. Điểm mạnh còn
vững của AI trong hệ thống này là **xác suất hiệu chỉnh để xếp hạng theo tổn thất kỳ vọng** (3,7–7,7×
doanh thu giữ được) — cái rule không có cách nào làm.

**⚠ Nghi vấn về định nghĩa nhãn:** `category_diversity_viewed` (số category xem trong 30 ngày) một mình
làm AUC tụt 0.2253 khi xáo trộn — áp đảo mọi feature khác. Nhưng nhãn churn là "KHÔNG có hoạt động nào
trong 30 ngày tới". Tức bài toán gần như thành "user đang hoạt động có tiếp tục hoạt động không", và
feature thắng chỉ là một chỉ báo hoạt động. AUC 0.938 vì vậy phản ánh **tính bền của hoạt động** hơn là
dự đoán churn tinh vi. Nên nêu thẳng giới hạn này khi bảo vệ.

### Việc đang mở

- [x] Sửa eval: grouped CV theo user, AUC mean ± std
- [x] Sửa `_assign_cluster_labels` → 4 phân khúc thật sự dùng được
- [x] Xếp hạng theo tổn thất kỳ vọng + precision@K / revenue-recall@K theo ngân sách voucher
- [x] Bảng hệ số `model.coef_` theo 11 feature (lưu ở `extra.feature_importance`)
- [x] **Chạy `POST /api/v1/models/train` trên DB thật** → đã có số thật (xem mục trên)
- [x] Kiểm chứng xếp hạng + ngân sách trên dữ liệu thật
- [ ] E2E qua Camunda với 3 process variable mới — cần `promotion-service` chạy + 1 user có giỏ bỏ
      dở trong `RISK_ABANDON_GRACE_HOURS`
- [ ] Quyết định có đổi `RISK_CHURN_PROBABILITY_THRESHOLD` 0.5 → 0.55 hay không (đang để nguyên 0.5)
- [x] Mở rộng feature theo khối → **không block nào vượt sàn nhiễu, không đưa gì vào production**
- [ ] Sửa `FutureWarning` ở `rfm.py:62` + `behavior.py:133` trước khi nâng pandas
Từ đây trở đi việc được quản lý ở [`churn-risk-roadmap.md`](churn-risk-roadmap.md) (xếp theo thứ tự
phụ thuộc, có tiêu chí thành công + tiêu chí dừng). Hai việc chặn đường, làm trước tiên:

- [x] **Tầng 0.1 — Kiểm định & hiệu chỉnh xác suất** → XONG, xem mục 2026-07-31. Miscalibration thật
      và nặng (ECE 0.1797, thổi phồng ~1,74×); `isotonic` tốt nhất; con số headline **tăng** lên 4,04×
      (K=50). Chưa áp vào production.
- [x] **Áp calibration vào production** → XONG, xem mục 2026-08-01. Ràng buộc "2 việc phải đi cùng
      nhau" đã cài cứng bằng guard `effective_threshold()` + cờ `calibrated` trong bundle, đã test.
- [x] **Tầng 0.2 — Định nghĩa lại nhãn** → XONG (chẩn đoán 12 biến thể → áp nhãn v2). **Tầng 0 hoàn tất.**
- [ ] **Sửa lại mọi chỗ đã viết con số 3,7–7,7× / 4,04×** — số đúng sau khi siết dân số là **~1,5–2,2×**
- [x] **Tầng 2.2 — Benchmark Rule vs AI** → XONG. Model hơn rule tốt nhất +0.0519 F1 (vượt sàn nhiễu);
      rule viết tay kém rule-đã-fit 5–14×; rule không xếp hạng được.
- [x] **Cập nhật `churn-risk-feature-overview.md`** → XONG. Thay đoạn lập luận suông bằng bảng benchmark
      thật; sửa mục 3.1 (tên phân khúc + cách gán nhãn theo churn rate), 3.3 (định nghĩa nhãn v2 +
      grouped CV, AUC 0.93 → 0.84 kèm lý do), thêm mục 3.4 (hiệu chỉnh xác suất) và 3.5 (xếp hạng theo
      tổn thất kỳ vọng); cập nhật sơ đồ luồng thành 4 tầng lọc; bổ sung 6 giới hạn mới vào mục 6.
- [x] **Tầng 5** → XONG phần lớn: segmentation nối số thật, anomalies/demand-forecasting gắn nhãn demo
      rõ ràng (xoá dòng bịa MAPE/LSTM), sửa `FutureWarning`, thêm model card (`GET /models/card`),
      thêm retrain gate (`AUC mới >= AUC cũ - std`, bỏ qua so sánh khi đổi định nghĩa nhãn, đã kiểm
      chứng cả 2 nhánh đạt/rớt). Còn lại: giám sát drift feature (để riêng, quy mô lớn hơn).
- [x] **Tầng 1.1 — sửa `session_id` write-path** → XONG. Lỗi nằm ở CẢ `behavior_consumer.py:45`
      (Python) LẪN `CartEventProducer.java` (Java, phát hiện thêm) hardcode null cả 2 phía. Sửa
      xuyên suốt FE (`X-Session-Id` header) → product-service/order-service → forecast-service.
      Verify: `mvn package` bằng JDK 17 tường minh (build Docker trước đó chỉ đóng gói jar CŨ, không
      compile gì — tự phát hiện + sửa, xem mục 2026-08-03 "SAI LẦM đã tự phát hiện") + test parse
      trong container. Chưa E2E qua Camunda.
- [x] **Tầng 1.2 — làm giàu seeder (session + nhịp giờ/ngày)** → XONG, **ĐÃ reseed DB thật** (user
      xác nhận qua AskUserQuestion) + train lại + chạy lại calibration/rule-benchmark để đối chiếu.
      Retrain gate **từ chối thật lần đầu** (AUC 0.7745 < ngưỡng 0.8095, đúng thiết kế). Calibration
      lặp lại y hệt kết luận cũ. **Rule-vs-AI: margin F1 KHÔNG còn vượt sàn nhiễu trên lượt này** —
      xem chi tiết + khuyến nghị đổi trọng tâm luận điểm ở mục 2026-08-03. `feature-overview.md` mục
      3.2 hiện ĐANG STALE (số cũ), chờ xác nhận trước khi viết lại.
- [x] **Tầng 1.2 (còn lại)** — review (`product_reviews`) + lịch sử voucher (`issued_vouchers`) →
      XONG, verify 0 orphan qua SQL trực tiếp. Thêm 3 candidate block mới (`session`/`review`/
      `voucher`) vào `candidates.py`, chạy `ablation` thật → **cả 6 block đều LOẠI (trong nhiễu)**,
      đúng như dự đoán (tham số ẩn mới cố ý độc lập với churn — null result xác nhận harness đúng,
      không phải seeder hỏng). Xem chi tiết ở mục "Hoàn tất Tầng 1.2".
- [x] **Tầng 3 — Next-Best-Action theo tầng xác suất** → XONG cơ chế. Thêm node điều kiện
      `Condition_ChurnRiskTier` (BE: `BpmnCompilerService`/`WorkflowValidatorService`; FE: 9 file
      trong campaign builder) tái dùng đúng cơ chế exclusive-gateway N-nhánh đã có — admin ghép được
      "0–0,2: chiến dịch A, 0,2–0,5: B, còn lại: C" trong 1 campaign, không cần sửa Camunda engine.
      Verify thật bằng harness Java gọi `validate()`+`compile()`: pass, sinh đúng BPMN XML có cả 2
      `conditionExpression`. **Tự phát hiện lại** lỗi "Docker build không compile" (giống Tầng 1.1) —
      đã sửa bằng `mvn package` JDK 17 tường minh. Chưa deploy campaign thật qua Camunda.

---

## 2026-07-31 — Tầng 0.1: kiểm định & hiệu chỉnh xác suất

Theo yêu cầu, lên plan trước rồi mới code: [`churn-risk-tier0-plan.md`](churn-risk-tier0-plan.md).

### Vì sao làm việc này TRƯỚC cả việc sửa nhãn

Đây là việc duy nhất có thể làm một kết quả **đã báo cáo** trở thành sai.
`LogisticRegression(class_weight="balanced")` khiến sklearn đặt trọng số `w_c = n/(n_classes·n_c)` ⇒
tổng trọng số 2 lớp bằng nhau ⇒ model ước lượng hậu nghiệm dưới **tiên nghiệm 50/50**, không phải
base rate thật. Grep toàn repo: **không có phép đo calibration nào**.

Hiệu chỉnh về tiên nghiệm thật là phép dịch odds `odds_thật = odds_model × π/(1−π)` — **đơn điệu nhưng
phi tuyến**. Nên: AUC và xếp-theo-`P`-thuần **không đổi**; xếp theo **`P × monetary` thì ĐỔI** (phép
nhân, P co giãn khác nhau ở các mức khác nhau). Con số "3,7–7,7× doanh thu giữ được" vì vậy phải đo lại.

### Đã build

- `app/training/calibration.py` — Brier, ECE, reliability curve; 4 phương án so trong **cùng một cách
  chia fold** (so chéo giữa các lần chia fold khác nhau thì chênh lệch lẫn với nhiễu chia fold).
- `_evaluate_grouped_cv` trả thêm `train_df` trong `_folds` để calibrator refit được **trong** fold
  (dùng base rate/dữ liệu toàn panel là rò rỉ).
- Endpoint `POST /api/v1/models/calibration` — thuần phân tích, không lưu model, không đổi đường voucher.
- Bổ sung `by_probability` vào bảng xếp hạng để tỉ số "hơn N lần" nằm **trong cùng một run** (số
  3,7× cũ ghép từ run 07-28, cutoff đã dịch 3 ngày nên không so trực tiếp được).

### Kết quả — miscalibration THẬT và nặng

Run 2026-07-31, base rate 0.1887, 5 fold. *(Cutoff tính theo ngày chạy nên panel lệch nhẹ so với run
07-28: AUC 0.9316 vs 0.9379 — vẫn trong sàn nhiễu ±0.0265, không phải hồi quy.)*

| Phương án | ECE | Brier | P̄ dự đoán | Thực tế | AUC | Ngưỡng F1 tốt nhất |
|---|---|---|---|---|---|---|
| `raw` | **0.1797** | 0.1308 | **0.4217** | 0.2420 | 0.9316 | 0.61 |
| `prior_shift` | 0.0819 | 0.0976 | 0.2247 | 0.2420 | 0.9316 | 0.24 |
| `platt` | 0.0726 | 0.0956 | 0.2360 | 0.2420 | 0.9316 | 0.24 |
| **`isotonic`** | **0.0391** | **0.0906** | 0.2433 | 0.2420 | 0.9314 | 0.23 |

**Model dự đoán churn ở mức 0.4217 trong khi thực tế là 0.2420 — thổi phồng ~1,74×.** Reliability
curve cho thấy over-predict ở **mọi bin**, tệ nhất bin [0.4,0.5): dự đoán 0.4526 vs thực tế 0.0323
(lệch +0.42). `isotonic` giảm ECE **4,6 lần** mà AUC không đổi ⇒ không có dấu hiệu overfit.

**Phép kiểm tra bug đạt:** AUC giống hệt nhau ở `raw`/`prior_shift`/`platt` (0.9316) đúng như lý
thuyết dự đoán cho biến đổi đơn điệu ngặt; `isotonic` lệch 0.0002 do sinh giá trị trùng (đơn điệu
không ngặt) — đúng dự kiến.

### Rủi ro đã lo KHÔNG xảy ra — con số headline TĂNG

revenue-recall@K, **cùng run**, xếp theo `P` thuần vs theo `P × monetary`:

| K | `raw`: theo P | `raw`: theo P×tiền | hơn | `isotonic`: theo P | `isotonic`: theo P×tiền | hơn |
|---|---|---|---|---|---|---|
| 25 | 0.0383 | 0.3330 | 8,69× | 0.0383 | **0.4056** | **10,59×** |
| 50 | 0.1752 | 0.5146 | 2,94× | 0.1696 | **0.6859** | **4,04×** |
| 100 | 0.5127 | 0.7743 | 1,51× | 0.5125 | 0.8589 | 1,68× |
| 200 | 0.9613 | 0.9154 | 0,95× | 0.9613 | 0.9545 | 0,99× |

Tổng doanh thu đang rủi ro: **9.698.109.000 ₫**.

Hai điều xác nhận bằng số: (1) xếp theo `P` thuần **bất biến** với hiệu chỉnh (0.0383 ở cả hai, đúng
lý thuyết); (2) hiệu chỉnh làm xếp-theo-tổn-thất-kỳ-vọng **tốt lên** — cùng 50 voucher giữ được
**68,6%** doanh thu rủi ro thay vì 51,5%.

**Nuance quan trọng, phải nói khi báo cáo:** lợi thế lớn nhất khi **ngân sách chật** và **tan biến khi
ngân sách rộng** (K=200 → 0,99×, tức không hơn gì). Hợp lý: với 200/500 user thì xếp theo xác suất đã
phủ gần hết churner (0.9613). Đúng chỗ nó có ích trong thực tế — ngân sách marketing luôn chật.

### Phát hiện vận hành: ngưỡng 0.5 hiện tại đang sai

Ngưỡng F1 tối ưu là **0.23–0.24** trên xác suất đã hiệu chỉnh, còn **0.61** trên xác suất thô.
Production đang chạy `RISK_CHURN_PROBABILITY_THRESHOLD=0.5` trên xác suất **chưa hiệu chỉnh** ⇒ đang
**bắn quá rộng**. So sánh tại ngưỡng 0.5:

| Phương án | Precision | Recall | F1 |
|---|---|---|---|
| `raw` (đang chạy) | 0.6082 | 0.9752 | 0.7492 |
| `isotonic` | 0.7120 | 0.7355 | 0.7236 |

### Chưa áp dụng vào production — chờ duyệt

Đề xuất chi tiết ở [`churn-risk-tier0-plan.md`](churn-risk-tier0-plan.md) mục "Đề xuất áp dụng".
**Cảnh báo: 2 việc phải đi CÙNG NHAU** (lưu calibrator vào bundle + đổi ngưỡng 0.5→0.23). Áp một mà
không áp cái kia thì sai nặng hơn hiện tại: ngưỡng 0.23 trên xác suất chưa hiệu chỉnh sẽ bắn gần như
mọi user.

### Sửa lỗi trong chính file log này

Phát hiện log trộn 2 múi giờ: run train đầu ghi "10:03" (giờ UTC của container) còn run sau ghi
"16:43" (giờ host). Đã đối chiếu mtime trên host (`17:03:19` cho version `20260727T100319`) — **không
có lệch đồng hồ thật**, chỉ khác múi giờ. Đã sửa run đầu về **17:03** và thêm quy ước giờ ở đầu file.

---

## 2026-08-01 — Áp hiệu chỉnh vào production

Đã duyệt áp dụng. Nguyên tắc "2 việc phải đi cùng nhau" được cài **cứng trong code**, không chỉ ghi
trong tài liệu — xem mục guard bên dưới.

### Thay đổi

| File | Thay đổi |
|---|---|
| `train.py` | `_fit_calibrated()` (LR + `CalibratedClassifierCV(isotonic, cv=5)`) dùng cho **cả** OOF hiệu chỉnh **và** model xuất bản — cùng một hàm để cái đo được và cái chạy thật là cùng cấu trúc. `_calibrated_oof()` sinh OOF đã hiệu chỉnh để chọn ngưỡng. Bundle thêm `calibrated`, `calibration_method`, `uncalibrated_model` |
| `config.py` | `RISK_CHURN_PROBABILITY_THRESHOLD` 0.5 → **0.23**; thêm `..._LEGACY` = 0.5 |
| `risk_scoring.py` | `effective_threshold()` — trả `(ngưỡng, đã_hiệu_chỉnh)` |
| `risk_scheduler.py` | dùng `effective_threshold()` thay vì đọc thẳng config; trả thêm `threshold_used`, `model_calibrated` |

`uncalibrated_model` phải giữ lại vì `CalibratedClassifierCV` **không có** `coef_` — bảng feature
importance sẽ chết nếu chỉ lưu model đã bọc.

### Ngưỡng chọn trên thang nào — chỗ dễ sai nhất

`train.py` giờ báo **hai** ngưỡng đề xuất và điều này là cố ý:

- trên thang **thô**: 0.61
- trên thang **đã hiệu chỉnh**: **0.24** ← production dùng thang này

Nếu vẫn tune trên OOF thô như trước rồi áp lên model đã hiệu chỉnh thì ngưỡng 0.61 sẽ siết mất gần
hết candidate. Vì vậy `_calibrated_oof()` là bắt buộc, không phải tùy chọn.
*(Config đặt 0.23, run này đề xuất 0.24 — lệch 1 bước lưới quét, không đáng chỉnh.)*

### Guard chống dùng ngưỡng mới với model cũ — đã test

Rủi ro thật: bundle train trước Tầng 0.1 trả xác suất **thô**; áp ngưỡng 0.23 lên đó sẽ bắn gần như
**mọi** user. `effective_threshold()` đọc cờ `calibrated` trong bundle, không thấy thì **tự lùi** về
legacy 0.5 kèm WARNING.

Kiểm chứng bằng cách giả lập bundle kiểu cũ trong container:

```
config: ngưỡng mới=0.23 legacy=0.5
  bundle THẬT (đã hiệu chỉnh) -> ngưỡng=0.23 calibrated=True
  bundle CŨ (thiếu cờ)        -> ngưỡng=0.5  calibrated=False   + WARNING
```

### Kiểm chứng production

Train lại: `calibrated=True (isotonic)`, AUC grouped CV **0.9315 ± 0.0120**, churn rate 0.1887.

Tại 2 điểm hoạt động trên thang đã hiệu chỉnh:

| Ngưỡng | Precision | Recall | F1 |
|---|---|---|---|
| 0.5 | 0.7213 | 0.7273 | 0.7243 |
| **0.24** (đang dùng) | 0.6441 | **0.9421** | **0.7651** |

**Vì sao chọn điểm nghiêng về recall:** ngưỡng ở đây chỉ định nghĩa **bể candidate**, còn số người
thực nhận voucher do **ngân sách + xếp hạng theo tổn thất kỳ vọng** quyết định. Nên bỏ sót ở cửa vào
là mất hẳn, còn thừa ở cửa vào thì tầng xếp hạng lọc được. Recall 0.94 > 0.73 là lựa chọn đúng **với
điều kiện có tầng xếp hạng phía sau** — nếu bỏ tầng đó thì phải quay về ngưỡng 0.5.

`trigger-scan` thật: `{at_risk_candidates: 144, eligible: 0, published: 0, threshold_used: 0.23,
model_calibrated: true}`. Số candidate **79 → 144** là đúng chủ đích (ngưỡng 0.23 trên thang đã hiệu
chỉnh tương đương ~0.40 trên thang thô, rộng hơn 0.5 cũ). `eligible: 0` vẫn do rule 24h — giỏ trong
seed đã cũ.

Đường xếp hạng + ngân sách với xác suất đã hiệu chỉnh (producer giả, không publish):
`144 candidates → 144 eligible → 50 published → 94 skipped_by_budget`; `expectedLoss` giảm dần đúng
thứ tự ✓; `riskRank` liên tục 1..50 ✓; `P ∈ [0.2466, 0.9542]` — đều trên ngưỡng 0.23 ✓.

Bảng xếp hạng trên thang đã hiệu chỉnh (từ metadata của model đang chạy):

| K | theo P | theo P×tiền | hơn |
|---|---|---|---|
| 25 | 0.0526 | 0.4231 | **8,04×** |
| 50 | 0.1774 | 0.6453 | **3,64×** |
| 100 | 0.4985 | 0.8500 | 1,71× |
| 200 | 0.9613 | 0.9579 | 1,00× |

### Còn nợ

- Chưa kiểm chứng E2E qua Camunda → voucher với model đã hiệu chỉnh (`promotion-service` chưa chạy,
  và hôm nay không có ai qua được rule 24h).
- Bundle cũ `20260727T*` / `20260728T*` vẫn nằm trong `AI/models/` — không sao vì `latest.json` đã
  trỏ sang bản mới, nhưng nếu rollback thủ công về bản cũ thì guard sẽ tự lùi ngưỡng (đúng thiết kế).

### Tầng 0.2 — Chẩn đoán định nghĩa nhãn (chưa đổi production)

Đã build `app/training/label_diagnostics.py` + `POST /api/v1/models/label-diagnostics`;
`labels.py` thêm tham số `source` (`activity` = cũ, `orders` = chỉ tính đặt đơn), mặc định giữ nguyên
hành vi cũ; `_build_training_panel` nhận `cutoffs_days_ago` / `label_window_days` / `label_source`.

**Quyết định phương pháp:** mọi biến thể dùng **CÙNG một bộ cutoff** `[150,180,210,240,270]` ngày
trước, neo theo cửa sổ nhãn dài nhất (120+30 đệm). Nếu để mỗi biến thể tự chọn mốc theo cửa sổ của nó
thì lượng lịch sử mỗi user có tại mốc cũng khác nhau ⇒ base rate/AUC lệch vì **hai** nguyên nhân trộn
lẫn. Đánh đổi: không dùng được dữ liệu 5 tháng gần đây, nên **số tuyệt đối không so trực tiếp được với
run production** (mốc gần nhất 60 ngày).

| Cửa sổ | Nguồn nhãn | Lọc ≥đơn | User | Base rate | AUC | ±std | F1 | Feature mạnh nhất | imp |
|---|---|---|---|---|---|---|---|---|---|
| 60 | activity | 0 | 500 | 0.0776 | 0.8555 | 0.0647 | 0.4696 | `category_diversity_viewed` | 0.0612 |
| 60 | activity | 2 | 342 | 0.0508 | 0.7784 | 0.1176 | 0.2725 | `recent_view_count` | 0.0633 |
| 60 | orders | 0 | 500 | 0.4824 | 0.7832 | 0.0393 | 0.7149 | `category_diversity_viewed` | 0.0602 |
| 60 | orders | 2 | 342 | 0.3751 | 0.7828 | 0.0408 | 0.7098 | `category_diversity_viewed` | 0.0578 |
| 90 | activity | 0 | 500 | 0.0560 | 0.8208 | 0.0866 | 0.3828 | `category_diversity_viewed` | 0.0797 |
| 90 | activity | 2 | 342 | 0.0334 | 0.7882 | 0.0832 | 0.2363 | `recent_view_count` | 0.0876 |
| 90 | orders | 0 | 500 | 0.4012 | 0.8087 | 0.0400 | 0.7044 | `category_diversity_viewed` | 0.0661 |
| 90 | orders | 2 | 342 | 0.3062 | 0.8120 | 0.0461 | 0.6769 | `category_diversity_viewed` | 0.0862 |
| 120 | activity | 0 | 500 | 0.0392 | 0.8455 | 0.0442 | 0.3253 | `category_diversity_viewed` | 0.0925 |
| 120 | activity | 2 | 342 | 0.0223 | 0.7549 | 0.1465 | 0.1743 | `category_diversity_viewed` | 0.0914 |
| 120 | orders | 0 | 500 | 0.3532 | 0.8386 | 0.0285 | 0.7098 | `category_diversity_viewed` | 0.0895 |
| **120** | **orders** | **2** | **342** | **0.2624** | **0.8414** | **0.0299** | 0.6525 | `category_diversity_viewed` | 0.0912 |

#### Dự đoán Poisson được xác nhận

Tôi dự đoán cửa sổ 60 ngày cho base rate ~0,37 (`e^−1` với λ=0,5/tháng). Đo được **0.3751** ở biến thể
`orders` + lọc ≥2 đơn — khớp gần như chính xác. Đây là lý do bỏ phương án 60 ngày: nhãn bị nhiễu
Poisson chi phối, không phản ánh churn thật.

#### ❗ Điều làm dịu kỳ vọng: tautology giảm chủ yếu do ĐỔI MỐC, không do đổi nguồn nhãn

`category_diversity_viewed` tụt từ **0.2253** (production) xuống **0.058–0.092** ở mọi biến thể. Nhưng
so **trong cùng bộ cutoff**, đổi nguồn nhãn `activity` → `orders` hầu như không đổi độ áp đảo của nó:

| Cửa sổ | activity | orders |
|---|---|---|
| 60 | 0.0612 | 0.0602 |
| 90 | 0.0797 | 0.0661 |
| 120 | 0.0925 | 0.0895 |

⇒ Phần lớn mức tụt so với 0.2253 đến từ **việc lùi mốc cắt**, không phải từ việc tách nguồn nhãn.
**Không được viết trong báo cáo rằng "đổi nhãn đã phá được tautology".**

Điều thực sự đổi là **thứ hạng phía sau**: với nhãn `orders`, `frequency` (feature ĐƠN HÀNG) leo lên
hạng 2 (0.0346–0.0373), trong khi ở production hạng 2 là `days_since_last_activity` (feature hành vi).
Độ tập trung cũng giảm: production 0.2253 vs 0.0285 = **7,9×**; biến thể tốt nhất 0.0912 vs 0.0346 =
**2,6×**. Nên kết luận đúng là: *tautology giảm nhẹ, feature đơn hàng bắt đầu có việc làm* — chứ không
phải bị phá bỏ. Và điều đó **hợp lý**: duyệt web dự đoán mua hàng là quan hệ thật, không phải rò rỉ.

#### Phương án đề xuất: cửa sổ 120 ngày · nguồn `orders` · lọc ≥2 đơn DELIVERED

| Tiêu chí | Giá trị | Đạt? |
|---|---|---|
| Base rate trong khoảng mục tiêu 15–30% | **0.2624** | ✅ (duy nhất trong lưới đạt) |
| Ổn định (std nhỏ) | ±0.0299 | ✅ tốt nhất nhóm `orders`; nhóm `activity` tệ nhất tới ±0.1465 |
| AUC | 0.8414 | ✅ cao nhất nhóm `orders` |
| Nghĩa kinh doanh | "khách đã mua ≥2 lần mà 120 ngày không đặt đơn" | ✅ đúng đối tượng cần cứu bằng voucher |

AUC **tụt 0.9315 → 0.8414** đúng như dự đoán — dấu hiệu bài toán đã thật, không phải hồi quy chất lượng.

**Lọc ≥2 đơn là đúng về mặt ngữ nghĩa, không phải tiện tay:** user chưa từng mua hoặc mới mua 1 lần
thì không thể là "khách mua hàng đã rời bỏ". Loại 158/500 user là loại đúng đối tượng.

#### Hai hệ quả phải quyết định trước khi áp

1. **Dân số khi CHẤM ĐIỂM.** Nếu train trên user ≥2 đơn thì áp model lên user 0–1 đơn là ngoại suy.
   Nên siết `risk_scoring` về cùng dân số (cũng hợp lý: chỉ "cứu" được người từng mua). Cần chốt.
2. **Mốc cắt phải lùi về ≥150 ngày** ⇒ model học từ dữ liệu 5–9 tháng trước. Với dữ liệu synthetic
   gần dừng thì không sao, nhưng phải ghi là giới hạn.

**Chưa đổi `labels.py` production, chưa tăng `FEATURE_VERSION`.** Chờ chốt 2 điểm trên.

### Tầng 0.2 — Áp nhãn v2 vào production

Được giao tự quyết 2 điểm còn mở, chốt: **siết dân số chấm điểm về ≥2 đơn** (đúng ngữ nghĩa, tránh
ngoại suy) và **chấp nhận mốc cắt ≥150 ngày** (ghi là giới hạn).

**Tự sửa một đề xuất cũ của mình:** kế hoạch ban đầu ghi "tăng `FEATURE_VERSION`" — sai nghĩa, vì bộ
feature không đổi (vẫn 11 cột), chỉ định nghĩa nhãn đổi. Thay bằng `LABEL_VERSION` riêng
(`churn_label_v2_orders_120d_min2`) ghi kèm mỗi artifact, vì model train bằng 2 nhãn khác nhau thì
không so metric trực tiếp được — không có mốc này thì `run_log.jsonl` trộn lẫn các run không so được.

| | Nhãn v1 (activity 30d) | Nhãn v2 (orders 120d, ≥2 đơn) |
|---|---|---|
| Panel | 3000 dòng / 500 user | 1437 dòng / **342 user** |
| Churn rate | 0.1887 | **0.2624** |
| AUC | 0.9315 ± 0.0120 | **0.8416 ± 0.0303** |
| F1 | 0.7243 | 0.6525 |
| Ngưỡng đề xuất | 0.24 | **0.26** |

AUC tụt **đúng như dự đoán** — bài toán khó và thật hơn, không phải hồi quy chất lượng.

#### ❗ Con số headline giảm mạnh — phải sửa lại trong báo cáo

revenue-recall@K, xếp theo `P × monetary` so với xếp theo `P` thuần:

| K | v1: hơn | **v2: hơn** |
|---|---|---|
| 25 | 8,04× | **2,18×** |
| 50 | 3,64× | **1,68×** |
| 100 | 1,71× | 1,46× |
| 200 | 1,00× | 1,09× |

**Nguyên nhân, và đây là điều phải nói thẳng:** ở v1 dân số gồm cả user **chưa từng mua**
(`monetary ≈ 0`). Nhóm này có xác suất churn cao nhất, nên xếp theo `P` thuần gần như không thu được
doanh thu nào (0.1774) ⇒ tỉ số bị **thổi lên**. Sang v2 dân số toàn là khách đã mua ≥2 lần, xếp theo
`P` thuần đã thu được kha khá (0.2571) ⇒ tỉ số về mức thật.

⇒ Lợi thế của xếp-theo-tổn-thất-kỳ-vọng là **thật nhưng khiêm tốn hơn nhiều: ~1,5–2,2×**, không phải
4–10×. Con số 3,7–7,7× và 4,04× báo trước đây **phần lớn là hiện vật của việc gộp user chưa từng mua
vào dân số**. Đừng dùng chúng.

#### Ablation trên nhãn v2 — vẫn không block nào vượt sàn nhiễu, nhưng harness cư xử đúng hơn

| Block | +feat | AUC | ΔAUC | Kết luận |
|---|---|---|---|---|
| baseline | — | 0.8412 ± 0.0297 | — | |
| `abandon_shape` | 2 | 0.8445 | +0.0033 | LOẠI |
| `gap_dispersion` | 4 | 0.8400 | −0.0012 | LOẠI |
| **`noise_control`** | 3 | 0.8331 | **−0.0081** | LOẠI |
| tất cả | 9 | 0.8362 | −0.0050 | LOẠI |

Điểm đáng chú ý: đối chứng âm giờ **tệ nhất** (−0.0081), đúng như một đối chứng âm phải cư xử. Ở v1 nó
lại tốt nhất (+0.0033) — dấu hiệu setup cũ không phân biệt được. Kết luận "không mở rộng được feature"
giữ nguyên, nhưng lý do giờ sạch hơn: generator chỉ có 2 cơ chế churn và 11 feature đã phủ.

#### ✅ Tin tốt: chiều hữu dụng TĂNG — có lợi cho lập luận "vì sao cần AI"

L1 path:

| C | Số feature giữ | AUC |
|---|---|---|
| 0.03 | **1.0** | 0.8030 ± 0.0239 |
| 0.1 | 3.0 | 0.8144 ± 0.0329 |
| 1.0 | 9.4 | **0.8414 ± 0.0172** |

1 feature → 9 feature là **Δ 0.0384 > sàn nhiễu 0.0297** ⇒ **nhiều chiều thực sự có ích**. Ở nhãn v1,
~2 feature đạt AUC không phân biệt được với 11 feature (chiều hữu dụng ~2) — bằng chứng khi đó *chống
lại* lập luận "mặt phân cách nhiều chiều". Với nhãn v2, lập luận đó **được số liệu ủng hộ**. Đây là
lợi ích lớn nhất của việc đổi nhãn, lớn hơn cả việc base rate đẹp hơn.

Permutation importance v2: `category_diversity_viewed` 0.0901 · **`frequency` 0.0347** ·
`days_since_last_activity` 0.0272 · `recent_view_count` 0.0219 · `recency` 0.0088. Độ tập trung giảm
từ **7,9×** (v1) xuống **2,6×**, và `frequency` (feature ĐƠN HÀNG) leo lên hạng 2.

#### Phân khúc bị hỏng dưới nhãn v2 → đã sửa bằng cách gán nhãn theo churn rate ĐO ĐƯỢC

Guard `SEGMENT_MATCH_WARN_DISTANCE` thêm ở Tầng 0.1 **đã bắt được lỗi này** (`poorly_matched_segments:
['New Customers']`, khoảng cách 3.105) — đúng công dụng của nó.

Trước khi sửa: nhóm **giá trị cao nhất** (freq 6.67, monetary 239tr) bị gọi `New Customers`; `At Risk`
rơi vào nhóm **giá trị thấp nhất** (101tr) trong khi nhóm recency xấu nhất (62.8) lại được gọi
`Hibernating` ⇒ **phát voucher sai hẳn đối tượng**.

Nguyên nhân gốc: 4 archetype được vẽ cho dân số **có cả user chưa từng mua**. Siết về ≥2 đơn thì
archetype `Hibernating` (freq 0/monetary 0) và `New Customers` (mua rất ít) **không còn nhóm tương
ứng**, mà phân công song ánh vẫn buộc gán đủ 4 nhãn.

Cách sửa — bỏ hẳn việc khớp archetype: **panel huấn luyện CÓ `churn_label`, nên không cần đoán.** Gán
`At Risk` cho cụm có **tỉ lệ churn thực đo cao nhất**; 3 cụm còn lại đặt tên theo hạng `monetary`.

| Segment | size | **churn rate** | freq | monetary | recency | views |
|---|---|---|---|---|---|---|
| **At Risk** | 262 | **0.4618** | 3.24 | 111.598.531 | **62.9** | 1.09 |
| Lapsed | 360 | 0.4139 | 2.78 | 101.402.514 | 53.8 | 1.59 |
| VIP Champions | 549 | 0.1439 | 6.67 | 238.873.286 | 26.4 | 4.07 |
| Loyal Regulars | 266 | 0.1053 | 6.51 | 218.180.801 | 15.9 | 3.50 |

`churn_rate_spread = 0.3565` (≫ ngưỡng cảnh báo 0.10) ⇒ `segment_gate_informative = True`: nhóm
`At Risk` có tỉ lệ churn **4,4×** nhóm `Loyal Regulars`. Cổng lọc theo segment vì vậy **có cơ sở giữ
lại** — trước đây chỉ là phỏng đoán. Silhouette 0.2022 vẫn thấp (cụm tách nhau yếu) — giới hạn của
dữ liệu, không sửa được bằng cách đặt tên.

Thêm cảnh báo tự động: nếu `churn_rate_spread < 0.10` thì log WARNING đề xuất **bỏ** cổng segment, vì
khi đó nó thêm rất ít thông tin so với chỉ dùng ngưỡng xác suất.

#### Ngưỡng giờ lấy từ metadata của model, không hardcode

Trong lúc làm phát hiện ngưỡng tối ưu **đổi theo định nghĩa nhãn** (v1 → 0.24, v2 → 0.26), nên một số
hardcode trong config sẽ âm thầm lạc hậu mỗi lần model đổi. `effective_threshold()` giờ theo thứ tự:
model chưa hiệu chỉnh → legacy 0.5 · có env override → dùng override · còn lại → đọc
`threshold_tuning.suggested_threshold` từ metadata của **chính model đang chạy**. Xác nhận: scan báo
`threshold_used: 0.26` khớp metadata.

#### Kiểm chứng production

`{scored_users: 501, in_population: 401, at_risk_candidates: 112, eligible: 0, published: 0,
threshold_used: 0.26, model_calibrated: true}`.

Tầng 0 (dân số ≥2 đơn) hoạt động: 501 → 401. `eligible: 0` vẫn do rule 24h — giỏ trong seed đã cũ.

#### Dọn theo
`scipy` đã bỏ khỏi `requirements.txt` vì lý do thêm nó (`linear_sum_assignment`) không còn.

### Tầng 2.2 — Benchmark Rule vs AI (câu hỏi xuất phát, giờ mới đo được)

Đã build `app/training/rule_benchmark.py` + `POST /api/v1/models/rule-benchmark`. Chạy trên nhãn v2,
**cùng bộ fold** grouped CV (tách user + nhân quả thời gian).

**Nguyên tắc chống dựng-baseline-để-thua:** không tự chọn một rule rồi đánh bại nó, mà **quét lưới**
tìm rule tốt nhất ở 3 mức phức tạp — rule 1 biến (mọi feature × 2 chiều × 19 mốc phân vị), rule 2 điều
kiện AND (55 cặp × 4 chiều × lưới 9×9 ≈ 17,8k ứng viên/fold), và cây quyết định sâu 1/2/3 (tập rule
**tối ưu do máy tìm** ở cùng mức phức tạp — baseline rule-based mạnh nhất dựng được). Mọi rule **chọn
trên tập train, đo trên tập test**.

#### ❗ Tôi mắc lỗi thiết kế ở lần chạy đầu và đã tự sửa

Lần đầu tôi cho rule được quét lưới chọn ngưỡng tối ưu nhưng đánh giá model ở **ngưỡng 0.5 cố định**
— tức rule được tune còn model thì không. Kết quả khi đó: **model THUA** (F1 0.5833 vs rule 0.6459).
Đã thêm `_tuned_cut()` để mọi phương pháp có score (model + cây) đều chọn ngưỡng theo F1 **trên train**
rồi đo trên test, đúng cách rule đang được đối xử. Ghi lại chuyện này vì nó cho thấy benchmark không
bị dựng nghiêng về model — nó từng cho kết quả ngược.

#### Kết quả (nhãn v2, 5 fold, 1437 dòng / 342 user, churn 0.2624)

| Baseline | F1 | Precision | Recall | AUC (xếp hạng) |
|---|---|---|---|---|
| **[tay]** `days_inactive>7 AND cart_abandon>=1` *(ví dụ trong tài liệu)* | **0.1238** ± 0.0596 | 0.5167 | 0.0711 | không xếp hạng được |
| **[tay]** `recency>30 AND cart_abandon>=2` *(RFM kinh điển)* | **0.0462** ± 0.0615 | 0.1833 | 0.0265 | không xếp hạng được |
| **[tay]** `recency>90` | 0.4448 ± 0.0651 | 0.6073 | 0.3625 | không xếp hạng được |
| rule 1 biến, quét lưới | 0.6370 ± 0.0819 | 0.5938 | 0.6917 | 0.7821 ± 0.0740 |
| rule 2 điều kiện AND, quét lưới | 0.6291 ± 0.0872 | 0.5970 | 0.6743 | không xếp hạng được |
| cây sâu 1 | 0.6370 ± 0.0819 | 0.5938 | 0.6917 | 0.7301 ± 0.0623 |
| cây sâu 2 | 0.6370 ± 0.0819 | 0.5938 | 0.6917 | 0.8107 ± 0.0451 |
| cây sâu 3 | 0.6015 ± 0.0747 | 0.5790 | 0.6478 | 0.8183 ± 0.0640 |
| **Model (LR 11 feature + hiệu chỉnh)** | **0.6889 ± 0.0240** | 0.6147 | **0.7885** | **0.8405 ± 0.0268** |

**Phán quyết:** model hơn rule tốt nhất **+0.0519 F1**, vượt sàn nhiễu ±0.0240 ⇒
`model_beats_best_rule_beyond_noise = True`.

Rule 1 biến tốt nhất được chọn **giống nhau ở cả 5 fold**: `days_since_last_activity >= 5`. Cây sâu 1
tìm ra đúng cùng một lát cắt (4.50). Cây sâu 2 dự đoán y hệt cây sâu 1 (cả 2 lá dưới mỗi nhánh cùng
lớp) — F1 trùng khớp, một phép kiểm tra nhất quán tốt.

#### Bốn kết luận, xếp theo độ mạnh của lập luận

1. **Rule mà người ta THỰC SỰ viết tay thì thảm hại.** Ví dụ ngay trong tài liệu của dự án
   (`churn-risk-feature-overview.md:95-100`) cho F1 **0.1238**; RFM kinh điển cho **0.0462** — kém
   rule-đã-fit (0.6370) **5–14 lần**. Muốn tìm ra `days_since_last_activity >= 5` thì phải quét lưới +
   chia fold + giữ tập test, tức **đúng bộ máy của ML**. Nói cách khác: *"viết vài câu SQL cho xong"
   trên thực tế không tồn tại* — rule tốt phải được HỌC.
2. **Model ổn định hơn nhiều.** std F1 của model **0.0240** so với 0.0747–0.0872 của rule ⇒ ổn định hơn
   **3–3,6×**. Rule rất nhạy với việc đánh giá trên nhóm user nào; đây là điểm thường bị bỏ qua.
3. **Model thắng cả về độ chính xác**, +0.0519 F1 và +0.022 AUC so với baseline rule mạnh nhất — thật
   nhưng khiêm tốn, phải trình bày đúng mức đó.
4. **Rule KHÔNG xếp hạng được.** Rule 2 điều kiện AND chỉ trả nhãn nhị phân ⇒ không có xác suất để nhân
   với giá trị khách hàng ⇒ **không thể phân bổ ngân sách voucher theo tổn thất kỳ vọng**, bất kể F1 bao
   nhiêu. Đây là khác biệt về **NĂNG LỰC**, không phải về độ chính xác — và là lập luận không phụ thuộc
   vào việc thắng thua metric.

Ghi chú thêm: cây sâu 3 **kém hơn** cây sâu 1/2 (F1 0.6015 vs 0.6370) — thêm độ phức tạp rule không
giúp gì, với ~1150 dòng train thì bắt đầu overfit. Một minh chứng tốt cho việc "viết thêm nhiều IF"
không phải hướng đi.

## 2026-08-03 — Tầng 5: dọn dẹp

### Phát hiện phạm vi lớn hơn dự kiến

Roadmap ghi "Bỏ endpoint dữ liệu giả" chỉ nhắc `/admin/analytics/{anomalies,segmentation}`. Đọc thêm
`demand.py`, `anomaly.py`, và FE [`AnalyticsAITab.jsx`](../../FE/src/features/admin/components/AnalyticsAITab.jsx)
mới thấy đây là **cả một tab admin riêng** ("Aura AI Analytics"), không liên quan gì đến pipeline
churn-risk vừa làm cả phiên:

- `/admin/analytics/demand-forecasting` — sinh số bằng `np.random` + sine wave ngay trong endpoint,
  **không hề gọi** `demand_forecasting_service`
- `demand_forecasting_service.forecast_demand()` (`demand.py`) — cũng thuần mock, comment
  "In production: 1. Fetch... 2. Fit LightGBM..." rồi bên dưới mock luôn, không đọc DB
- `/admin/analytics/anomalies` — 3 dòng hardcode, không gọi `anomaly_detection_service`
- `anomaly_detection_service` (`anomaly.py`) — có `IsolationForest` thật nhưng không nối với giao
  dịch thật nào (nhận `historical_data` bất kỳ do caller truyền vào)
- **FE hiển thị dòng chữ bịa đặt cụ thể**: *"Model: LightGBM & Facebook Prophet • Độ chính xác:
  MAPE ~ 4.2%"* và tiêu đề *"(LSTM Autoencoder)"* — không model nào trong 2 dòng này tồn tại
- Các nút "Đánh Dấu Sạch"/"Tạm Khóa User"/"Kích Hoạt Chiến Dịch" chỉ gọi `alert()`, không làm gì thật

### Hỏi trước khi sửa vì đụng tới FE và có thể ảnh hưởng demo

Dựng bản thật cho demand-forecasting/anomaly-detection là **dự án riêng ngoài phạm vi churn-risk**
(cần feature engineering + temporal split + đánh giá — đúng khối lượng vừa làm cho churn cả phiên).
Đưa ra 3 lựa chọn, **user chọn: "Ghi rõ là demo, giữ nguyên"** — nối segmentation vào số thật, 2 tab
kia giữ nguyên nhưng gắn nhãn rõ ràng, xoá dòng bịa đặt.

### Đã làm

**Backend** (`forecast.py`): đổi shape cả 3 endpoint từ trả mảng trần sang
`{data, is_demo_data, note}`.
- `segmentation` — **nối vào số thật**, tái dùng đúng `risk_scoring_service.predict()` mà
  `risk_scheduler` dùng để phát voucher (không phải model riêng), lọc đúng dân số
  `>= MIN_DELIVERED_ORDERS_FOR_CHURN` (khớp dân số model đã học), gán màu cố định theo tên segment.
- `anomalies` / `demand-forecasting` — giữ nguyên mock, thêm `is_demo_data=True` +
  `note` giải thích rõ ("chưa có model thật... không dùng số này để ra quyết định").

**Frontend**: `aiApi.ts` cập nhật type theo shape mới; `AnalyticsAITab.jsx` thêm `DemoDataBanner`
(banner cảnh báo màu vàng) hiển thị ở đầu mỗi tab khi `note` khác null; xoá dòng
*"Model: LightGBM & Facebook Prophet • Độ chính xác: MAPE ~ 4.2%"* và tiêu đề *"(LSTM Autoencoder)"*.

**Kiểm chứng qua endpoint thật** (không chỉ đọc code):

```json
// segmentation — is_demo_data: false, số liệu THẬT từ model đang chạy
{"segment": "At Risk", "count": 148, "percentage": 36.9, "spendRatio": 26.6}
{"segment": "Lapsed", "count": 102, "percentage": 25.4, "spendRatio": 12.6}
{"segment": "VIP Champions", "count": 100, "percentage": 24.9, "spendRatio": 46.1}
{"segment": "Loyal Regulars", "count": 51, "percentage": 12.7, "spendRatio": 14.7}
```

Khớp logic: `At Risk` chiếm 36.9% dân số nhưng chỉ 26.6% doanh thu; `VIP Champions` ngược lại — 24.9%
dân số nhưng 46.1% doanh thu. Đúng ý nghĩa 2 segment này.

`anomalies`/`demand-forecasting`: xác nhận `is_demo_data=True` kèm đúng `note` đã viết.

FE: 2 file sửa (`aiApi.ts`, `AnalyticsAITab.jsx`) compile sạch qua `esbuild` (không có Vite dev server
để test tương tác trực tiếp trong phiên này — cần bạn tự mở tab **Aura AI Analytics** trên FE admin
để xác nhận banner hiện đúng chỗ).

### Sự cố kỹ thuật lặp lại: Docker Desktop tự tắt

Lần thứ 3 trong phiên Docker Desktop mất hết process (không phải engine treo — `Get-Process` trả
rỗng hoàn toàn). Không rõ nguyên nhân (không phải do lệnh nào trong phiên gọi tắt nó). Cách xử lý mỗi
lần: `Start-Process "Docker Desktop.exe"` → xác nhận process xuất hiện → poll `docker info` tới khi
engine nhận kết nối. Nếu việc này tái diễn thường xuyên, nên kiểm tra cấu hình khởi động Docker Desktop
trên máy (WSL integration, resource limit) ngoài phạm vi phiên này.

### Tiếp tục Tầng 5 — model card, retrain gate, sửa FutureWarning

**Sửa `FutureWarning`.** `rfm.py:62` và `behavior.py:133` dùng `.replace(0, pd.NA)` trước `.fillna()` —
`pd.NA` sinh dtype object sau phép chia, `.fillna()` phải "downcast" ngầm về float, pandas cảnh báo sẽ
đổi hành vi ở bản tương lai. Đổi sang `np.nan` (vốn đã là float, không cần downcast) — cùng cách
`candidates.py` đã dùng từ Tầng 2.

**Model card** — `app/training/model_card.py` + `GET /api/v1/models/card`. Chỉ **đọc lại** những gì
`registry.py` đã lưu (metadata + `run_log.jsonl`), không tính gì mới. Trả trong 1 lần gọi: version,
`trained_at`, `label_definition`, `calibrated`, metrics grouped CV, ngưỡng đề xuất, top-5 feature
importance, phân bố + churn rate từng segment, và danh sách giới hạn đã biết (tĩnh, trỏ về log thay vì
lặp lại phân tích).

**Retrain gate** — vấn đề: "train xong là dùng ngay" có thể làm production **tệ đi** nếu lần train gặp
panel xấu (seed ít hơn, fold rủi ro). Sửa `registry.save_model()` thêm `update_latest: bool = True` —
khi `False` vẫn ghi đủ artifact + metadata + `run_log.jsonl` (audit không mất), chỉ **không** cập nhật
con trỏ `latest.json`.

`train.py::_retrain_gate()`: chấp nhận nếu `AUC_mới >= AUC_cũ - std_cũ` (dùng std của model CŨ làm sàn
nhiễu, vì model mới lúc so sánh chưa được tin để làm chuẩn). **Luôn chấp nhận** (bỏ qua so AUC) khi:
chưa có model nào đang chạy (lần đầu), hoặc **định nghĩa nhãn đã đổi** — tự áp dụng đúng bài học vừa
rút ra trong phiên này (nhãn v1 AUC 0.93 vs v2 AUC 0.84 không so trực tiếp được, chênh lệch đó do đổi
bài toán chứ không phải model tệ đi).

Gate áp dụng **đồng thời** cho cả KMeans lẫn Classifier (cùng version, cùng panel) — nếu chỉ gate
riêng classifier thì production có thể chạy cặp model lệch nhau, gây khó hiểu khi soát lại.

**Kiểm chứng qua Docker (không chỉ đọc code):**

1. Train 2 lần liên tiếp, cùng nhãn: cả hai đều **ĐẠT** gate — AUC train #2 (0.8415) so với ngưỡng từ
   train #1 (0.8416 − 0.0303 = 0.8113) → đạt. Xác nhận gate không chặn nhầm khi model ổn định.
2. **Test cách ly** (namespace `demo`, không đụng model thật): lưu v1 (AUC 0.80), rồi lưu v2 (AUC 0.50)
   với `update_latest=False` → xác nhận `latest.json` **vẫn trỏ v1** sau đó, `load_model("demo")`
   mặc định vẫn trả v1, nhưng v2 **vẫn load được** qua version cụ thể, và `run_log.jsonl` có đủ 2 dòng
   (không mất audit trail dù rớt gate). Cả 3 assertion pass.

Model card đọc lại đúng: `total_training_runs: 7`, `retrain_gate` của lần gần nhất hiển thị đầy đủ lý
do bằng tiếng Việt.

### Việc còn lại trong Tầng 5 (chưa làm)

- Giám sát drift feature (PSI/KS so với phân bố lúc train) — quy mô lớn hơn, để riêng cho lần sau

---

## 2026-08-03 — Tầng 1: sửa nguồn dữ liệu (session_id + làm giàu seeder)

Theo đúng thứ tự user đã chốt ("Làm tầng 5 trước rồi làm tầng 1 sau"), Tầng 5 xong phần lớn nên
chuyển sang Tầng 1.

### 1.1 — Sửa write-path `session_id` (lỗi thật, không phải thiếu seed)

`behavior_consumer.py:45` hardcode `"session_id": None` cho `ProductViewedEvent`; nhánh cart (dòng
58) đã đọc `payload.get("sessionId")` nhưng **CartEventProducer.java cũng hardcode `.sessionId(null)`**
(phát hiện thêm khi đọc code — roadmap chỉ nêu phía Python, không nêu phía Java này). Kết quả: cả 2
nguồn hành vi đều ghi `session_id` NULL 100%, không phải do thiếu FE gửi lên mà do 2 chỗ code chủ
động bỏ qua.

**Sửa toàn bộ đường đi:**
- FE (`apiClient.ts`): sinh 1 `X-Session-Id` (UUID, lưu `sessionStorage` — mất khi đóng tab, không
  chia sẻ giữa các tab, đúng ngữ nghĩa 1 phiên trình duyệt), gắn vào mọi request. Xác nhận trước:
  `UserHeaderFilter` (api-gateway) chỉ strip header `X-User-*` để chống giả mạo identity, KHÔNG đụng
  `X-Session-Id` → header client gửi lên đi xuyên qua gateway nguyên vẹn.
- `product-service`: `ProductViewedEvent` + `ProductViewEventProducer` + `ProductController` (2
  endpoint `getProductById`/`getProductBySlug`) — thêm tham số `sessionId` đọc từ header.
- `order-service`: `CartUpdatedEvent`/`CartEventProducer.publishCartUpdated` bỏ hardcode `null`;
  thread `sessionId` xuyên suốt `CartController` (5 endpoint) → `CartService`/`CartServiceImpl`. Có
  1 lời gọi khác ở `OrderServiceImpl.java:355` (clear cart lúc checkout xong) không có HTTP session
  nào ở bước đó — truyền `null` tường minh kèm chú thích, không phải sót.
- `behavior_consumer.py`: bỏ hardcode `None`, đọc `payload.get("sessionId")` giống nhánh cart.

**Kiểm chứng (không chỉ đọc code) — VÀ 1 lần tự sửa sai quan trọng:**
1. `mvn compile` local thất bại với lỗi Lombok "cannot find symbol" trên cả file KHÔNG hề đụng tới
   (`SearchServiceImpl`, `BrandServiceImpl`) → do JDK mặc định của máy là **JDK 23** trong khi project
   khai `<java.version>17</java.version>` + `lombok 1.18.30` (chưa hỗ trợ chính thức JDK 23) — lỗi môi
   trường, không phải do thay đổi lần này.
2. **SAI LẦM đã tự phát hiện và sửa (ghi lại để không lặp):** lúc đó kết luận "`docker compose build`
   → build sạch cả 3, xác nhận compile đúng" — **kết luận này SAI**. `product-service/Dockerfile` /
   `order-service/Dockerfile` / `promotion-service/Dockerfile` chỉ `COPY .../target/*.jar app.jar` —
   **không hề chạy Maven**, chỉ đóng gói lại file jar CŨ đã có sẵn trên đĩa. Jar trong `target/` lúc đó
   có mtime **27-28/07** — TỪ TRƯỚC session này — nên "build sạch" chỉ chứng minh Docker đóng gói lại
   được jar cũ, KHÔNG chứng minh code mới compile được. Phát hiện lại khi làm Tầng 3 (mục dưới) và thấy
   cùng hiện tượng lặp lại với `Condition_ChurnRiskTier`.
3. **Sửa đúng:** cần build bằng JDK 17 tường minh (`JAVA_HOME=.../jdk-17.0.5`) thay vì JDK 23 mặc định
   của máy. `grpc-common/target` phải xoá trước (generated-sources protobuf cũ gây lỗi đọc file lạ khi
   đổi JDK). Sau khi làm đúng: `mvn -q -pl product-service,order-service,promotion-service -am package`
   **THẬT SỰ compile + đóng gói lại** — xác nhận qua mtime jar mới = giờ chạy lệnh (không còn 27-28/07),
   rồi `docker compose build` lại từ jar mới (SHA image đổi, khác hẳn lần build "giả" trước).
4. Rebuild `ai-forecast-service`, exec vào container gọi thẳng `_parse_message()` với payload giả
   lập có `sessionId` → trả đúng `session_id` thay vì `None`; payload không có `sessionId` (client cũ
   chưa cập nhật) → fallback `None` đúng như thiết kế. Container khởi động khỏe sau rebuild. (Đây là
   phần Python — KHÔNG bị ảnh hưởng bởi lỗi jar-cũ ở trên, vì forecast-service build qua pip, không qua
   bước copy jar.)
5. **Chưa** verify end-to-end qua Camunda/toàn bộ stack thật (cần eureka + gateway + keycloak +
   product/order-service cùng chạy, ngoài phạm vi hợp lý cho 1 bugfix header) — giữ nguyên là việc
   còn thiếu, đã ghi ở mục "Giới hạn" bên dưới.

**Bài học rút ra (áp dụng cho MỌI lần sửa code Java trong project từ giờ):** `docker compose build`
với các Dockerfile kiểu `COPY target/*.jar` KHÔNG verify được gì về code Java — phải `mvn package`
bằng JDK 17 tường minh TRƯỚC, kiểm tra mtime jar đổi mới, RỒI mới build Docker image.

### 1.2 — Làm giàu seeder: cụm phiên (session) + nhịp giờ/ngày

Nguyên tắc bắt buộc (đã nêu ở Phase 3 gốc): tham số ẩn phải **độc lập với `willChurn`/`churnMonth`**,
không được để cấu trúc mới tương quan thẳng với nhãn — nếu không, feature suy ra từ nó chỉ là suy
luận vòng tròn.

`profiles.mjs` — thêm 5 tham số ẩn/user, sinh **không điều kiện** theo `willChurn`:
`preferredHourCenter` (giờ hoạt động ưa thích, 0–24h), `hourConcentration` (độ lệch quanh giờ đó),
`weekendBias` (thiên lệch cuối tuần, có thể >1 hoặc <1), `sessionBrowseSpreadMinutes`, `sessionPureViewBatch`.

`simulate.mjs`:
- `rhythmicTimestamp()` thay `randomTimestamp()` (đã xoá, không còn nơi gọi) làm mốc neo mỗi
  "dịp" (đơn hàng / bỏ giỏ / phiên xem thuần) — chọn ngày có trọng số theo `weekendBias`, giờ theo
  phân phối chuẩn quanh `preferredHourCenter` (Box-Muller có sẵn trong `random.mjs`).
- `randomSessionId()` sinh id từ chính RNG có seed (KHÔNG dùng `crypto.randomUUID()`) — bắt buộc để
  giữ toàn bộ dataset **reproducible theo `--seed`**, đúng contract đã ghi trong `random.mjs`.
- Gán `sessionId` theo đúng ngữ nghĩa hành vi thật: view (1–72h trước đơn) và add-to-cart (10 phút–6h
  trước đơn) thuộc **2 phiên khác nhau** (browse sớm hơn, rồi quay lại chốt đơn ở phiên sau); bỏ giỏ
  KHÔNG dẫn tới đơn thì view+cart chung **1 phiên** (xem xong bỏ giỏ, rời đi — 1 lượt ghé ngắn); xem
  thuần tuý được **gộp cụm** (1–4 sản phẩm/phiên, trải trong `sessionBrowseSpreadMinutes`) thay vì
  rải từng cái độc lập suốt tháng như trước.

`writeData.mjs`: thêm cột `session_id` vào `INSERT user_events`.

`seed.mjs::summarize()`: in thêm số phiên, event/phiên trung bình, %NULL — để phát hiện lỗi cụm
phiên ngay lúc seed, khớp tiêu chí thành công đã đặt ở roadmap Tầng 1.2 (NULL < 5%, event/phiên > 1).

**Kiểm chứng:** `node seed.mjs --dry-run` (seed=42, 500 user, 12 tháng) → **40.635 phiên, 1.55
event/phiên trung bình, 0.0% event không có `session_id`** trên 62.787 event — đạt cả 2 tiêu chí đề
ra, không phẳng/không hằng số (đúng yêu cầu "phân bố lệch thật").

**Quyết định CHƯA reseed DB thật:** vì `random.mjs` dùng 1 bộ đếm RNG toàn cục, việc thêm các lệnh
`rng.*` mới vào `profiles.mjs`/`simulate.mjs` làm lệch **toàn bộ** chuỗi ngẫu nhiên sinh ra sau đó —
dù giữ nguyên `--seed 42`, chạy `--force` bây giờ sẽ sinh ra orders/events **khác hoàn toàn** dữ liệu
đã dùng để đo mọi con số đã báo cáo trong phiên này (AUC 0.8415, bảng rule-vs-AI, revenue-recall@K...).
Reseed + train lại là một bước cần được xác nhận riêng (kéo theo phải chạy lại toàn bộ Tầng 0–2 để
đối chiếu số mới với số cũ), **không** làm ngầm trong lúc chỉ đang "làm giàu seeder cho tương lai".

### Reseed thật + train lại — đối chiếu số cũ/mới

User chọn "Reseed + train lại ngay" (qua AskUserQuestion). Đã thực hiện thật, không phải dry-run:

`node seed.mjs --force --demo-users 0` (bỏ `--demo-users` vì Keycloak không chạy trong phiên này,
490→500 user đều chỉ để train, không ảnh hưởng panel huấn luyện). Xoá 500 user/3.361 order/61.691
event cũ, sinh lại 500 user/3.482 order/62.787 event — **40.635 phiên, 1,55 event/phiên, 0% NULL
`session_id`**, đúng số đã thấy ở dry-run (xác nhận `--seed 42` deterministic đúng như thiết kế).

**Train lại (`POST /models/train`) — retrain gate hoạt động đúng, trên tình huống THẬT lần đầu:**

| | Trước reseed (train #7) | Sau reseed (train #8) |
|---|---|---|
| AUC (grouped CV) | 0.8415 ± 0.032 | **0.7745 ± 0.0595** |
| Panel | 342 user / 1.443 dòng | 332 user / 1.395 dòng |
| Churn rate | 0.2633 | 0.2401 |

AUC mới (0.7745) < ngưỡng gate (0.8415 − 0.032 = 0.8095) → **gate từ chối thật** (`passed: false`),
`latest.json` **vẫn trỏ train #7**, train #8 vẫn được lưu đủ artifact/metadata/`run_log.jsonl` (soát
lại được qua version cụ thể). Đây là lần đầu gate chặn một tình huống **thật** (lần trước chỉ test
cách ly bằng số giả lập) — đúng thiết kế, không cần sửa gì.

**Vì sao AUC tụt, có phải seeder làm hỏng dữ liệu không?** Không — 11 feature production hiện tại
(`assembler.py`) chưa dùng bất kỳ thông tin session/nhịp giờ nào (candidate block đó còn chưa được
thêm vào `candidates.py`), nên thay đổi seeder không đổi ý nghĩa của feature nào cả, chỉ đổi **chuỗi
RNG** sinh ra sau nó (thêm lệnh `rng.*` mới) → cùng seed 42 nhưng ra 1 lượt user/đơn/hành vi khác.
AUC std TĂNG gần gấp đôi (0,032 → 0,0595) cùng lúc panel nhỏ hơn (332 vs 342 user, ít fold-test-user
hơn/fold) — khớp với "nhiễu lấy mẫu lớn hơn trên tập nhỏ hơn", không phải suy thoái có hệ thống. Kết
luận trung thực: đây là **1 lượt lấy mẫu xui hơn từ CÙNG một cơ chế sinh dữ liệu**, và chính retrain
gate được thiết kế để bắt đúng tình huống này, không phải bằng chứng seeder sai.

**Calibration (`POST /models/calibration`) chạy lại trên panel mới — mẫu hình LẶP LẠI đúng như trước:**

| | raw | isotonic |
|---|---|---|
| ECE | 0.1709 | **0.0674** |
| Brier | 0.1967 | 0.1647 |
| `sanity_auc_invariant_under_prior_shift` | — | **true** |

Xác nhận phát hiện Tầng 0.1 (miscalibration do `class_weight='balanced'`, fix bằng isotonic) **không
phải hiện tượng chỉ xảy ra trên 1 bộ dữ liệu cụ thể** — lặp lại gần như y hệt trên panel mới. Tỉ lệ
xếp hạng theo tổn thất kỳ vọng/theo xác suất (`expected_loss_over_probability`) dao động 0,96–1,56×
tuỳ k — khớp dải "~1,5–2,2×" đã hiệu chỉnh trước đó (không phải số 3,7–7,7× cũ đã bác bỏ).

**Rule-vs-AI benchmark (`POST /models/rule-benchmark`) — PHÁT HIỆN QUAN TRỌNG, khác kết quả cũ:**

| | Trước reseed | Sau reseed |
|---|---|---|
| Model F1 | 0.6889 ± 0.0240 | 0.6033 ± 0.0492 |
| Rule tốt nhất (2-feature) F1 | 0.6370 ± 0.0747–0.0872 | 0.5862 ± 0.1285 |
| Chênh lệch F1 | **+0,0519, vượt sàn nhiễu ±0,0240** | +0,0171, **KHÔNG vượt sàn nhiễu ±0,0492** |
| `model_beats_best_rule_beyond_noise` | (chưa có field này lúc đó) | **`false`** |

Trên lượt lấy mẫu này, chênh lệch F1 model-vs-rule **không còn phân biệt được với nhiễu** — khác hẳn
kết luận "vượt sàn nhiễu 5–14×" đã ghi trong `churn-risk-feature-overview.md` mục 3.2. Đây không phải
lỗi code (đã dùng lại đúng `_tuned_cut()` đã sửa fairness bug trước đó) — là bằng chứng thật rằng
margin F1 **nhạy với lượt lấy mẫu cụ thể**, tức con số cũ một phần là may mắn của 1 lần seed. Argument
"model xếp hạng được còn rule thì không" (mục 3.5, dùng cho phân bổ ngân sách theo tổn thất kỳ vọng)
**không đổi và mạnh hơn hẳn để dùng làm luận điểm chính khi bảo vệ** — đây là khác biệt về NĂNG LỰC
(rule trả nhãn nhị phân, không xếp hạng được), không phụ thuộc lượt lấy mẫu nào, và vừa được xác nhận
lại nguyên vẹn ở cả 2 lượt.

**Đã cập nhật `churn-risk-feature-overview.md` mục 3.2** (user chọn "Cập nhật ngay, chuyển trọng tâm
sang năng lực xếp hạng" qua AskUserQuestion): bảng đổi sang số đo lại 2026-08-03, 4 kết luận viết lại
theo thứ tự độ bền — **luận điểm chính giờ là "rule không xếp hạng được"** (đứng vững cả 2 lượt), margin
F1 được nêu rõ là **giòn, không nên dùng làm luận điểm chính** thay vì trình bày như một chiến thắng chắc
chắn. Có ghi chú rõ: panel đo lại (332 user) khác panel model đang chạy production (342 user, mục 3.3,
vì retrain bị gate từ chối); số L1-path/cây sâu ở cuối mục 3.2 (từ `ablation.py`) **chưa đo lại** trong
lượt này, vẫn là số cũ trước reseed — nói rõ để không đọc nhầm là đã kiểm chứng lại toàn bộ.

### Hoàn tất Tầng 1.2 (còn lại) — review + lịch sử voucher, rồi đo bằng ablation

User yêu cầu làm tiếp "1-2-3": (1) review/voucher enrichment, (2) candidate feature block mới, (3)
Next-Best-Action theo tầng xác suất. Phần (1)-(2) làm xong trong mục này.

**Sinh dữ liệu — vẫn theo nguyên tắc tham số ẩn độc lập với churn:**
- `profiles.mjs`: thêm `reviewProbability`/`reviewRatingBias` (tính cách "có hay review"/"khó hay dễ
  tính" — không liên quan rời bỏ) và `voucherIssueRateBase`/`voucherRedeemProbability` (gắn với
  `priceSensitivity` **đã có sẵn**, không phải willChurn — user nhạy giá thật thì hay được
  phát/dùng voucher hơn, đây là quan hệ hợp lý cần có, khác hẳn suy luận vòng tròn).
- `lib/reviews.mjs`: 1 review/đơn DELIVERED theo `reviewProbability`, rating = round(4 +
  `reviewRatingBias` + nhiễu chuẩn), tham chiếu **order_id thật** (`writeOrders()` phải chạy TRƯỚC
  để gán `order.dbId` thật — review sinh sau, không phải trước).
- `lib/vouchers.mjs`: số voucher/user ~ Poisson(`voucherIssueRateBase`), redeem = tìm đơn DELIVERED
  thật trong đúng cửa sổ hiệu lực (30 ngày) theo `voucherRedeemProbability`; hết hạn mà chưa dùng
  → `EXPIRED`. `issued_vouchers.user_id` là **id nội bộ (Long)**, khác `keycloak_user_id` (String)
  dùng ở mọi bảng khác — phải `fetchInternalUserIdMap()` tra ngược qua `ecommerce_user_db.users`
  SAU khi user đã được insert.
- `cleanupData.mjs`: mở rộng xoá thêm `product_reviews`/`issued_vouchers` của đúng seed user khi
  `--force` (không đụng dữ liệu thật khác — đã có 1 voucher test thật trong DB, xác nhận không bị
  xoá nhầm khi verify).

**Verify bằng SQL trực tiếp (không chỉ tin code):** 0 review orphan (không order_id nào không tồn
tại), 0 voucher orphan (không user_id nào không tồn tại), phân bố status voucher thực tế (442
EXPIRED / 106 USED / 38 UNUSED trên 585 voucher — hợp lý vì cửa sổ hiệu lực chỉ 30 ngày trong khi dữ
liệu trải 12 tháng). Reseed thật: **1.128 review** (34,5% đơn DELIVERED, rating 3,84 ± 0,87 — có
phương sai thật, không hằng số), **585 voucher** (18,1% đã dùng).

**Thêm 3 candidate feature block mới vào `candidates.py`** (`session`, `review`, `voucher`), mỗi
block có đánh giá circularity riêng trong docstring (giữ đúng chuẩn 3 block cũ). Đặc biệt:
`avg_rating_given` được thiết kế gần như **đối chứng âm thứ 2** (độc lập hoàn toàn cơ chế churn) —
nếu ablation báo nó có tín hiệu thì phải nghi ngờ chính harness. `_voucher()` cần JOIN 2 database
(`ecommerce_promotion_db.issued_vouchers` × `ecommerce_user_db.users`) trong cùng 1 câu SQL, dùng
chung `engine` đã có (root, cùng server MariaDB) — không cần tạo engine riêng.

**Chạy `POST /api/v1/models/ablation` thật — kết quả: CẢ 6 BLOCK ĐỀU "LOẠI (trong nhiễu)"**, kể cả 3
block mới:

| Block | ΔAUC | Sàn nhiễu | Kết luận |
|---|---|---|---|
| session (`distinct_sessions_30d`, `avg_events_per_session_30d`) | −0,0126 | ±0,0312 | LOẠI |
| review (`review_count`, `avg_rating_given`) | −0,0039 | ±0,0312 | LOẠI |
| voucher (`voucher_issued_count`, `voucher_usage_rate`) | +0,0021 | ±0,0312 | LOẠI |

**Đây là kết quả ĐÚNG NHƯ DỰ ĐOÁN, không phải thất bại của việc làm giàu seeder.** 3 tham số ẩn mới
(review/voucher/session) được thiết kế **có chủ đích độc lập** với `willChurn`/`churnMonth` — nếu
chúng "có tín hiệu" thì đó mới là dấu hiệu harness sai. Kết quả null xác nhận: (1) bộ sinh dữ liệu chỉ
có đúng 2 cơ chế gắn với churn (λ tụt bậc + tăng bỏ giỏ trước churn), 11 feature hiện tại đã phủ hết cả
hai; (2) `avg_rating_given` (đối chứng âm thứ 2) không cho tín hiệu giả — harness đáng tin; (3) việc
làm giàu seeder **vẫn có giá trị thật** dù ablation null: mở khoá được 3 bảng dữ liệu (review, voucher,
session) cho các tính năng KHÁC ngoài churn model (vd hiển thị review thật ở trang sản phẩm, lịch sử
voucher thật cho admin) — chỉ riêng churn classifier thì không cần thêm.

### Việc CHƯA làm trong Tầng 1 (để lại, không phải quên)

- Tất cả các mục Tầng 1.1/1.2 đã XONG. Không còn việc nào bị chặn bởi bảng rỗng nữa.

---

## 2026-08-03 — Tầng 3: Next-Best-Action theo tầng xác suất (`Condition_ChurnRiskTier`)

User hỏi thẳng: tính năng có làm được "từ điểm dự đoán 0–1 → chọn chiến dịch phù hợp (0–0,2: A,
0,2–0,5: B...)" chưa. Kiểm tra lại code trước khi trả lời (không đoán): `churnProbability` ĐÃ được
đưa vào process variables (`PromotionKafkaConsumer.java`), nhưng FE Campaign Builder
(`constants.js`) không có node điều kiện nào đọc được nó — chỉ có 1 ngưỡng trigger nhị phân +
xếp hạng theo `expected_loss` để chọn ai trong ngân sách, KHÔNG có cơ chế "dải xác suất → chiến
dịch khác nhau". Trả lời: **chưa làm**. Đây chính là hướng 3 (Next-Best-Action) đã duyệt ở đầu
phiên (roadmap Tầng 3) — bắt tay làm ngay.

### Khảo sát kiến trúc trước khi code

Dùng 1 Explore agent lần ra chính xác luồng `Condition_MemberRank`/`Condition_TotalSpending` (loại
node gần nhất) từ FE đến runtime, để KHÔNG phát minh lại kiến trúc mới:
- `BpmnCompilerService.java` compile mọi node `Condition_*` thành 1 `bpmn:exclusiveGateway` **gốc**
  — không có delegate riêng. Điều kiện thật nằm trên `sequenceFlow` (JUEL, vd
  `${totalSpending >= 5000000}`), Camunda engine tự evaluate, không cần code Java xử lý runtime.
- Gateway đã hỗ trợ **N nhánh IF + 1 Else** trong CÙNG 1 node (nút "Thêm IF" ở `PropertyPanel.jsx`)
  — nghĩa là "0–0,2: A, 0,2–0,5: B, còn lại: C" làm được bằng 2 nhánh IF (`< 0.2`, `< 0.5`) + 1 Else
  trên MỘT gateway, không cần campaign riêng cho mỗi dải, không cần thêm khái niệm gateway mới.
- `WorkflowValidatorService.java` validate theo từng loại node (operator/value hợp lệ, không có 2
  nhánh trùng điều kiện...) — cần thêm 1 `case` cho loại mới, không đổi logic chung.

Kết luận: chỉ cần thêm **1 loại `Condition_*` mới** (`Condition_ChurnRiskTier`) tái dùng đúng cơ chế
gateway/JUEL/N-nhánh đã có — không cần sửa Camunda engine, không cần delegate mới, không cần đổi
kiến trúc BE. Việc còn lại là nhân bản đúng pattern của `Condition_TotalSpending` (loại gần nhất về
mặt kỹ thuật: so sánh số + operator, khác `Condition_MemberRank` là so khớp tập giá trị).

### Triển khai — 11 file, đúng 1 pattern lặp lại

**BE** (`BpmnCompilerService.java`, `WorkflowValidatorService.java`): thêm `Condition_ChurnRiskTier`
vào `CONDITION_TYPES` (2 nơi, set độc lập không dùng chung hằng số — đã xác nhận qua đọc code, không
giả định) + 1 `case` validate operator ∈ {GREATER_THAN, LESS_THAN, EQUAL} + value là Number. Khác
`Condition_TotalSpending`: KHÔNG cần `timeRange`/`daysLookback` — `churnProbability` là điểm số tại
đúng thời điểm risk-scan chấm, không phải tổng dồn theo khoảng thời gian.

**FE** (9 file, toàn bộ chỗ có logic riêng theo loại node — xác nhận bằng grep, không sót):
`constants.js` (đăng ký node type), `utils/bpmn.js` + `utils/clientValidation.js` (2 set
CONDITION_TYPES độc lập phía FE, y hệt tình trạng phía BE), `utils/expression.js`
(parse/build/default JUEL — `${churnProbability OP threshold}`, kẹp threshold về [0,1]),
`utils/branchDisplay.js` (hiển thị "Rủi ro rời bỏ ≥ 50%"), `utils/nodeDisplay.js` (mô tả node),
`fields/BranchEditor.jsx` (form nhập operator + % trên UI, quy đổi ra phân số 0–1 khi lưu),
`fields/ConditionFields.jsx` (info box cấp node), `hooks/useWorkflow.js` (giá trị mặc định khi bấm
"Thêm IF").

### Kiểm chứng — và phát hiện lại đúng lỗi vừa tự sửa ở Tầng 1.1

Thử `docker compose build promotion-service` trước — **lại thấy hiện tượng CŨ**: chỉ đóng gói lại
jar có sẵn (không compile). Áp đúng bài học vừa rút ra: build bằng `mvn package` với
`JAVA_HOME=jdk-17.0.5` tường minh (máy mặc định JDK 23, không tương thích lombok 1.18.30 của
project) — xác nhận qua mtime jar đổi thành giờ chạy lệnh thật.

**Không dừng ở "compile được"** — viết 1 harness Java gọi thẳng `WorkflowValidatorService.validate()`
+ `BpmnCompilerService.compile()` (constructor rỗng, không cần Spring context) với 1 đồ thị thật: 1
gateway `Condition_ChurnRiskTier` có 2 nhánh IF (`churnProbability < 0.2`, `< 0.5`) + 1 Else, mỗi
nhánh trỏ tới 1 action gửi email khác nhau. Kết quả:
- `validate()` → **`valid = true`** (không có lỗi nào liên quan tới gateway mới).
- `compile()` → sinh **7.311 ký tự BPMN XML thật**, chứa đúng `exclusiveGateway` + cả 2
  `conditionExpression` (`churnProbability < 0.2` và `< 0.5`) trên các `sequenceFlow`.

Đây là bằng chứng THẬT rằng "0–0,2: chiến dịch A, 0,2–0,5: chiến dịch B, còn lại: C" biên dịch được
thành BPMN hợp lệ trong CÙNG 1 campaign, đúng như user mô tả — không phải suy luận từ đọc code. Đã
xoá file harness (`VerifyChurnRiskTier.java`) sau khi chạy xong, không phải test infra lâu dài (project
chưa có `src/test` cho promotion-service).

`npm run build` (FE) qua sạch, không lỗi mới.

### Giới hạn của Tầng 3 vừa làm

- Đây là **cơ chế** (thêm 1 loại node điều kiện), KHÔNG PHẢI đã có sẵn 1 campaign thật dùng nó — admin
  vẫn phải tự vào Campaign Builder, thêm node `Condition_ChurnRiskTier`, tự vẽ các dải ngưỡng + action
  tương ứng. Không tự động tạo sẵn "4 chiến dịch mẫu theo 4 dải rủi ro".
- Chưa deploy thật một campaign dùng node này qua Camunda (cần stack đầy đủ + Keycloak, cùng giới hạn
  đã ghi ở Tầng 1.1) — dừng ở compile ra BPMN XML hợp lệ, chưa chạy process instance thật.
- `churnProbability` dùng trong JUEL là xác suất **đã hiệu chỉnh** (Tầng 0.1) — admin cấu hình ngưỡng
  theo thang đã hiệu chỉnh, không phải thang thô 0.5 mặc định của model chưa calibrate.

---

## 2026-08-03 — `tools/real-data-seed`: nạp đơn hàng + review THẬT (Olist)

User yêu cầu: tìm dữ liệu thật (kiểu Kaggle) để seed thay cho dữ liệu tổng hợp, lưu công cụ vào
GitHub cho người sau dùng. Không có dataset công khai nào có đủ CẢ đơn hàng/review thật LẪN hành vi
xem/bỏ giỏ thật của CÙNG 1 user — đã hỏi lại user để chốt trọng tâm trước khi code (tránh chọn bừa
1 dataset không khớp mục tiêu): chọn **Brazilian E-Commerce Public Dataset by Olist** (Kaggle) cho
đơn hàng/review thật; hành vi xem/bỏ giỏ vẫn phải tổng hợp (Olist không có clickstream) nhưng NEO
vào mốc thời gian đơn hàng THẬT — khác `tools/data-seed` (mọi mốc đều tổng hợp), nhịp giờ/ngày thật
của Olist tự lan truyền vào behavior mà không cần dựng `rhythmicTimestamp()`.

**Cấu trúc tool mới** (`tools/real-data-seed/`, độc lập với `tools/data-seed`, không đụng nhau —
khác domain email `@olist.import` vs `@seed.internal`, khác slug `olist-*`):
- `download.mjs` — tải dataset qua Kaggle public API (HTTP Basic Auth username/key từ kaggle.json),
  KHÔNG cần cài Kaggle CLI/Python.
- `lib/parseOlist.mjs` — đọc 6 CSV cần dùng, **validate tên cột ngay khi đọc** (báo lỗi rõ nếu
  Kaggle đổi schema, thay vì để `undefined` âm thầm lan xuống làm sai lệch dữ liệu).
- `lib/mapOlist.mjs` — ánh xạ Olist → schema project. Quyết định quan trọng (ghi rõ trong code +
  README, không giấu): chỉ giữ 2/8 trạng thái đơn map thẳng được (delivered/canceled), bỏ 6 trạng
  thái trung gian thay vì bịa; tên sản phẩm tổng hợp từ category vì Olist không có tên SP thật; giá
  = trung bình giá bán THẬT của đúng product_id đó; quy đổi BRL→VND chỉ để hiển thị (không ảnh
  hưởng phân bố tương đối, mọi feature đều qua MinMaxScaler); không có discount/voucher cấp đơn ở
  Olist nên để 0/null, không suy diễn.
- `lib/behaviorFromOrders.mjs` — sinh view/cart tổng hợp neo theo `order_purchase_timestamp` thật.
- `lib/writeReal.mjs` + `lib/cleanup.mjs` — ghi/dọn DB, idempotent qua `ON DUPLICATE KEY UPDATE`.
- `import.mjs` — orchestrator (`--dry-run`, `--customers N` để lấy mẫu thay vì toàn bộ ~96k khách
  hàng thật, `--force`).

**Kiểm chứng đã làm (chưa có kaggle.json nên chưa chạy được với dữ liệu thật):**
- Cài dependency (`csv-parse`, `adm-zip`) — phát hiện `adm-zip@<0.6.0` có lỗ hổng cao (crafted ZIP
  gây cấp phát 4GB RAM) qua `npm audit`, nâng lên `^0.6.0` ngay, xác nhận lại 0 lỗ hổng.
- Dựng bộ fixture CSV nhỏ **giả lập ĐÚNG schema Olist thật** (kể cả trường hợp 2 `customer_id` khác
  nhau cùng trỏ về 1 `customer_unique_id` — đúng đặc điểm thật của Olist) để kiểm tra logic mapping
  mà không cần chờ dataset thật: xác nhận dedup user đúng (2 customer_id → 1 user), lọc đúng trạng
  thái đơn (bỏ "processing"), tính giá/tổng tiền đúng, review gắn đúng review với order/product,
  `--customers N` sample đúng. Đã xoá fixture sau khi test xong (không phải test infra lâu dài).
- Test riêng `behaviorFromOrders.mjs`: xác nhận toàn bộ view/cart sinh ra đều có timestamp **trước**
  mốc đơn hàng, cùng 1 đơn nhiều sản phẩm thì các sự kiện "cart" chia sẻ đúng 1 `sessionId` (giống
  logic phiên đã làm ở Tầng 1.2).

**Đang chờ:** user cung cấp `kaggle.json` (username/key) để tải dataset thật và chạy `import.mjs`
thật + verify bằng SQL (đếm orphan, phân bố trạng thái/rating...) — cùng chuẩn kiểm chứng đã áp
dụng cho mọi phần khác trong log này, chưa coi là "xong" cho tới khi có số đo thật.

**Đã commit + push code (KHÔNG commit dữ liệu)** — 5 commit theo từng mảng việc (calibration/rule-
benchmark/model-card, session_id + seeder enrichment, NBA `Condition_ChurnRiskTier`, tool
`real-data-seed`, docs) lên `origin/ai/behavoir`. Đã kiểm tra kỹ trước khi push: không `.env`,
không `node_modules`, không dữ liệu Olist nào lọt vào (root `.gitignore` đã có sẵn `**/data/`,
`**/node_modules/`, `**/.env`).

### Tải + import dữ liệu THẬT — dùng `kagglehub` (Python) thay vì tự đăng nhập Kaggle

User đưa đoạn code Python dùng thư viện `kagglehub` để tải — thử trực tiếp: **tải được dataset
HOÀN TOÀN KHÔNG CẦN xác thực** (`kagglehub.dataset_download("olistbr/brazilian-ecommerce")` chạy
thẳng, không cần `kaggle.json`). Bất ngờ nhưng hợp lý: dataset công khai, Kaggle cho phép tải ẩn
danh qua kênh này. Thử lại bằng `fetch` thuần trong Node (cách `download.mjs` đang dùng) thì bị
`ConnectTimeoutError` tới `kaggle.com` từ môi trường này — không rõ do khác route mạng hay khác
endpoint nội bộ mà `kagglehub` dùng. Không đào sâu thêm (không phải trọng tâm) — dùng luôn dữ liệu
đã tải qua `kagglehub`, copy 9 file CSV vào `tools/real-data-seed/data/` (đã gitignore).

**Phát hiện 1 bug thật khi soát header file thật (không phải đoán):**
`product_category_name_translation.csv` có **BOM UTF-8** ở đầu file — tên cột đầu tiên đọc thô ra
là `"﻿product_category_name"` thay vì `"product_category_name"`, làm mọi lookup dịch category
thất bại ÂM THẦM (rơi về tên gốc tiếng Bồ Đào Nha, không sai crash nhưng sai ý nghĩa). Chính cơ chế
validate cột bắt buộc đã viết trước (`readCsv()`) sẽ bắt được lỗi này khi chạy thật — nhưng sửa
luôn cho gọn: thêm `bom: true` vào `csv-parse`.

**Dry-run mẫu 500 khách hàng thật** khớp gần đúng thống kê công khai của Olist (99.441 orders/
customers, 99.224 reviews tổng — đúng số liệu dataset gốc, xác nhận đọc đúng file thật, không phải
may mắn nhớ đúng cấu trúc). Docker Desktop crash lần nữa giữa chừng (đã quen thuộc, xem các lần
trước) — khởi động lại, infra tự phục hồi.

**Import thật (500 khách hàng mẫu) + verify SQL đầy đủ:**
- 517 orders (515 DELIVERED / 2 CANCELLED), 514 reviews thật, 1.180 event hành vi tổng hợp.
- **0 orphan** order_items (trỏ order không tồn tại), **0 orphan** review theo order_id, **0
  orphan** review theo product_id — toàn vẹn tham chiếu qua cả 3 database.
- Phân bố rating: lệch mạnh về 5 sao (318/514 ≈ 61,9%) — khớp đặc điểm review TMĐT Brazil đã biết
  công khai (thiên lệch tích cực), không phẳng/không giả.
- Mẫu event: xác nhận đúng thiết kế — nhiều `ADD_TO_CART` cùng 1 đơn chia sẻ đúng 1 `session_id`
  (phiên chốt đơn), mọi event đều có timestamp TRƯỚC mốc đơn hàng thật.

**Kết luận: `tools/real-data-seed` hoạt động đúng trên dữ liệu thật, không chỉ trên fixture giả
lập.**

### Tối ưu tốc độ trước khi import full ~96k khách hàng

User hỏi "import full mất bao lâu" — đo thời gian thật của lần chạy mẫu 500 khách hàng (~175s) rồi
suy ra: `writeOrders()` đang ghi **từng đơn một** (khác hẳn `tools/data-seed` đã tối ưu bulk-insert
từ đầu), ước tính scale lên ~96.478 đơn thật sẽ mất **~8-9 tiếng** — không thực tế. Hỏi lại user
trước khi làm thêm (không tự ý vừa import full vừa chấp nhận chờ hàng giờ): user chọn tối ưu trước.

Sửa `ensureCategories`/`ensureProducts`/`ensureUsers` (thêm `bulkUpsert()` — batch INSERT ...
ON DUPLICATE KEY UPDATE) và `writeOrders` (batch INSERT nhiều dòng, suy `order_id` qua
`result.insertId + idx` — **giống hệt** pattern đã dùng ở `tools/data-seed/lib/writeData.mjs`,
đúng nguyên tắc InnoDB single-connection không ghi đồng thời).

**Đo lại sau tối ưu:** cùng mẫu ~500 khách hàng, `--force` chạy lại — **10,4 giây** (từ ~175s ban
đầu, nhanh hơn ~17×). Verify SQL lại từ đầu sau khi đổi cách ghi (không chỉ tin vì nhanh hơn): 0
orphan order_items, 0 orphan review (cả 2 khoá), 0 lệch `subtotal`, đếm chéo 521 order khớp đúng
595 order_items — xác nhận suy `order_id` theo batch không bị lệch/collision.

**Ước tính full ~96.478 đơn sau tối ưu: ~15-25 phút** (so với ~8-9 tiếng trước tối ưu) — đã báo lại
cho user, user xác nhận chạy full + train để so sánh.

### Import full ~93.897 user thật + train thật để so sánh — kết quả quan trọng

**Import full:** đúng ước tính, chạy nền. Kết quả: **93.897 user, 97.103 đơn (96.478 DELIVERED /
625 CANCELLED), 96.808 review thật, 221.478 event hành vi tổng hợp**. Verify SQL lại từ đầu ở quy
mô đầy đủ: **0 orphan** ở mọi bảng (order_items, review theo order_id, review theo product_id,
event theo user_id). Docker Desktop crash thêm 1 lần giữa chừng (quen thuộc) — khởi động lại,
`ai-forecast-service` cần thêm ~15-20s sau khi daemon sẵn sàng để networking WSL2 ổn định (curl
"connection refused" dù `docker ps` báo "Up" — không phải lỗi ứng dụng, đã gặp lại đúng hiện tượng
network chưa ổn định sau crash).

**Phát hiện phụ, đáng chú ý:** trong 93.897 user thật, chỉ **2.801 user (~3%)** có ≥2 đơn DELIVERED
— ngưỡng dân số huấn luyện churn hiện dùng. Olist là dữ liệu marketplace thật với tỉ lệ khách quay
lại mua RẤT THẤP — đặc điểm đã biết công khai của dataset này, không phải lỗi import.

**Để so sánh sạch (không trộn lẫn synthetic + thật)**: tạm dọn dữ liệu synthetic
(`tools/data-seed/cleanup.mjs`, có chủ đích, sẽ sinh lại sau) rồi gọi `POST /models/train` trên
CHỈ dữ liệu Olist thật.

**Phát hiện quan trọng #1 — training thất bại lần đầu, đúng nguyên nhân, không phải bug import:**
`/models/train` báo lỗi "tập train chỉ có 1 lớp nhãn duy nhất". Lý do: `_build_training_panel()`
tính mốc cắt bằng `datetime.now()` (đồng hồ hệ thống, hiện là 2026), nhưng dữ liệu Olist thật đứng
yên ở 2016-2018 — mọi mốc cắt rơi vào ~2025-2026, cách xa dữ liệu thật hàng năm trời, nên "user có
đơn trong 120 ngày tới mốc cắt" luôn là KHÔNG (tương lai đó không hề tồn tại trong dữ liệu) → 100%
user churn=1, mất khả năng train. Đây là giới hạn thật của kiến trúc (mốc cắt neo theo đồng hồ hệ
thống — hợp lý cho dữ liệu synthetic luôn sinh quanh "hiện tại", nhưng sai với dữ liệu lịch sử đã
đóng băng), không phải lỗi của `tools/real-data-seed`.

**Sửa tối thiểu, an toàn:** thêm tham số `reference_now: pd.Timestamp | None = None` vào
`_build_training_panel()` — mặc định `None` giữ NGUYÊN hành vi production (dùng đồng hồ hệ thống),
chỉ dùng tường minh cho phân tích dữ liệu lịch sử. Xác nhận model production KHÔNG bị đụng vào:
version/AUC trước và sau detour này giống hệt nhau (`GET /models/card` kiểm tra lại sau cùng).

Chạy trực tiếp `_build_training_panel(reference_now=2018-10-20)` + `_evaluate_grouped_cv()` (không
qua `/models/train`, không lưu model — đây là phân tích một lần, không phải thay đổi production)
với mốc neo = ngày cuối cùng có đơn thật (2018-10-17) + vài ngày đệm.

**Phát hiện quan trọng #2 — kết quả trên dữ liệu thật:**

| Chỉ số | Dữ liệu tổng hợp (production, train #7) | Dữ liệu Olist thật |
|---|---|---|
| Panel | 342 user / 1.443 dòng | 2.189 user / 8.815 dòng |
| Churn rate | 0.2633 | **0,9729** |
| AUC (grouped CV) | 0,8415 ± 0,032 | **0,7564 ± 0,0413** |
| F1 | 0,6621 | 0,8599 ± 0,0252 |
| Precision | 0,555 | 0,9903 ± 0,0021 |
| Recall | 0,8316 | 0,7608 ± 0,0394 |

**Diễn giải trung thực (không phải "thật tốt hơn synthetic" hay ngược lại):**
- **AUC — CÓ so sánh được** (không phụ thuộc base rate): 0,7564 (thật) so với 0,7461-0,8415 (các
  lần đo synthetic khác nhau trong phiên) — **cùng bậc độ lớn**. Đây là tín hiệu tốt: sức phân biệt
  của 11 feature + Logistic Regression **có chuyển giao được sang hành vi người thật**, không chỉ
  "học vẹt" cấu trúc sinh dữ liệu tổng hợp.
- **F1/Precision/Recall — KHÔNG so sánh trực tiếp được**, vì base rate khác nhau quá xa (97,3% so
  với 26,3%). Ở base rate 97,3%, "đoán bừa toàn churn" đã cho precision ~97% miễn phí — F1 0,86 và
  precision 0,99 ở đây **bị base rate cực lệch thổi phồng**, không phản ánh model giỏi hơn.
- **Phát hiện thật, có giá trị báo cáo:** cửa sổ nhãn 120 ngày (hiệu chỉnh cho tốc độ mua của
  generator tổng hợp) tạo ra churn rate cực đoan (97,3%) trên hành vi mua hàng thật — gợi ý dataset
  marketplace thật như Olist cần cửa sổ nhãn DÀI HƠN nhiều (vd 180-365 ngày) để có churn rate cân
  bằng/dùng được, vì khách quay lại mua thật thường cách nhau lâu hơn giả định của generator tổng hợp.

**Phát hiện phụ khác:** `behavior.py:125` (`cart_abandon_count.fillna(0)`) vẫn còn 1 chỗ
`FutureWarning` pandas y hệt lỗi đã sửa ở Tầng 5 (dòng khác trong cùng file) — chưa sửa vì không
chặn kết quả, để lại cho lần dọn dẹp tiếp theo.

**Đã khôi phục dữ liệu synthetic** (`node seed.mjs --force --demo-users 0`) về đúng quy mô cũ (500
user) sau khi đo xong — không mất gì, seeder sinh lại được bất cứ lúc nào.

### User hỏi "test chưa" — và câu hỏi đó phát hiện ra 1 LỖI NGHIÊM TRỌNG tôi đã suýt bỏ qua

Rà lại thì đúng là **kiểm chứng của tôi có lỗ hổng thật**: khi thêm tham số `reference_now`, tôi chỉ
test **nhánh mới** (truyền giá trị → ra AUC 0,7564) mà **KHÔNG test nhánh mặc định** (`None` — chính
là đường production dùng). Việc gọi `GET /models/card` chỉ chứng minh metadata model CŨ không đổi
(hiển nhiên, vì chưa gọi train), **không** chứng minh code sửa không làm hỏng đường train bình thường.
Tệ hơn: đưa file vào container bằng `docker cp` (tạm, mất khi container tạo lại) và **chưa rebuild
image** — đúng dạng lỗi đã tự rút bài học ở Tầng 1.1/Tầng 3 ("build không thật sự verify code"), lặp
lại lần thứ 3 dưới hình thức khác. Đã commit + push trước khi verify đủ.

**Sửa cách làm:** rebuild image thật từ code đã commit (bỏ bản `docker cp`), xác nhận code có trong
image, rồi gọi `POST /models/train` (nhánh mặc định) để regression test.

**Kết quả regression test — phát hiện lỗi NGHIÊM TRỌNG (nghiêm trọng hơn hẳn lỗi ban đầu):**

Lúc đó DB đang có CẢ **93.897 user Olist (đơn 2016-2018)** LẪN **500 user synthetic (đơn 2025-2026)**.
Train nhánh mặc định (mốc cắt theo đồng hồ hệ thống = 2026) cho ra:

| | Chỉ synthetic (model tốt) | Trộn synthetic + Olist |
|---|---|---|
| Panel | 342 user / churn 0,2633 | 3.141 user / churn **0,9285** |
| AUC | 0,8415 ± 0,032 | **0,9908 ± 0,0027** |
| Precision | 0,555 | **1,0** |
| F1 | 0,6621 | 0,9828 |

**AUC 0,9908 này HOÀN TOÀN VÔ NGHĨA.** Mọi user Olist có đơn cuối cách mốc cắt nhiều năm → luôn
churn=1, và `recency`/`days_since_last_activity` lớn bất thường. Model chỉ cần học **"user thuộc
nguồn dữ liệu nào"** là phân loại gần hoàn hảo — không học gì về hành vi rời bỏ thật.

**Điểm chết người: `_retrain_gate()` KHÔNG cứu được.** Gate được thiết kế chặn khi AUC TỤT
(`AUC_mới >= AUC_cũ − std_cũ`), nhưng ở đây AUC bị THỔI PHỒNG nên gate **cho qua** (`passed: true`,
"ĐẠT: 0.9908 >= 0.8095") và **model rác đã thay luôn model production** (`latest` trỏ sang
`20260804T034459207489`, threshold nhảy 0,35 → 0,58). Đây là giới hạn thật của retrain gate cần ghi
rõ khi bảo vệ: **gate chống suy giảm chất lượng, KHÔNG chống nhiễm dữ liệu làm metric đẹp giả.**

**Khắc phục ngay:** khôi phục con trỏ `latest.json` của CẢ 2 model (classifier + kmeans, phải khớp
version vì được gate đồng thời) về `20260803T030831471695` — xác nhận qua `/models/card`: AUC về
0,8415, threshold về 0,35, 2 model khớp version. Không mất artifact nào (registry giữ đủ mọi version,
kể cả bản rác — đúng thiết kế audit trail).

**Sửa nguyên nhân gốc — guard chặn cứng ngay từ lúc dựng panel** (`_assert_panel_not_contaminated`,
gọi trong `_build_training_panel`), KHÔNG để tới bước gate. Chặn khi thoả **ĐỒNG THỜI** 2 dấu hiệu:
tỉ lệ churn > 0,90 **và** > 50% user có đơn cuối cùng cũ hơn cả mốc cắt sớm nhất. Chọn ngưỡng 0,90
có chủ đích rất cao để **không chặn oan** cấu hình nhãn hợp lệ (synthetic hiện tại ~0,26; biến thể
nhãn 60 ngày từng đo ~0,38 — còn rất xa 0,90). Nếu chỉ 1/2 dấu hiệu → chỉ log cảnh báo, không chặn
(có thể là chủ đích train dữ liệu lịch sử với `reference_now` đúng).

**Kiểm chứng guard cả 2 nhánh** (đúng chuẩn đã áp dụng cho retrain gate):
1. **Nhánh CHẶN** — giữ nguyên DB đang nhiễm, gọi `/models/train` → **HTTP 500** kèm chẩn đoán cụ thể
   ("tỉ lệ churn 0.9285 (> 0.9) và 90,6% user có đơn cuối cùng còn cũ hơn cả mốc cắt sớm nhất
   (2025-11-07)") + hướng dẫn cách xử lý. Quan trọng: model production **không bị đụng** vì bị chặn
   TRƯỚC khi lưu.
2. **Nhánh CHO QUA** — dọn dữ liệu Olist (`real-data-seed/cleanup.mjs`: xoá 93.897 user / 97.103 đơn
   / 221.478 event / 96.808 review), train lại → **HTTP 200**, panel 340 user / churn 0,2364, AUC
   0,7438 ± 0,0585. Guard không chặn oan dữ liệu sạch.
   - Đáng chú ý: retrain gate **từ chối** model mới này (0,7438 < ngưỡng 0,8095) — đúng thiết kế,
     production giữ model 0,8415. Lại là hiện tượng "lượt lấy mẫu synthetic khác nhau cho AUC dao
     động 0,74-0,84" đã ghi nhận nhiều lần trong phiên.

**Trạng thái cuối:** DB chỉ còn 1 nguồn (synthetic 500 user), production dùng model
`20260803T030831471695` (AUC 0,8415, threshold 0,35), cả classifier + kmeans khớp version.

**Đã sửa README của `real-data-seed`**: đoạn cũ viết "2 tool độc lập, không xung đột" — **đúng về
ghi dữ liệu nhưng SAI về train model**. Thay bằng cảnh báo ⚠️ có bảng số đo thật, giải thích vì sao
AUC 0,99 là giả, và lệnh cụ thể để cô lập từng nguồn trước khi train.

---

## Giới hạn phải nói rõ khi báo cáo

- **Dữ liệu synthetic** → metric đo "model có phục hồi được cấu trúc sinh dữ liệu hay không",
  **không phải** "model dự đoán đúng hành vi người thật". Đây là giới hạn chính đáng, nhưng phải nói.
- **AUC hiện tại lạc quan** vì train/test chung user (xem phát hiện 2 ngày 2026-07-28).
- Chỉ chính xác với **user đã đăng nhập**; guest dùng chung `X-User-Id: anonymous` (bug có sẵn,
  ngoài phạm vi) — pipeline chủ động bỏ qua identity không thật.
- **~490 user seed không tồn tại trong Keycloak** (không login được); chỉ ~10 user demo là
  end-to-end thật. Cần nhớ khi demo.
- `user_events` không unique theo `eventId` → Kafka at-least-once có thể sinh bản ghi trùng thưa.
- Nhãn cụm phải gán theo **đặc trưng tâm cụm**, không theo `cluster_id` (id đổi thứ tự mỗi lần fit).
- `session_id` (Tầng 1.1) mới verify qua `mvn package` (JDK 17) thật + unit-style test hàm parse phía
  Python, **chưa** verify
  end-to-end qua Camunda/toàn bộ stack thật (cần eureka+gateway+keycloak+product/order-service cùng
  chạy). Seeder đã làm giàu session/nhịp giờ (Tầng 1.2) và **đã reseed DB thật** — nhưng vì hardcode
  `session_id=None` ở BE (Tầng 1.1) mới sửa cùng lượt này nên **DB chưa từng nhận session_id qua
  đường Kafka thật**, chỉ qua seeder (ghi thẳng SQL, không qua Kafka) — 2 đường ghi độc lập, cả 2 đã
  đúng riêng lẻ nhưng chưa được xác nhận nhất quán bằng traffic thật cùng lúc.
- **Reseed 2026-08-03 làm AUC/F1 đổi so với số đã báo cáo trước đó** (AUC 0.8415→0.7745, margin F1
  model-vs-rule không còn vượt sàn nhiễu) — xem bảng đối chiếu đầy đủ ở mục 2026-08-03. Nguyên nhân
  là lượt lấy mẫu RNG mới (seeder đổi mã → chuỗi random dịch), KHÔNG phải seeder sinh dữ liệu sai;
  `churn-risk-feature-overview.md` mục 3.2 hiện chưa cập nhật theo số mới.
