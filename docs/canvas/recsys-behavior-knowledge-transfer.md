# Recommendation (SASRec) + Behavior Tracking — Tài liệu bàn giao kiến thức

> **Dành cho:** người phụ trách P1 (hoặc bất kỳ ai mới vào phần này), chưa cần biết trước về recommender system.
> **Đọc xong sẽ:** hình dung được toàn bộ luồng, hiểu các thuật ngữ, biết mỗi việc nằm ở file nào, và tự trả lời được
> các câu hỏi phản biện cơ bản.
> **Trạng thái code mô tả ở đây:** nhánh `fix/recs-p0-serving` (đã sửa GĐ0 + GĐ1, **chưa commit**). Mục 9 ghi rõ những chỗ
> khác với nhánh `ai/behavoir`.
>
> Tài liệu liên quan:
> - [`recsys-behavior-flow-review.md`](recsys-behavior-flow-review.md) — bảng luồng kỹ thuật + số đo chi tiết
> - [`recsys-p1-assessment-and-plan.md`](recsys-p1-assessment-and-plan.md) — đánh giá và kế hoạch 10 tuần
> - [`recsys-gd0-browser-test.md`](recsys-gd0-browser-test.md) — hướng dẫn kiểm thử trên trình duyệt

---

## Mục lục

1. [Bức tranh lớn trong 1 phút](#1-bức-tranh-lớn-trong-1-phút)
2. [Một vòng đầy đủ: câu chuyện của khách tên An](#2-một-vòng-đầy-đủ-câu-chuyện-của-khách-tên-an)
3. [Phần A — Behavior Tracking chi tiết](#3-phần-a--behavior-tracking-chi-tiết)
4. [Phần B — Kafka và Consumer](#4-phần-b--kafka-và-consumer)
5. [Phần C — Train SASRec (offline)](#5-phần-c--train-sasrec-offline)
6. [Phần D — Phục vụ gợi ý (online)](#6-phần-d--phục-vụ-gợi-ý-online)
7. [Phần E — Hiển thị và vòng phản hồi](#7-phần-e--hiển-thị-và-vòng-phản-hồi)
8. [Đánh giá: đo gợi ý tốt hay dở](#8-đánh-giá-đo-gợi-ý-tốt-hay-dở)
9. [Hiện trạng: cái gì đã chạy, cái gì còn thiếu](#9-hiện-trạng-cái-gì-đã-chạy-cái-gì-còn-thiếu)
10. [Hợp đồng dữ liệu (tra cứu nhanh)](#10-hợp-đồng-dữ-liệu-tra-cứu-nhanh)
11. [Bản đồ code và thứ tự nên đọc](#11-bản-đồ-code-và-thứ-tự-nên-đọc)
12. [Chạy thử trên máy](#12-chạy-thử-trên-máy)
13. [Câu hỏi thường gặp (và câu hỏi phản biện)](#13-câu-hỏi-thường-gặp-và-câu-hỏi-phản-biện)
14. [Từ điển thuật ngữ](#14-từ-điển-thuật-ngữ)

---

## 1. Bức tranh lớn trong 1 phút

Hình dung website là một **cửa hàng điện máy**, trong đó có 3 "nhân viên":

| Nhân viên | Tên kỹ thuật | Việc | Khi nào làm |
|---|---|---|---|
| 👀 **Người quan sát** | Behavior Tracking | Ghi lại mọi thứ khách làm: xem máy nào, bỏ gì vào giỏ, cuộn trang, rời tab… | Liên tục, mỗi khi khách thao tác |
| 📚 **Người học việc** | Training SASRec | Đọc sổ ghi chép của **tất cả** khách để rút ra quy luật *"xem A, B thì hay xem C"* | Thỉnh thoảng, chạy riêng (offline) |
| 💁 **Người tư vấn** | Serving (`recs-service`) | Khi khách mở trang chủ: nhìn vài món khách vừa xem, dùng quy luật đã học để gợi ý | Mỗi lần khách tải trang (online) |

Phần việc P1 gồm **cả 3 nhân viên** này, cộng với dây nối giữa họ.

```
 KHÁCH ──thao tác──► 👀 Người quan sát ──ghi──► 📒 Sổ ghi chép (MySQL)  ──đọc định kỳ──► 📚 Người học việc
                              │                                                             │
                              └──ghi nhanh──► 🧠 Trí nhớ ngắn hạn (Redis)                  │ tạo ra "bộ não"
                                                        │                                   ▼
 KHÁCH ◄──── 10 gợi ý ──── 💁 Người tư vấn ◄──đọc 50 món gần nhất──┘        🗂️ checkpoint sasrec.pt
                              ▲                                                             │
                              └─────────────────────── nạp "bộ não" ◄───────────────────────┘
```

---

## 2. Một vòng đầy đủ: câu chuyện của khách tên An

1. **An mở web**, chưa đăng nhập. Trình duyệt tự tạo cho An một **mã phiên** (`session id`, ví dụ `a1b2-…`), lưu trong
   `sessionStorage`. Mọi request sau đó đều mang mã này trong header `X-Session-Id`.
2. **An xem iPhone 15.** FE gọi `GET /public/products/15`. product-service trả thông tin sản phẩm, **đồng thời** bỏ một
   "lá thư" `VIEW_PRODUCT (session=a1b2, product=15)` vào hộp thư **Kafka**.
3. **An cuộn trang, phóng to ảnh.** FE không gửi ngay mà **gom** các vi hành vi này, 10 giây sau gửi một lô lên
   forecast-service. forecast-service cũng bỏ chúng vào Kafka.
4. **Người đọc thư (consumer)** lấy thư ra khỏi Kafka và:
   - ghi **mọi** thư vào sổ dài hạn MySQL (`user_events`);
   - riêng `VIEW_PRODUCT` / `ADD_TO_CART` thì ghi thêm vào **trí nhớ ngắn hạn** Redis: `session:a1b2:history = [15]`.
5. **An xem tiếp ốp lưng (id 40), sạc nhanh (id 52).** Redis giờ là `[52, 40, 15]`, **mới nhất đứng đầu**.
6. **An quay lại trang chủ.** FE gọi `GET /api/v1/public/recommendations/personal`. recs-service:
   - đọc Redis → `[52, 40, 15]`;
   - vì có lịch sử và có "bộ não" SASRec → đảo lại theo thời gian `[15, 40, 52]` → đưa vào model;
   - model chấm điểm cả 1.123 sản phẩm, **bỏ 3 món đã xem**, lấy 10 món điểm cao nhất (ví dụ AirPods, cáp USB-C…);
   - tra tên/giá/ảnh thật rồi trả về.
7. **FE hiển thị** 10 gợi ý và bắn `IMPRESSION` cho từng món đang hiện ("đã cho An thấy"). An bấm vào AirPods → quay
   lại bước 2. **Vòng lặp khép kín.**
8. **Tối hôm đó**, bạn chạy script train. Model đọc lại toàn bộ sổ (có cả chuỗi của An) và học thêm quy luật mới.

---

## 3. Phần A — Behavior Tracking chi tiết

### 3.1 Ba nguồn sinh event

| Nguồn | Ai phát | Sự kiện | Khi nào | Topic Kafka |
|---|---|---|---|---|
| **Xem sản phẩm** | product-service (Java) — [`ProductViewEventProducer`](../../BE/product-service/src/main/java/com/ecommerce/productservice/event/producer/ProductViewEventProducer.java) | `VIEW_PRODUCT` | Mỗi lần gọi `GET /public/products/{id}` hoặc `/slug/{slug}` | `product-viewed-events` |
| **Giỏ hàng** | order-service (Java) — [`CartEventProducer`](../../BE/order-service/src/main/java/com/ecommerce/orderservice/event/producer/CartEventProducer.java) | `ADD_TO_CART`, `UPDATE_CART_QTY`, `REMOVE_FROM_CART`, `CLEAR_CART` | Mỗi thao tác giỏ (bỏ qua khách vãng lai `anonymous`) | `cart-updated-events` |
| **Vi hành vi** | Trình duyệt — [`behaviorTracker.ts`](../../FE/src/services/behaviorTracker.ts) → forecast-service | 14 loại, xem 3.2 | Khi xảy ra, gửi theo lô | `user-behavior-events` |

**Vì sao chia hai loại?** "Xem sản phẩm" và "giỏ hàng" là **thao tác nghiệp vụ**: đã có request tới server Java, nên
server phát event luôn. Còn "cuộn trang" hay "rời tab" **không có request nào** tới server, nên chỉ trình duyệt mới biết
và phải tự gửi lên.

### 3.2 Bảng chữ cái hành vi (19 ký hiệu)

**5 hành vi nghiệp vụ:** `VIEW_PRODUCT`, `ADD_TO_CART`, `UPDATE_CART_QTY`, `REMOVE_FROM_CART`, `CLEAR_CART`.

**14 vi hành vi từ FE:**

| Action | Nghĩa | `weight` mang gì | Bắn ở đâu |
|---|---|---|---|
| `VIEW_CART` | Mở trang giỏ | — | CartPage |
| `BEGIN_CHECKOUT` | Vào luồng thanh toán | — | CheckoutPage |
| `VIEW_SHIPPING_FEE` | Nhìn thấy phí ship | — | CheckoutPage |
| `COUPON_APPLIED` / `COUPON_FAILED` | Áp mã thành công / thất bại | — | CheckoutPage |
| `TAB_HIDDEN` / `TAB_VISIBLE` | Rời tab / quay lại (có thể đi so giá) | — | tự động (`visibilitychange`) |
| `SCROLL_DEPTH` | Cuộn tới mốc | % (25/50/75/100) | tự động |
| `PAGE_DWELL` | Thời gian ở một trang | số giây | tự động |
| `PRODUCT_ZOOM` | Phóng to ảnh sản phẩm | — | ProductDetailPage |
| `SEARCH` | Tìm kiếm | — | SearchPage |
| `FILTER_APPLIED` / `SORT_APPLIED` | Lọc / sắp xếp (hành vi so sánh) | — | CategoryPage, SearchPage |
| `IMPRESSION` | Sản phẩm **hiện ra** trong một danh sách (chưa chắc được bấm) | — | Trang chủ (khối gợi ý), CategoryPage, SearchPage |

**Vì sao cần nhiều loại như vậy?** Thí nghiệm trên dữ liệu thật RetailRocket (chỉ 3 loại: xem/giỏ/mua) cho thấy **thứ
tự** hành vi hầu như không thêm thông tin. Bảng chữ cái quá nghèo thì chuỗi cũng chẳng khác gì một phép đếm. Có nhiều
loại hơn, ví dụ `cart → remove → cart` mang nghĩa "đổi ý", thì thứ tự mới có cái để học. Đây là luận điểm nền của
phần Behavior Tracking.

**Vì sao chỉ dùng hành vi có trên mobile?** TMĐT Việt Nam phần lớn truy cập bằng điện thoại. Hover chuột hay gia tốc chuột
chỉ có trên desktop, nên dự án chủ động không dùng.

### 3.3 Tracker FE hoạt động thế nào ([`behaviorTracker.ts`](../../FE/src/services/behaviorTracker.ts))

```
trackBehavior("PRODUCT_ZOOM", {itemId: 15})
        │
        ▼
   ┌─────────┐   mỗi 10 giây      ┌──────────────────────────────────────┐
   │  queue  │ ─── hoặc đủ 200 ──►│ POST /api/v1/public/behavior/events  │
   │ (RAM)   │ ─── hoặc rời tab ─►│ fetch keepalive + Authorization      │
   └─────────┘                    │ (khách chưa đăng nhập rời tab:       │
                                  │  sendBeacon)                         │
                                  └──────────────────────────────────────┘
```

**Danh tính:** tracker gửi kèm token đăng nhập (nếu có), nhờ đó gateway gắn `X-User-Id` và vi hành vi được ghép đúng với
xem/giỏ của cùng người dùng. Trước GĐ1 tracker không gửi token, nên mọi vi hành vi có `user_id = NULL`. Token hết hạn
thì gateway trả 401, và tracker **gửi lại không kèm token** để không mất lô event (vẫn ghép được theo phiên).

**Đổi trang trong SPA:** component `BehaviorRouteTracker` trong [`App.jsx`](../../FE/src/App.jsx) gọi
`notifyRouteChange()` mỗi khi đường dẫn đổi. Hàm này ghi `PAGE_DWELL` của trang vừa rời và reset mốc cuộn. Trước GĐ1
tracker chỉ nghe `popstate`, mà sự kiện này chỉ phát khi bấm Back, nên bấm link bình thường thì không ghi gì.

Ba nguyên tắc được viết ngay đầu file:
1. **Không bao giờ làm hỏng trải nghiệm**: mọi thứ bọc `try/catch`, lỗi mạng bị nuốt im lặng.
2. **Gom lô**: vi hành vi dày hơn hẳn event nghiệp vụ, gửi từng cái sẽ tốn mạng và pin.
3. **Timestamp là lúc hành vi xảy ra**, không phải lúc server nhận. Nếu lấy giờ server, cả lô 10 giây sẽ bị dồn vào
   cùng một mốc và **mất thứ tự**, mà thứ tự lại chính là thứ cần đo.

Mỗi event gửi lên có dạng:
```json
{ "actionType": "IMPRESSION", "itemId": 15, "categoryId": null, "weight": 3, "source": "for_you",
  "timestamp": "2026-09-26T09:29:36", "sessionId": "a1b2-..." }
```

`timestamp` là **giờ UTC** (không có hậu tố `Z`). Mọi nguồn đều theo quy ước này, xem mục 10.

`trackImpressions(ids, source)` bắn **1 event cho mỗi sản phẩm** (tối đa 20 mỗi danh sách), kèm:
- `weight` = **vị trí** hiển thị (1 = đầu danh sách). Có vị trí mới tách được "không bấm vì không thích" khỏi "không bấm
  vì nằm cuối, không ai kéo tới" (position bias).
- `source` = danh sách nằm ở đâu: `for_you` / `recent` / `trending` (3 tab gợi ý), `search`, `category`. Có source mới
  tính được CTR riêng cho từng khối gợi ý.

### 3.4 Cổng nhận vi hành vi (forecast-service)

Endpoint: `POST /api/v1/public/behavior/events` — [`forecast.py`](../../AI/forecast-service/app/api/endpoints/forecast.py),
schema ở [`models/behavior.py`](../../AI/forecast-service/app/models/behavior.py).

- **Public có chủ đích**: khách chưa đăng nhập vẫn cần được ghi nhận, vì đây chính là nhóm quan trọng cho bài toán bỏ giỏ.
- **Kiểm tra đầu vào**: `actionType` phải thuộc 14 loại; `weight` trong khoảng `[0, 86400]`; mỗi lô tối đa 200. Sai
  một event thì **cả lô bị từ chối** (HTTP 422).
- **Danh tính**: chỉ tin `X-User-Id` do gateway gắn từ JWT. Gateway luôn xoá mọi header `X-User-*` mà client tự gửi,
  nên không ai giả mạo được.
- **Luôn trả 200** kể cả khi publish lỗi, vì đây là đường phụ trợ, không được làm FE báo lỗi cho người dùng.
- Không ghi thẳng database mà **publish lên Kafka** (lý do ở mục 4.1).

---

## 4. Phần B — Kafka và Consumer

### 4.1 Vì sao phải qua Kafka?

**Kafka** giống một **hộp thư có nhiều ngăn** (mỗi ngăn là một **topic**). Bên gửi (**producer**) bỏ thư vào, bên nhận
(**consumer**) lấy ra đọc theo tốc độ của mình.

| Lợi ích | Giải thích |
|---|---|
| **Tách rời** | product-service không cần biết ai sẽ dùng event "xem sản phẩm". Nó chỉ bỏ thư vào hộp |
| **Chịu tải** (backpressure) | Vi hành vi có thể dồn dập. Kafka giữ thư lại, consumer ghi dần, MySQL không bị dội |
| **Một đường ghi duy nhất** | Cả 3 nguồn đều đi qua **cùng một consumer** vào `user_events`. Mọi chuẩn hoá và kiểm tra chỉ nằm ở một chỗ |
| **Giữ thứ tự trong phiên** | Vi hành vi dùng `sessionId` làm key, nên event cùng phiên vào cùng partition và giữ nguyên thứ tự |

### 4.2 Consumer làm gì ([`behavior_consumer.py`](../../AI/forecast-service/app/kafka/behavior_consumer.py))

Chạy nền trong forecast-service (khởi động cùng app), nghe cả 3 topic.

```
đọc 1 message
   │
   ├─ 1. Chuẩn hoá về cùng một dạng:
   │      {user_id, session_id, item_id, category_id, action_type, weight, created_at}
   │      (vd "ADD_ITEM" của giỏ hàng → "ADD_TO_CART")
   │
   ├─ 2. Không có cả user_id lẫn session_id → bỏ
   │
   ├─ 3. Ghi Redis — CHỈ khi action ∈ {VIEW_PRODUCT, ADD_TO_CART}
   │      key = user:{user_id}:history   (nếu có user)
   │          hoặc session:{session_id}:history
   │      LPUSH item_id  → thêm vào ĐẦU danh sách
   │      LTRIM 0..49    → chỉ giữ 50 món gần nhất
   │      EXPIRE 30 ngày → không hoạt động 30 ngày thì tự xoá
   │
   ├─ 4. Ghi MySQL `user_events` — MỌI action
   │
   └─ 5. Commit offset (đánh dấu "đã đọc thư này")
```

**Vì sao chỉ "xem" và "thêm giỏ" được vào Redis?** Redis là đầu vào cho **gợi ý sản phẩm**. Rời tab 5 lần ở một sản
phẩm không có nghĩa là thích nó. Còn **xoá khỏi giỏ** mang nghĩa *không muốn*. Trước GĐ0, `REMOVE_FROM_CART` bị đẩy vào
Redis nên món vừa bị xoá lại đứng **đầu** danh sách gợi ý. Tập hợp này giờ được khai ở một chỗ duy nhất là
`HISTORY_ACTIONS` trong [`contracts.py`](../../AI/shared-common/shared_common/contracts.py).

### 4.3 Hai nơi lưu, hai mục đích

| | Redis `*:history` | MySQL `user_events` |
|---|---|---|
| Ví như | Trí nhớ ngắn hạn | Sổ ghi chép dài hạn |
| Giữ gì | 50 product id gần nhất, **mới nhất ở đầu** | Mọi event, đủ cột |
| Tốc độ đọc | Dưới 1 ms | Chậm hơn |
| Ai đọc | recs-service, **mỗi request** | Script train SASRec, feature churn (P2), phân tích |
| Mất đi thì sao | Dựng lại được từ MySQL bằng `scripts/backfill_history.py` | Mất dữ liệu thật |

---

## 5. Phần C — Train SASRec (offline)

Script: [`recsys_platform_sasrec.py`](../../AI/forecast-service/app/training/experiments/recsys_platform_sasrec.py).
"Offline" nghĩa là chạy riêng, không liên quan tới lúc khách đang dùng web.

### 5.1 Từ sổ ghi chép đến chuỗi

1. Lấy các dòng `VIEW_PRODUCT` / `ADD_TO_CART` trong `user_events`, sắp theo `user_id` rồi theo thời gian.
2. Mỗi user thành một chuỗi, ví dụ An: `[15, 40, 52, 88]` (product id thật).
3. **Đánh số lại** product id thành 0, 1, 2, … (gọi là `item_id_map`). Lý do: bảng embedding của model cần chỉ số liên tục.
   Map này **được lưu kèm checkpoint** để lúc phục vụ dịch ngược ra product id thật.

### 5.2 Chia train / test (leave-last-out)

Với mỗi user, **giấu món cuối cùng** để làm bài kiểm tra; phần còn lại dùng để luyện:

```
An:   15 → 40 → 52 → 88
      └──── luyện ────┘  └ kiểm tra (model phải đoán ra 88)
```

### 5.3 Tạo bài tập luyện

Từ chuỗi luyện `[15, 40, 52]`, tạo ra **mọi tiền tố** (tương đương "sliding window"):

| Model được xem | Phải đoán |
|---|---|
| `[15]` | 40 |
| `[15, 40]` | 52 |

Model chỉ đọc tối đa **15 món gần nhất** (`MAXLEN = 15`). Chuỗi ngắn hơn được **đệm số 0 vào bên trái** (padding):

```
[15, 40]  →  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 40]
                                               └ món mới nhất luôn ở vị trí CUỐI
```

(Thực tế trong tensor dùng `index nội bộ + 1`, vì số 0 đã dành cho "ô trống".)

### 5.4 SASRec "suy nghĩ" thế nào — không cần toán

**Bước 1 — Embedding: mỗi sản phẩm có một toạ độ trên "bản đồ sở thích".**
Ví dụ đơn giản hoá còn 2 chiều (thực tế là 32 chiều):

| Sản phẩm | Toạ độ |
|---|---|
| iPhone | `[0.9, 0.1]` |
| Ốp lưng iPhone | `[0.8, 0.2]` |
| Chuột gaming | `[0.2, 0.8]` |
| Laptop gaming | `[0.1, 0.9]` |

Món hay được xem cùng nhau sẽ nằm gần nhau. **Model tự học ra bản đồ này**, không ai phải điền tay.

**Bước 2 — Positional embedding: biết món nào trước, món nào sau.**
Mỗi vị trí trong chuỗi cũng có một vector riêng, được cộng vào. Nhờ đó `iPhone → ốp lưng` khác với `ốp lưng → iPhone`.
Đây cũng là lý do **thứ tự đưa vào phải đúng**. Lỗi đảo thứ tự sửa ở GĐ0 từng khiến model "đọc câu văn ngược".

**Bước 3 — Self-attention: nhìn lại cả chuỗi, tự quyết món nào quan trọng.**
Chuỗi của An là `laptop → chuột → iPhone → ốp lưng`. Khi đoán món tiếp theo, model tự tính "trọng số chú ý", kiểu như:

| Món trong quá khứ | Trọng số chú ý (minh hoạ) |
|---|---|
| laptop | 0.05 |
| chuột | 0.10 |
| iPhone | 0.35 |
| ốp lưng | 0.50 |

Kết quả là một vector **"trạng thái sở thích hiện tại"** `h`, ví dụ `h ≈ [0.85, 0.15]` (đang nghiêng về đồ iPhone).

**Bước 4 — Causal mask: không được nhìn trộm tương lai.**
Khi đoán món ở vị trí 3, model **chỉ được** nhìn vị trí 1–2. Không có mặt nạ này thì lúc luyện model sẽ "chép đáp án".

**Bước 5 — Chấm điểm mọi sản phẩm.**
Điểm = độ "cùng hướng" giữa `h` và toạ độ sản phẩm (phép nhân vô hướng, dot product):

| Sản phẩm | Điểm = h · toạ độ |
|---|---|
| Ốp lưng iPhone | 0.85×0.8 + 0.15×0.2 = **0.71** |
| Chuột gaming | 0.85×0.2 + 0.15×0.8 = 0.29 |
| Laptop gaming | 0.85×0.1 + 0.15×0.9 = 0.22 |

Sắp xếp theo điểm rồi lấy top 10 là ra gợi ý.

### 5.5 Luyện bằng "câu hỏi trắc nghiệm" (sampled softmax)

Bắt model chấm cả 1.123 sản phẩm ở **mỗi** bước luyện thì rất tốn. Thay vào đó, mỗi bài tập là **một câu trắc
nghiệm 51 đáp án**: 1 đáp án đúng (món thật sự được xem tiếp) và 50 đáp án sai lấy ngẫu nhiên (món phổ biến bị chọn
nhiều hơn). Model bị phạt (**loss**) khi đáp án đúng không có điểm cao nhất. Lặp lại khoảng 158.000 bài × tối đa 30 lượt
(**epoch**), và dừng sớm khi loss gần như không giảm nữa.

### 5.6 Cấu hình và kết quả lần chạy gần nhất

| Tham số | Giá trị | Ý nghĩa |
|---|---|---|
| `D_MODEL` | 32 | Số chiều của "bản đồ sở thích" |
| `N_BLOCKS` / `N_HEADS` | 1 / 2 | Số lớp attention / số "góc nhìn" song song |
| `MAXLEN` | 15 | Đọc tối đa 15 món gần nhất |
| `N_NEGATIVES` | 50 | Số đáp án sai mỗi câu trắc nghiệm |
| `BATCH_SIZE` / `LR` | 32 / 0.001 | Số bài mỗi lần cập nhật / tốc độ học |

Lần chạy 2026-09-26 trên seed (500 user, khoảng 159K event): **31 phút CPU**, loss từ 4,26 xuống 2,58, dừng sớm ở epoch 20.

### 5.7 Checkpoint

Kết quả được lưu thành file `.pt` gồm: trọng số model, cấu hình, `item_id_map`, và nhãn `item_space = "platform_v1"`.

**Vì sao cần nhãn `platform_v1`?** Dự án có cả checkpoint train trên **dữ liệu nghiên cứu công khai** (REES46), với chỉ
số item hoàn toàn khác product id thật. Nạp nhầm loại đó vào service sẽ ra gợi ý **sai nhưng trông như hợp lệ**, còn
nguy hiểm hơn cả lỗi rõ ràng. Service chỉ nạp checkpoint có đúng nhãn này.

---

## 6. Phần D — Phục vụ gợi ý (online)

Service: `recs-service` (FastAPI, cổng 8003). File chính: [`recommend.py`](../../AI/recs-service/app/api/endpoints/recommend.py).

### 6.1 Request đi qua đâu

```
Trình duyệt ──► api-gateway :8080 ──► recs-service :8003 ──► Redis (lịch sử)
                  │                          │
                  │ kiểm tra JWT             ├──► MySQL products (tên/giá/ảnh)
                  │ gắn X-User-Id            └──► MySQL user_events (Popularity)
                  │ route theo đường dẫn
```

| Endpoint | Ai dùng | Cần đăng nhập ở gateway? | Danh tính lấy từ |
|---|---|---|---|
| `GET /api/v1/public/recommendations/personal?source=…` | **FE trang chủ** (3 tab) | Không | `X-User-Id` (nếu có token) → `X-Session-Id` |
| `GET /api/v1/recommendations/personal?source=…` | Client cũ | Có | `X-User-Id` → `X-Session-Id` |
| `POST /api/v1/recommend` | Gọi nội bộ / debug | (gateway chưa route) | `userId`/`sessionId` trong body; trả kèm `strategy` |
| `GET /api/v1/recommendations/cross-sell` | Trang giỏ hàng | Có | — (hiện vẫn là Popularity) |

Mọi response đều có header **`X-Recs-Strategy`** (`sasrec` / `recency` / `popularity`) để biết tầng nào đã trả lời. Mở
DevTools → Network là thấy.

**Vì sao không route nào nhận `?user_id=`?** Nếu nhận, ai cũng xem được gợi ý dựng từ lịch sử của người khác chỉ bằng
cách đoán id. Danh tính chỉ được lấy từ thứ mà gateway đảm bảo. Việc gateway gắn `X-User-Id` cả trên route `/public/**`
khi request có JWT đã được **kiểm E2E thật** ngày 2026-10-01 (xem [`recsys-gd0-browser-test.md`](recsys-gd0-browser-test.md)).

Tham số **`source`** chọn nguồn cho từng khối UI (mặc định `auto`):

| `source` | Nguồn | Khi không dùng được |
|---|---|---|
| `auto` | Thang 3 tầng ở mục 6.3 | — |
| `for_you` | SASRec (**món mới**) | Popularity **đã loại món đã xem**. Không bao giờ rơi về Recency, để không lặp lại tab "Xem gần đây" |
| `recent` | Recency (**món đã xem**, mới nhất trước) | Trả rỗng |
| `trending` | Popularity 30 ngày | — |
| giá trị khác | — | HTTP 422 |

### 6.2 Lấy lịch sử

`_resolve_history(user_id, session_id)`: đọc `user:{id}:history`, nếu rỗng thì đọc `session:{sid}:history`. Lý do: một
người vừa đăng nhập thì chưa có lịch sử theo user, nhưng phiên đang duyệt đã có vài món. Bỏ qua phiên là phí đúng tín
hiệu mới nhất.

### 6.3 Thang 3 tầng (`_recommend_for_history`)

```
Có lịch sử?  ──không──────────────────────────────────────────►  3. POPULARITY
   │có
   ▼
Có checkpoint SASRec hợp lệ? ──không──►  2. RECENCY
   │có
   ▼
1. SASREC ── trả rỗng (mọi món trong lịch sử đều lạ với model) ──►  2. RECENCY
```

| Tầng | File | Làm gì | Đặc điểm |
|---|---|---|---|
| **1. SASRec** | [`sasrec.py`](../../AI/recs-service/app/services/sasrec.py) | Đảo lịch sử Redis (mới→cũ) thành cũ→mới, dịch sang index nội bộ, đệm trái tới 15, chạy model, **loại món đã xem**, lấy top-k, dịch ngược ra product id | Gợi ý món **mới**. Model được nạp **một lần** ở request đầu tiên |
| **2. Recency** | [`recency.py`](../../AI/recs-service/app/services/recency.py) | Trả lại chính các món đã xem, mới nhất trước, bỏ trùng | Thực chất là "Xem gần đây", không có AI |
| **3. Popularity** | [`popularity.py`](../../AI/recs-service/app/services/popularity.py) | Món được quan tâm nhiều nhất 30 ngày qua: điểm = số lượt xem + 3 × số lượt thêm giỏ. Cache 5 phút | Cho khách mới (**cold-start**). Chưa có hành vi nào thì mới rơi về `sales_count` |

### 6.4 Làm giàu thông tin sản phẩm ([`catalog.py`](../../AI/recs-service/app/services/catalog.py))

Model chỉ biết **id**. Bước cuối là tra bảng `products` (chỉ lấy `active = 1`) để trả về cho FE:

```json
{ "id": "387", "name": "Màn hình Gaming LG Ultragear 24GS65F", "price": 2990000,
  "oldPrice": 4290000, "image": "https://…/main-250.png", "slug": "…", "rating": 0.0, "score": 8.42 }
```

`price` ưu tiên giá khuyến mãi. `oldPrice` chỉ có khi đang giảm giá thật (FE sẽ gạch ngang). Sản phẩm đã ẩn hoặc xoá bị
bỏ qua, không bịa dữ liệu.

### 6.5 Tốc độ

Đo được: **p50 ≈ 13 ms, p95 ≈ 17 ms** với tầng SASRec, thấp hơn nhiều so với mục tiêu 200 ms của plan. Model nhỏ
(khoảng 210 KB) và chạy CPU là đủ.

---

## 7. Phần E — Hiển thị và vòng phản hồi

1. [`HomePage.jsx`](../../FE/src/features/catalog/pages/HomePage.jsx) gọi **song song** 3 lần
   `aiApi.getRecommendations(source)` với `for_you`, `recent`, `trending`.
2. [`aiApi.ts`](../../FE/src/services/aiApi.ts) gọi route public. Hàm `asProductList` nhận cả dạng mảng trần lẫn dạng
   `{data: [...]}` (trước đây đọc `.data` trên mảng nên nhận `undefined`, khối gợi ý luôn rỗng).
3. [`SuggestedSection.jsx`](../../FE/src/features/catalog/components/SuggestedSection.jsx) hiển thị 3 tab, **mỗi tab
   là một nguồn thật**:

   | Tab | Nguồn | Bài toán |
   |---|---|---|
   | GỢI Ý CHO BẠN | SASRec | Khám phá (món mới) |
   | XEM GẦN ĐÂY | Recency | Xem lại |
   | XU HƯỚNG MUA SẮM | Popularity | Phổ biến chung |

   Trước đây cả 3 tab chỉ sắp xếp lại **cùng một danh sách**: tab "xu hướng" sắp theo rating vốn bằng 0 cho mọi sản
   phẩm. Mỗi tab bắn `IMPRESSION` **một lần** cho mỗi lần tải; trước đây đổi tab qua lại là bắn lặp lại.
4. Người dùng bấm vào một món → trang chi tiết → `VIEW_PRODUCT` → quay lại Phần A.

**Vì sao impression quan trọng?** Nếu chỉ có click, ta không phân biệt được *"đã gợi ý mà khách bỏ qua"* với *"chưa
từng gợi ý"*. Có impression rồi mới tính được **CTR** = click / impression, tức thước đo trực tiếp nhất của một hệ gợi ý
khi chạy thật.

---

## 8. Đánh giá: đo gợi ý tốt hay dở

### 8.1 Cách đo

Giấu món cuối cùng của mỗi user, cho từng chiến lược gợi ý 10 món, rồi xem món bị giấu có nằm trong đó không. Xếp hạng
trên **toàn bộ** catalog (không lấy mẫu), dùng cho 499 user.

### 8.2 Chỉ số

| Chỉ số | Nghĩa dễ hiểu |
|---|---|
| **HR@10** (Hit Rate) | Bao nhiêu % user có món thật nằm trong top 10 |
| **Recall@10** | Với 1 món cần đoán thì giống hệt HR@10 (script train dùng tên này) |
| **NDCG@10** | Như HR, nhưng trúng ở **vị trí 1** được nhiều điểm hơn trúng ở vị trí 10 |
| **MRR** | Trung bình của 1/(vị trí trúng). Trúng vị trí 1 được 1, vị trí 2 được 0,5… |
| **Coverage@10** | Bao nhiêu % catalog từng xuất hiện trong gợi ý. Thấp nghĩa là chỉ quanh quẩn vài món |
| **CI95** | Khoảng tin cậy 95%. Hai con số có khoảng **chồng nhau** thì chưa chắc cái nào thật sự hơn |
| **Baseline** | "Đối thủ đơn giản" để so sánh. AI chỉ có giá trị khi thắng được chúng |

### 8.3 Kết quả (seed, 2026-09-26)

| Chiến lược | HR@10 |
|---|---|
| Popularity | 0,002 |
| Markov-1 ("món hay đi sau món vừa xem") | 0,036 |
| **Recency** (tầng 2) | 0,212 |
| **SASRec, cho phép gợi ý lại món đã xem** | **0,267** |
| **SASRec, loại món đã xem** (đúng như tầng 1 đang phục vụ) | 0,094 |

### 8.4 Phát hiện quan trọng nhất: hai bài toán khác nhau

**58%** lần xem tiếp theo là món khách **đã từng xem**. Như vậy thực ra có hai bài toán:

| | **Xem lại** (repeat) | **Khám phá** (explore) |
|---|---|---|
| Câu hỏi | Khách sẽ quay lại món cũ nào? | Món **mới** nào khách sẽ thích? |
| Recency | 0,366 | 0 (không thể trúng, vì chỉ đưa món cũ) |
| Markov-1 | 0 | **0,086** |
| SASRec (không loại món đã xem) | **0,424** | 0,048 |
| SASRec (loại món đã xem) | 0,103 | 0,081 |

Cách đọc:
- SASRec giỏi nhất ở việc đoán **khách sẽ quay lại món nào**.
- Với món **mới**, SASRec hiện chỉ ngang một quy tắc đơn giản.
- Con số 0,267 trong script train đạt được vì **không loại món đã xem**, trong khi service lại loại. Hai bên đo hai thứ
  khác nhau.
- Hướng xử lý trong plan: tách hai khối UI, *"Xem gần đây"* và *"Gợi ý cho bạn"*, và đo riêng từng khối.

⚠️ **Đây là dữ liệu seed tổng hợp.** Những con số này chứng minh hệ thống **chạy đúng**, không dùng để kết luận khoa
học. Kết luận phải dựa trên dữ liệu thật công khai (REES46, Taobao), xem plan GĐ2–GĐ3.

### 8.5 Harness đánh giá chuẩn (GĐ2) — thay cho cách đo ở 8.1–8.4

Các số ở 8.3–8.4 đo bằng *leave-last-out* (giấu món cuối của từng user). Cách này có rò rỉ: model được học từ hành vi
của user khác xảy ra **sau** thời điểm cần đoán. Từ GĐ2, mọi con số đưa vào báo cáo phải ra từ
[`AI/recs-service/evaluation/`](../../AI/recs-service/evaluation/):

| Thành phần | Lựa chọn |
|---|---|
| Chia dữ liệu | **Theo thời gian toàn cục**: train trước mốc 80%, validation 80–90%, test 90–100%. Mọi model chỉ học từ phần train |
| Target | Tương tác **đầu tiên** của user sau mốc. Target là item chưa từng có trong train thì loại ra nhưng được đếm |
| Hai track | **explore** (target là món mới, loại món đã xem) và **repeat** (target là món đã xem, không loại gì) |
| Baseline | Popularity, Recency, Markov-1, Category-Pop, **ItemKNN** (tham số chọn trên validation, không nhìn test) |
| SASRec | Đúng class `SASRecModel` của service, dừng sớm theo NDCG@10 trên validation, **chạy nhiều seed** |
| Độ tin cậy | CI95 bootstrap, so sánh ghép cặp, độ lệch giữa các seed = **mức nhiễu** |

Kết quả lần chạy 2026-10-01 trên **dữ liệu platform** (seed tổng hợp; 395 case test, 62,8% là repeat), HR@10:

| | Explore (147 case) | Repeat (248 case) |
|---|---|---|
| Popularity | 0,000 | 0,137 |
| Recency | 0,000 | 0,274 |
| Markov-1 | 0,027 | 0,206 |
| Category-Pop | 0,034 | 0,254 |
| ItemKNN (đã tune) | 0,034 | **0,355** |
| **SASRec (3 seed)** | **0,050 ± 0,009** | 0,315 ± 0,012 |

Cách đọc:
- Explore: SASRec có số cao nhất, nhưng so với ItemKNN thì chênh **+0,016 [−0,016; +0,045]**, tức **chưa có ý nghĩa
  thống kê**. Repeat: ItemKNN, SASRec và Recency chênh nhau đều chưa có ý nghĩa thống kê.
- SASRec **ít thiên về món phổ biến** nhất (ARP@10 ≈ 0,0008, so với 0,0016 của ItemKNN). Đây là điểm cộng đáng nêu.
- Với khoảng 150–250 case thì **không đủ dữ liệu để phân thắng thua**: mức nhiễu giữa các seed (±0,009) xấp xỉ một nửa
  chênh lệch cần đo. Vì vậy kết luận **bắt buộc** phải chạy trên REES46/Taobao.
- **Không so** các số này với 8.3 (0,267 / 0,094), vì hai cách chia dữ liệu khác nhau.

Chạy lại:
```bash
cd AI/recs-service
python -m evaluation.run --source platform --seeds 3 --out eval_platform.json        # khoảng 17 phút trên CPU
python -m evaluation.run --source csv --csv <file> --user-col <c> --item-col <c> --ts-col <c> [--category-col <c>] --seeds 3
```

---

## 9. Hiện trạng: cái gì đã chạy, cái gì còn thiếu

### 9.1 Đã sửa ở GĐ0 (nhánh `fix/recs-p0-serving`, chưa commit)

| Trước | Sau |
|---|---|
| Trang chủ không gửi danh tính → luôn Popularity; khách chưa đăng nhập nhận `[]` | Route public, danh tính từ header, fallback theo phiên |
| FE đọc `.data` trên mảng → khối gợi ý luôn rỗng; trang giỏ có thể crash | `asProductList` nhận cả hai dạng |
| SASRec đọc lịch sử **ngược** (lấy 15 món cũ nhất) | Đảo đúng thứ tự: HR@10 từ 0,066 lên 0,094 |
| Xoá khỏi giỏ bị đẩy vào lịch sử | Chỉ `HISTORY_ACTIONS` mới vào Redis |
| Popularity theo `sales_count` (luôn = 0, thứ tự tuỳ ý) | Theo hành vi thật 30 ngày, có cache |
| `userId` kiểu `int` → user thật (UUID) bị 422 | Nhận cả chuỗi lẫn số |
| Card gợi ý không có ảnh | Trả thêm `image`, `oldPrice`, `rating`, `slug` |
| Chạy Docker thì không bao giờ nạp checkpoint | Sửa default path + volume `AI/models/` |
| Redis trống với user có lịch sử cũ | `scripts/backfill_history.py` |
| Route cũ nhận `?user_id=` (xem được gợi ý của người khác) | Mọi route chỉ lấy danh tính từ header gateway |
| 3 tab trang chủ chỉ sắp xếp lại cùng một danh sách | 3 tab = 3 nguồn thật (`source`); impression không lặp |
| Không có test | 27 test pytest |
| Chưa kiểm qua gateway | 5/5 ca E2E đạt qua gateway + Keycloak thật (2026-10-01) |

### 9.2 Đã sửa ở GĐ1 (cùng nhánh, chưa commit) — kiểm E2E qua gateway thật ngày 2026-10-01

| Trước | Sau | Bằng chứng E2E |
|---|---|---|
| FE ghi UTC, Java ghi giờ máy (lệch 7 giờ) | Java ghi `LocalDateTime.now(ZoneOffset.UTC)` | VIEW/ADD/IMPRESSION đều lệch dưới 5 giây so với `UTC_TIMESTAMP()` của DB |
| Tracker không gửi token → vi hành vi `user_id = NULL` | Gửi token; 401 thì gửi lại không token | Mọi dòng có `user_id` = Keycloak `sub`; token hỏng → 401 thật |
| Gọi API chi tiết SP ở đâu cũng tính là "xem" | Opt-in: chỉ khi có header `X-Track-View: 1` (chỉ ProductDetailPage gửi) | Gọi không header: 0 view; có header: 1 view |
| `PAGE_DWELL`/`SCROLL_DEPTH` chỉ reset khi bấm Back | `notifyRouteChange()` mỗi lần đổi route | FE build OK (cần xem trên trình duyệt) |
| `IMPRESSION` không có vị trí, nguồn | `weight` = vị trí, cột mới `source` | Dòng IMPRESSION có `(weight=1,2,3, source=for_you)`; source lạ → 422 |

⚠️ **Cần báo P2 (churn)**: từ GĐ1, `user_events.created_at` của **mọi** nguồn là UTC. Dữ liệu cũ do Java ghi khi chạy
trên máy giờ VN thì lệch +7 giờ. Feature nào so `created_at` với `NOW()` (vd "hoạt động trong N ngày") giờ đã đúng múi
giờ của DB (UTC). Không có migration cho dữ liệu cũ: dữ liệu seed là tổng hợp và có thể seed lại.

### 9.3 Còn tồn tại

| Vấn đề | Ảnh hưởng |
|---|---|
| Cột `source` chỉ có sau khi order-service khởi động lại | Hibernate thêm cột lúc khởi động. Trước đó consumer tự phát hiện và ghi **không kèm** source (không mất event), rồi tự dùng cột khi có (kiểm lại mỗi 5 phút) |
| SASRec **chưa dùng** `action_type` | 19 ký hiệu hành vi chưa đóng góp gì cho model. Đây là mắt xích nối Tracking với AI |
| Seed chỉ sinh `VIEW_PRODUCT`/`ADD_TO_CART` | Không có dữ liệu vi hành vi để thử nghiệm |
| Cross-sell vẫn là Popularity | Chưa có gợi ý "mua kèm" thật |
| Chưa có sự kiện `PURCHASE` trong `user_events` | Thiếu tín hiệu mạnh nhất |

---

## 10. Hợp đồng dữ liệu (tra cứu nhanh)

Nguồn sự thật: [`contracts.py`](../../AI/shared-common/shared_common/contracts.py). Mọi service mới phải import từ đây,
không tự viết chuỗi.

| Loại | Giá trị |
|---|---|
| Redis lịch sử | `user:{user_id}:history`, `session:{session_id}:history` — list, **mới nhất ở đầu**, tối đa 50, TTL 30 ngày |
| Action vào Redis | `HISTORY_ACTIONS = {VIEW_PRODUCT, ADD_TO_CART}` |
| Topic | `product-viewed-events`, `cart-updated-events`, `user-behavior-events` |
| Consumer group | `forecast-service-behavior-group` |
| Bảng | `ecommerce_order_db.user_events(id, user_id VARCHAR(100), session_id VARCHAR(100), item_id BIGINT, category_id BIGINT, action_type VARCHAR(30), weight DOUBLE, source VARCHAR(30) NULL, created_at DATETIME)` |
| Múi giờ | **UTC** cho mọi nguồn (FE `toISOString()`, Java `LocalDateTime.now(ZoneOffset.UTC)`), khớp `NOW()` của DB |
| `weight` | `SCROLL_DEPTH` = % cuộn, `PAGE_DWELL` = giây, `IMPRESSION` = vị trí (1 = đầu) |
| `source` | `IMPRESSION_SOURCES = {for_you, recent, trending, search, category}`; giá trị lạ → 422 |
| Ghi VIEW_PRODUCT | Chỉ khi request có header `X-Track-View: 1` (opt-in, chỉ ProductDetailPage gửi) |
| User id | Keycloak UUID (chuỗi), ví dụ `42d23463-560c-…` |
| Checkpoint | `{model_state_dict, config{n_items,d_model,n_blocks,n_heads,maxlen}, item_space="platform_v1", item_id_map{product_id→index}, epoch}` |

---

## 11. Bản đồ code và thứ tự nên đọc

| # | Đọc | Để hiểu | Thời gian |
|---|---|---|---|
| 1 | [`contracts.py`](../../AI/shared-common/shared_common/contracts.py) | Tên gọi của mọi thứ | 10' |
| 2 | [`recommend.py`](../../AI/recs-service/app/api/endpoints/recommend.py) → hàm `_recommend_for_history` | Thang 3 tầng, trái tim của serving | 15' |
| 3 | [`recency.py`](../../AI/recs-service/app/services/recency.py), [`popularity.py`](../../AI/recs-service/app/services/popularity.py), [`catalog.py`](../../AI/recs-service/app/services/catalog.py) | Hai tầng dự phòng + tra sản phẩm | 15' |
| 4 | [`sasrec.py`](../../AI/recs-service/app/services/sasrec.py) | Nạp checkpoint + chạy model | 20' |
| 5 | [`behavior_consumer.py`](../../AI/forecast-service/app/kafka/behavior_consumer.py) | Redis/MySQL được ghi thế nào | 15' |
| 6 | [`behaviorTracker.ts`](../../FE/src/services/behaviorTracker.ts) | FE ghi vi hành vi | 15' |
| 7 | [`recsys_platform_sasrec.py`](../../AI/forecast-service/app/training/experiments/recsys_platform_sasrec.py) | Train từ đầu tới cuối | 30' |
| 8 | Test trong [`AI/recs-service/tests/`](../../AI/recs-service/tests/) | Hành vi mong đợi, viết thành code | 15' |

Mẹo: đọc test trước file tương ứng. Tên test như `test_newest_item_is_at_last_position` hay
`test_public_route_ignores_user_id_query` nói thẳng code **phải** làm gì.

---

## 12. Chạy thử trên máy

Tóm tắt (chi tiết từng bước xem [`recsys-gd0-browser-test.md`](recsys-gd0-browser-test.md)):

```bash
# 1. Hạ tầng: MariaDB, Redis, Kafka (+ Keycloak nếu test đăng nhập)
docker compose -f BE/docker-compose-infra.yml up -d mariadb redis kafka

# 2. Dữ liệu giả lập (nếu DB trống)
cd tools/data-seed && npm install && node seed.mjs --demo-users 0

# 3. Train (khoảng 30 phút CPU) → chép checkpoint vào AI/models/sasrec.pt
cd AI/forecast-service/app/training/experiments
PLATFORM_SASREC_MODEL_PATH=../../../../models/sasrec.pt python recsys_platform_sasrec.py

# 4. Service
cd AI/forecast-service && DB_NAME=ecommerce_order_db KAFKA_BOOTSTRAP_SERVERS=localhost:29092 uvicorn app.main:app --port 8004
cd AI/recs-service    && MODEL_WEIGHTS_PATH=../models/sasrec.pt uvicorn app.main:app --port 8003
cd AI/recs-service    && python scripts/backfill_history.py

# 5. Thử nhanh không cần FE
curl -i -H "X-Session-Id: test" "http://localhost:8003/api/v1/public/recommendations/personal?top_k=5"
#   → xem header X-Recs-Strategy

# 6. Test tự động
cd AI/recs-service && pip install -r requirements-dev.txt && pytest -q
cd AI/forecast-service && pytest -q tests
```

Kiểm tra nhanh dữ liệu:
```bash
docker exec infra-redis redis-cli lrange "user:<ID>:history" 0 -1
docker exec infra-mariadb mariadb -uroot -proot -e \
  "SELECT action_type, COUNT(*) FROM ecommerce_order_db.user_events GROUP BY action_type;"
```

---

## 13. Câu hỏi thường gặp (và câu hỏi phản biện)

**Vì sao chọn SASRec mà không phải model khác?**
SASRec là mô hình chuẩn cho bài toán "đoán món tiếp theo từ chuỗi" (sequential recommendation). Self-attention đọc được
cả chuỗi cùng lúc và tự chọn món quan trọng, không bị "quên" đầu chuỗi như RNN/LSTM. Model lại nhỏ, chạy CPU vẫn dưới
20 ms.

**Vì sao cần cả Redis lẫn MySQL?**
Redis trả lời trong dưới 1 ms cho mỗi lượt tải trang, nhưng chỉ giữ 50 món. MySQL giữ toàn bộ lịch sử để train và phân
tích. Redis mất thì dựng lại được từ MySQL.

**Vì sao không gọi thẳng database từ FE mà phải qua Kafka?**
Để có đúng **một** đường ghi, chịu được lúc tải dồn dập, và để các service nghiệp vụ không phải biết ai dùng dữ liệu
hành vi.

**Vì sao không dùng luôn Recency cho xong?**
Recency chỉ đưa lại món **đã xem**. Theo định nghĩa, nó không thể gợi ý món mới (HR = 0 ở nhóm "khám phá"). Nó phù hợp
cho khối "Xem gần đây", không thay được "Gợi ý cho bạn".

**Khách mới tinh thì sao? (cold-start)**
Rơi về Popularity, tức món được quan tâm nhiều nhất 30 ngày qua. Chỉ sau 1–2 lượt xem, lịch sử theo phiên đã đủ để
chuyển sang SASRec.

**Sản phẩm mới thêm vào (model chưa từng thấy) thì sao?**
Model không có toạ độ cho món đó nên sẽ không gợi ý nó, cho tới lần train sau. Nếu **toàn bộ** lịch sử là món lạ thì
service rơi về Recency. Hướng khắc phục (plan GĐ3–4): train định kỳ, và dùng thông tin nội dung (category) cho món mới.

**Số đo trên dữ liệu tự sinh thì có ý nghĩa gì?**
Chỉ để chứng minh **hệ thống chạy đúng**. Kết luận khoa học phải dựa trên dữ liệu thật công khai (REES46, Taobao), với
cách chia theo thời gian, nhiều seed và so với baseline mạnh.

**Vì sao service loại món đã xem?**
Để khối "Gợi ý cho bạn" giới thiệu món **mới**. Cái giá là mất phần "xem lại" (58% lượt). Đó là lý do plan đề xuất tách
thành hai khối UI.

**Nếu bot spam click thì model có bị "nhiễm" không?**
Có, nếu không lọc. Việc này phối hợp với P2 (SIEM): các session bị gắn cờ bot sẽ bị loại khỏi dữ liệu train và khỏi
Redis history (plan GĐ1, GĐ4).

**Vi hành vi (cuộn, rời tab…) hiện giúp gì cho gợi ý?**
**Chưa giúp gì**: SASRec hiện chỉ đọc product id của xem/giỏ. Thêm "loại hành vi" vào đầu vào của model là thí nghiệm
trung tâm của GĐ3. Kết quả dương hay âm đều có giá trị cho báo cáo.

---

## 14. Từ điển thuật ngữ

| Thuật ngữ | Giải thích |
|---|---|
| **Event** | Một dòng ghi "ai – làm gì – với cái gì – lúc nào" |
| **Behavior Tracking** | Việc ghi nhận hành vi người dùng một cách có hệ thống |
| **Micro-behavior** (vi hành vi) | Hành động nhỏ không phải mua bán: cuộn, rời tab, zoom… |
| **Impression** | Sản phẩm đã hiện ra trước mắt khách (chưa chắc được bấm) |
| **CTR** (Click-Through Rate) | Số lần bấm / số lần hiển thị |
| **Session** (phiên) | Một lần duyệt web liên tục, có mã riêng trong trình duyệt |
| **JWT / token** | "Thẻ ra vào" sau khi đăng nhập Keycloak; gateway đọc nó để biết bạn là ai |
| **Gateway** | Cổng vào duy nhất (`:8080`): kiểm tra đăng nhập, gắn `X-User-Id`, chuyển request tới đúng service |
| **Kafka** | Hệ thống hộp thư trung gian giữa các service |
| **Topic** | Một "ngăn thư" trong Kafka |
| **Partition** | Ngăn con của topic; event cùng key vào cùng partition nên giữ được thứ tự |
| **Producer / Consumer** | Bên bỏ thư / bên đọc thư |
| **Offset / commit** | Vị trí đã đọc tới / đánh dấu "đã đọc xong thư này" |
| **Redis** | Bộ nhớ tốc độ cao, dùng làm trí nhớ ngắn hạn |
| **LPUSH / LTRIM / TTL** | Thêm vào đầu danh sách / cắt còn N phần tử / thời gian tự hết hạn |
| **Recommender system** | Hệ thống gợi ý |
| **Sequential recommendation** | Gợi ý dựa trên **chuỗi** hành vi theo thời gian |
| **SASRec** | *Self-Attentive Sequential Recommendation*: model gợi ý dựa trên chuỗi, dùng self-attention (Kang & McAuley, 2018) |
| **Transformer** | Kiến trúc mạng nơ-ron dựa trên attention (cùng họ với các mô hình ngôn ngữ lớn) |
| **Embedding** | Toạ độ của một sản phẩm (hoặc vị trí) trên "bản đồ" nhiều chiều do model tự học |
| **Self-attention** | Cơ chế để mỗi vị trí tự "nhìn" các vị trí khác và quyết định cái nào quan trọng |
| **Head** (attention head) | Một "góc nhìn" attention; nhiều head nhìn song song các kiểu quan hệ khác nhau |
| **Causal mask** | Mặt nạ cấm nhìn các vị trí tương lai khi luyện |
| **Padding** | Đệm số 0 cho chuỗi ngắn đủ độ dài cố định |
| **maxlen** | Số món gần nhất model đọc (hiện là 15) |
| **Sampled softmax** | Luyện bằng "trắc nghiệm": 1 đáp án đúng lẫn trong một số đáp án sai lấy mẫu |
| **Negative** | Đáp án sai được lấy mẫu trong sampled softmax |
| **Loss** | Mức "bị phạt" khi đoán sai; luyện là làm loss giảm dần |
| **Epoch** | Một lượt luyện qua toàn bộ dữ liệu |
| **Batch** | Một nhóm bài tập được xử lý cùng lúc trước mỗi lần cập nhật model |
| **Learning rate (LR)** | Mỗi lần cập nhật, model thay đổi bao nhiêu |
| **Early stopping** | Dừng sớm khi không còn cải thiện |
| **Checkpoint** | File lưu model đã train |
| **Offline / Online** | Chạy riêng (train, đánh giá) / chạy lúc khách đang dùng web |
| **Serving** | Phục vụ dự đoán cho người dùng thật |
| **Fallback** | Phương án dự phòng khi tầng trên không dùng được |
| **Cold-start** | Khách (hoặc sản phẩm) mới, chưa có dữ liệu |
| **Popularity / Recency / Markov-1** | Baseline: món phổ biến / món vừa xem / món hay đi sau món vừa xem |
| **Leave-last-out** | Giấu món cuối mỗi user để kiểm tra |
| **HR@K / Recall@K** | % user có món thật nằm trong top K |
| **NDCG@K** | Như HR nhưng thưởng thêm khi trúng ở vị trí cao |
| **Coverage** | Độ phủ catalog của gợi ý |
| **Baseline** | Phương pháp đơn giản dùng làm mốc so sánh |
| **CI95 / bootstrap** | Khoảng tin cậy 95% / kỹ thuật lấy mẫu lại để ước lượng khoảng đó |
| **Repeat / Explore** | Đoán món cũ khách sẽ quay lại / đoán món mới khách sẽ thích |
| **Seed data** | Dữ liệu giả lập để chạy thử, **không** dùng để kết luận |
| **Latency / p50 / p95** | Thời gian phản hồi / mức mà 50% / 95% request nhanh hơn |
| **Backfill** | Dựng lại dữ liệu bị thiếu từ nguồn gốc (ở đây: Redis từ MySQL) |
