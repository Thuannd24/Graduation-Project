# P1 — Recommendation (SASRec) + Behavior Tracking: Đánh giá & Kế hoạch hướng đi

> **Đầu vào:** lần chạy thật ngày 2026-09-26 (chi tiết luồng + số đo:
> [`recsys-behavior-flow-review.md`](recsys-behavior-flow-review.md)), kế hoạch nhóm
> [`recsys_security_2_month_plan.md`](recsys_security_2_month_plan.md), nền nghiên cứu
> [`recsys-execution-plan.md`](recsys-execution-plan.md).
>
> **Giả định lịch:** plan nhóm ghi "09/10/2025 → 08/12/2025", nhưng commit và dữ liệu đều ở năm 2026, nên hiểu là
> **09/10/2026 → 08/12/2026**. Hôm nay là 26/09/2026, tức còn khoảng **10 tuần**.

---

## PHẦN I — ĐÁNH GIÁ

### 1. Kết luận một câu

**Khung hệ thống đã đúng hướng và chạy được đầu-cuối, nhưng chưa có mắt xích nào đủ chuẩn để bảo vệ:**
FE chưa lấy được gợi ý cá nhân hoá, dữ liệu hành vi chưa sạch (lệch giờ, mất user, view giả), còn con số model thì
đo theo protocol khác với cách service thật sự phục vụ.

### 2. Bảng chấm theo 4 mức trưởng thành

Mỗi thành phần được chấm theo 4 câu hỏi, tăng dần độ khó:
**(1) Chạy được?** → **(2) Đúng?** → **(3) Đo được?** → **(4) Bảo vệ được trước hội đồng?**

| Thành phần | (1) Chạy | (2) Đúng | (3) Đo được | (4) Bảo vệ được | Ghi chú chính |
|---|---|---|---|---|---|
| Tracker FE (14 vi hành vi) | ✅ | ❌ | ❌ | ❌ | UTC vs giờ local, mất `user_id`, dwell/scroll sai với SPA |
| View/Cart event từ Java | ✅ | ⚠️ | ⚠️ | ❌ | View giả từ admin/profile; thiếu PURCHASE |
| Kafka → consumer → Redis/MySQL | ✅ | ⚠️ | ✅ | ⚠️ | REMOVE_FROM_CART bị coi là "quan tâm"; chưa có backfill |
| Train SASRec | ✅ | ⚠️ | ❌ | ❌ | Leave-last-out, 1 seed, không validation, chỉ so với Popularity |
| Serving recs-service | ✅ | ❌ | ✅ | ❌ | Lịch sử bị đảo thứ tự; Popularity vô nghĩa; thiếu ảnh |
| Tích hợp FE | ⚠️ | ❌ | ❌ | ❌ | Không gửi `user_id`, khách chưa đăng nhập nhận `[]` |
| Vòng phản hồi (impression → click) | ⚠️ | ❌ | ❌ | ❌ | Impression thiếu nguồn/vị trí/request id → không tính được CTR |

### 3. Điểm mạnh thật sự (nên giữ và nêu khi bảo vệ)

1. **Một nguồn sự thật cho hợp đồng dữ liệu** ([`contracts.py`](../../AI/shared-common/shared_common/contracts.py)):
   tên key Redis, topic và bảng chữ cái hành vi nằm ở một chỗ.
2. **Chỉ một đường ghi vào `user_events`** (qua consumer): mọi chuẩn hoá chỉ tồn tại ở một nơi, và Kafka có sẵn backpressure.
3. **Chốt chặn không gian item** (`item_space == "platform_v1"` + `item_id_map`): không bao giờ nạp nhầm checkpoint
   REES46 vào dữ liệu thật. Đây là tư duy MLOps đúng.
4. **Thang fallback** SASRec → Recency → Popularity và không bịa dữ liệu khi rỗng.
5. **Văn hoá kết quả âm trung thực** trong docs (§5.7–5.8 của execution-plan). Hội đồng đánh giá cao điều này, nhưng
   chỉ khi protocol đo đủ chặt (xem mục 4).
6. **Hiệu năng dư thừa**: p95 26 ms với SASRec, nhỏ hơn 8 lần mục tiêu 200 ms.

### 4. Điểm yếu cốt lõi (không phải bug lẻ, mà là vấn đề phương pháp)

#### 4.1 Chưa định nghĩa rõ bài toán "gợi ý" là gì

Trên dữ liệu đo được, **58 % lượt tương tác kế tiếp là item user đã xem**. Như vậy có **hai bài toán khác nhau**:

| | "Xem lại" (repeat) | "Khám phá" (explore) |
|---|---|---|
| Câu hỏi | User sẽ quay lại item nào? | Item **mới** nào user sẽ thích? |
| Heuristic mạnh | Recency (HR@10 = 0,366 trên nhóm này) | Markov-1 (0,086) |
| SASRec hiện tại | **0,424** (thắng) | 0,081 (chỉ ngang) |
| UI tương ứng | "Xem gần đây / Mua lại" | "Gợi ý cho bạn" |

Script train đo **gộp cả hai** (không lọc item đã xem), còn service chỉ phục vụ **khám phá** (có lọc). Vì thế con số
0,2665 không phản ánh thứ người dùng nhận. Đây là lỗi gốc cần giải quyết trước mọi việc tối ưu model.

#### 4.2 Protocol đánh giá vi phạm chính nguyên tắc của dự án

Execution-plan §6–§9 tự đặt ra các nguyên tắc: GTS (chia theo thời gian toàn cục), full-catalog, có sàn nhiễu, nhiều
seed, không kết luận từ seed tổng hợp. Script platform lại dùng leave-last-out (rò rỉ thời gian giữa các user), 1 seed,
dừng sớm theo train loss, và chỉ so với Popularity (baseline yếu nhất). **Phải có một harness đánh giá duy nhất, dùng
chung cho mọi model.**

#### 4.3 Luận điểm "micro-behavior là mỏ vàng cho AI" chưa được nối

Hiện tại, vi hành vi được thu nhưng: (a) seed không sinh ra chúng, (b) SASRec không đọc `action_type`, (c) dữ liệu thật
bị lệch giờ và mất `user_id`. Chuỗi lập luận *Tracking → Data sạch → AI tốt hơn* đang **đứt ở cả ba chỗ**.

#### 4.4 Trên dữ liệu thật công khai, SASRec đang thua baseline

Theo commit `c1c502f` (mình **chưa chạy lại**): trên REES46 Cosmetics, SASRec recall@20 = 0,0108, trong khi Popularity
là 0,0179 và ItemKNN là 0,0199. Đây là rủi ro lớn nhất cho chương đánh giá: mọi luận điểm học thuật phải đứng trên dữ
liệu thật, mà ở đó model đang thua.

### 5. Danh sách lỗi (tham chiếu)

Chi tiết và bằng chứng xem [`recsys-behavior-flow-review.md`](recsys-behavior-flow-review.md) §5. Tóm tắt:

| Mức | # | Lỗi |
|---|---|---|
| 🔴 | 1 | FE không gửi `user_id`; khách chưa đăng nhập nhận `[]` |
| 🔴 | 2 | Popularity dựa trên `sales_count` = 0 toàn bộ |
| 🔴 | 18 | Response gợi ý chỉ có `id/name/price` → `ProductCard` không có ảnh, giá gốc, rating |
| 🟠 | 3 | Lịch sử Redis (mới nhất ở đầu) được đưa vào SASRec như thể cũ nhất ở đầu |
| 🟠 | 4 | Lệch protocol train/serve (lọc item đã xem) |
| 🟠 | 5 | REMOVE_FROM_CART / UPDATE_CART_QTY được đẩy vào history |
| 🟠 | 6 | Lệch múi giờ 7 h giữa FE (UTC) và Java (giờ local) |
| 🟠 | 7 | Vi hành vi mất `user_id` (tracker không gửi token) |
| 🟠 | 8 | VIEW_PRODUCT giả từ trang admin/profile/order |
| 🟡 | 9–17 | `POST /recommend` 422 với UUID, không dùng action type, không backfill Redis, dwell/scroll sai với SPA, impression thiếu ngữ cảnh, cross-sell = popularity, metadata checkpoint sai, maxlen 15 vs chuỗi 233, các hạng mục plan chưa làm |

---

## PHẦN II — KẾ HOẠCH

### 6. Nguyên tắc định hướng (áp dụng cho mọi quyết định bên dưới)

1. **Tách "hệ thống chạy" khỏi "kết luận học thuật".**

   | Nguồn dữ liệu | Được dùng để | Không được dùng để |
   |---|---|---|
   | Seed platform | Chứng minh pipeline đúng, demo, kiểm thử hồi quy | Kết luận model nào tốt hơn |
   | REES46 Cosmetics | Protocol theo thời gian dài (152 ngày), hiệu ứng thứ tự | Đo tầm quan trọng của action type (chỉ 4 loại) |
   | Taobao UserBehavior | Encoder chuỗi (75 event/user), ablation action type (4 loại) | Protocol theo thời gian dài (chỉ 9 ngày) |

2. **Một harness đánh giá, một protocol, nhiều model.** Mọi con số trong báo cáo đều ra từ cùng một đoạn code.
3. **Đo đúng cái được phục vụ.** Offline metric phải tái hiện đúng logic serving (lọc gì, lấy bao nhiêu history, thứ tự nào).
4. **Không promise "AI thắng".** Mục tiêu là *so sánh có đối chứng*; nếu thua quá sàn nhiễu thì báo cáo kết quả âm và giải thích.
5. **Mỗi giai đoạn có cổng ra bằng số.** Chưa qua cổng thì không sang giai đoạn sau.

### 7. Các quyết định cần bạn chốt trước (tuần này)

| # | Quyết định | Khuyến nghị của mình | Lý do |
|---|---|---|---|
| D1 | "Gợi ý cho bạn" phục vụ repeat, explore hay cả hai? | **Hai khối UI**: "Xem gần đây" (Recency) và "Gợi ý cho bạn" (SASRec, lọc item đã xem). Đo và báo cáo **tách riêng** | Đúng chuẩn ngành (repeat-aware recommendation); mỗi khối có baseline và metric rõ ràng; tránh đem số gộp đi so |
| D2 | Có dựng lớp Spring Boot gọi FastAPI + Redis cache 15' như plan nhóm? | **Không dựng proxy Java.** FE → Gateway → FastAPI; chỉ thêm cache nếu đo được tải cao | p95 đã 26 ms. Thêm một hop Java chỉ tăng độ phức tạp. Ghi rõ lý do bằng số đo trong báo cáo — đây là quyết định kiến trúc bảo vệ được |
| D3 | Bộ dữ liệu cho luận điểm chính | **Taobao** cho encoder và action type, **REES46** cho protocol thời gian và hiệu ứng thứ tự | Khớp phân vai §5.2 của execution-plan; mỗi bộ dùng đúng trục nó mạnh nhất |
| D4 | Có GPU không? | Nếu không: giới hạn Taobao ở một mẫu con (vd 100K user) | Seed platform (158K mẫu) đã mất 31 phút CPU với batch 32; REES46/Taobao lớn hơn 2–3 bậc |

### 8. Lộ trình 10 tuần

```
Tuần:  1      2      3      4      5      6      7      8      9      10
       28/09  05/10  12/10  19/10  26/10  02/11  09/11  16/11  23/11  30/11–08/12
GĐ0 ███
GĐ1        ██████████
GĐ2                    ██████████
GĐ3                                ██████████
GĐ4                                              ██████████
GĐ5                                                            █████████
Báo cáo ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (song song, theo plan nhóm)
```

---

#### GĐ0 — Sửa lỗi chặn (28/09 → 04/10)

**Mục tiêu:** demo "User đăng nhập, xem vài SP → trang chủ hiện gợi ý cá nhân hoá có ảnh" chạy thật.

| Việc | File | Ước lượng |
|---|---|---|
| recs-service lấy danh tính từ header `X-User-Id` / `X-Session-Id` thay vì query param; FE bỏ chặn `hasAuthToken` | `recommend.py`, `aiApi.ts`, `HomePage.jsx` | 0,5 ngày |
| Popularity tính từ `user_events` (VIEW + 3×ADD_TO_CART, 30 ngày), cache 5 phút | `popularity.py`, `catalog.py` | 0,5 ngày |
| Đảo `item_history` về chronological trước khi đưa vào SASRec | `sasrec.py` | 15 phút |
| Chỉ đẩy VIEW_PRODUCT / ADD_TO_CART vào Redis history | `behavior_consumer.py` | 15 phút |
| Response gợi ý thêm `image`, `oldPrice`, `rating`, `slug` | `catalog.py`, `models/recommend.py` | 0,5 ngày |
| `userId: Optional[str]` trong `RecommendRequest` | `models/recommend.py` | 5 phút |
| Test tự động cho 4 lỗi trên (pytest, mock Redis/DB) | `AI/recs-service/tests/` | 1 ngày |
| Script backfill Redis từ `user_events` | `tools/` hoặc `AI/recs-service/scripts/` | 0,5 ngày |

**✅ Cổng ra:**
- E2E: user seed đăng nhập → `strategy ∈ {sasrec, recency}` và card có ảnh.
- Pytest xanh, trong đó có test *"lịch sử newest-first → model nhận chronological"* và *"REMOVE_FROM_CART không vào history"*.
- Chạy lại harness: SASRec-như-service = SASRec-đúng-thứ-tự (hết khoảng chênh 0,028).

---

#### GĐ1 — Behavior Tracking chuẩn (05/10 → 18/10)

**Mục tiêu:** dữ liệu hành vi đủ sạch để phân tích **thứ tự** — nền của toàn bộ luận điểm.

| Việc | Chi tiết |
|---|---|
| **Chuẩn thời gian UTC** | Java: `Instant.now()` / `LocalDateTime.now(ZoneOffset.UTC)`; FE giữ `toISOString()` và **thêm `Z`**; consumer parse có timezone và lưu UTC. Thêm `received_at` (giờ server) cạnh `created_at` (giờ client) để phát hiện đồng hồ client sai |
| **Danh tính** | Tracker `fetch` gửi kèm token. Với `sendBeacon` (không set được header): khi login, ghi một event `SESSION_LINKED(session_id → user_id)` để ghép lại offline |
| **Chống view giả** | Endpoint chi tiết nhận `?track=false`; admin/profile/order gọi với cờ này. Hoặc tốt hơn: FE bắn `VIEW_PRODUCT` từ `ProductDetailPage` và BE ngừng publish ở endpoint đọc |
| **SPA route** | Hook `useLocation()` trong app shell để bắn PAGE_DWELL và reset mốc scroll mỗi khi đổi route |
| **PURCHASE** | Consumer nghe `order-events` (đã có topic) → ghi `PURCHASE` cho từng item — tín hiệu mạnh nhất đang thiếu |
| **Impression chuẩn cho recsys** | Thêm `source` (home_recs / search / category), `position`, `rec_request_id` (recs-service sinh và trả kèm response). Chỉ bắn khi item thật sự vào viewport (IntersectionObserver), không bắn lại khi đổi tab |
| **Hợp đồng chống bot với P2** | Chốt sớm: bảng `flagged_sessions(session_id, reason, flagged_at)` do SIEM ghi; training và Redis history bỏ qua các session này |
| **Seeder** | Sinh thêm micro-behavior và REMOVE_FROM_CART để **demo và kiểm thử** (không dùng để kết luận) |
| **Data-quality check** | Script SQL chạy được bất cứ lúc nào (xem cổng ra) |

**✅ Cổng ra (data-quality check trên một phiên test thật qua FE):**

| Chỉ số | Ngưỡng |
|---|---|
| Event của user đã đăng nhập có `user_id` NULL | 0 % |
| Chênh lệch `created_at` giữa FE event và Java event cùng thao tác | < 5 giây |
| VIEW_PRODUCT phát sinh khi mở trang admin Inventory | 0 |
| Impression từ home recs có `rec_request_id` | 100 % |
| Có PURCHASE sau khi đặt đơn | ✅ |

---

#### GĐ2 — Harness đánh giá chuẩn (19/10 → 01/11)

**Mục tiêu:** một module đánh giá duy nhất trong repo; mọi con số báo cáo đều ra từ đây.

**Protocol:**

| Thành phần | Lựa chọn | Vì sao |
|---|---|---|
| Chia dữ liệu | **Global temporal split**: train < T_val < T_test (vd phân vị thời gian 80/90) | Không rò rỉ tương lai giữa các user — đúng nguyên tắc GTS của execution-plan |
| Target | Tương tác đầu tiên sau mốc, của user có lịch sử trước mốc | |
| Xếp hạng | Full catalog, **không** sampled metric | |
| Hai track | **Explore** (lọc item đã xem, target là item mới) và **Repeat** (target là item đã xem) | Theo quyết định D1 |
| Metric | HR@10, NDCG@10, MRR@20, Coverage@10, Gini, ARP (độ phổ biến trung bình) | Đúng danh sách plan + đo popularity bias |
| Độ tin cậy | ≥ 3 seed; paired bootstrap CI95; **sàn nhiễu** = std giữa các seed | |
| Baseline | Popularity (thật), Recency, Markov-1, **ItemKNN đã tune**, Category-Pop | ItemKNN là baseline hội đồng hay hỏi nhất |
| Dừng sớm | Theo NDCG@10 trên validation, không theo train loss | |
| Checkpoint | Lưu kèm `git_sha`, snapshot dữ liệu, metric validation/test, epoch thật | Dùng cho cổng deploy ở GĐ4 |

**Tăng tốc train:** batch 256, bỏ `rng.choice` từng batch (lấy mẫu negative một lần cho mỗi epoch), dùng
`torch.set_num_threads`. Mục tiêu: seed platform < 5 phút / lần.

**✅ Cổng ra:**
- Bảng baseline hoàn chỉnh (± std) trên cả 3 bộ: platform, REES46, Taobao (mẫu con).
- Harness tái hiện được số của GĐ0 trên platform.
- Có unit test cho metric (tính tay trên ví dụ 3 user).

---

#### GĐ3 — Cải tiến model + nối luận điểm Behavior → AI (02/11 → 15/11)

**Mục tiêu:** trả lời bằng thí nghiệm có đối chứng hai câu hỏi của đồ án.

**Câu hỏi 1 — SASRec có vượt ItemKNN-tuned trên dữ liệu thật không?** Thang ablation, mỗi bước chỉ đổi một yếu tố:

| Bước | Thay đổi | Cơ sở |
|---|---|---|
| 0 | SASRec hiện tại | mốc |
| 1 | Negative 50 → 256 + **logQ correction** (trừ log tần suất negative) | Negative lấy theo popularity mà không hiệu chỉnh sẽ gây popularity bias |
| 2 | Tune `maxlen` (15 → 50 → 100), dropout, d_model | Chuỗi median 233 đang bị cắt còn 15 |
| 3 | Pre-norm + nhiều epoch hơn (theo cấu hình eSASRec trong execution-plan §4.1) | |

**Câu hỏi 2 — Loại hành vi (`action_type`) có mang thêm thông tin không?** Đây là mắt xích nối Behavior Tracking với AI:

- Thêm `emb(action_type)` vào đầu vào (tầng 1 của execution-plan).
- Đo trên **Taobao** (pv/cart/fav/buy) và **REES46** (có `remove_from_cart`), so có/không có action embedding.
- **Đối chứng âm:** xáo `action_type` trong mỗi chuỗi → Δ phải về 0.

**Serving (theo D1):** "Gợi ý cho bạn" dùng model thắng ở track Explore; "Xem gần đây" dùng Recency hoặc model thắng ở
track Repeat.

**✅ Cổng ra:**
- Câu hỏi 1: SASRec-tốt-nhất > ItemKNN-tuned vượt sàn nhiễu → dùng. Nếu không → ghi kết quả âm và phục vụ ItemKNN/Markov
  (đã có Coverage 0,91).
- Câu hỏi 2: Δ(action embedding) có CI95 không chứa 0 **và** đối chứng âm sạch. Nếu không → kết quả âm có giá trị:
  "bảng chữ cái 4 ký hiệu chưa đủ", đúng nhánh rẽ ở §7 execution-plan.

---

#### GĐ4 — Productionize + MLOps (16/11 → 29/11)

| Việc | Chi tiết |
|---|---|
| **Cổng deploy tự động** | Checkpoint chỉ được `is_ready()` nếu metadata cho thấy nó thắng Recency/ItemKNN trên track Explore của holdout. Mở rộng chốt chặn `item_space` hiện có |
| **Train lại định kỳ** | Job train trên `user_events` (loại session bị P2 gắn cờ) + backfill Redis. Item mới chưa có trong `item_id_map` → fallback Category-Pop |
| **Metric online** | CTR = click / impression theo `rec_request_id` và theo `strategy` → dashboard nhỏ. Đây là metric duy nhất đo được "gợi ý đưa ra mà bị bỏ qua" |
| **Cross-sell** | Thay Popularity bằng co-occurrence (ItemKNN) |
| **Cache (nếu D2 cần)** | Key theo `hash(history)` và tự vô hiệu khi có event mới — không dùng TTL 15' cứng, vì sẽ trả gợi ý cũ ngay sau khi user vừa xem SP mới |
| **E2E với P2** | Bot spam click → SIEM gắn cờ → không vào Redis history / training → gợi ý của user thật không đổi (đo trước/sau) |
| **Tải** | Locust 50–100 RPS vào `/recommendations/personal`, ghi p95 |

**✅ Cổng ra:**
- Kịch bản demo chạy trên Docker Compose sạch.
- Dashboard có CTR theo strategy.
- Test bot: gợi ý của user thật không thay đổi khi bị spam.

---

#### GĐ5 — Báo cáo & bảo vệ (30/11 → 08/12, theo plan nhóm)

**Chương Behavior Tracking:**
- Sơ đồ luồng (đã có trong flow-review).
- Bảng data-quality trước/sau GĐ1 — minh chứng "data sạch" bằng số.
- Lý do chọn hành vi chạy được trên mobile; lý do chỉ có một đường ghi.

**Chương SASRec:**
- Self-attention, causal mask, sampled softmax + logQ.
- Bảng ablation GĐ3.
- Phân tích repeat vs explore.

**Chương Đánh giá:**
- Protocol GTS, sàn nhiễu, đối chứng âm, Coverage/ARP (popularity bias), CTR online.
- Kết quả âm (nếu có) trình bày như một phát hiện.

**Câu hỏi phản biện nên tập trước:**

| Câu hỏi | Bằng chứng để trả lời |
|---|---|
| "Sao không dùng Recency cho xong?" | Bảng tách repeat/explore: Recency = 0 trên item mới theo định nghĩa |
| "Số đo trên data tự sinh có ý nghĩa gì?" | Nguyên tắc §6.1 — không có kết luận nào lấy từ seed |
| "Sao không thêm Spring Boot?" | Số latency p95 + lập luận về số hop |
| "Micro-behavior giúp được gì?" | Kết quả Câu hỏi 2, kể cả khi âm |

### 9. Rủi ro & phương án

| Rủi ro | Khả năng | Ảnh hưởng | Phương án |
|---|---|---|---|
| SASRec không vượt ItemKNN trên dữ liệu thật | Cao (đã thấy trên REES46) | Cao | Chuẩn bị sẵn khung "kết quả âm có đối chứng"; phục vụ model thắng; luận điểm chuyển sang *khi nào* chuỗi có ích |
| Không có GPU | Trung bình | Trung bình | Mẫu con Taobao; tối ưu train ở GĐ2; chạy qua đêm |
| P2 trễ phần gắn cờ bot | Trung bình | Thấp | Chốt hợp đồng bảng `flagged_sessions` ngay GĐ1; tự tạo dữ liệu gắn cờ giả để test |
| Sửa timezone làm vỡ feature churn của P2 | Trung bình | Trung bình | Báo P2 trước; migration chuyển dữ liệu cũ (hỏi nhóm trước khi chạy) |
| Hết thời gian | Trung bình | Cao | Thứ tự ưu tiên cứng: GĐ0 → GĐ1 → GĐ2 là **bắt buộc**; GĐ3 câu hỏi 2 và GĐ4 cross-sell/cache có thể cắt |

### 10. Nếu chỉ còn thời gian cho 3 việc

1. **GĐ0 toàn bộ** — không có nó thì không có demo.
2. **Harness GĐ2 với hai track repeat/explore** — không có nó thì không có con số nào bảo vệ được.
3. **UTC + `user_id` + chống view giả (GĐ1)** — không có nó thì luận điểm "data sạch → AI" không đứng được.
