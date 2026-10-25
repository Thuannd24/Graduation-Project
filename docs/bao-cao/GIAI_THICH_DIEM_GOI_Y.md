# Cách hệ thống gợi ý tính điểm sản phẩm

Tài liệu này giải thích ba cách gợi ý sản phẩm trong TechStore (SASRec, Recency, Popularity), công thức tính điểm
`score` của từng cách, và cách xem chúng chạy trên hệ thống thật. Nội dung khớp với code trong `AI/recs-service`
(cập nhật 21/10/2026).

---

## 1. Tổng quan

Trang chủ có 3 khối gợi ý. Mỗi khối dùng đúng một cách, phục vụ một mục đích:

| Khối trên web | Tham số API `source` | Thuật toán (`X-Recs-Strategy`) | Mục đích |
|---|---|---|---|
| Gợi ý cho bạn | `for_you` | `sasrec` | **Khám phá** món mới hợp sở thích |
| Xem gần đây | `recent` | `recency` | **Xem lại** món đang cân nhắc |
| Xu hướng mua sắm | `trending` | `popularity` | Sản phẩm **đang hot** với mọi khách |
| Gợi ý mua kèm (giỏ hàng) | API `cross-sell` | `cart_related` | Phụ kiện hợp với món trong giỏ |

Khối "Gợi ý cho bạn" có phương án dự phòng:

```
Có lịch sử xem + model sẵn sàng ──► SASRec        (sasrec)
        │ không được (khách mới, model lỗi)
        ▼
Popularity, đã loại các món khách từng xem         (popularity)
```

Nhờ vậy khách nào cũng có gợi ý, và lỗi ở model không làm trống khối gợi ý.

### Dữ liệu đầu vào đến từ đâu

1. Trình duyệt gom hành vi (xem sản phẩm, thêm giỏ…) và gửi theo lô 10 giây một lần: `POST /api/v1/public/behavior/events`.
2. Sự kiện đi qua Kafka tới `forecast-service`.
3. `forecast-service` ghi:
   - **lịch sử xem của từng khách** vào Redis: `user:<id Keycloak>:history`, món mới nhất đứng trước;
   - **toàn bộ hành vi** vào bảng `user_events` (database `ecommerce_order_db`).
4. `recs-service` đọc hai nguồn này để tính gợi ý.

---

## 2. Popularity: khối "Xu hướng mua sắm"

### Công thức

```
score = (số lượt XEM sản phẩm) × 1 + (số lượt THÊM VÀO GIỎ) × 3
        — chỉ tính hành vi trong 30 ngày gần nhất, của tất cả khách
```

- Nguồn dữ liệu: bảng `user_events`.
- Thêm giỏ được nhân 3 vì đó là tín hiệu **muốn mua** mạnh hơn hẳn việc chỉ xem.
- Sản phẩm xếp theo `score` giảm dần.

**Ví dụ:** Tai nghe Samsung Galaxy Buds 4 Pro có `score: 85`. Có thể hiểu là 70 lượt xem + 5 lượt thêm giỏ
(70 × 1 + 5 × 3 = 85) trong 30 ngày qua.

Code: `AI/recs-service/app/services/popularity.py` (`WINDOW_DAYS = 30`, `CART_WEIGHT = 3.0`),
`catalog.py → get_trending_product_scores`.

---

## 3. Recency: khối "Xem gần đây"

### Công thức

```
score = N − thứ_hạng
        — N = số sản phẩm khác nhau trong lịch sử; món xem gần nhất có thứ hạng 0
```

- Lấy lịch sử xem trong Redis, bỏ trùng lặp, giữ thứ tự gần nhất trước.
- `score` ở đây **chỉ là thứ tự thời gian**, không phải độ phù hợp.
- Sản phẩm đã ẩn hoặc xóa bị bỏ qua.

**Ví dụ:** khách vừa xem Redmi A7 rồi trước đó là Galaxy S26 Ultra thì Redmi A7 có `score: 2`, S26 Ultra có `score: 1`.

**Vì sao giữ thuật toán đơn giản này?** Thực tế khách hay quay lại món vừa xem. Trên dữ liệu thử nghiệm, Recency
đoán trúng khoảng 21% (HR@10 ≈ 0,212), trong khi SASRec khi đã loại món đã xem chỉ khoảng 9%. Hai bài toán khác
nhau ("xem lại" và "khám phá") nên được tách thành hai khối riêng.

Code: `AI/recs-service/app/services/recency.py`.

---

## 4. SASRec: khối "Gợi ý cho bạn"

**SASRec** (*Self-Attentive Sequential Recommendation*) là mô hình học sâu kiến trúc Transformer, cùng họ với các
mô hình ngôn ngữ. Nó đọc **chuỗi sản phẩm khách đã xem theo đúng thứ tự** và đoán món tiếp theo, giống cách YouTube
gợi ý video kế tiếp.

### Cấu hình mô hình đang chạy

| Thông số | Giá trị | Ý nghĩa |
|---|---|---|
| `n_items` | 1.123 | Số sản phẩm trong catalog |
| `maxlen` | 15 | Đọc tối đa 15 sản phẩm xem gần nhất |
| `d_model` | 32 | Mỗi sản phẩm là một vector 32 chiều |
| `n_blocks` | 1 | 1 khối Transformer |
| `n_heads` | 2 | 2 đầu attention |

### Các bước tính điểm

1. **Đầu vào:** lấy tối đa 15 sản phẩm khách xem gần nhất trong Redis, xếp lại theo thứ tự thời gian (cũ → mới).
2. **Biểu diễn:** mỗi sản phẩm được đổi thành **vector embedding 32 chiều** (học được khi huấn luyện), cộng
   thêm **vector vị trí** để mô hình biết món nào xem trước, món nào sau.
3. **Đọc chuỗi bằng self-attention:** chuỗi vector đi qua lớp Transformer. Khi dự đoán, cơ chế attention tự xét
   món nào trong lịch sử quan trọng hơn. Ví dụ xem 3 tai nghe rồi 1 cái sạc, mô hình vẫn hiểu mối quan tâm chính là
   tai nghe. Có mặt nạ nhân quả (causal mask) để mỗi vị trí chỉ nhìn được các món xem trước nó.
4. **Vector sở thích:** đầu ra ở vị trí cuối cùng của chuỗi là **vector sở thích hiện tại** của khách, ký hiệu `h`.
5. **Chấm điểm từng sản phẩm** `i` trong catalog:

   ```
   score(i) = h · eᵢ        (tích vô hướng giữa vector sở thích h và vector sản phẩm eᵢ)
   ```

   Hai vector càng cùng hướng thì tích càng lớn, tức sản phẩm càng hợp với sở thích. Các món khách **đã xem**
   bị gán điểm âm vô cùng để không gợi ý lại.
6. **Lấy top 40 ứng viên** điểm cao nhất (`max(top_k × 4, 40)`) để đưa sang bước sắp xếp lại.

Con số `score: 4.07` thấy trong API chính là `h · eᵢ`. Điểm này chỉ dùng để **so sánh tương đối** giữa các sản
phẩm với cùng một khách, **không phải xác suất mua**.

### Mô hình học như thế nào

Mô hình được huấn luyện theo bài toán **"đoán món kế tiếp"**. Với mỗi chuỗi xem trong dữ liệu huấn luyện, ở mỗi vị
trí, mô hình được dạy cho món khách **thực sự xem tiếp theo** điểm cao hơn các món khác. Sau huấn luyện, những sản
phẩm hay được xem nối tiếp nhau sẽ có vector gần nhau.

### Bước sắp xếp lại sau mô hình (re-rank)

Điểm thô của SASRec rất sát nhau (khoảng 3,9–4,1), nên hệ thống không so trực tiếp mà đổi sang điểm theo thứ
hạng, rồi trừ điểm phạt theo giá:

```
điểm_mới = (1 − thứ_hạng / số_ứng_viên) − phạt_giá

phạt_giá = 0,1 + 0,8 × log₂( giá / (2 × giá_trung_vị) )   nếu giá > 2 lần giá trung vị các món khách đã xem
         = 0,15                                            nếu giá < 0,2 lần giá trung vị
         = 0                                               còn lại
```

- **Ví dụ:** khách hay xem máy khoảng 5 triệu. Một máy 40 triệu (gấp 8 lần) bị phạt
  0,1 + 0,8 × log₂(4) = **1,7**, nên rơi xuống cuối danh sách.
- **Đa dạng:** không để quá **2 sản phẩm cùng danh mục đứng liền nhau**.
- **Lọc:** loại sản phẩm hết hàng, ngừng bán, đã xóa (cả trong lịch sử lẫn trong kết quả).
- Trường `score` trả về **vẫn giữ điểm gốc của mô hình**, nên danh sách hiển thị **không nhất thiết giảm dần**
  theo `score`.

Code: `AI/recs-service/app/services/sasrec.py` (tính `h · eᵢ`), `rerank.py` (sắp xếp lại),
`app/api/endpoints/recommend.py` (chọn thuật toán, gộp kết quả).

---

## 5. Gợi ý mua kèm trong giỏ hàng (`cart_related`)

Không dùng mô hình. Ứng viên được lấy từ hai nguồn:

1. **Thường mua cùng:** sản phẩm từng nằm chung đơn hàng với món trong giỏ (bảng `order_items`, bỏ đơn đã hủy).
   Chỉ giữ món thuộc danh mục phụ kiện, hoặc khác nhóm và rẻ hơn hẳn món chính, để không gợi ý "mua kèm" một
   chiếc điện thoại thứ hai.
2. **Phụ kiện cùng hệ:** danh mục phụ kiện hợp với loại sản phẩm trong giỏ, khớp theo tên danh mục. Ví dụ
   điện thoại → ốp lưng, sạc, pin dự phòng, tai nghe; laptop → sạc, tai nghe, loa, pin dự phòng.

Sau đó:
- **Lọc:** chỉ giữ món còn bán, còn hàng, không đắt hơn món đắt nhất trong giỏ.
- **Xếp hạng:** món "thường mua cùng" đứng trước phụ kiện phổ biến; không để 2 món cùng danh mục đứng liền nhau.
- **Bù:** nếu không đủ, bù bằng sản phẩm phổ biến khác danh mục với giỏ.

Code: `AI/recs-service/app/services/cross_sell.py`.

---

## 6. Cách xem trên hệ thống thật

### 6.1 Trên trình duyệt (F12)

1. Đăng nhập `customer`, mở trang chủ http://localhost:5173.
2. F12 → tab **Network** → gõ `recommendations` vào ô lọc → nhấn **F5** để tải lại trang.
3. Có 3 request `personal?top_k=10&source=for_you`, `...recent`, `...trending`. Bấm vào một request:
   - **Headers → Response Headers**, dòng `x-recs-strategy`: thuật toán đang chạy.
   - **Preview**: mở `▶ 0`, `▶ 1`… để xem `score` của từng sản phẩm.
4. Tích **Keep log**, sang `/cart` để thấy request `cross-sell` với `x-recs-strategy: cart_related`.

### 6.2 Gọi API bằng PowerShell

```powershell
$t = (Invoke-RestMethod -Method Post "http://localhost:8083/realms/ecommerce-realm/protocol/openid-connect/token" `
      -Body @{grant_type="password"; client_id="ecommerce-frontend"; username="customer"; password="12345678"}).access_token
foreach ($s in "for_you","recent","trending") {
  $r = Invoke-WebRequest "http://localhost:8080/api/v1/public/recommendations/personal?top_k=5&source=$s" `
       -Headers @{Authorization="Bearer $t"} -UseBasicParsing
  "== $s  (strategy: $($r.Headers['X-Recs-Strategy']))"
  ($r.Content | ConvertFrom-Json) | Select-Object id, name, price, score | Format-Table -AutoSize
}
```

### 6.3 Xem dữ liệu đầu vào

- Lịch sử xem của `customer` (món mới nhất trước):
  ```powershell
  docker exec infra-redis redis-cli lrange user:eeb77c2d-9938-474c-aa6a-438308be1a87:history 0 19
  ```
  Tài khoản khác: `docker exec infra-redis redis-cli --scan --pattern 'user:*:history'`.
- Swagger http://localhost:8003/docs → `POST /api/v1/recommend`, nhập
  `{"userId": "eeb77c2d-9938-474c-aa6a-438308be1a87", "sessionId": "demo", "top_k": 10}` → **Execute**.
- Hành vi dùng cho Popularity: bảng `user_events` trong `ecommerce_order_db` (xem bằng DBeaver, cổng 3308).

### 6.4 Thử thấy gợi ý thay đổi

Mở 2–3 sản phẩm cùng loại (ví dụ vài tai nghe), quay về trang chủ, đợi khoảng 15 giây rồi tải lại:
"Xem gần đây" có ngay các món đó, "Gợi ý cho bạn" nghiêng về loại sản phẩm đó.

---

## 7. Câu hỏi hội đồng có thể hỏi

**Hỏi: Em tính điểm gợi ý như thế nào?**
> "Mỗi khối dùng một cách. **Xu hướng** đếm hành vi thật của mọi khách trong 30 ngày: xem 1 điểm, thêm giỏ
> 3 điểm. **Xem gần đây** chỉ xếp theo thời gian. **Gợi ý cho bạn** dùng SASRec: mô hình Transformer biến chuỗi
> sản phẩm khách đã xem thành một vector sở thích, rồi lấy tích vô hướng với vector của từng sản phẩm; tích càng
> lớn càng hợp. Sau đó em sắp xếp lại theo tầm giá và độ đa dạng danh mục."

**Hỏi: Vì sao không chỉ dùng SASRec?**
> "Khách mới chưa có lịch sử thì SASRec không có gì để đọc (cold-start), nên cần Popularity làm dự phòng. Còn
> nhu cầu xem lại món vừa xem thì Recency làm tốt hơn hẳn, nên em tách thành khối riêng."

**Hỏi: Vì sao phải sắp xếp lại sau mô hình?**
> "SASRec chỉ học thứ tự sản phẩm, không biết giá. Nếu không sắp xếp lại, khách xem máy 5 triệu vẫn có thể được
> gợi ý máy 40 triệu. Điểm thô của mô hình cũng rất sát nhau nên em dùng thứ hạng, cộng phạt giá và giới hạn
> 2 sản phẩm cùng danh mục liền nhau."

**Hỏi: Điểm này có phải xác suất khách mua không?**
> "Không. Điểm SASRec chỉ để so sánh tương đối giữa các sản phẩm với cùng một khách. Điểm Popularity là số đếm
> hành vi. Điểm Recency chỉ là thứ tự thời gian."

**Hỏi: Mô hình chính xác đến đâu?**
> "Em đánh giá bằng HR@10, tức tỉ lệ món khách thật sự xem tiếp nằm trong top 10 gợi ý. SASRec đạt khoảng
> 0,05, nhỉnh hơn mức nền Category-Pop khoảng 0,034, nhưng khoảng tin cậy của chênh lệch vẫn chứa 0 nên chưa có
> ý nghĩa thống kê. Mô hình được huấn luyện trên dữ liệu tổng hợp, nên đây là chứng minh phương pháp; muốn tốt
> hơn cần huấn luyện lại định kỳ trên hành vi thật và A/B test."

---

## 8. Giới hạn hiện tại

- Mô hình huấn luyện trên **dữ liệu tổng hợp**, chưa có hành vi thật đủ lớn.
- Sản phẩm mới thêm sau khi huấn luyện chưa có vector, nên SASRec chưa gợi ý được chúng cho tới lần huấn luyện sau.
- Gợi ý phụ kiện ghép theo tên danh mục, chưa xét đúng đời máy (ví dụ có thể gợi ý ốp lưng iPad cho điện thoại).
- Lịch sử của tài khoản test `customer` có thể bị lệch do các lần kiểm thử; trước buổi demo nên tự lướt vài sản
  phẩm để chuỗi hành vi tự nhiên hơn.
