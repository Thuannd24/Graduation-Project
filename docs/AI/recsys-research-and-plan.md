# Nghiên cứu chuẩn làm hệ gợi ý (2019→2026) + kế hoạch triển khai

> Tài liệu này trả lời: **cách làm AI cho bài toán gợi ý sao cho đúng chuẩn và hiệu quả**, dựa
> trên tài liệu học thuật tới 2026, và quy về một kế hoạch khả thi với **phần cứng và dữ liệu
> thật của dự án này**.
>
> Bối cảnh: bài toán churn và bỏ-giỏ-hàng đã được đo và kết luận là **lớp bài toán rule là đủ**
> (xem [`churn-risk-log.md`](churn-risk-log.md)). Gợi ý sản phẩm được chọn thay thế vì qua đủ 5
> tiêu chí "đáng dùng ML" — chi tiết ở mục 5.

---

## 0. Tóm tắt điều hành

Ba điều quan trọng nhất, nếu chỉ đọc một mục:

1. **SOTA học thuật 2025 cho gợi ý theo chuỗi là một SASRec được làm kỹ** (eSASRec = SASRec +
   LiGR layers + Sampled Softmax), hơn **23%** so với model sinh mới nhất như ActionPiece. Không
   phải Transformer khổng lồ, không phải semantic ID.
2. **Công thức huấn luyện quan trọng hơn kiến trúc.** Data augmentation kiểu sliding-window cho
   **+34% Recall@10** — lớn hơn toàn bộ khoảng cách giữa TIGER và SASRec.
3. **Mọi thế hệ model mới đều bị thổi phồng, rồi bị baseline tune kỹ bắt kịp.** Quy luật này lặp
   lại 5 lần liên tiếp từ 2019 tới 2025 (bảng ở mục 1). Nên baseline tune kỹ **là** phần việc
   chính, không phải thủ tục.

---

## 1. Quy luật lặp lại — và nó lặp đúng 5 lần

| Năm | Tuyên bố ban đầu | Khi được so công bằng |
|---|---|---|
| 2019 | Neural CF là SOTA | **11/12** model neural tái lập được **thua** kNN / model tuyến tính. Chỉ 7/18 tái lập nổi |
| 2022 | BERT4Rec > SASRec | Không bản cài đặt nào tái lập được kết quả gốc với config mặc định. Chỉ đạt SOTA **khi train đủ lâu** |
| 2023 | SASRec thua BERT4Rec vì **kiến trúc** | **Sai nguyên nhân.** Thực ra do **hàm mất mát**: negative sampling + BCE gây overconfidence. Đổi sang gBCE là hết |
| 2023 | TIGER hơn SASRec **+29% NDCG@5** | Với SASRec **tune kỹ**: Beauty R@10 = 6,05 (SASRec) vs 6,42 (TIGER) → chỉ **+6% tương đối** |
| 2024 | HSTU hơn SASRec **+16,9…+60,7% NDCG** | Repo HSTU/FuXi-α có **bug xử lý dữ liệu** làm đổi **25% test set**. Và MovieLens **bị khuyến cáo KHÔNG dùng** cho gợi ý theo chuỗi (thứ tự thời gian quá nhiễu) |
| 2025 | **eSASRec** — SASRec + LiGR + Sampled Softmax | Hơn **23%** so với SOTA mới nhất (ActionPiece); nằm trên Pareto frontier độ chính xác–độ phủ cùng HSTU và FuXi-α. **Không cần feature phụ** (HSTU cần timestamp) |

**Kết luận rút ra:** đây chính xác là điều mà kỷ luật đo lường của dự án này đã tự khám phá ra ở
quy mô nhỏ (đối chứng âm, sàn nhiễu, "phải đánh bại rule tốt nhất"). Ngành gợi ý đã phải học đi
học lại bài học đó suốt 6 năm.

---

## 2. Cái gì THẬT SỰ tạo ra hiệu quả — xếp theo mức đã đo được

| Đòn bẩy | Mức tác động đo được | Nguồn |
|---|---|---|
| **Data augmentation (sliding window)** | **+34% Recall@10** (Beauty) | GRID handbook |
| **Hàm mất mát** (sampled softmax / gBCE thay BCE) | Giải thích **toàn bộ** khoảng cách SASRec–BERT4Rec | gSASRec |
| **Retrain trên train+val trước khi deploy** | **+1…80%** | Time to Split |
| **Tune baseline tử tế** | Ưu thế TIGER: +29% → **+6%** | Closing the Gap |
| Kiến trúc encoder-decoder vs decoder-only | Encoder-decoder **hơn hẳn** | GRID |
| Tokenizer: **RK-Means > RQ-VAE** | RK-Means thắng **dù RQ-VAE được train 5× lâu hơn** | GRID |
| Codebook `(L,W) = (3, 256)` | Nhiều tầng hơn → **tệ đi rõ rệt** | GRID |
| Bỏ user token | Bỏ hẳn cho kết quả **tốt nhất** | GRID |
| Xử lý va chạm semantic ID | Chọn ngẫu nhiên ≈ cách phức tạp của TIGER | GRID |
| Cỡ encoder nội dung 780M → 11B | **Gần như không đổi** | GRID |
| Kiến trúc TIGER vs SASRec | Nhỏ | Closing the Gap |

**Đọc bảng này theo chiều dọc:** ba đòn bẩy mạnh nhất đều là **công thức huấn luyện và giao thức**,
không phải kiến trúc. Ba đòn bẩy yếu nhất đều là **kiến trúc và quy mô model**.

⇒ Kế hoạch phải đầu tư ngân sách theo đúng tỉ lệ đó.

---

## 3. Giao thức đánh giá — công thức cụ thể

Đây là phần **không lỗi thời** (là toán về giao thức, không phải mốt kiến trúc), và là phần đa số
bài báo làm sai.

### 3.1 Chia dữ liệu — Global Temporal Split (GTS)

Khảo sát 75 bài RecSys/SIGIR/CIKM 2022–2024: **77,3% dùng leave-one-out**, chỉ **6,7%** dùng GTS
đúng cách. Khi sửa cho đúng, **nDCG@10 tụt 21,7–73,4%**.

Công thức khuyến nghị:

| Thành phần | Chọn gì | Ghi chú |
|---|---|---|
| Mốc cắt test | **phân vị tương tác q = 0,9** | cho ra 2–15% độ dài dòng thời gian |
| Chọn target | **Successive** (chuẩn nhất, sát production) hoặc **Last** (rẻ hơn, tương quan cao với Successive) | tránh **All** (lệch bài toán) và **First** (lệch khoảng thời gian do ranh giới phiên) |
| Validation | **Global Temporal** | Kendall **0,81–0,83** với metric test — cao nhất trong các phương án |
| Chuỗi bắt đầu sau cutoff | **bỏ item đầu tiên** | |
| Lọc | **filter seen** — bỏ item user đã tương tác | |
| Trước khi deploy | **retrain trên train + val** | cho **+1…80%** |

### 3.2 Metric

- **Xếp hạng trên TOÀN BỘ catalog.** Không sample 100 negative. Sampled metric **không bảo toàn
  phát biểu "A tốt hơn B"**, kể cả trong kỳ vọng; sample càng nhỏ mọi metric càng collapse về AUC.
- Recall@K, NDCG@K (K = 10, 20)
- **Kèm metric ngoài độ chính xác**: catalogue coverage, Gini, ARP (Average Recommendation
  Popularity), novelty.
  → Đây là luận điểm thứ hai và **rule không chạm tới được**: popularity baseline có coverage ≈ 0.

### 3.3 Kỷ luật đã có sẵn của dự án — giữ nguyên

Sàn nhiễu (±std giữa fold), đối chứng âm, đăng ký tiêu chí trước khi đo, không báo cải thiện dưới
sàn nhiễu. Ba thứ này đã có và **mạnh hơn mặt bằng tài liệu** — không cần xây lại.

---

## 4. Ràng buộc thật của dự án này

### 4.1 Phần cứng

Hiện tại (đã đo): Intel i5-10400 (6 nhân), **15,9 GB RAM**, **không có GPU**.
Kế hoạch nâng cấp: **RTX 5090 (32 GB GDDR7)** — đã xác nhận với người dùng.

**Với 5090, mọi phương án đều khả thi.** Nút thắt chuyển từ *"model nào chạy được"* sang *"chạy
được bao nhiêu thí nghiệm"* — và đó là thay đổi có lợi, vì mục 2 cho thấy giá trị nằm ở **tune kỹ
và quét nhiều cấu hình**, không ở model to.

| Phương án | 5090 (32 GB) |
|---|---|
| ItemKNN, iALS, EASE | ✅ (EASE vẫn giới hạn bởi **RAM hệ thống**, không phải VRAM — xem dưới) |
| SASRec / eSASRec (d = 256) | ✅ thừa sức; VRAM dùng rất ít |
| TIGER (seq2seq T5 + RQ-VAE) | ✅ |
| HSTU | ✅ nhưng **có rủi ro build** — xem mục 7.5 |
| Sentence encoder cỡ lớn | ✅ (dù GRID chứng minh cỡ encoder gần như không ảnh hưởng ⇒ vẫn nên dùng model nhỏ cho nhanh) |

⚠️ **EASE không được lợi từ GPU**: nó cần ma trận item×item trong **RAM hệ thống**. Ở 91k item vẫn
cần ~33 GB. Nếu muốn dùng EASE thì phải nâng RAM, không phải nâng GPU. Với 16 GB RAM: trần ~30k
item (float32).

### 4.2 Dữ liệu

| Bộ | Điểm mạnh | Điểm chặn |
|---|---|---|
| **RetailRocket** (đã tải) | clickstream **thật**, 2,76M event, 235k item; đã đo: đồng-xuất-hiện hơn popularity **22,5×** | **Mọi giá trị thuộc tính đều bị HASH** trừ `categoryid` và `available`. Không có text ⇒ **không dựng được semantic ID kiểu TIGER**. Chỉ còn: cây category + giá + tồn kho. Median **1 event/visitor**, chỉ 5,8% có ≥5 |
| **Amazon Reviews 2023** | 570M review / 48M sản phẩm / 33 ngành; có **title, description, giá, ảnh**; **có sẵn split chuẩn**; là bộ mà TIGER/eSASRec dùng ⇒ **so sánh được với tài liệu** | Phải chọn 1–2 ngành cỡ vừa để vừa CPU |
| **MovieLens** | phổ biến | ⛔ **Bị khuyến cáo KHÔNG dùng** cho gợi ý theo chuỗi — thứ tự thời gian tương quan rất yếu với thứ tự lựa chọn thật |
| **Catalog riêng của dự án** (~1.123 SP) | text tiếng Việt **thật**, nối thẳng được vào `recs-service` + FE | Quá ít user để huấn luyện/đánh giá |

---

## 5. Vì sao gợi ý, mà không phải churn — đối chiếu tiêu chí

Tiêu chí "bài toán đáng dùng ML" (đăng ký trước khi đo):

| # | Tiêu chí | Churn | Bỏ giỏ | **Gợi ý** |
|---|---|---|---|---|
| 1 | Không gian đầu ra lớn / cần ≥3 chiều tương tác | ❌ 1 ngưỡng là đủ | ⚠️ | ✅ **235k item** |
| 2 | Nhãn quan sát trực tiếp | ❌ cửa sổ nhân tạo | ⚠️ gộp 3 hiện tượng | ✅ item kế tiếp |
| 3 | Dữ liệu thật, base rate không thoái hoá | ❌ synthetic / Olist 97,3% | ✅ | ✅ |
| 4 | Có baseline tầm thường để so | ✅ | ✅ | ✅ popularity = 0,0124 |
| 5 | Metric xếp hạng | ✅ | ✅ | ✅ Recall/NDCG@K |

**Gợi ý 5/5. Churn trượt 1, 2, 3** — nên nó thất bại là tất yếu, không phải do làm sai.

---

## 6. Kế hoạch

Thiết kế **ba chân**: Amazon để đo nghiêm túc và so được với tài liệu · RetailRocket để kiểm chứng
chéo trên clickstream thật · catalog riêng để có hệ thống chạy thật.

### Tuần 1 — Giao thức (khoá lại TRƯỚC khi có model nào)

- Cài đặt GTS theo công thức mục 3.1 (q = 0,9, target = Last, validation = Global Temporal)
- Xếp hạng full catalog, filter seen
- Metric: Recall@10/20, NDCG@10/20 + coverage, Gini, ARP
- Baseline: Popularity → **ItemKNN có tune** → iALS có tune
- Chạy trên **cả** Amazon (1 ngành) **và** RetailRocket

**Cổng đi tiếp:** bảng baseline có sàn nhiễu; con số RetailRocket 0,2777 (đo bằng leave-last-out,
đang lạc quan) được thay bằng số GTS hợp lệ.

### Tuần 2 — SASRec đúng chuẩn, không phải SASRec mặc định

Đây là tuần quan trọng nhất, vì bảng mục 2 nói đòn bẩy nằm ở đây.

- SASRec cơ bản → rồi thêm từng thứ một, **đo riêng từng cái**:
  1. **Sampled Softmax / gBCE** thay BCE
  2. **Sliding-window augmentation** (kỳ vọng lớn nhất: +34%)
  3. LiGR layers (⇒ eSASRec)
- Mỗi bước là một dòng trong bảng ablation, đúng kiểu `ablation.py` đã có

**Cổng đi tiếp:** eSASRec vượt ItemKNN đã tune **quá sàn nhiễu**. Nếu không vượt → dừng, báo cáo
đúng như vậy (và đó vẫn là kết quả hợp lệ).

### Tuần 3 — Nội dung item & cold-start

- Amazon: mã hoá `title + description + category + price` bằng sentence encoder **nhỏ** (MiniLM)
- RetailRocket: nội dung chỉ có cây category + giá + tồn kho → **ghi rõ giới hạn này**
- Đo riêng trên **nhóm item lạnh** (<5 tương tác): độ phủ và Recall thay đổi thế nào

**Đây là chỗ luận điểm "AI hơn rule" mạnh nhất:** rule không có cách nào gợi ý item chưa ai mua.

### Tuần 4 — Semantic ID (chỉ nếu tuần 3 cho tín hiệu dương)

- **RK-Means**, không phải RQ-VAE (GRID: RK-Means thắng dù RQ-VAE train 5× lâu hơn)
- Codebook `(3, 256)`; va chạm xử lý bằng chọn ngẫu nhiên
- Bỏ user token
- Train seq2seq trên **RTX 5090** (cấu hình chi tiết ở mục 7)

**Cổng:** vượt eSASRec quá sàn nhiễu. Tài liệu cho thấy khả năng này **không cao** (TIGER chỉ hơn
SASRec-tune-kỹ ~6%) ⇒ nếu không vượt thì **đó chính là kết quả đáng báo cáo**, lặp lại được phát
hiện của "Closing the Gap" bằng thí nghiệm của mình.

### Tuần 5 — Nối vào hệ thống thật

- Thay `popularity.py` trong `recs-service` bằng model tốt nhất
- Semantic ID / embedding nội dung dựng trên **catalog tiếng Việt thật** (1.123 SP)
- E2E qua FE "Gợi ý cho bạn", đúng chuẩn kiểm chứng đã áp dụng cho churn

### Tuần 6 — Viết

Cấu trúc báo cáo:
1. Churn/bỏ-giỏ = **chương phương pháp**: tiêu chí + số đo cho biết *khi nào rule là đủ*
2. Gợi ý = **chương chính**: bài toán qua đủ 5 tiêu chí, giao thức không rò rỉ, baseline mạnh
3. Đóng góp: **một tiêu chí quyết định có kiểm chứng được** cho câu hỏi "bài toán này có đáng
   dùng ML không" — áp dụng lên 3 bài toán thật, 2 âm 1 dương

---

## 7. Cấu hình huấn luyện cụ thể

### 7.1 Nền tảng code — KHÔNG viết lại từ đầu

Repo [`blondered/transformer_benchmark`](https://github.com/blondered/transformer_benchmark) (chính
là code của bài eSASRec) đã có sẵn gần hết thứ cần:

| | Nội dung |
|---|---|
| Model | SASRec · BERT4Rec · **HSTU** · FuXi-α · **eSASRec** · **TIGER** · ActionPiece · CL4SRec · DuoRec · LSAN · S3Rec |
| Dataset | ML-1M · ML-20M · **Amazon Beauty / Sports / Toys** · Kion · BeerAdvocate |
| Giao thức | leave-one-out **và** time-based global timestamp split |
| Metric | HR, NDCG, **coverage**, debiased |
| Quy trình | grid search → holdout evaluation qua file config |
| Nền | thư viện [RecTools](https://github.com/MobileTeleSystems/RecTools) |

⇒ **Đây là điểm khởi đầu.** Tự viết lại nghĩa là tự tạo ra một baseline không ai kiểm chứng được —
đúng cái sai mà mục 1 cảnh báo. Việc của dự án là **thêm dataset RetailRocket + catalog riêng**, và
thêm metric Gini/ARP nếu thiếu.

### 7.2 Môi trường — cái bẫy Blackwell

RTX 5090 là `sm_120`, **bắt buộc CUDA 12.8**. PyTorch **2.7.0 là bản ổn định đầu tiên** hỗ trợ
`sm_120`; hiện khuyến nghị **2.11.0**.

```bash
# Đường an toàn nhất: image chính thức có sẵn CUDA 12.8
docker pull pytorch/pytorch:2.11.0-cuda12.8-cudnn9-devel
```

⚠️ **Rủi ro đã ghi nhận:** Blackwell **chưa có hỗ trợ chính thức cho JIT compile kernel CUDA** —
việc này làm hỏng `torch.utils.cpp_extension`, FlashAttention, vLLM và các thư viện biên dịch kernel
lúc chạy. **HSTU dùng kernel tuỳ biến kiểu FlashAttention**, nên đây là rủi ro cụ thể cho HSTU chứ
không phải rủi ro chung. Mitigation: thử HSTU **sớm** (ngày đầu), nếu build hỏng thì bỏ HSTU —
không phải model bắt buộc, vì eSASRec đã nằm cùng Pareto frontier với nó.

SASRec/eSASRec/TIGER chỉ dùng op PyTorch chuẩn ⇒ **không dính rủi ro này**.

### 7.3 Cấu hình eSASRec (lấy từ chính bài báo)

| Tham số | Giá trị |
|---|---|
| Embedding dim | **256** |
| Số block | 2–4 (tuỳ dataset) |
| Số head | 2–8 (tuỳ dataset) |
| Max sequence length | 50–200 (tuỳ dataset) |
| Learning rate | **0,001** |
| Batch size | **128** |
| Sampled negatives | **256** |
| Dropout | 0,1–0,3 |
| Epoch / patience | 100 epoch, early stopping patience 10–50 |

**LiGR layer khác vanilla Transformer ở đâu:** pre-norm; **cổng hoá** cả multi-head attention lẫn
feed-forward bằng linear projection + sigmoid; FFN dùng **SwiGLU** với `ff_emb_mult = 4`.

Tác động đo được của LiGR: trên ML-20M gần như không đổi, nhưng trên Kion **NDCG@10 +9% và
coverage +280%**. ⇒ LiGR ăn điểm ở **độ phủ**, và độ phủ chính là luận điểm phụ mà rule không chạm
tới (mục 3.2).

Số tham chiếu để đối chiếu khi chạy lại: ML-20M NDCG@10 = **0,1563** / Coverage@10 = 0,0889 · Kion
0,1657 / 0,3003 · BeerAdvocate 0,0650 / 0,0771.

### 7.4 Thứ tự quét tham số — theo đúng bảng tác động ở mục 2

Không quét lung tung. Quét theo thứ tự tác động đã biết, mỗi bước là **một dòng ablation**:

| Bước | Thay đổi | Kỳ vọng |
|---|---|---|
| 0 | SASRec mặc định (d=256, BCE) | mốc xuất phát |
| 1 | **BCE → Sampled Softmax (256 neg)** | đòn bẩy #2 trong bảng mục 2 |
| 2 | **+ sliding-window augmentation** | **kỳ vọng lớn nhất: ~+34% Recall@10** |
| 3 | **+ LiGR layers** ⇒ eSASRec | +9% NDCG, **+280% coverage** (theo Kion) |
| 4 | Quét `n_blocks × n_heads × maxlen × dropout` | tinh chỉnh |
| 5 | **Retrain train+val** cho bản cuối | **+1…80%** |

Chỉ sau khi bảng này đầy đủ mới được đụng tới TIGER/HSTU. Lý do: nếu nhảy thẳng vào model sinh rồi
so với SASRec mặc định thì tái tạo đúng lỗi mà mục 1 đã liệt kê 5 lần.

### 7.5 Ngân sách tính toán

Trên 5090, VRAM không phải nút thắt (d=256, batch 128 dùng rất ít). Nút thắt là **số lần chạy**.
Nên dùng GPU để **quét nhiều cấu hình**, không phải để nuôi một model to hơn — đây là kết luận trực
tiếp từ mục 2.

Ước lượng thô, cần đo lại bằng một lần chạy thử trước khi lên lịch:
Amazon Beauty/Toys/Sports (~200k–2M tương tác) → phút tới hàng chục phút mỗi lần chạy ·
ML-20M / RetailRocket (~2–20M) → hàng chục phút tới vài giờ · TIGER (seq2seq + RQ-VAE) → vài giờ.

---

## 8. Tiêu chí dừng (đăng ký trước)

- Mọi cải thiện **dưới sàn nhiễu** ⇒ không tính, không đưa vào production, ghi vào báo cáo là null
- Không so số giữa các giao thức chia dữ liệu khác nhau
- Không dùng sampled metric trong bất kỳ kết luận nào
- Nếu một bước không qua cổng ⇒ **dừng bước đó**, báo cáo kết quả âm; không tune tới khi ra số đẹp

---

## 9. Nguồn

**Phương pháp & tái lập**
- [Are We Really Making Much Progress? (Ferrari Dacrema et al., RecSys 2019)](https://arxiv.org/abs/1907.06902v3)
- [A Systematic Review and Replicability Study of BERT4Rec (Petrov & Macdonald, RecSys 2022)](https://arxiv.org/abs/2207.07483)
- [gSASRec: Reducing Overconfidence in Sequential Recommendation (RecSys 2023)](https://arxiv.org/abs/2308.07192)

**Giao thức đánh giá**
- [Time to Split: Data Splitting Strategies for Sequential Recommenders (RecSys 2025)](https://arxiv.org/abs/2507.16289) · [code](https://github.com/monkey0head/time-to-split)
- [A Critical Study on Data Leakage in Recommender System Offline Evaluation (TOIS)](https://dl.acm.org/doi/full/10.1145/3569930)
- [On Sampled Metrics for Item Recommendation (Krichene & Rendle, KDD 2020)](https://dl.acm.org/doi/10.1145/3394486.3403226)

**Model sinh & semantic ID**
- [TIGER — Recommender Systems with Generative Retrieval (NeurIPS 2023)](https://arxiv.org/abs/2305.05065)
- [Generative Recommendation with Semantic IDs: A Practitioner's Handbook — GRID (2025)](https://arxiv.org/abs/2507.22224)
- [Closing the Performance Gap in Generative Recommenders (2025)](https://arxiv.org/abs/2508.14910)
- [HSTU — Actions Speak Louder than Words (ICML 2024)](https://arxiv.org/abs/2402.17152) · [code](https://github.com/meta-recsys/generative-recommenders)
- [eSASRec (RecSys 2025)](https://arxiv.org/abs/2508.06450) · [transformer_benchmark — code](https://github.com/blondered/transformer_benchmark) · [RecTools](https://github.com/MobileTeleSystems/RecTools)
- [BaseModel vs HSTU — so sánh độc lập](https://sair.synerise.com/basemodel-vs-meta-ais-hstu-for-sequential-recommendations/)

**Môi trường**
- [PyTorch sm_120 / RTX 5090 support](https://github.com/pytorch/pytorch/issues/159207) · [Chạy PyTorch trên RTX 5090](https://docs.salad.com/container-engine/tutorials/machine-learning/pytorch-rtx5090)

**Dữ liệu & metric**
- [Taobao UserBehavior — 100M tương tác, 4 loại hành vi](https://tianchi.aliyun.com/dataset/649?lang=en-us)
- [TAOBAO-MM — chuỗi dài tới 1.000 + impression + embedding đa phương thức](https://taobao-mm.github.io/)
- [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/) · [HuggingFace](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023)
- [Retailrocket dataset](https://www.kaggle.com/datasets/retailrocket/ecommerce-dataset)
- [Towards the Evaluation of Recommender Systems with Impressions](https://www.researchgate.net/publication/363645705_Towards_the_Evaluation_of_Recommender_Systems_with_Impressions)
- [Diversity, Serendipity, Novelty, and Coverage (TiiS)](https://dl.acm.org/doi/10.1145/2926720) · [A Survey on Popularity Bias](https://arxiv.org/pdf/2308.01118)
