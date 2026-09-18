# Plan nâng cấp Feature Space — thi hành ngay

> Phạm vi: **chỉ không gian feature.** Không đổi model, không đổi kiến trúc, không đụng production.
> Chẩn đoán dẫn tới plan này: [`churn-risk-log.md`](churn-risk-log.md) ·
> bối cảnh dài hạn: [`recsys-execution-plan.md`](recsys-execution-plan.md)

---

## 0. Giả thuyết cần kiểm chứng (đăng ký TRƯỚC khi đo)

> **H1** — Thêm thông tin từ **thực thể sản phẩm** (nhóm C) hoặc **trục dân số** (nhóm D) sẽ nâng
> AUC vượt sàn nhiễu. Thêm cột tổng hợp trên cùng bảng cũ thì **không**.
>
> **H0** (bác bỏ H1) — cả C và D đều nằm trong nhiễu ⇒ trần thông tin nằm sâu hơn feature space,
> phải xét lại nhãn hoặc nguồn dữ liệu.

**Đây là dự đoán sai được.** Nếu H0 đúng thì vẫn là kết quả có giá trị, ghi vào báo cáo đúng như vậy.

## 1. Mốc phải vượt — đã đo, không dựng lại

Từ `cart_abandon_rule_vs_ml.py` (bản đã sửa lỗi cắt phiên, chạy 2026-08-17):

| Mốc | AUC |
|---|---|
| Xếp hạng bằng 1 feature | 0,6594 |
| Cây depth-2 (người viết tay được) | 0,6987 |
| Cây depth-6 (60 lá) | 0,7363 |
| **LightGBM — 17 feature hành vi phẳng** | **0,7462** |
| **Sàn nhiễu** | **± 0,0111** |

⇒ **Ngưỡng nhận một nhóm feature: ΔAUC > 0,0111.**

Vì sao chọn bài toán bỏ-giỏ RetailRocket làm sân đo: dữ liệu đã trên đĩa, harness đã đúng, mốc đã
có, **không cần Docker**. Vòng lặp nhanh nhất hiện có.

---

## 2. Nhóm C — Thực thể SẢN PHẨM *(chưa feature nào đọc)*

Nguồn: `item_properties_part1/2.csv` (20,3M dòng) + `category_tree.csv`.
Đã đo ở khảo sát tín hiệu: **417.053 item** có `categoryid`, giá (property `790`), `available`.

### Điểm kỹ thuật quyết định: thuộc tính có VERSION theo thời gian

Mỗi dòng là `(timestamp, itemid, property, value)`. Với một sự kiện thêm-giỏ tại thời điểm *t*, phải
lấy giá trị thuộc tính **ở bản ghi mới nhất có timestamp ≤ t**. Lấy bản mới nhất tuyệt đối là **rò rỉ
tương lai**.

### Feature

| Feature | Định nghĩa | Ghi chú |
|---|---|---|
| `item_category` | `categoryid` tại *t* | |
| `item_cat_parent`, `item_cat_depth` | từ `category_tree` | ngành hàng thô hơn ⇒ dày hơn, ít nhiễu hơn |
| `item_price` | property `790` tại *t*, parse `n1234.000` → float | |
| `item_available` | 0/1 **tại *t*** | ⚠️ chỉ tại *t*, xem mục 2.1 |
| `item_age_days` | *t* − lần đầu item xuất hiện | item mới vs item cũ |
| `item_n_prop_changes` | số lần đổi thuộc tính trước *t* | item hay đổi giá/tồn kho |

### 2.1 ⚠️ `available` sau *t* là CHẨN ĐOÁN, không phải feature

**16,07% item có `available` đổi theo thời gian.** Nếu một item hết hàng trong 24h sau khi thêm giỏ
thì "bỏ giỏ" **không phải ý định người dùng** — nó là hết hàng.

- `available` **tại *t*** → hợp lệ làm feature
- `available` **sau *t*** → **không được** làm feature (rò rỉ tương lai), nhưng **bắt buộc** dùng làm
  cột chẩn đoán để đo: *bao nhiêu % nhãn "bỏ giỏ" thực ra là hết hàng?*

Nếu tỉ lệ đó cao ⇒ **nhãn đang lẫn hai hiện tượng**, và phải tách trước khi kết luận bất cứ điều gì
về feature. *(Đối chiếu: chẩn đoán "đã mua món khác" cho ra 6,7% — nhỏ. Cái này có thể lớn hơn.)*

---

## 3. Nhóm D — Trục DÂN SỐ *(trục chưa feature nào đi qua)*

Mọi feature hiện tại đều **trong-user**. Nhóm này thống kê **xuyên user**.

| Feature | Định nghĩa |
|---|---|
| `item_abandon_rate` | tỉ lệ bỏ giỏ lịch sử của **item này** |
| `item_n_carts_prior` | số lần item được thêm giỏ trước *t* (độ tin cậy của tỉ lệ trên) |
| `cat_abandon_rate` | như trên, mức **category** — dày hơn nhiều |
| `cat_conversion_rate` | tỉ lệ chuyển đổi của category |
| `price_decile_abandon_rate` | tỉ lệ bỏ giỏ theo **thập phân vị giá** trong cùng category |

### 3.1 Ba lớp chống rò rỉ — BẮT BUỘC, đây là nhóm nguy hiểm nhất

1. **Nhân quả thời gian** — chỉ đếm sự kiện **trước *t* nghiêm ngặt**, không tính chính nó
2. **Out-of-fold** — thống kê tính trên **fold train**, áp lên fold test. Tính trên toàn bộ là rò rỉ
3. **Làm mượt Bayes** — phần lớn item có <5 lần thêm giỏ ⇒ co về tỉ lệ toàn cục:
   `rate = (n_abandon + m·p_global) / (n_total + m)`, `m ≈ 20`. Không làm mượt thì item hiếm cho tỉ
   lệ 0 hoặc 1, và model học thuộc item id

### 3.2 Đối chứng âm riêng cho nhóm D

Xáo trộn ánh xạ `item → rate` giữa các item. Nếu AUC **không tụt** ⇒ nhóm D đang rò rỉ hoặc vô dụng.
**Bắt buộc chạy**, không phải tuỳ chọn.

### 3.3 Nói cho trung thực về luận điểm "rule không làm được"

Rule **có thể** đặt ngưỡng lên `item_abandon_rate` khi cột đó đã được tính sẵn. Nhưng bản thân cột
đó **là một bảng tra 235k dòng được học ra** — cần out-of-fold, làm mượt, nhân quả thời gian.

⇒ Phát biểu đúng: *rule dùng được kết quả, nhưng không tự sinh ra được nó.* Cùng dạng với kết luận
đã có: **"rule tốt phải được HỌC"**. Không được nói quá thành "rule không làm được".

---

## 4. Đo — thiết kế thí nghiệm

Giữ nguyên giao thức đã có: grouped CV theo visitor, 5 fold, xếp hạng đầy đủ, **AUC** (không F1 —
base rate 70%).

| Cấu hình | Mục đích |
|---|---|
| A *(17 feature hành vi)* | baseline, = 0,7462 |
| A + C | thực thể sản phẩm có thêm gì? |
| A + D | trục dân số có thêm gì? |
| A + C + D | có cộng dồn không hay trùng nhau? |
| A + C + D **đã xáo** | **đối chứng âm** |
| **Rule (cây depth-2/6) trên A + C + D** | **cho rule ĐÚNG bộ feature mới** — nếu không thì so lệch |

Dòng cuối là nguyên tắc đã lập từ trước: rule phải được nhận cùng thông tin. Nếu model hưởng lợi từ
C+D **nhiều hơn** rule ⇒ đó là ưu thế của model. Nếu cả hai lợi ngang nhau ⇒ C+D chỉ là **thông tin
mới**, không phải ưu thế của AI. Cả hai kết luận đều đáng báo cáo.

---

## 5. Sửa harness — permutation theo CỤM tương quan

Điểm mù hiện tại: `monetary` có importance **0,0001** nhưng **tương quan 0,877 với `frequency`** —
xáo một cột thì cột kia gánh, nên **cả hai trông vô dụng** dù cặp thì thiết yếu.

```
1. Ma trận tương quan Spearman trên toàn bộ feature
2. Gom cụm phân cấp, cắt ở ngưỡng 0,7
3. Permutation TOÀN CỤM cùng lúc
4. Giữ/bỏ quyết định ở mức CỤM
5. Trong cụm được giữ → giữ 1 đại diện dễ giải thích nhất
```

**Đầu ra bắt buộc:** bảng đối chiếu *permutation theo cột* vs *theo cụm*. Nếu hai bảng khác nhau thì
đó là bằng chứng trực tiếp rằng cách đánh giá cũ **loại nhầm feature** — một kết quả đáng báo cáo
độc lập với chuyện C/D có thắng hay không.

---

## 6. Lịch — 4 ngày

| Ngày | Việc | Đầu ra | Cần Docker? |
|---|---|---|---|
| **1** | Parse `item_properties` với **temporal join** (mới nhất ≤ *t*) → nhóm C. Đo ngay tỉ lệ "bỏ giỏ thực ra là hết hàng" | `item_features.parquet` + con số chẩn đoán nhãn | ❌ |
| **2** | Nhóm D + 3 lớp chống rò rỉ + đối chứng âm riêng | `population_features.parquet` | ❌ |
| **3** | Chạy 6 cấu hình ở mục 4 + permutation theo cụm | bảng ΔAUC có sàn nhiễu | ❌ |
| **4** | Port nhóm C/D sang panel churn (`candidates.py` + `ablation.py`), chạy `POST /models/ablation` | bảng ablation churn | ✅ **cần Docker** |

Ngày 1–3 chạy được **ngay hôm nay** — dữ liệu trên đĩa, venv đã cài, Docker đang tắt cũng không sao.

---

## 7. Tiêu chí quyết định — chốt trước

| Kết quả | Kết luận | Hành động |
|---|---|---|
| C hoặc D có ΔAUC > 0,0111, đối chứng âm sạch | **H1 đúng** — trần đúng là do thiếu nguồn thông tin | Đưa vào `candidates.py`, port sang churn (ngày 4) |
| Cả C và D trong nhiễu, đối chứng âm sạch | **H0** — trần nằm sâu hơn feature space | Dừng nhánh feature, chuyển sang xét lại **nhãn** hoặc **biểu diễn chuỗi** |
| Đối chứng âm **không tụt** | **Harness sai / rò rỉ** | ⛔ Vứt cả lượt, sửa rồi chạy lại |
| Tỉ lệ "hết hàng" cao ở mục 2.1 | **Nhãn lẫn 2 hiện tượng** | Tách nhãn TRƯỚC, mọi kết luận feature phía sau phải đo lại |

---

## 8. KẾT QUẢ — Ngày 1 (2026-08-17)

### 8.1 Nhóm C: NHẬN

| Cấu hình | AUC (25 fold) |
|---|---|
| A — 17 feature hành vi | 0,7428 ± 0,0159 |
| **A + C — thêm sản phẩm** | **0,7540 ± 0,0154** |
| A + C đã xáo | 0,7420 ± 0,0165 |

| Hiệu ghép cặp | Δ | Fold dương | Nhận |
|---|---|---|---|
| **A + C thật** | **+0,01113 ± 0,00207** | **25/25** | ✅ |
| Đối chứng âm | −0,00084 ± 0,00152 | 7/25 | ❌ |

Hiệu ứng lớn **5,4× sai số của chính nó**, dương ở **mọi fold**. Đối chứng âm sạch ⇒ harness hợp lệ.

### 8.2 ⚠️ Phát hiện phương pháp — có thể ảnh hưởng KẾT LUẬN CŨ

Luật cũ (`Δ > std của từng AUC riêng lẻ`) so hiệu ứng với **độ khó khác nhau giữa các fold** — một
nguồn nhiễu mà **cả hai cấu hình cùng chịu**. Ghép cặp thì nó triệt tiêu:

| Thống kê | Giá trị |
|---|---|
| std của từng AUC *(luật cũ dùng làm ngưỡng)* | 0,0159 |
| **std của HIỆU ghép cặp** *(sai số thật)* | **0,00207** |
| Chênh | **7,7×** |

⇒ **Luật cũ khắt khe hơn thực tế ~7,7 lần.** Nhóm C trượt luật cũ (0,0110 < 0,0111) nhưng thực ra
là hiệu ứng chắc chắn.

**Hệ quả cần kiểm tra lại:** `ablation.py` đã dùng luật cũ để loại **6/6 khối feature ứng viên**
(`abandon_shape` +0,0033 · `gap_dispersion` −0,0012 · `noise_control` −0,0081 · `session` −0,0126 ·
`review` −0,0039 · `voucher` +0,0021). Các delta này nhỏ hơn C 3–5 lần và nhiều cái âm, nên **phần
lớn khả năng vẫn null thật** — nhưng kết luận đó được rút bằng một phép kiểm sai, nên **phải chạy
lại bằng ghép cặp** trước khi trích dẫn trong báo cáo.

### 8.3 Chẩn đoán nhãn: hết hàng KHÔNG phải confounder

| Nhóm | Tỉ lệ item hết hàng trong 24h |
|---|---|
| Bỏ giỏ | **0,12%** |
| Đã mua | 0,32% |

Tỉ lệ ở nhóm **đã mua còn cao hơn** (hàng bán chạy hay hết) ⇒ hết hàng là **nhiễu nền**, không giải
thích được nhãn. Giả thuyết bị loại bằng số. *(Đối chiếu: "đã mua món khác" = 6,7%.)*

### 8.4 Ba dự đoán trước khi đo — hai sai

| Dự đoán | Thực tế |
|---|---|
| Hết hàng chiếm 1–5% nhãn bỏ giỏ | **0,12%** ❌ sai ~10× |
| Giá là yếu tố mạnh | trung vị 48.000 vs 47.880 — gần y hệt ❌ |
| C cho ΔAUC 0,01–0,05 | **0,0111** ⚠️ đúng độ lớn, mép dưới |

### 8.5 Đánh giá độ lớn — không thổi phồng

AUC 0,7428 → 0,7540. Hiệu ứng **thật và nhất quán**, nhưng **khiêm tốn**: nó không biến bài toán
thành bài toán khác. H1 được ủng hộ về **chiều** (nguồn thông tin mới > cách tổng hợp mới), chưa
được ủng hộ về **độ lớn**.

### 8.6 Lỗi tự bắt được

Merge nhóm C làm số hàng tăng 69.332 → 70.064 (+1,1%) vì RetailRocket có sự kiện trùng hệt nhau.
Đã thêm khử trùng + `assert` chặn cứng. Sau khi sửa, baseline tái lập **đúng** con số cũ
(0,7457 ± 0,0111).

---

## 9. KẾT QUẢ — Ngày 2 (2026-08-17)

### 9.1 Nhóm D: LOẠI — nhưng vì TRÙNG, không phải vì null

| Cấu hình | AUC (25 fold) |
|---|---|
| A | 0,7428 ± 0,0159 |
| **A + C** | **0,7540 ± 0,0154** |
| A + D | 0,7521 ± 0,0153 |
| A + C + D | 0,7560 ± 0,0144 |

| Hiệu ghép cặp | Δ | Fold dương | Nhận |
|---|---|---|---|
| A+C vs A | +0,01113 ± 0,00207 | 25/25 | ✅ |
| **A+D vs A** | **+0,00925 ± 0,00220** | **25/25** | ✅ |
| **A+C+D vs A+C** | **+0,00200 ± 0,00222** | 20/25 | ❌ |
| Đối chứng âm D vs A | −0,00062 ± 0,00116 | 6/25 | ❌ sạch |

**D có tín hiệu thật khi đứng một mình** (+0,00925, dương ở mọi fold) **nhưng gần như không thêm gì
ngoài C** (+0,00200, trượt luật 1). Đây là **loại vì TRÙNG**, khác hẳn 6 khối trước đó bị loại vì null.

### 9.2 Vì sao trùng — cơ chế giải thích được

`cat_abandon_rate` là bản **tính tay** của đúng thứ mà cây quyết định **tự học** khi đã được cho
`item_category`: model chia nhánh theo category và học luôn tỉ lệ bỏ giỏ của từng nhánh. Target
encoding chỉ có ích khi model **không xử lý nổi** categorical bậc cao — mà ở mức category (~1.700
giá trị) thì LightGBM xử lý được.

Còn `item_abandon_rate` thì hỏng vì **thưa**: mật độ đo được là **median 1 sự kiện trước/item**, chỉ
**21,9%** item có ≥5. Phần lớn giá trị bị làm mượt về tiên nghiệm toàn cục ⇒ gần như hằng số.

| Mức | Median sự kiện trước | Có ≥5 |
|---|---|---|
| item | **1** | 21,9% |
| category | 54 | 76,8% |
| thùng giá | 2.881 | 91,9% |

### 9.3 Dự đoán trước khi đo — lần này ĐÚNG

> *"A + C ≈ A + C + D, và A + D một mình có vượt nhưng ít hơn A + C."*

Thực tế: A+D = +0,00925 < A+C = +0,01113; D thêm ngoài C chỉ +0,00200 (không nhận). Cả hai vế đều
đúng. *(Đối chiếu ngày 1: 2/3 dự đoán sai.)*

### 9.4 Bẫy đã xử lý: NHÃN CÓ ĐỘ TRỄ

Nhãn của sự kiện tại *t* chỉ biết tại *t + 24h*. Nên thống kê tại *t* chỉ được dùng nhãn của sự kiện
đã **đóng cửa sổ** (`t_j + 24h ≤ t`), không phải mọi `t_j < t`. Cài đặt sắp xếp theo `label_ts` rồi
mới cộng dồn. Bỏ sót điểm này sẽ đưa nhãn chưa-thể-biết vào feature — rò rỉ tinh vi, và với item
hiếm thì đủ để thổi phồng kết quả.

### 9.5 Chốt không gian feature

**A + C = 25 feature.** AUC **0,7428 → 0,7540** (+0,0111, hiệu ứng lớn 5,4× sai số của nó).

D **không đưa vào**, nhưng giữ code lại — nếu sau này bỏ `item_category` khỏi C, hoặc dùng model
không xử lý được categorical bậc cao, thì D sẽ có giá trị trở lại.

### 9.6 Việc còn thiếu để kết luận về "ưu thế của AI"

**Chưa đo rule trên A + C.** Nguyên tắc đã lập: rule phải được nhận **cùng bộ feature**. Nếu cây
depth-2/6 trên A+C cũng tăng đúng +0,011 thì C là **thông tin mới cho cả hai bên**, không phải ưu
thế của model. Chưa có số thì chưa kết luận được. Đây là việc đầu tiên của ngày 3.

---

## 10. KẾT QUẢ — Ngày 3 (2026-08-17)

### 10.1 Rule được nhận CÙNG bộ feature — và không dùng được gì

| Phương pháp | A | A+C | Lợi ích từ C | Fold dương |
|---|---|---|---|---|
| Cây depth-1 | 0,6321 | 0,6321 | **+0,00000** | 0/25 |
| Cây depth-2 *(viết tay được)* | 0,6968 | 0,6968 | **+0,00000** | 0/25 |
| Cây depth-3 | 0,7177 | 0,7175 | −0,00025 | 1/25 |
| Cây depth-6 *(60 lá)* | 0,7304 | 0,7291 | **−0,00131** | 6/25 |
| **LightGBM** | 0,7428 | **0,7540** | **+0,01113** | **25/25** |

`Δ_model − Δ_cây` (ghép cặp) = **+0,0111 … +0,0124**, dương ở **25/25 fold** với mọi độ sâu ⇒ **đáng
kể**.

**Khoảng cách LightGBM − cây tốt nhất GẤP ĐÔI khi thêm C:**

| Bộ feature | Khoảng cách |
|---|---|
| A | +0,01243 ± 0,00588 |
| **A + C** | **+0,02487 ± 0,00480** |

### 10.2 Cơ chế — vì sao rule không dùng được C

Permutation importance từng feature của nhóm C: `item_cat_parent` 0,0067 · `item_price` 0,0064 ·
`item_category` 0,0043 · `item_cat_depth` 0,0041 · `item_age_days`+`n_prop_changes` 0,0027 ·
`item_available` 0,0005 · `item_has_properties` **0,0000**.

**Không feature nào của C vượt 0,007.** Cây depth-1/2 chỉ có 1–3 lát cắt, nên luôn tiêu vào các
feature mạnh (`cum_transaction` 0,166) và **không bao giờ chọn tới C**. Cây depth-6 thậm chí **tệ
đi** vì có thêm 8 ứng viên yếu để chọn nhầm.

⇒ Phát biểu chính xác, và đây là luận điểm mạnh nhất dự án có tới giờ:

> **Nhóm C mang thông tin mà rule KHÔNG khai thác được — không phải vì rule kém, mà vì thông tin đó
> chỉ tồn tại ở dạng KẾT HỢP NHIỀU CHIỀU YẾU.** Mỗi cột riêng lẻ dưới ngưỡng mà một lát cắt nhìn
> thấy được; cộng lại thì có giá trị đo được và nhất quán ở mọi fold.

Đây khác hẳn kết luận của giai đoạn churn (*"rule tốt phải được HỌC"* — về **năng lực sinh ra rule**).
Lần này là ưu thế về **năng lực biểu diễn**, và nó được chứng minh bằng thí nghiệm đối chứng.

### 10.3 Permutation theo CỤM — hiệu ứng che có thật nhưng nhẹ ở bộ này

25 feature → **17 cụm** (5 cụm có >1 cột). Chỉ **một** cụm bị che:

| Cụm | Tổng theo cột | Theo cụm | |
|---|---|---|---|
| `cum_addtocart`, `sess_cum_addtocart` | 0,02062 | **0,02377** | bị che +0,003 |

Các cụm còn lại chênh không đáng kể. ⇒ Ở bộ feature này, đánh giá theo cột **không sai nhiều** —
khác với bộ churn nơi `monetary`↔`frequency` tương quan 0,877. Kỹ thuật vẫn nên giữ, nhưng không
phải nguồn sai lớn ở đây.

### 10.4 Cắt cái vô dụng

| Feature | Importance | Quyết định |
|---|---|---|
| `item_has_properties` | **0,00000** | **BỎ** |
| `item_available` | 0,00046 | **BỎ** — và hợp lý: chẩn đoán ở §8.3 đã cho thấy tồn kho không liên quan tới nhãn |

⇒ Nhóm C rút từ 8 xuống **6 feature**. Không gian cuối: **A + C = 23 feature**.

### 10.5 Một điểm phải nói khi báo cáo

`cum_transaction` chiếm importance **0,166**, gấp **2,5×** feature kế tiếp — độ tập trung tương tự
bộ churn (2,6×). Nhưng khác churn ở chỗ **không tautology**: "số đơn đã mua trước đó" và "có mua món
này trong 24h tới" là quan hệ hành vi thật, không phải gần đồng nghĩa như
`category_diversity_viewed` với nhãn "còn hoạt động".

Và độ lớn tuyệt đối vẫn **khiêm tốn**: 0,7304 (rule tốt nhất) → 0,7540 (model). Thật, nhất quán,
vượt sàn nhiễu — nhưng không phải bước nhảy.

---

## 11. KẾT QUẢ — Ngày 4 (2026-08-18): port sang panel churn

Dự đoán **đăng ký trước khi chạy: NULL** (generator chỉ có 2 cơ chế gắn với churn, thuộc tính sản
phẩm độc lập với cả hai). Panel 1.509 dòng / 348 user, độ phủ block 92,3%.

| Model | Baseline | + block sản phẩm | Δ ghép cặp | Fold dương | Nhận |
|---|---|---|---|---|---|
| **LogisticRegression** *(production)* | 0,7644 ± 0,0137 | 0,7650 ± 0,0105 | **+0,0006 ± 0,00433** | 3/5 | ❌ |
| LightGBM | 0,7250 ± 0,0388 | 0,7539 ± 0,0288 | +0,02884 ± 0,03186 | 5/5 | ❌ |

### 11.1 Đọc đúng kết quả LightGBM

Δ = +0,0289 dương ở **5/5 fold** trông hấp dẫn, nhưng:

- std của hiệu (0,0319) **lớn hơn** chính hiệu ⇒ trượt luật 1
- Chỉ có **5 fold** (giao thức churn) so với 25 fold bên RetailRocket ⇒ độ mạnh thấp hơn nhiều
- Quan trọng nhất: **LightGBM + block (0,7539) vẫn THẤP HƠN LR baseline (0,7644)**

⇒ Block sản phẩm giúp LightGBM **gỡ lại phần đã thua**, **không nâng trần**. Model tốt nhất trên
panel này vẫn là LR ở **0,7644**, và block không làm nó nhúc nhích. Khớp với phát hiện cũ của
`diagnose_model_ceiling.py`: trên panel nhỏ, LightGBM **kém hơn** LR.

### 11.2 Phép so hai nguồn dữ liệu — điểm chính của ngày 4

| | RetailRocket (hành vi THẬT) | Churn (dữ liệu TỔNG HỢP) |
|---|---|---|
| Baseline | 0,7428 | 0,7644 (LR) |
| + thực thể sản phẩm | **0,7540** | 0,7650 |
| Δ ghép cặp | **+0,01113** | **+0,0006** |
| Fold dương | **25/25** | 3/5 |
| Kết luận | **NHẬN** | **NULL** |

**Cùng một nguồn thông tin: dương trên dữ liệu thật, null trên dữ liệu tự sinh.**

### 11.3 ⚠️ Ba giới hạn — không được overclaim

1. **Không phải so like-for-like.** C bên RetailRocket có 8 cột ở mức **sự kiện** (category, cha,
   độ sâu, giá, tồn kho, tuổi item, số lần đổi thuộc tính). C bên churn chỉ dựng được **hồ sơ giá**
   ở mức **user × mốc cắt** — panel churn là user-level nên thuộc tính từng item bị tổng hợp mất.
2. **Độ mạnh khác nhau**: 25 fold vs 5 fold.
3. Panel churn nhỏ (348 user).

⇒ Đây là **bằng chứng ủng hộ**, không phải chứng minh. Phát biểu đúng: *"nhất quán với dự đoán rằng
bộ sinh tổng hợp không gắn thuộc tính sản phẩm với churn"*, không phải *"đã chứng minh dữ liệu tổng
hợp là nguyên nhân"*.

### 11.4 Phát hiện KIẾN TRÚC: một lớp feature không dùng được vì schema

`products` có `sales_count` và `rating_avg` — rất hấp dẫn, nhưng bảng **chỉ lưu giá trị HIỆN TẠI,
không có version theo thời gian**. Dùng chúng tại mốc cắt quá khứ là **rò rỉ tương lai**: giá trị đó
đã bao gồm cả lượt bán/đánh giá xảy ra SAU mốc.

**Không sửa được ở tầng feature — phải sửa ở tầng schema** (bảng lịch sử, hoặc snapshot theo ngày).

Đối chiếu: RetailRocket `item_properties` **có** version theo thời gian, nên bên đó làm được
`merge_asof` backward. Đây là khác biệt kiến trúc thật giữa hai nguồn, và là một khuyến nghị cụ thể
cho hệ thống: **muốn dùng thuộc tính sản phẩm cho ML lịch sử thì phải version hoá chúng.**

Loại vì lý do khác: `sale_price` (0 dòng), `brand_id` (0 giá trị phân biệt).

### 11.5 Hiệu chỉnh một phát biểu của chính plan này

Mục 2 viết *"tỉ số/hiệu của feature đã có ⇒ thông tin mới bằng 0"*. Đúng về **lượng thông tin**,
nhưng **không đúng về khả năng biểu diễn**: LR và cây đều không biểu diễn được phép chia, nên
`cart_over_view_price_ratio` vẫn có thể giúp dù thông tin của nó đã nằm trong 2 cột kia. Đã giữ lại
trong block và ghi rõ.

---

## 12. Những gì KHÔNG làm trong đợt này

- Không đổi model (LightGBM giữ nguyên) — đang đo **feature space**, không đo thuật toán
- Không thêm cột là **tỉ số/hiệu của feature đã có** — thông tin mới bằng 0
- Không thêm cửa sổ thời gian khác trên cùng event — đã đo 6 khối kiểu này, cả 6 null
- Không đụng production: `assembler.py` và model đang chạy **giữ nguyên** tới khi có số
- Không báo cáo ΔAUC dưới sàn nhiễu
