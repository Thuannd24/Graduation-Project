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
| Tracker của dự án: **18 loại action** (`FE_BEHAVIOR_ACTIONS`) | Vẫn giàu nhất, nhưng **không còn là bộ duy nhất có tín hiệu ma sát** — REES46 Cosmetics đã có 1 loại thật |
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
| `action_type` | 18 loại của tracker · 3 loại ở RetailRocket | **Đây là chiều mà đa số model gợi ý bỏ qua** |
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

⚠️ **Giới hạn phải nói kèm:** (1) độ lớn tuyệt đối khiêm tốn — AUC tăng 0,0067, không phải bước
nhảy; (2) mới đo trên 1 tháng, chưa mở rộng ra 5 tháng; (3) chưa so với rule (cây depth-1/2/3/6)
để biết rule có hưởng lợi được từ thứ tự hay không — làm theo đúng nguyên tắc "rule phải được nhận
cùng bộ feature" (mục 10.1 `feature-space-upgrade-plan.md`) là việc tiếp theo.

### 5.3 Khoảng cách với production mà KHÔNG bộ công khai nào lấp được

Phải nêu thẳng ở mục giới hạn của báo cáo:

| Thiếu | Hệ quả |
|---|---|
| **Impression** (cái gì đã hiển thị mà không được click) | Chỉ học được từ positive; không học được *"đã đưa ra mà bị từ chối"*. Chỉ MIND và TAOBAO-MM có |
| **Counterfactual / vòng phản hồi** | Log sinh ra **bởi một recommender**; offline không đo được điều gì xảy ra nếu đổi model. Không ai giải được offline |
| **Ngữ cảnh** | Thiết bị, giá tại thời điểm xem, tồn kho, khuyến mãi đang chạy |
| **Độ tươi** | RetailRocket 2015, Taobao 2017 |

Đây là giới hạn **của cả ngành** — mọi công trình được trích (TIGER, HSTU, eSASRec) đều đo trên
đúng những bộ này.

### 5.4 Thứ dự án này có mà không bộ công khai nào có

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
| Action-type embedding không thêm gì (tuần 2) | Đo lại trên **cả** Taobao (4 loại) **và** RetailRocket (3 loại). Nếu Taobao dương mà RetailRocket âm ⇒ **bằng chứng trực tiếp** rằng độ giàu bảng chữ cái quyết định, và đó chính là lý do tracker 18 ký hiệu tồn tại |
| Đầu Risk không vượt 0,7462 (tuần 4) | **Đây là kết quả trung tâm, không phải thất bại**: biểu diễn chuỗi KHÔNG hơn feature tổng hợp trên dữ liệu này ⇒ giải thích được vì sao rule bắt kịp suốt giai đoạn churn |
| Thừa thời gian | Thêm TIGER/semantic ID (cấu hình GRID: RK-Means, `(3,256)`, bỏ user token) |

---

## 8. Ánh xạ sang báo cáo

| Chương | Nội dung | Từ đâu |
|---|---|---|
| **1. Phương pháp** | Tiêu chí 5 điểm "bài toán có đáng dùng ML không", áp lên 3 bài toán thật · giao thức không rò rỉ · sàn nhiễu · đối chứng âm | log churn + tuần 1 |
| **2. Chính** | Biểu diễn hành vi: **chuỗi vs tổng hợp**. Encoder, feature 3 tầng, hai đầu ra, số đo | tuần 2–4 |
| **3. Hệ thống** | Tracker 18 ký hiệu → Kafka → encoder → gợi ý + campaign Camunda, E2E thật | tuần 5 |

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
