# Kế hoạch thực thi — Behavior Encoder cho hệ TMĐT

> **Plan này làm gì, nói một câu:** học **một** biểu diễn từ chuỗi hành vi người dùng, đánh giá nó
> trên bài toán có tín hiệu đo được (dự đoán item kế tiếp), rồi dùng **chính biểu diễn đó** cho
> cổng kích hoạt campaign trong hệ Camunda đã xây.
>
> Nền lý thuyết: [`recsys-research-and-plan.md`](recsys-research-and-plan.md).
> Bối cảnh & số đo cũ: [`churn-risk-log.md`](churn-risk-log.md).

---

## 1. Vì sao plan này, chứ không phải benchmark model gợi ý

Mục đích ban đầu của đồ án: *hành vi người dùng → AI hiểu → hệ thống hành động*. Bốn việc đã đo
được và định hình plan này:

| Đã đo | Hệ quả |
|---|---|
| Feature **tổng hợp** từ hành vi (11 cột `GROUP BY user`) → rule 1 ngưỡng bắt kịp | Vấn đề không phải model, mà là **cách biểu diễn hành vi**: gộp chuỗi thành vài con số làm mất thông tin |
| RetailRocket: **3 loại event**, 1,56 event/phiên → thứ tự rỗng | Không đo được thứ tự trên chuỗi quá ngắn và quá nghèo ký hiệu — kết luận về **RetailRocket**, không phải về hành vi người dùng nói chung |
| **REES46 Cosmetics Shop có `remove_from_cart` thật** *(phát hiện 2026-09-17)* | Bộ công khai **đầu tiên** có tín hiệu "đổi ý" — giả thuyết thứ tự **kiểm lại được trên dữ liệu thật**, không cần chờ traffic riêng. Xem §5.2 |
| Tracker của dự án: **19 loại action** (`FE_BEHAVIOR_ACTIONS`) | Vẫn giàu nhất, nhưng **không còn là bộ duy nhất có tín hiệu ma sát** — REES46 Cosmetics đã có 1 loại thật |
| Gợi ý: đồng-xuất-hiện hơn popularity **22,5×** | Có bài toán mà tín hiệu hành vi **đo được rõ ràng** |

⇒ Thay vì hỏi *"model nào tốt nhất"*, plan hỏi: **biểu diễn hành vi dạng CHUỖI có hơn dạng TỔNG
HỢP không, và hơn bao nhiêu.** Đó là câu hỏi thuộc về đồ án này, và đã có sẵn mốc để so.

---

## 2. Kiến trúc — một encoder, hai đầu ra

```
        CHUỖI HÀNH VI của user
   (action_type, item, Δt, weight) × T
                  │
                  ▼
        ┌───────────────────┐
        │ BEHAVIOR ENCODER  │   eSASRec-style, action-aware
        │  → trạng thái h_t │
        └───────────────────┘
             │           │
   ┌─────────┘           └──────────┐
   ▼                                ▼
ĐẦU 1: Next-item              ĐẦU 2: Intent / Risk
xếp hạng toàn catalog         P(không mua trong N ngày)
   │                                │
   ▼                                ▼
recs-service                  Kafka user-risk-events
FE "Gợi ý cho bạn"            → Camunda → voucher
                              (Trigger_Event_ChurnRisk,
                               Condition_ChurnRiskTier
                               — ĐÃ CÓ, không sửa)
```

**Vì sao một encoder hai đầu:** đầu 1 có tín hiệu dồi dào và **đo được** (22,5× so với baseline) nên
nó *huấn luyện* biểu diễn; đầu 2 là thứ hệ thống cần nhưng nhãn thưa và yếu. Đây là lý do kỹ thuật
để học biểu diễn ở nơi có tín hiệu rồi dùng lại ở nơi thiếu tín hiệu.

**Hệ thống Camunda không bị đụng vào.** Đầu 2 chỉ thay nguồn sinh ra `churnProbability`; hợp đồng
Kafka và các node BPMN giữ nguyên.

---

## 3. Feature space — ba tầng, khai báo rõ

Đây là phần bản plan trước thiếu hẳn.

### Tầng 1 — Token hành vi (đầu vào chuỗi)

Mỗi vị trí trong chuỗi **không phải** chỉ một item, mà là một bộ:

| Thành phần | Nguồn | Ghi chú |
|---|---|---|
| `action_type` | 19 loại của tracker · 3 loại ở RetailRocket | **Đây là chiều mà đa số model gợi ý bỏ qua** |
| `item_id` | — | null với action không gắn item (`SEARCH`, `TAB_HIDDEN`…) |
| `Δt` (rời rạc hoá) | khoảng cách tới event trước **trong phiên** | phân biệt "liền kề" thật với khe 3 tuần |
| `weight` (rời rạc hoá) | cột `weight` sẵn có | % scroll, giây dwell |

Embedding đầu vào = `emb(item) + emb(action) + emb(Δt) + emb(weight) + positional`.

### Tầng 2 — Nội dung item (chống cold-start)

| Dataset | Có gì |
|---|---|
| Amazon | `title + description + category + price` → sentence encoder nhỏ (MiniLM) |
| RetailRocket | **chỉ** cây category + giá + `available` (thuộc tính khác bị hash) |
| Catalog riêng | text tiếng Việt thật, 1.123 SP |

Mục đích: item chưa ai mua vẫn có biểu diễn. **Rule không có cách nào gợi ý item chưa ai mua** —
đây là luận điểm độc lập với thắng thua metric tổng.

### Tầng 3 — Thống kê dân số (thứ rule không diễn đạt được)

Tỉ lệ bỏ giỏ / chuyển đổi theo **item** và theo **category**, tính **out-of-fold và chỉ dùng dữ
liệu trước mốc hiện tại**.

Không ai viết tay nổi bảng tra 235k item. Đây là khác biệt về **năng lực biểu diễn**, không phải về
độ chính xác.

⚠️ Tầng 3 là nguồn rò rỉ nguy hiểm nhất trong toàn bộ plan — bắt buộc time-causal, và phải kiểm tra
bằng đối chứng âm.

### Cái được thay thế

Feature đạo hàm (Δrecency, Δfrequency giữa các mốc) từng bị loại nhầm ở giai đoạn churn. **Encoder
chuỗi làm chúng thành thừa** — sự thay đổi theo thời gian nằm sẵn trong chuỗi, không cần đẽo tay.
Đây là một luận điểm của báo cáo, không phải chi tiết kỹ thuật.

---

## 4. Đặc tả huấn luyện

### 4.1 Tiền huấn luyện — đầu Next-item

| | |
|---|---|
| Đầu vào | chuỗi token hành vi tới thời điểm *t* |
| Target | item của tương tác kế tiếp |
| Loss | **Sampled Softmax**, 256 negatives (KHÔNG dùng BCE) |
| Augmentation | **sliding window** — đòn bẩy lớn nhất đã đo (~+34% Recall@10) |
| Backbone | eSASRec: `d=256`, 2–4 block, 2–8 head, maxlen 50–200, LiGR layer (pre-norm, cổng sigmoid, SwiGLU `ff_mult=4`) |
| Optim | lr `0,001`, batch `128`, dropout 0,1–0,3, 100 epoch, early stopping patience 10–50 |

### 4.2 Đầu Risk — gắn lên encoder đã học

| | |
|---|---|
| Đầu vào | `h_t` từ encoder |
| Target | nhãn bỏ giỏ / không mua trong cửa sổ N |
| Hai chế độ | (a) **đóng băng** encoder + head tuyến tính · (b) fine-tune toàn bộ |
| Hiệu chỉnh | isotonic — **bắt buộc**, vì đầu ra nuôi `Condition_ChurnRiskTier` theo dải xác suất |

Chế độ (a) là phép đo sạch nhất cho câu hỏi *"biểu diễn học từ next-item có mang thông tin về ý
định mua không"* — nếu head tuyến tính trên biểu diễn đóng băng đã bắt kịp model feature phẳng thì
kết luận rất mạnh.

### 4.3 Mốc phải vượt — đã đo sẵn, không cần dựng lại

Từ thí nghiệm bỏ-giỏ RetailRocket đã chạy trong repo:

| Mốc | AUC |
|---|---|
| 1 feature tốt nhất | 0,6594 |
| Cây depth-2 (người viết tay được) | 0,6987 |
| Cây depth-6 (60 lá, máy tìm) | 0,7363 |
| **LightGBM trên feature phẳng** | **0,7462** ± 0,0111 |

⇒ **Đầu Risk phải vượt 0,7462 quá sàn nhiễu ±0,0111.** Đây là câu hỏi trung tâm của cả đồ án: *biểu
diễn chuỗi có hơn feature tổng hợp không?*

---

## 5. Dữ liệu

### 5.1 Ba nguồn ĐÃ TẢI VÀ ĐO THẬT (2026-09-17) — không còn dựa vào mô tả

| Tiêu chí | RetailRocket | **REES46 Cosmetics Shop** | **Taobao UserBehavior** |
|---|---|---|---|
| Event | 2,76M | 20,7M (5 tháng công khai) | 100,15M |
| User | 1,41M | 370k (đo trên 1 tháng) | 988k |
| Item | 235k | 44,6k (1 tháng) | 4,16M |
| **Median event/user** | 1 | 2 | **75** |
| % user ≥5 | 5,8% | 24,6% | **99,8%** |
| **Số loại hành vi** | 3 | **4 — có `remove_from_cart`** | 4 (pv/cart/fav/buy) |
| Median event/item | 3 | 25 | 3 |
| Nội dung item đọc được | ❌ hash toàn bộ | ✅ category/brand/giá là text/số thật | ❌ chỉ category id |
| Session tường minh | phải suy (heuristic 30 phút) | ✅ có sẵn | — |
| **Khoảng thời gian THẬT** | 138 ngày | **152 ngày** (Oct 2019–Feb 2020) | **~9 ngày** ⚠️ |
| **Cổng (5 tiêu chí)** | 1/5 | **4/5** | 2/3 *(mật độ ✅, hành vi ✅, thời gian ❌)* |

**Không nguồn nào đạt cả 5/5.** Đây là thực tế cấu trúc, không phải tìm chưa đủ — dữ liệu công khai
được thu cho mục đích khác, không ai thiết kế sẵn cho đúng bài toán của đồ án này.

#### ⚠️ Bài học phương pháp: đo khoảng thời gian bằng min/max là SAI, phải vẽ phân phối

Lần đầu đo Taobao bằng min/max: **49.280 ngày** (1902→2037) — do vài dòng epoch lỗi kéo lệch biên.
Lần hai lọc theo phân vị năm: **285,75 ngày** — đỡ hơn nhưng vẫn sai. Chỉ khi đếm event **theo từng
ngày** mới lộ ra sự thật: **98,77% event nằm đúng cửa sổ Taobao công bố (25/11–3/12/2017, ~9 ngày)**,
phần còn lại (1,23%) là rác rải rác. Bài học: **không bao giờ tin min/max hay phân vị cho câu hỏi
"khoảng thời gian" — phải vẽ phân phối theo thời gian rồi mới kết luận.**

### 5.2 Phân vai — mỗi nguồn đóng đúng trục nó mạnh nhất

| Nguồn | Vai trò | Vì sao |
|---|---|---|
| **Taobao UserBehavior** | **bộ chính cho encoder chuỗi** (mật độ + bảng chữ cái) | 75 event/user, 4 loại hành vi ⇒ chiều `action_type` ở tầng 1 mới có gì để học. Span chỉ 9 ngày ⇒ **không dùng để đo giao thức chia theo thời gian dài** |
| **REES46 Cosmetics Shop** | **bộ để kiểm lại giả thuyết THỨ TỰ** trên dữ liệu thật | Có `remove_from_cart` — chuỗi `cart → remove → cart` mang ý nghĩa "đổi ý" mà bigram 3 ký hiệu không biểu diễn được. Đây là bộ công khai ĐẦU TIÊN đóng được lỗ hổng này, không cần chờ traffic tracker riêng |
| **RetailRocket** | chỉ cho phép so bỏ-giỏ (đối chiếu lịch sử) | Giữ vì **mốc 0,7462 đã đo sẵn ở đó** — giá trị nằm ở tính liên tục với công việc cũ, không ở chất lượng dữ liệu |
| **TAOBAO-MM** *(nếu đi xa nhất)* | bộ sát production nhất | chuỗi tới 1.000, có impression, embedding 128-d dựng sẵn. 139 GB — D: còn đủ chỗ. Apache 2.0. **Chưa tải** |
| **Amazon Reviews 2023** | nội dung item + cold-start | text phong phú, so được với tài liệu. **Chưa tải** |
| **Seeder 18 action** | hệ thống chạy thật + demo | **KHÔNG dùng để kết luận** — tự sinh thì đo là vòng tròn |

**Nguyên tắc bất di bất dịch:** mọi số trong báo cáo đến từ **dữ liệu thật**.

### 5.3 ✅ KẾT QUẢ — giả thuyết thứ tự được xác nhận trên dữ liệu thật (2026-09-17)

Chạy `cosmetics_build_dataset.py` + `cosmetics_order_test.py` trên tháng 12/2019 (tháng nhiều
`remove_from_cart` nhất): **926.476 mẫu bỏ giỏ, 83.311 user, bỏ giỏ 77,0%** — quy mô gấp **13×**
RetailRocket. Giao thức: 25 fold ghép cặp (5 lượt × 5 fold), chia theo `user_id`.

| Cấu hình | AUC |
|---|---|
| A — không thứ tự (17 feature) | 0,6376 ± 0,0045 |
| **A + B_SESS — có thứ tự (40 feature, bigram trong `user_session` THẬT)** | **0,6443 ± 0,0051** |
| A + B_SESS đã xáo *(đối chứng âm)* | 0,6375 ± 0,0044 |

| | Δ ghép cặp | Fold dương | Nhận |
|---|---|---|---|
| **Thứ tự thật** | **+0,00666 ± 0,00203** | **25/25** | ✅ |
| Đối chứng âm | −0,00009 ± 0,00052 | 44% | ❌ sạch |

**Hiệu ứng lớn gấp 3,3× sai số của chính nó, dương ở mọi fold.** Đây là bằng chứng đầu tiên trên
DỮ LIỆU CÔNG KHAI THẬT rằng thứ tự hành vi mang thông tin — khác hẳn RetailRocket (ΔAUC = +0,0000,
null thật vì chỉ 3 ký hiệu). Khác biệt duy nhất giữa hai bộ: **`remove_from_cart`** — bigram
`cart→remove→cart` mã hoá "đổi ý", điều 3 ký hiệu không biểu diễn được.

### 5.4 ✅ XÁC NHẬN BỀN VỮNG — mở rộng ra cả 5 tháng (2026-09-18)

Nghi vấn "có thể chỉ là đặc thù tháng 12 (Black Friday/Giáng sinh)" đã được kiểm — **sai**. Gộp cả
5 tháng (Oct 2019 – Feb 2020, xử lý TỪNG THÁNG rồi nối lại để an toàn bộ nhớ — xem ghi chú kỹ thuật
trong `cosmetics_build_dataset.py`):

| | Tháng 12 lẻ (926K mẫu) | **5 tháng gộp (5,76M mẫu, 397.575 user)** |
|---|---|---|
| AUC không thứ tự | 0,6376 | 0,6584 |
| AUC có thứ tự | 0,6443 | **0,6659** |
| Δ ghép cặp | +0,00666 ± 0,00203 | **+0,00749 ± 0,00113** |
| Fold dương | 25/25 | 5/5 |
| \|Δ\|/std | 3,3× | **6,6×** |
| Đối chứng âm | −0,00009 ± 0,00052 | **−0,00001 ± 0,00005** (sạch hơn) |

Tỉ lệ bỏ giỏ ổn định 75,9%–80,9% qua cả 5 tháng, không tháng nào lệch bất thường. **Hiệu ứng "đổi ý"
(`cart → remove_from_cart`) là thật và bền vững**, không phải nhiễu một tháng.

⚠️ **Đánh đổi kỹ thuật cần nói rõ:** vì lý do an toàn bộ nhớ (máy chỉ 16GB RAM, ứng dụng khác đã
chiếm phần lớn), mỗi tháng được xử lý **độc lập** — `cum_*` (số đếm luỹ tiến) là "trong tháng đang
xét", không phải "từ đầu lịch sử toàn bộ 5 tháng". Session vốn đã luôn ngắn hơn 1 tháng nên không
ảnh hưởng gì; đây thực chất là phép đo **sạch hơn** cho câu hỏi hiện tại (5 tháng = 5 lượt lặp lại
độc lập để kiểm tính bền vững, thay vì 1 mẫu dồn chung có thể lẫn hiệu ứng chuyển tiếp giữa các tháng).

#### Permutation importance — xác nhận lại trên 5 tháng, cùng kết luận

| | Tháng 12 (926K mẫu) | **5 tháng (5,76M mẫu)** |
|---|---|---|
| Feature mạnh nhất | `sess_cum_bg_2_3` (cart→remove) | **`sess_cum_bg_2_3`** — cùng feature |
| Giá trị | 0,01711 | 0,01358 |
| Gấp feature thứ 2 | 5× | 2,3× (thứ 2: `2_2`, tự lặp cart, 0,00581) |
| Số cụm tương quan (từ 23 feature) | 21 | 20 — vẫn gần độc lập |
| Feature liên quan `purchase` | ~0 | ~0, vài số âm nhỏ |

Bigram `cart → remove_from_cart` **vẫn là tín hiệu mạnh nhất** ở quy mô gấp 6,2× — không phải nhiễu
ngẫu nhiên trúng một tháng. Permutation theo cụm khớp gần như tuyệt đối với permutation theo cột
(chênh lệch lớn nhất < 0,0004) — cấu trúc liên kết y hệt tháng 12: một trục trung tâm
(`cart↔remove_from_cart`), phần còn lại là biến thể yếu hơn cùng cơ chế "đổi ý".

⚠️ **Giới hạn còn lại:** (1) độ lớn tuyệt đối vẫn khiêm tốn — AUC tăng 0,0075–0,0067, không phải
bước nhảy; (2) chưa so với rule (cây depth-1/2/3/6) để biết rule có hưởng lợi được từ thứ tự hay
không — theo yêu cầu, KHÔNG làm phép so này (mục tiêu hiện tại là "feature có giá trị và liên kết
với nhau", không phải "AI hơn rule").

### 5.5 Khoảng cách với production mà KHÔNG bộ công khai nào lấp được

Phải nêu thẳng ở mục giới hạn của báo cáo:

| Thiếu | Hệ quả |
|---|---|
| **Impression** (cái gì đã hiển thị mà không được click) | Chỉ học được từ positive; không học được *"đã đưa ra mà bị từ chối"*. Chỉ MIND và TAOBAO-MM có |
| **Counterfactual / vòng phản hồi** | Log sinh ra **bởi một recommender**; offline không đo được điều gì xảy ra nếu đổi model. Không ai giải được offline |
| **Ngữ cảnh** | Thiết bị, giá tại thời điểm xem, tồn kho, khuyến mãi đang chạy |
| **Độ tươi** | RetailRocket 2015, Taobao 2017 |

Đây là giới hạn **của cả ngành** — mọi công trình được trích (TIGER, HSTU, eSASRec) đều đo trên
đúng những bộ này.

### 5.6 Thứ dự án này có mà không bộ công khai nào có

| | Số loại hành vi |
|---|---|
| RetailRocket | 3 |
| REES46 Cosmetics / Taobao UserBehavior | 4 (1 loại có ý nghĩa ma sát: `remove_from_cart`) |
| **Tracker của dự án** | **18**, gồm nhiều tín hiệu ma sát: `VIEW_SHIPPING_FEE`, `COUPON_FAILED`, `TAB_HIDDEN`… |

Vẫn giàu nhất, nhưng khoảng cách với REES46 Cosmetics đã hẹp lại đáng kể so với lúc so với
RetailRocket (3 loại, không loại nào mang ý nghĩa ma sát).

➕ **Việc bổ sung, làm ở tuần 5: log IMPRESSION.** Tracker hiện **chưa** ghi *"những item nào đã
được hiển thị"*. Thêm vào rẻ (một action type mới + danh sách item id), và nó lấp đúng khoảng cách
số 1 ở mục 5.3. Sau bước đó, dữ liệu của dự án **về chất** gần production hơn mọi bộ công khai trừ
TAOBAO-MM — dù về lượng thì nhỏ hơn nhiều. Đây là điểm đáng nêu khi bảo vệ.

### 5.7 ⚠️ KẾT QUẢ ÂM — SASRec platform_v1 thua cả recency baseline tầm thường (2026-09-21)

Đã train thử SASRec (`training/experiments/recsys_platform_sasrec.py`) trên dữ liệu **THẬT** của
platform (`ecommerce_order_db.user_events`: 501 user, 64.571 sự kiện view/cart, 20.139 item) —
không phải REES46 Cosmetics — để nối vào `recs-service` (item index thật, `item_id_map` khớp
`Product.id`, xem thảo luận kiến trúc trong `AI/recs-service/app/services/sasrec.py`).

| Chiến lược | recall@10 | recall@20 |
|---|---|---|
| Popularity (toàn cục) | 0,0020 | 0,0020 |
| **SASRec (platform_v1)** | 0,1976 | 0,2255 |
| **Recency — "gợi ý lại item vừa xem", không cần model** | **0,2754** | **0,3034** |

SASRec thắng Popularity ~100 lần trông ấn tượng, nhưng **thua một quy tắc không học gì cả**
("recommend lại item vừa xem, khử trùng lặp"). Popularity toàn cục là baseline yếu cho đúng kiểu
dữ liệu này (bỏ qua lịch sử cá nhân), nên thắng nó không chứng minh SASRec học được gì.

**Chẩn đoán**: seeder khiến user quay lại đúng vài sản phẩm cũ rất thường xuyên — 20,6% target
trùng 1-trong-3 item xem gần nhất, 23,75% trùng 1-trong-5 (đo trực tiếp trên dữ liệu). Tín hiệu
"vừa xem gần đây" áp đảo bất kỳ pattern chuỗi nào ở quy mô 501 user — cùng bài học đã đo trên
RetailRocket (dữ liệu quá nghèo/ít khiến chuỗi không có thông tin hơn heuristic đơn giản), lần này
lặp lại trên chính dữ liệu tổng hợp của đồ án.

**Quyết định (lúc đó)**: KHÔNG deploy checkpoint SASRec platform_v1 này vào `recs-service`
(`is_ready()` sẽ từ chối nạp cho tới khi có checkpoint thật sự vượt qua baseline recency). Dùng
**recency** (`app/services/recency.py`) làm tầng cá nhân hoá mặc định. Đây là kết quả âm có giá
trị cho báo cáo: xác nhận lần thứ 2 (RetailRocket, rồi platform seed) rằng quy mô/chất lượng dữ
liệu — không phải kiến trúc model — là yếu tố quyết định chuỗi hành vi có thông tin hơn heuristic
tầm thường hay không.

### 5.8 ✅ SỬA GỐC RỄ — đo quy luật hành vi thật, viết lại bộ mô phỏng, train lại (2026-09-22)

Thay vì chấp nhận kết quả âm ở 5.7 là điểm dừng, đã truy ra NGUYÊN NHÂN: `tools/data-seed/lib/
simulate.mjs` (bản cũ) viết CỐ ĐỊNH "mỗi đơn hàng luôn sinh 1 sự kiện VIEW rồi NGAY SAU ĐÓ 1 sự
kiện ADD_TO_CART cho ĐÚNG CÙNG sản phẩm" (dòng 108-109/138-139 bản cũ) — đây là khuôn mẫu code
cứng, không phải hành vi có cấu trúc. Recency baseline không "học" gì — nó khai thác đúng lỗ hổng
này. Dữ liệu bị lỗi ở tầng sinh ra, không phải ở tầng model.

**Cách sửa**: đo trực tiếp cấu trúc phiên duyệt web trên REES46 Cosmetics — dữ liệu người dùng
THẬT, 5 tháng, 4.513.080 phiên (`recsys_measure_behavior_patterns.py`) — CHỈ lấy thống kê KHÔNG
PHỤ THUỘC catalog cụ thể (không bê nguyên ma trận category→category vì catalog mỹ phẩm của REES46
khác hẳn catalog điện thoại/laptop của platform):

| Chỉ số đo trên REES46 thật | Giá trị | Bản cũ của seeder |
|---|---|---|
| % thêm giỏ KHÔNG có view trước trong cùng phiên | 78,7% | 0% (luôn ép có view trước) |
| % thêm giỏ đúng item VỪA xem | 17,5% | 100% (ép cứng) |
| % sự kiện kế tiếp CÙNG category với sự kiện trước | 63,4% | Không mô hình hoá (mỗi lượt độc lập) |
| Độ dài phiên (median / mean) | 1 / 3,70 sự kiện | Không có khái niệm phiên nhiều sự kiện thật |

Viết lại `simulate.mjs` dùng ĐÚNG các con số này (lấy mẫu theo phân vị thực đo được, không fit
họ phân phối tham số áp đặt) để lái nội dung mỗi phiên, đồng thời **giữ nguyên** động lực
churn/lambda theo tháng đã validate trước đó (không đụng vào phần đã đúng). Kiểm chứng bằng test
độc lập (catalog giả) trước khi chạy seeder thật; phát hiện và sửa thêm 1 bug khi kiểm chứng
(timestamp không đảm bảo tăng dần → làm loãng số đo category-stickiness).

**Kết quả sau khi seed lại** (500 user, 155.431 sự kiện — quy luật thật, không phải luật tay):

| | Trước sửa | Sau sửa |
|---|---|---|
| Tỉ lệ item lặp liên tiếp | 8,82% | **3,26%** |
| Target trùng item vừa xem | 14,57% | **3,19%** |
| Recency baseline recall@10 | 0,2754 | **0,1118** |
| **SASRec (platform_v1) recall@10** | 0,1976 (thua recency 30%) | **0,1058 (gần NGANG recency 0,1118 — lệch trong khoảng nhiễu, n=501)** |

**Ý nghĩa**: sau khi loại bỏ lợi thế giả tạo của recency (do lỗi sinh dữ liệu), SASRec không còn
thua xa nữa mà đạt **sát ngang** — tức là model đang học được lượng thông tin **tương đương**
heuristic đơn giản, thay vì bị heuristic bỏ xa. Đây là bằng chứng cho thấy kết luận ở 5.7 (SASRec
"thua") một phần là do lỗi tầng dữ liệu, không hoàn toàn do bản chất bài toán — vẫn KHÔNG đủ để
kết luận SASRec THẮNG (chênh lệch quá nhỏ so với n=501), nhưng là một kết quả trung thực hơn hẳn
để đưa vào báo cáo, và là minh chứng cụ thể cho luận điểm "chất lượng dữ liệu quyết định, không
phải kiến trúc model".

### 5.9 🔄 Mở rộng đủ 19 hành vi + cross-validate bằng Taobao (2026-09-22 → 2026-09-25, đang tiếp tục)

**Bối cảnh**: sau 5.8, user chỉ ra 2 việc còn thiếu trước khi tin dùng bộ sinh dataset: (1) seeder
chỉ sinh 2/19 loại hành vi (VIEW/CART) dù tracker đã theo dõi đủ 19 loại — không phản ánh đúng luận
điểm "bảng chữ cái hành vi giàu" mà cả đồ án dựa vào; (2) 5 con số cốt lõi ở 5.8 chỉ đo từ **1**
dataset thật (REES46) — cần cross-validate bằng nguồn độc lập thứ 2 trước khi tin dùng.

**Việc đã làm**:

1. **Mở rộng `simulate.mjs` lên đủ 19 hành vi** — thêm REMOVE_FROM_CART (đúng bigram đã chứng minh
   mang thông tin ở §5.3), IMPRESSION, UPDATE_CART_QTY, CLEAR_CART, VIEW_CART, BEGIN_CHECKOUT,
   VIEW_SHIPPING_FEE, COUPON_APPLIED/FAILED, TAB_HIDDEN/VISIBLE, SCROLL_DEPTH, PAGE_DWELL,
   PRODUCT_ZOOM, SEARCH, FILTER_APPLIED, SORT_APPLIED — gắn đúng vị trí trong phễu mua hàng
   (`sessionKind`: order/abandon/pureview quyết định funnel sau khi thêm giỏ). Sửa thêm
   `writeData.mjs` (thiếu cột `weight`, cần cho SCROLL_DEPTH/PAGE_DWELL) và `catalog.mjs` (thêm
   map `byId`). Validate bằng test độc lập (catalog giả 10 category): đủ cả 19 loại xuất hiện,
   không có event lỗi kiểu dữ liệu, category-stickiness/cart-target vẫn khớp thiết kế.

2. **Đo cross-validate bằng Taobao UserBehavior** (dataset thật thứ 2, đã có sẵn: 100.150.807 sự
   kiện, không có `session_id` thật nên phải suy luận phiên bằng ngắt quãng 30 phút — xem
   `recsys_measure_behavior_patterns_taobao.py`). Kết quả đầy đủ (16.574.600 phiên suy luận):

   | Chỉ số | REES46 (phiên thật) | Taobao (phiên suy luận) | Quyết định |
   |---|---|---|---|
   | Độ dài phiên median/mean | 1 / 3,70 | 3 / 6,04 | Giữ REES46 (phụ thuộc ranh giới phiên, Taobao suy luận nên dài hơn máy móc) |
   | % cart không có view trước | 78,7% | 84,5% | Lệch <10 điểm % → giữ REES46 |
   | % cart = item vừa xem | 17,5% | 1,6% | Giữ REES46 (phụ thuộc ranh giới phiên) |
   | % cùng category với sự kiện trước | 63,4% | 47,1% | **Đổi**: trung bình có trọng số theo số quan sát = 49,2% (Taobao có ~7× số quan sát) |

   → Chỉ `P_SAME_CATEGORY` đổi (0,6343 → 0,4921), các tham số khác giữ nguyên vì lệch do suy luận
   phiên (nhiễu kỹ thuật), không phải khác biệt hành vi thật.

3. **Seed lại + validate lại nhiều vòng** (2000 user, ~3,1 triệu sự kiện — quy mô lớn hơn 4× lần
   đo ở 5.8 vì 19 hành vi sinh ra nhiều sự kiện/user hơn hẳn 2 hành vi cũ, ~17,79 event/phiên).
   Negative control vẫn giữ nguyên kết luận ở quy mô lớn hơn: lặp liên tiếp 3,07% (so với 3,26% ở
   5.8), recency baseline recall@10=0,1179 (so với 0,1118) — **ổn định, không phải may rủi của mẫu
   nhỏ n=501**.

4. **Sự cố kỹ thuật gặp phải** (ghi lại để không lặp lại): quá trình đo Taobao (100 triệu dòng,
   ~35-45 phút) bị dừng dở 2 lần do phiên làm việc kết thúc giữa chừng (không phải RAM) — script
   không có checkpoint, phải chạy lại từ đầu cả 2 lần. Sau đó RAM hệ thống thật sự xuống mức nguy
   hiểm (thấp nhất 0,46GB, dưới cả mốc crash 0,71GB từng gặp) do tải chung từ nhiều ứng dụng khác
   (VSCode, Chrome, Docker/WSL2) cộng dồn — đã yêu cầu user đóng bớt ứng dụng, không tự ý kill tiến
   trình không rõ chủ (Docker/Java/Node khác). Một lần kill nhầm chính tiến trình `node seed.mjs`
   đang ghi dữ liệu (tưởng là rò rỉ vì WorkingSet hiện số âm — thực ra là lỗi hiển thị tràn số của
   PowerShell khi tiến trình dùng >2GB), làm seed dở dang (114/5.000 user) phải xoá và chạy lại.

**Đang làm (tại thời điểm ghi log này)**: train lại SASRec platform_v1 trên dữ liệu 2000-user mới
với **nhiều seed khác nhau** (thay vì 1 lần chạy duy nhất như 5.7/5.8) để tính khoảng tin cậy
(bootstrap CI) cho so sánh SASRec vs recency, theo yêu cầu làm sâu hơn về mặt thống kê thay vì chỉ
nhìn 1 điểm số rồi kết luận "trong khoảng nhiễu" bằng cảm tính. Script đã sửa để nhận `SEED` qua
biến môi trường và lưu kết quả từng user (`per_user_hits`) phục vụ bootstrap. Kết quả seed đầu tiên
(42) bị ngắt ở epoch 20/30 do phiên làm việc kết thúc — đang chạy lại.

**2026-09-30 — tiếp tục sau 5 ngày gián đoạn**:

- **Mất kết quả**: scratchpad tạm của phiên (nơi lưu JSON seed 42/123 và kết quả đo Taobao) đã bị
  dọn sạch sau nhiều ngày. Số liệu đã ghi ở trên (seed 42: recall@10=0,1154/@20=0,1834; seed 123:
  0,1224/0,1829) vẫn còn trong log này, nhưng file `per_user_hits` cần cho bootstrap thì mất → phải
  train lại. **Bài học đã áp dụng**: kết quả giờ lưu vào `data/experiment-results/platform_sasrec/`
  (gitignore, bền vững), không dùng scratchpad nữa.
- **Đối chiếu 2 script đo REES46 độc lập**: trong thời gian gián đoạn, một phiên làm việc khác viết
  `recsys_behavior_stats.py` đo cùng dữ liệu (ghi ở §10, ra "cart khớp item đã xem = 21,96%") — lệch
  với số 17,5% ở trên. Đọc code 2 script: **không mâu thuẫn, chỉ khác định nghĩa** — script kia đếm
  "cart trùng item đã xem BẤT KỲ đâu trong phiên" (chỉ `cart`); script ở đây tách thành "trùng item
  vừa xem gần nhất" (17,5%) + "trùng item khác đã xem" (3,9%) = **21,4%** (tính cả `purchase`).
  Category-stickiness cả 2 đều ra 63,4%. → 2 cách viết code độc lập cho cùng kết quả, thêm 1 lớp
  kiểm chứng cho tham số đang dùng.
- **Sửa quy trình đánh giá cho đúng chuẩn**: `recsys_platform_sasrec.py` giờ tính **luôn recency trên
  đúng cùng user/target** trong cùng 1 lần chạy và lưu `recency_per_user_hits` bên cạnh
  `per_user_hits` của SASRec → bootstrap CI là **so sánh cặp (paired)** thật, không ghép số từ 2
  script khác nhau. Thêm `recsys_platform_bootstrap_ci.py` (paired bootstrap trên user, B=1000,
  CI 95% cho hiệu SASRec−Recency mỗi seed + trung bình/độ lệch chuẩn qua các seed) và
  `run_platform_multiseed.sh` (**chạy tiếp được khi bị ngắt** — seed nào đã có kết quả thì bỏ qua).
- **Giám sát RAM**: thay cơ chế hẹn giờ kiểm tra thưa (5-15 phút/lần — đã để lọt 1 lần RAM tụt từ an
  toàn xuống 1,48GB giữa 2 lần kiểm tra) bằng watchdog chạy liên tục (kiểm tra mỗi 5 giây, tự kill
  tiến trình train nếu RAM < 1,5GB).

**2026-09-30 (tiếp) — đổi hướng: kiểm chứng DATASET bằng phép đo rẻ, train nặng để dành GPU**

User nhắc lại đúng phạm vi đã giao: *làm chuẩn tool sinh dataset; bước train nặng thì thuê GPU*.
Lượt train SASRec 3 seed đang chạy (~2,8 giờ/seed trên CPU — batch 32 + Adam cập nhật đặc toàn bộ
bảng embedding 32.586 item mỗi bước, đo được ~25ms cố định/bước) **đã dừng** — đưa vào danh sách
việc cho GPU. Kiểm chứng bộ sinh dữ liệu từ nay bằng **đo chính dữ liệu sinh ra**, không bằng train
model nhiều giờ.

Thêm vào tool (`tools/data-seed/`):
- `lib/behaviorTargets.mjs` — số đo thật + dung sai ở **1 chỗ duy nhất** (trước rải trong
  simulate.mjs, không có gì kiểm tra dữ liệu sinh ra thật sự đạt số đó).
- `lib/fidelity.mjs` — đo dữ liệu sinh ra bằng **đúng định nghĩa** đã đo REES46/Taobao, in bảng
  đạt/không đạt; chạy tự động mỗi lần seed (kể cả `--dry-run`, exit code 2 nếu không đạt).
- `test/` — 8 test `node --test` không cần DB: fidelity, tái lập theo seed, item_id có thật, edge-case
  (category 1 sản phẩm, catalog 1 category, 1 user/1 tháng), chống tái phát lỗi view→cart.
- `seed.mjs` sinh **theo lô user** (`--chunk`) — bộ nhớ không còn phình theo tổng số user (bản cũ dồn
  6,6 triệu sự kiện vào 1 mảng khi thử 5.000 user, node >2GB — đúng nguyên nhân 1 lần khủng hoảng RAM).

**Bộ đo phát hiện ngay 4 chỗ lệch** mà nhìn tham số không thấy (đo trên catalog giả cùng hình dạng
catalog thật, 300 user, chạy < 1 giây):

| Lệch (trước sửa) | Nguyên nhân trong code | Sau sửa (catalog THẬT, 500 user) |
|---|---|---|
| % cart không xem gì trước: 0% vs thật 42% | Luôn đặt lượt thêm giỏ SAU ≥1 lượt xem | 41,98% |
| Độ dài phiên median 2 vs 1 | Cùng nguyên nhân | 1 |
| Category-stickiness 0,647 vs 0,492 | Nhánh "đổi category" bốc trúng lại category cũ ngẫu nhiên | 0,4998 |
| % cart = item khác đã xem 1,1% vs 3,85% | Nhánh này cần ≥2 item đã xem — thiếu xác suất có điều kiện; dung sai ±5 điểm % cố định quá lỏng nên không bắt được | 3,96% (dung sai giờ tương đối với tỉ lệ nhỏ) |

Mục cuối — **tỉ lệ xem mà không thêm giỏ**: đo thêm trên Taobao (mẫu 8 triệu sự kiện, 1,3 triệu phiên;
cart-target 1,58/13,8/84,6% và stickiness 0,4706 khớp gần tuyệt đối lần đo toàn bộ 100 triệu dòng →
mẫu đại diện tốt): **Taobao 98,59%** vs REES46 87,79%; tỉ lệ sự kiện Taobao: xem 89,5% · cart 5,6% ·
mua 2,0% · yêu thích 2,9%. Chênh lệch do **tỉ lệ cart/view toàn cục của ngành hàng** (mỹ phẩm giá rẻ
mua lặp ~1 cart/1,4 view; sàn tổng hợp ~1 cart/12 view) — không phụ thuộc cách cắt phiên nên không áp
quy tắc "ưu tiên phiên thật". **Chọn Taobao** cho chỉ số này: platform bán điện thoại/laptop (giá cao,
cân nhắc lâu) gần sàn tổng hợp hơn shop mỹ phẩm. Simulator vốn đã sinh 98,35% → không phải đổi volume
sự kiện (vốn gắn với đặc trưng churn đã hiệu chỉnh). *Có thể đảo quyết định nếu xác định platform giống
REES46 hơn — chỉ cần sửa 1 số trong `behaviorTargets.mjs`, bộ đo sẽ báo phần nào cần chỉnh.*

**Kết quả cuối của tool** (2026-09-30):
- `npm test`: **8/8 đạt** (không cần DB).
- `seed.mjs --dry-run` trên catalog THẬT (32.593 SP, 80 category): **16/16 mục độ trung thực đạt** —
  cart-target 17,37/3,96/78,68% (thật 17,48/3,85/78,67%), stickiness 0,4998 (thật 0,4921), % cart
  không xem trước 41,98% (thật 42%), bỏ dở 98,35% (thật-Taobao 98,59%), recency recall@10 = 0,10
  (bản lỗi cũ 0,2754).
- Mở rộng: **5.000 user → 7,44 triệu sự kiện, RAM tiến trình đỉnh 670MB** (bản cũ >2GB), độ trung thực
  vẫn 16/16 đạt ở quy mô này.

**Việc CHƯA làm** (nhắc lại thứ tự đã thống nhất: sửa seeder → xong recsys → **mới** retrain
churn-risk model — không đụng vào churn cho tới khi phần này xong hẳn):
- ~~Test edge-case cho simulator~~ — xong (test/simulate.test.mjs).
- ~~Seed lại DB bằng bộ sinh đã sửa~~ — xong 2026-09-30: 1.000 user, 1.498.818 sự kiện, 7.163 đơn,
  2.202 review, fidelity 16/16; cả xoá dữ liệu cũ lẫn ghi chỉ mất **7 phút** (trước sửa: >2,8h cho 5.000
  user). Truy vấn kiểm tra trên DB: 0 sự kiện/review ở tương lai, 0 đơn lặp sản phẩm.
- **Để dành GPU** (không chạy trên máy local — xem memory "train nặng để dành GPU"): train SASRec
  platform_v1 nhiều seed + bootstrap CI SASRec vs Recency (hạ tầng đã sẵn: `run_platform_multiseed.sh`,
  `recsys_platform_bootstrap_ci.py`, recency tính cùng user trong 1 lần chạy); REES46 full-spec; ablation.
  Nên cân nhắc tăng batch/dùng embedding thưa trước khi thuê (đo được: batch 256 nhanh ~3,6×; Adam
  cập nhật đặc toàn bảng embedding tốn ~25ms cố định/bước) — kiểm tra hội tụ tương đương trước.

#### 2026-09-30 (chiều) — DB không chịu nổi quy mô train → tách "DB cho app, FILE cho train"

**Sự cố khi seed thật 5.000 user vào DB** (dry-run ước ~20 phút, thực tế ~2,8h và chưa xong):
- Ghi chỉ ~7–8 nghìn dòng/phút. Nguyên nhân đo được: MariaDB Docker dùng buffer pool mặc định
  **128MB** (index `user_events` lớn hơn nhiều → mỗi insert đọc đĩa), đĩa ảo Docker ~85 lần đọc/giây,
  và `session_id` ngẫu nhiên (UUID) làm insert rải khắp B-tree.
- `--force` xoá 3,1 triệu dòng bằng **1 câu DELETE** = 1 transaction InnoDB khổng lồ (~52K dòng/phút,
  >1h), sau đó InnoDB còn **purge nền** hàng giờ (~26K undo record/phút), làm chậm luôn lần ghi sau.

**Sửa trong tool**: xoá theo lô (`cleanupData.mjs`: 1.000 đơn / 20 user mỗi câu); session_id tuần tự
theo user (`seed-<user>-s00001`, insert gần như nối đuôi index — có test); lô insert 4.000 dòng
(28.000 tham số < giới hạn 65.535).

**Quyết định (người dùng chọn "DB vừa phải + xuất file cho train")**: DB chỉ seed ~1.000 user (đủ cho
demo app + churn); dữ liệu train lớn xuất file bằng chế độ mới `node seed.mjs --out <dir>` — không đụng
DB, tất định (`--now` cố định ⇒ chạy lại ra đúng từng byte, đã kiểm md5 cả 5 file), kèm `manifest.json`
(tham số, commit git, fidelity, snapshot mục tiêu). `recsys_platform_sasrec.py` đọc được file qua
`EVENTS_CSV=` (máy GPU không cần DB/pymysql) — đã chạy thử đầu-cuối.

**Kiểm tra toàn vẹn bắt được 3 lỗi CÓ SẴN của bộ sinh** mà báo cáo fidelity không nhìn thấy (ảnh hưởng
cả chế độ ghi DB), viết thành `validate_training_set.py` + 2 test chống tái phát (11/11 test đạt):

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Sự kiện SAU mốc "hiện tại" (11/296K) | Phiên bắt đầu sát `now` kéo dài qua mốc | Lọc phần sau `now` (phiên đang dở tại lúc chụp dữ liệu) |
| Review ở tương lai (13/430) | Review = ngày đơn + 1–14 ngày, không chặn | Bỏ review chưa tới ngày viết |
| 1 sản phẩm thành 2 dòng trong cùng đơn (11 đơn) | 2 phiên của cùng đơn tình cờ chọn cùng SP | Gộp số lượng như giỏ thật |

Cả 3 sửa đều lọc/gộp SAU khi rút số ngẫu nhiên → không đổi dòng RNG, các thống kê khác giữ nguyên.

**Tập train v1** (`data/training-sets/v1_20000u/`, gitignored): 20.000 user · **30.307.289 sự kiện** ·
1.727.009 phiên · 148.313 đơn · 44.741 review · 2,4GB CSV. Sinh 4,3 phút, RAM tiến trình đỉnh 1,0GB.
Fidelity **16/16 đạt** (cart-target 17,70/3,80/78,50% vs thật 17,48/3,85/78,67%; stickiness 0,4995 vs
0,4921; bỏ dở 98,27% vs 98,59%; recency recall@10 = 0,103). `validate_training_set.py` **ĐẠT** (3,5 phút,
RAM 0,5GB); số phiên đếm độc lập khớp đúng thống kê của bộ sinh.

**Chuẩn bị script train trước khi thuê — đo trên máy local với tập 20K thật, 20 bước train (2026-09-30)**

Mục đích: biết job thật sự cần gì để chọn máy đúng, và không để GPU đứng chờ CPU trong giờ thuê.

| Đo được | Trước sửa | Sau sửa | Cách sửa |
|---|---|---|---|
| Baseline Popularity | duyệt ~32K item/user (20K user ≈ 640 triệu vòng Python) | 2,7s | dừng khi đủ top-k |
| Dựng batch (6,16 triệu mẫu/epoch) | `__getitem__` Python từng mẫu | **0%** thời gian bước train | vector hoá numpy (mảng phẳng + offset); đã so **giống hệt** 8.852 mẫu với cách cũ |
| Nạp CSV mỗi seed | 104s | 67s lần đầu, **3,8s** các seed sau | cache bản đã lọc/sắp (ghi nguyên tử, có số phiên bản) |
| RAM tiến trình | 2,2GB | **1,1GB** | bỏ 6,2 triệu tuple (user, item, Timestamp); chuỗi dựng thẳng — đã so giống hệt |
| Mẫu âm | `numpy.choice(p=…)` trên CPU mỗi bước | `torch.multinomial` trên GPU | |

Kết quả (loss, recall) trước/sau tối ưu **giống hệt từng chữ số** → tối ưu không đổi ngữ nghĩa.

**Phát hiện**: loss khởi đầu 17,5–18,2 (kỳ vọng ≈ ln 51 = 3,9) do `nn.Embedding` mặc định N(0,1) → điểm
có độ lệch ~√d. Thêm `EMB_INIT=scaled` (std = d^-0,5 → loss khởi đầu 4,30); **giữ mặc định cũ** để khớp
kết quả trước, quyết định trên GPU theo loss sau 1 epoch. Không đổi state_dict → recs-service nạp được
(đã thử nạp checkpoint d=64, maxlen=50 bằng đúng class của recs-service).

`run_platform_multiseed.sh` bỏ đường dẫn Windows ghi cứng (Linux được); chạy thử trọn vòng 2 seed +
bootstrap CI: OK. Thêm `MAX_STEPS` (đo tốc độ, in ước lượng thời gian 1 epoch đầy đủ) và `timing_s`,
`config` vào file kết quả.

**Hệ quả cho cấu hình máy thuê** (từ số đo, không đoán): RAM hệ thống ≥ 16GB là dư (tiến trình 1,1GB);
CPU ≥ 4 nhân đủ (dựng batch ~0%); VRAM vài GB là đủ (model nhỏ) — chọn 3090/4090 vì **tốc độ**, không
vì bộ nhớ; disk 20–40GB; upload = 240MB (gzip nén ~10×) → nút thắt là mạng upload ở nhà, không phải máy
thuê. CPU local: ~780 mẫu/s ⇒ 1 epoch ~2,2h — xác nhận phải dùng GPU.

**⚠️ 2026-09-30 — PHÁT HIỆN: catalog trong DB KHÔNG phải catalog của web → CHẶN bước thuê GPU**

Kiểm tra nguồn "catalog thật" mà `data-seed` đọc (`products WHERE active=1`, 32.593 SP, 80 category):
- 32.443 SP là **Olist** (Kaggle, Brazil) do `tools/real-data-seed` import 2026-08-04 — tên ghép từ
  category (`"baby (Olist #72dd2e7b)"`), giá BRL×6000, category `Olist: bed bath table`…, 0 ảnh.
- 150 SP giả tên `"<Loại> <Hãng> Model N"` (id 1–150, tạo 2026-07-27).
- **0 / 1.123** SP thật của web (scrape cellphones.com.vn, có ảnh R2, `tools/catalog-import/manifests/`).

Các báo cáo trước ghi "catalog thật của hệ thống" là **sai** theo nghĩa "catalog web bán" — đúng chỉ theo
nghĩa "catalog đang nằm trong DB". Dataset v1 (DB 1.000 user + CSV 20K) gắn với product_id Olist. Phần
thống kê hành vi (REES46/Taobao) độc lập catalog → giữ nguyên; chỉ cần sinh lại sau khi chốt catalog.

Đọc thiết kế hệ thống (chỉ phần quyết định) để chốt: **web là cửa hàng CHUYÊN ĐIỆN TỬ** (kiểu CellphoneS),
không phải sàn đa ngành kiểu Shopee — schema product-service tổng quát (EAV attribute + cây category +
variant) nhưng mọi thứ phía trên đều thiên điện tử: tên "AuraTech"; trang chủ = Flash deal · Gợi ý cho
bạn · Điện thoại/Máy tính bảng · Phụ kiện · Laptop · Thương hiệu; `ProductCard` có biến thể `laptop`
hiện thông số; entity có `warrantyPeriod`/`specsRaw`, attribute mẫu `cpu`/`ram`; catalog-import scrape
19 ngành điện tử. Quyết định ngưỡng "bỏ dở" theo Taobao (§ trên) cũng đã lập luận từ "platform bán
điện thoại/laptop". ⇒ Catalog đúng = 1.123 SP điện tử; Olist (không ảnh, hàng Brazil) lệch domain.

Người dùng hỏi chi phí nếu đổi web thành sàn đa ngành (kiểu Shopee). Quét từ khoá (không đọc hết file):
**BE + AI gần như tổng quát** (EAV attribute/category/variant; chỉ tính năng bảo hành + fallback
`storage`→`size` ở giỏ hàng); **FE ghi cứng ở trang chủ** (`CategoryDualSection`/`AccessoriesSection`/
`LaptopShowcaseSection` ~1.100 dòng), `categoryUtils` (map từ khoá ngành + `LAPTOP_SPEC_FILTERS` RAM cứng),
icon Header, khuyến mãi laptop ở CategoryPage, gợi ý chatbot → ước **2–3 ngày** code. Phần đắt thật là
**catalog đa ngành có tên/ảnh/thuộc tính tiếng Việt**: Olist không dùng được cho web (không tên, không
ảnh, giá BRL); scraper hiện chỉ cho cellphones.com.vn → phải viết scraper + mirror ảnh + map thuộc tính
mới, ước **3–5+ ngày** và rủi ro chặn bot/điều khoản. Lợi ích cho đồ án nhỏ vì recsys/churn/chatbot không
phụ thuộc ngành hàng.

**QUYẾT ĐỊNH (chủ dự án, 2026-09-30): web là sàn TMĐT ĐA NGÀNH HÀNG.** Commit `75d00f1` trên `ai/behavoir`,
tạo nhánh `feat/multi-category-catalog`. Khảo sát chi tiết FE/BE/AI → viết prompt thực thi cho agent khác
(rẻ hơn) tại `docs/canvas/multi-category-refactor-prompt.md` (8 task T1–T8, luật cấm commit/xoá file/
đụng DB, kiểm tra build sau mỗi task, báo cáo ra `docs/canvas/multi-category-audit.md`). Phát hiện thêm
khi khảo sát: bảo hành mặc định 12 tháng cho MỌI SP (order-service); trang danh mục lọc phía client, cắt
ở 1.000 SP/danh mục (BE chưa có API lọc) — ghi là giới hạn, chưa sửa đợt này. Catalog đa ngành thật (tên,
ảnh, thuộc tính tiếng Việt) vẫn là việc riêng, chưa có nguồn — chặn bước sinh lại dataset + GPU.

**Review kết quả agent thực thi (2026-09-30 tối) — KHÔNG ĐẠT.** Báo cáo `multi-category-audit.md` ghi đã
làm xong T1–T8, build đạt, và dán `git diff --stat` 20 file — nhưng thư mục làm việc thực tế chỉ còn thay
đổi ở 5 file admin/chatbot (AddProductTab, SupportChatTab đúng; AnalyticsAITab đúng; CategoriesTab comment
sửa dở "Thời trang gồm cả iPhone/Samsung"; AIChatbotWidget chỉ đổi 1/3 gợi ý, còn "Tư vấn iPhone").
Toàn bộ T1–T5 (categoryUtils, bộ lọc giá, CategoryPage, HomePage), T6 phía BE, T7 Header, Footer, rag.py
**không có trong working tree** (file tracked trùng HEAD). Để lại rác ở gốc repo: `search1-4.txt`,
`update.js`/`update_header.js`/`update_t8.js` (0 byte), `CategoryGridSection.jsx` 0 byte. Đụng file cấm
`InventoryGrpcClient.java` (đổi xuống dòng). Lỗi của prompt: tên `CategoryShowcaseSection.jsx` trùng file
có sẵn từ commit đầu (không nơi nào dùng) — phải đổi tên nếu làm lại. Lỗi compile BE "cannot find symbol"
agent báo là có sẵn: đúng, nhưng là do **môi trường** (JDK 23 + Lombok 1.18.30), với JDK 17 compile ĐẠT →
theo yêu cầu người dùng đặt `JAVA_HOME` (user) = JDK 17.0.5, không sửa code.

**Claude làm lại T1–T8 (người dùng duyệt).** Xong + thêm các chỗ khảo sát ban đầu bỏ sót (chữ slide trang
chủ, giỏ hàng, wishlist, chính sách bảo hành/đổi trả ProfilePage), gộp 2 bản sao hàm icon danh mục thành
`FE/src/utils/categoryIcon.js`. FE build ĐẠT, BE compile (JDK 17) ĐẠT, rag.py ĐẠT; chưa kiểm thử trình
duyệt. Chi tiết: `multi-category-audit.md` (viết lại theo trạng thái thật). Trong lúc làm, 3 file rác
`update*.js` rỗng bị tạo lại lúc 17:29 sau khi đã xoá — dấu hiệu agent kia còn chạy; đã xoá lại.

**2026-09-30 (tối) — Colab qua VS Code thay cho thuê máy (bước tổng duyệt)**

Người dùng cài extension Colab cho VS Code. Tài khoản Google AI Pro (sinh viên) nhưng Colab báo **0 compute
unit** → đang ở mức MIỄN PHÍ (quyền lợi Colab của gói AI chưa áp dụng); bảng chọn chỉ có **T4** (+ TPU —
không dùng: code PyTorch/CUDA). T4 miễn phí đủ bộ nhớ (16GB); chỉ khác 3090 về tốc độ (~2–4×) và độ ổn
định phiên (rớt sau ~90 phút không thao tác, trần ~12h). Máy Colab không thấy file local → **nhúng dữ liệu
vào notebook**: chuỗi VIEW/CART của 20K user nén xz còn 14MB (kiểm tra giải nén giống hệt bản gốc).
Notebook `colab_train_overnight.ipynb`: 3 seed `EMB_INIT=scaled` (d=64, maxlen=50, batch 512, ≤30 epoch,
dừng sớm, in loss mỗi epoch — thêm `LOG_EVERY`) + bootstrap CI + 1 seed khởi tạo mặc định để so; seed xong
in kết quả ngay, chạy lại bỏ qua seed đã có. Đã mô phỏng toàn bộ cell ở local (3 bước/seed): chạy trọn.
Còn `colab_env_check.ipynb`, `colab_train_smoke.ipynb` (2.000 user, 5 epoch) để đo nhanh. Dữ liệu vẫn là
catalog Olist → đây là **tổng duyệt pipeline + đo thời gian T4**, sẽ train lại khi có catalog đa ngành.

#### 2026-10-01 — Đo thêm trên dữ liệu thật: độ phổ biến đuôi dài + hành vi XEM LẠI (sửa phương pháp)

**(1) Độ tập trung độ phổ biến SP** (`recsys_measure_item_popularity.py`, tỉ lệ lượt xem rơi vào top 10% SP;
đo cả trên mẫu 7.000 SP ≈ cỡ catalog web → gần như y hệt toàn catalog):

| Nguồn | top 10% | Gini |
|---|---|---|
| REES46 mỹ phẩm (5 tháng) | 0,645 | 0,757 |
| Taobao (20 triệu dòng) | 0,657 | 0,735 |
| REES46 đa ngành (10/2019) | 0,826 | 0,880 |
| **Bộ sinh cũ (chọn SP đều nhau)** | **0,315** | **0,40** |

Bộ sinh cũ thiếu hẳn đuôi dài → baseline Popularity gần 0 (recall@10 0,0005), phi thực tế. Sửa: chọn SP theo
trọng số (mảng tích luỹ + tìm nhị phân, `lib/catalogIndex.mjs`); trọng số = (số đã bán THẬT trên Tiki + 1)^α
(α = 0,7 hiệu chỉnh trên catalog Tiki: top10 0,652, Gini 0,761), SP không có số bán → log-normal tất định
(σ = 1,8 → 0,653). Thêm 2 mục vào báo cáo fidelity (top 10%, Gini; mục tiêu Taobao 0,657/0,735 vì 2 nguồn
độc lập khớp ~0,65).

**(2) Recency và lặp liên tiếp — 2 "ngưỡng chống tái phát" CHƯA TỪNG đo trên dữ liệu thật**
(`recsys_measure_recency_baseline.py`, đúng giao thức fidelity.mjs, mẫu 10% user):

| Nguồn | recency recall@10 | lặp liên tiếp |
|---|---|---|
| REES46 mỹ phẩm | 0,508 | 19,2% |
| REES46 đa ngành | 0,488 | 31,3% |
| Taobao | 0,169 | 0,3% |
| Ngưỡng cũ trong fidelity | ≤ 0,20 | ≤ 6% |

Taobao gần như 0% lặp liên tiếp → bộ dữ liệu Taobao đã **lọc trùng** sự kiện liền nhau; REES46 ghi nguyên
mọi lượt tải trang. **Web đồ án ghi giống REES46**: product-service phát `product-viewed-events` mỗi lần GET
chi tiết SP, `behavior_consumer.py` ghi thẳng `user_events`, không lọc. ⇒ Ngưỡng cũ (đặt theo lỗi view→cart
cũ) đẩy dữ liệu sinh RA XA thực tế; việc "giảm lặp liên tiếp 8,82%→3,26%" ở §5.8 tưởng đúng hướng nhưng
thực tế người dùng xem lại rất nhiều. Hệ quả dây chuyền: category-stickiness REES46 0,634 vs Taobao 0,471
(đang lấy trung bình 0,492) có thể lệch cũng vì Taobao mất các cặp "cùng item" (luôn cùng category) — đang
đo kiểm chứng (`recsys_measure_revisit_patterns.py`: stickiness trên cặp KHÁC item + xác suất xem lại).
Nguyên tắc mới: chỉ số chịu ảnh hưởng của lượt xem lặp lấy theo nguồn ghi log GIỐNG hệ thống (REES46).

**(3) Hành vi xem lại trên REES46** (`recsys_measure_revisit_patterns.py`, 962K lượt xem, 160K user, phiên
thật): xem lại ngay SP vừa xem 10,6% · quay lại SP đã xem trước đó trong phiên 14,4% · SP xem lần đầu trong phiên
là SP của phiên cũ 16,7% · stickiness mọi cặp 0,619 / cặp KHÁC SP 0,574. Giả thuyết lọc trùng đúng MỘT PHẦN
(0,62→0,57 khi bỏ cặp trùng); phần còn lại so với Taobao 0,47 là khác biệt hành vi thật (mỹ phẩm 1 ngành).

**Sửa bộ sinh + kiểm tra:**
- `simulate.mjs`: lượt xem có thể là xem lại SP vừa xem / SP đã xem trong phiên / SP từ phiên cũ (chỉ phiên có mốc
  SỚM hơn), phiên có thể mở đầu bằng SP đang xem dở; lượt thêm giỏ đặt theo số item PHÂN BIỆT đã xem (đúng
  định nghĩa đo).
- Tách **số đo thật** (`TARGETS`, chỉ để kiểm) khỏi **tham số sinh** (`GENERATION`, hiệu chỉnh) — vì xác suất cấp
  phiên ≠ chỉ số cấp user (lượt quay lại SP cũ hay đổi category; người dùng mở phiên mới bằng SP đang xem dở).
- `fidelity.mjs`: stickiness đo trên cặp KHÁC SP (cùng định nghĩa Taobao); thêm "lặp liền nhau trong phiên"
  (mục tiêu 0,1064 — giữ tham số cấp phiên bị kiểm, không trôi tự do); recency + lặp cấp user so với số đo THẬT
  (0,508 / 0,192) thay ngưỡng cũ; chốt chặn lỗi cũ chuyển sang đúng dấu hiệu của nó (cart = SP vừa xem ≤ 0,3).
- Hiệu chỉnh lưới 36 + 24 tổ hợp trên catalog Tiki thật (chấm theo tổng độ lệch chuẩn hoá, chọn tổ hợp mọi mục
  cách ngưỡng an toàn): `pSameCategoryNew 0,66 · repeatPrev 0,08 · revisitSession 0,1442 · revisitHistory 0,25 ·
  sessionResume 0,58`, `salesAlpha 0,7`, `fallbackSigma 2,0` (hiệu chỉnh lại sau khi có xem lại). Đầu ra trên
  catalog Tiki: stickiness 0,520 · lặp trong phiên 0,111 · recency 0,529 · lặp cấp user 0,159 · top10 0,633 —
  **20/20 mục đạt**; `npm test` **11/11**. Còn lệch có ghi nhận: lặp cấp user thấp hơn thật (0,159 vs 0,192) —
  REES46 có thể chứa sự kiện view nhân đôi do cách ghi log mà bộ sinh không mô phỏng.
- Hệ quả cho bước train: dữ liệu mới có Recency mạnh như thật (~0,5) và Popularity có tín hiệu — SASRec phải vượt
  mốc khó hơn nhưng TRUNG THỰC hơn.

**Bàn giao sang máy GPU thuê** (việc tiếp theo — phần dataset đã xong):
1. Nén + upload `data/training-sets/v1_20000u/` (2,4GB CSV; pandas đọc thẳng `.csv.gz`).
2. `python tools/data-seed/validate_training_set.py <dir>` — phải ĐẠT (bắt file cụt/hỏng khi copy).
3. Đo tốc độ: `MAX_STEPS=200 N_EPOCHS=1 BATCH_SIZE=512 MAXLEN=50 D_MODEL=64 EVENTS_CSV=… python
   recsys_platform_sasrec.py` → ước lượng thời gian thật. Rồi 1 epoch đầy đủ: nếu loss vẫn cao bất
   thường (≫ 4) thì dùng `EMB_INIT=scaled`.
4. `EVENTS_CSV=<dir>/user_events.csv OUT_DIR=… BATCH_SIZE=512 MAXLEN=50 D_MODEL=64 bash
   run_platform_multiseed.sh` (trong `tmux`) → 3 seed + bootstrap CI SASRec vs Recency. Ghi kết quả
   trung thực vào §5.9 dù thắng hay thua.

---

## 6. Lịch

| Tuần | Việc | ✅ Cổng (bằng số) |
|---|---|---|
| **0** | Môi trường CUDA 12.8 / PyTorch ≥2.7 (**Docker data-root sang D:** — C: chỉ còn 8 GB) · thử build HSTU **ngay** · clone `transformer_benchmark` · tải **Taobao UserBehavior** + dựng adapter | Tái lập **ML-20M NDCG@10 ≈ 0,1563**. Không khớp ⇒ **dừng** |
| **1** | Giao thức GTS (q=0,9, target Last, validation Global Temporal, full-catalog, filter seen) · baseline Popularity → ItemKNN-tuned → iALS · metric kèm coverage/Gini/ARP | Bảng baseline có ±std. Đo lại số RetailRocket 0,2777 cho hợp lệ |
| **2** | **Behavior encoder v1** + đầu Next-item. Thang ablation: BCE→Sampled Softmax → +sliding window → +LiGR → **+action-type embedding** | eSASRec > ItemKNN-tuned quá sàn nhiễu. **Và**: action-type embedding có thêm gì không (đo riêng) |
| **3** | Feature tầng 2 (nội dung item) + tầng 3 (dân số, out-of-fold). Đo phân tầng theo độ phổ biến item | Recall **tầng item lạnh** tăng vượt sàn nhiễu |
| **4** | **Đầu Risk** trên encoder đã học — cả 2 chế độ đóng băng / fine-tune. So thẳng với 0,7462 | Vượt **0,7462 ± 0,0111**. Không vượt ⇒ kết quả âm có giá trị, báo cáo đúng vậy |
| **5** | **Thêm log impression vào tracker** (mục 5.4) · mở rộng seeder phát 18 action · train kiến trúc đó trên catalog tiếng Việt · nối `recs-service` + FE · nối đầu Risk vào Kafka → Camunda | E2E thật: gợi ý hiện trên FE **và** voucher phát qua Camunda, chuẩn bằng chứng như 27-07 |
| **6** | Viết | 3 chương |

---

## 7. Điểm rẽ nhánh

| Nếu | Thì |
|---|---|
| HSTU không build được trên Blackwell (tuần 0) | Bỏ HSTU. eSASRec đã cùng Pareto frontier |
| Không tái lập được số (tuần 0) | **Dừng**, sửa môi trường |
| Action-type embedding không thêm gì (tuần 2) | Đo lại trên **cả** Taobao (4 loại) **và** RetailRocket (3 loại). Nếu Taobao dương mà RetailRocket âm ⇒ **bằng chứng trực tiếp** rằng độ giàu bảng chữ cái quyết định, và đó chính là lý do tracker 19 ký hiệu tồn tại |
| Đầu Risk không vượt 0,7462 (tuần 4) | **Đây là kết quả trung tâm, không phải thất bại**: biểu diễn chuỗi KHÔNG hơn feature tổng hợp trên dữ liệu này ⇒ giải thích được vì sao rule bắt kịp suốt giai đoạn churn |
| Thừa thời gian | Thêm TIGER/semantic ID (cấu hình GRID: RK-Means, `(3,256)`, bỏ user token) |

---

## 8. Ánh xạ sang báo cáo

| Chương | Nội dung | Từ đâu |
|---|---|---|
| **1. Phương pháp** | Tiêu chí 5 điểm "bài toán có đáng dùng ML không", áp lên 3 bài toán thật · giao thức không rò rỉ · sàn nhiễu · đối chứng âm | log churn + tuần 1 |
| **2. Chính** | Biểu diễn hành vi: **chuỗi vs tổng hợp**. Encoder, feature 3 tầng, hai đầu ra, số đo | tuần 2–4 |
| **3. Hệ thống** | Tracker 19 ký hiệu → Kafka → encoder → gợi ý + campaign Camunda, E2E thật | tuần 5 |

**Đóng góp chính:** không phải một con số, mà là **trả lời được — bằng thí nghiệm có đối chứng —
câu hỏi biểu diễn hành vi dạng nào là đủ cho bài toán nào**, trên 3 bài toán thật, có cả kết quả âm
lẫn dương.

---

## 9. Những gì KHÔNG làm

- Không dùng số từ **seeder tổng hợp** cho bất kỳ kết luận nào — chỉ để chạy hệ thống
- Không dùng **MovieLens** làm dataset kết luận (thứ tự nhiễu, bị khuyến cáo)
- Không dùng **sampled metric**; luôn xếp hạng full catalog
- Không so số giữa hai giao thức chia dữ liệu khác nhau
- Không sửa hợp đồng Kafka / node BPMN đã chạy — chỉ thay nguồn sinh `churnProbability`
- Không tự viết lại khung so sánh khi `transformer_benchmark` đã có
- Không báo cáo cải thiện **dưới sàn nhiễu**

---

## 10. Nhật ký production wiring & hạ tầng (2026-09-18 → 2026-09-24)

Tiếp diễn trực tiếp từ §5.3-§5.7 — chuyển từ "đo trên dữ liệu nghiên cứu" sang "gắn vào hệ thống thật
và phát hiện khoảng cách với production". Ghi theo đúng convention `churn-risk-log.md`.

### 2026-09-18 → 2026-09-21 — SASRec full-scale: 2 lần crash, 2 lần sửa đúng gốc rễ

Chạy `recsys_sasrec.py` full 307K user (không subsample) hai lần, cả hai lần đều bị dừng — nhưng vì
2 lý do khác nhau, không phải cùng 1 bug lặp lại:

1. **Lần 1**: tiến trình bị cắt ngang vì **phiên làm việc trước kết thúc** (không phải lỗi kỹ thuật).
   Checkpoint dừng đúng ở epoch 1/15 — không mất dữ liệu nhờ đã có cơ chế lưu mỗi epoch (thêm từ vụ
   phát hiện thiếu `torch.save` ở §mục cũ).
2. **Lần 2 (resume)**: RAM hệ thống tụt xuống **0,71GB free** giữa epoch 2 — **kill khẩn cấp thủ công**
   theo đúng quy tắc an toàn RAM đã thiết lập từ đầu dự án. Không phải bug code — là hệ quả của việc
   chạy song song với khối lượng RAM nền (VSCode+Chrome) đã chiếm ~10-13GB trên máy 16GB.

**Sửa thêm 2 việc quan trọng nhân dịp này** (không chỉ vá tạm):
- Thêm **cơ chế resume từ checkpoint** (`RESUME` env, so khớp `config` trước khi nạp `state_dict` +
  `optimizer_state_dict`) — để lần dừng sau không phải train lại từ đầu.
- Sửa **device-agnostic** (`torch.device("cuda" if torch.cuda.is_available() else "cpu")` thay vì
  hardcode `"cpu"`) — chuẩn bị cho khả năng thuê GPU sau này mà không cần sửa code.

### 2026-09-21 — Audit `recs-service` thật: phát hiện model giả đang chạy production

Dùng subagent audit toàn bộ hạ tầng production (event pipeline, serving API, cache, message broker,
Camunda) đối chiếu với kiến trúc recommender chuẩn. Phát hiện quan trọng nhất:

- `AI/recs-service/app/services/sasrec.py` đang dùng **1 class LSTM giả** ("Dummy SASRec class" —
  comment trong code cũ), không liên quan gì tới kiến trúc đã nghiên cứu; nếu thiếu file trọng số còn
  tự sinh **trọng số ngẫu nhiên** và trả về product id bịa (`prod_{idx}`).
- `popularity.py` cũng mock hoàn toàn (`Mocking values for base structure`).
- Điểm sáng: pipeline churn-risk → Camunda (`risk_scheduler.py` → Kafka → `PromotionKafkaConsumer` →
  `Trigger_Event_ChurnRisk` → voucher) là **mảnh E2E thật hoàn chỉnh nhất** trong toàn hệ thống.

**Đã sửa** (không chỉ ghi nhận): thay kiến trúc SASRec giả bằng đúng kiến trúc Transformer khớp
`recsys_sasrec.py`; thêm cơ chế **`item_space` gating** — chỉ nạp checkpoint gắn nhãn
`"platform_v1"` kèm `item_id_map`, từ chối mọi checkpoint train trên dataset nghiên cứu (index không
tương ứng với `Product.id` thật, xem lý do kỹ thuật ở §dưới); thêm `catalog.py` (tra cứu tên/giá thật
từ `ecommerce_product_db`) và `popularity.py` dùng query thật thay mock. Test end-to-end thật (chạy
uvicorn + Docker MariaDB/Redis thật) xác nhận cold-start → `popularity`, có lịch sử → chiến lược đang
active, cơ chế chặn checkpoint sai log đúng cảnh báo thiết kế.

### 2026-09-21 — Train `platform_v1` trên dữ liệu thật của web: kết quả âm quan trọng

Chi tiết đầy đủ ở §5.7. Tóm tắt: SASRec train trên `user_events` thật (501 user, item_id thật) đạt
recall@10=0,1976 — **thua** 1 heuristic không cần model ("gợi ý lại item vừa xem", recall@10=0,2754).
Chẩn đoán gốc rễ: `tools/data-seed/lib/simulate.mjs:105-109` sinh CỨNG mọi đơn hàng theo mẫu
`view(product X) → cart(product X)` cùng 1 item — không phải hành vi người dùng biến thiên tự nhiên.
**Quyết định đã note nhớ** (xem memory phiên): sửa lại `simulate.mjs` theo quy luật đo từ REES46 +
mở rộng phát đủ 19 hành vi, rồi mới retrain `platform_v1` VÀ churn-risk cùng lúc.

### 2026-09-22 — Impression tracking: lấp khoảng trống §5.6 + phát hiện 3 hành vi "chết"

Thêm `ACTION_IMPRESSION` vào `contracts.py` (19 hành vi, không còn 18) và nối `trackImpressions()`
vào 3 nơi render danh sách sản phẩm (`CategoryPage.jsx`, `SearchPage.jsx`, `SuggestedSection.jsx`).

Nhân dịp rà soát toàn bộ 19 hành vi, phát hiện **3 hành vi đã khai báo trong `contracts.py`/
`behaviorTracker.ts` từ 2026-08-04 nhưng CHƯA BAO GIỜ có nơi gọi thật trong FE**: `PRODUCT_ZOOM`,
`FILTER_APPLIED`, `SORT_APPLIED` — đúng đề mục "chưa làm" đã ghi từ khi xây tracker
(`churn-risk-log.md:1706-1707`). Đã vá cả 3: `PRODUCT_ZOOM` vào `ProductDetailPage.jsx` (click zoom
ảnh), `FILTER_APPLIED`/`SORT_APPLIED` vào `CategoryPage.jsx` + `SearchPage.jsx` (useEffect theo dõi
state filter/sort, bỏ qua lần render đầu). Xác nhận lại bằng grep: cả 14/14 vi hành vi giờ đều có nơi
bắn thật. Build FE pass.

### 2026-09-23 — Điều tra hiệu năng CPU: loại 3 giả thuyết, tìm đúng nguyên nhân

Trước khi quyết định thuê GPU, đo thử để trả lời "vì sao ngay cả RTX 3090 vẫn cần nhiều giờ train":

1. **Loại**: lấy mẫu âm có trọng số (`rng.choice(p=...)`) — chỉ ~5 giây/epoch, không phải nút thắt.
2. **Loại**: 2 loại mask (causal+padding) khác dtype tắt fast-path PyTorch — hợp nhất lại không cải
   thiện đáng kể (~190ms/batch, trong khoảng nhiễu đo được).
3. **Loại**: batch nhỏ gây phí tổn cố định trên CPU — tăng batch 256→4096 vẫn ~664-737 μs/mẫu, gần
   như không đổi ⇒ **CPU tỉ lệ thẳng theo compute, không phải overhead-bound**.
4. `torch.compile()` không test được (thiếu MSVC trên Windows) — để thử trên máy thuê Linux.

**Kết luận**: không có bug để sửa miễn phí — chi phí ~700μs/mẫu là thật, khớp đúng thời gian đã đo
(27 phút/epoch cấu hình nhỏ). Vì CPU không được lợi khi tăng batch nhưng GPU thì có (nhiều lõi song
song), vẫn có cơ sở tin GPU nhanh hơn đáng kể — nhưng phải đo thật trên máy thuê (giai đoạn smoke-test
trong plan thuê GPU), không suy diễn thêm từ số CPU.

### 2026-09-24 — Đối chiếu `AI/forecast-service/production_reference/*.md` (tài liệu chuyên gia)

Đối chiếu toàn bộ implementation với 6 tài liệu tham khảo production/academic đã có sẵn trong repo.
Kết quả quan trọng nhất: `7_sasrec_evaluation_metrics.md` xác nhận **đúng nguyên văn** phương pháp đã
tự phát hiện — *"A strong production evaluation standard requires testing SASRec against a simple
Recency heuristic... If the ML model cannot beat this dumb rule, it should not be deployed."* — tức
việc từ chối deploy `platform_v1` (mục trên) là đúng chuẩn khắt khe nhất ngành đòi hỏi, không phải
tự đặt thanh chuẩn thấp.

Phần lõi thuật toán (causal masking, sampled softmax, HR@K/NDCG@K, đối chứng Recency+Popularity,
Coverage@K chống popularity bias) đạt chuẩn đầy đủ. Phần hạ tầng vận hành (cache, ANN serving, retrain
tự động, model versioning, A/B test, monitoring/dashboard CTR-conversion-lift, item-to-item cho khách
vãng lai) **chưa có** — khác biệt quan trọng cần nói rõ trong báo cáo: đây là 2 loại thiếu khác nhau
(kỹ thuật vận hành chưa làm, KHÔNG phải "AI chưa đủ giỏi" — điểm này tách biệt với kết quả âm của
`platform_v1` ở trên, không được gộp chung khi trình bày).

### 2026-09-24 — Đo quy luật hành vi thật từ REES46 để sửa `simulate.mjs`

Chạy `recsys_behavior_stats.py` (mới, xử lý từng tháng + `gc.collect()` — an toàn bộ nhớ) trên toàn
bộ 5 tháng REES46 Cosmetics (4.513.080 session, 16,7 triệu event). Kết quả — khác đáng kể so với luật
cứng hiện tại của `simulate.mjs`:

| Đại lượng đo được | Số thật (REES46) | Luật hiện tại của `simulate.mjs` |
|---|---|---|
| Session dài bao nhiêu event | median=1, mean=3,70, p90=8 | Không mô hình hoá session — mỗi đơn hàng tự coi là 1 đơn vị |
| Cart có trùng ĐÚNG item vừa xem trong session không | **chỉ 21,96%** | **Luôn luôn** (dòng 108-109, cứng 100%) |
| Số SP khác đã xem cùng category trước khi cart | median=0, p90=2, 75,5% trường hợp = 0 | Không mô hình hoá — không có khái niệm "xem trước" |
| Tỉ lệ đổi category giữa 2 event liên tiếp | 36,57% | `PREFERRED_CATEGORY_WEIGHT=0.7` — không đo từ đâu cả |

**Phát hiện quan trọng nhất**: chỉ ~22% lượt cart thật sự khớp với item vừa xem trong CÙNG session —
luật cứng "view(X) → cart(X)" của `simulate.mjs` đang mô phỏng đúng 1 kịch bản chỉ xảy ra ở thiểu số
user thật, 78% còn lại cart đến từ nơi khác (session trước, tìm trực tiếp, gợi ý...). Đây chính là cơ
chế sinh ra artifact "recency luôn thắng" đã phát hiện ở `platform_v1`.

Số liệu lưu `behavior_stats.json`, dùng làm tham số thiết kế cho bản `simulate.mjs` mới.
