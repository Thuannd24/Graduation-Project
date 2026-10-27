# Hướng dẫn test thủ công toàn hệ thống (nhánh `develop`)

> Dùng để tự tay kiểm tra mọi chức năng trước khi viết Chương 4 và trước buổi bảo vệ.
> Mỗi mục có: **làm gì → kết quả đúng → kiểm chứng ở đâu**. Đánh dấu `[x]` khi qua.
> Muốn hiểu sâu từng luồng (từng bước, ví dụ số liệu, sơ đồ): đọc [GIAI_THICH_LUONG_HE_THONG.md](../bao-cao/GIAI_THICH_LUONG_HE_THONG.md).
> Các chức năng **đã biết là chưa xong** nằm ở [mục 13](#13-hành-vi-đã-biết--không-ghi-là-lỗi-mới) — gặp thì không cần ghi lỗi mới.
>
> Đã kiểm chứng tự động ngày 2026-10-11: đơn COD đến khi giao, hủy + hoàn kho, tạo link VNPay, chiến dịch ở mục 8.1,
> huấn luyện churn + quét rủi ro, gợi ý, tìm kiếm văn bản/ảnh, chatbot, 14 trang khách và 15 tab admin không lỗi.
> **Chưa kiểm chứng đến cùng** — cần bạn test tay: trả tiền VNPay sandbox, nhận email thật, chat 2 phía có gửi ảnh.

## Mục lục

- [Đọc trước: hệ thống chạy thế nào](#đọc-trước-hệ-thống-chạy-thế-nào)
0. [Khởi động hệ thống](#0-khởi-động-hệ-thống)
1. [Bảng địa chỉ (URL)](#1-bảng-địa-chỉ-url)
2. [Tài khoản test](#2-tài-khoản-test)
3. [PH1 – Tài khoản, đăng nhập, phân quyền](#3-ph1--tài-khoản-đăng-nhập-phân-quyền)
4. [PH2 – Sản phẩm và tìm kiếm văn bản](#4-ph2--sản-phẩm-và-tìm-kiếm-văn-bản)
5. [PH3 – Giỏ hàng, đặt hàng, vận chuyển, bảo hành](#5-ph3--giỏ-hàng-đặt-hàng-vận-chuyển-bảo-hành)
6. [PH4 – Tồn kho](#6-ph4--tồn-kho)
7. [PH5 – Thanh toán (COD, VNPay)](#7-ph5--thanh-toán-cod-vnpay)
8. [PH6 – Khuyến mãi, chiến dịch Camunda, điểm thưởng](#8-ph6--khuyến-mãi-chiến-dịch-camunda-điểm-thưởng)
9. [PH7 – Thông báo email](#9-ph7--thông-báo-email)
10. [PH8 – Theo dõi hành vi, gợi ý sản phẩm](#10-ph8--theo-dõi-hành-vi-gợi-ý-sản-phẩm)
11. [PH9 – Phân tích AI, churn, quét rủi ro](#11-ph9--phân-tích-ai-churn-quét-rủi-ro)
12. [PH10 – Chatbot AI, chat với nhân viên](#12-ph10--chatbot-ai-chat-với-nhân-viên)
13. [Hành vi đã biết – không ghi là lỗi mới](#13-hành-vi-đã-biết--không-ghi-là-lỗi-mới)
14. [Ghi kết quả và dọn dữ liệu](#14-ghi-kết-quả-và-dọn-dữ-liệu)

---

## Đọc trước: hệ thống chạy thế nào

Hãy hình dung hệ thống như một **cửa hàng có nhiều phòng ban**; mỗi phòng ban là một service riêng, có sổ sách (database) riêng:

| Phòng ban | Service | Việc của nó |
|---|---|---|
| Lễ tân + bảo vệ | **API Gateway** (8080) | Mọi yêu cầu từ trình duyệt đều đi qua đây. Kiểm tra "vé vào cửa" (token), rồi chuyển đến đúng phòng ban |
| Phòng cấp thẻ | **Keycloak** (8083) | Đăng nhập, đăng ký, cấp token, giữ vai trò ADMIN / STAFF / CUSTOMER |
| Phòng khách hàng | **user-service** | Hồ sơ, địa chỉ, hạng thành viên, điểm thưởng |
| Phòng sản phẩm | **product-service** | Sản phẩm, danh mục, thương hiệu, đánh giá, yêu thích |
| Quầy bán hàng | **order-service** | Giỏ hàng, đặt hàng, trạng thái đơn, bảo hành |
| Kho | **inventory-service** | Số lượng tồn của từng phiên bản sản phẩm |
| Thu ngân | **payment-service** | COD, VNPay, hoàn tiền |
| Phòng marketing | **promotion-service** + Camunda | Voucher, chiến dịch tự động |
| Phòng thư tín | **notification-service** | Gửi email |
| Phòng chăm sóc khách | **chat-service** | Chat trực tiếp giữa khách và nhân viên |
| "Bộ não" AI | 4 service Python (8001–8004) | Tìm kiếm thông minh, chatbot, gợi ý sản phẩm, dự đoán khách rời bỏ |

**Các phòng ban nói chuyện với nhau theo hai cách:**

1. **Gọi trực tiếp và chờ trả lời** (REST, gRPC) — khi cần câu trả lời ngay. Ví dụ: giỏ hàng hỏi phòng sản phẩm
   "giá hiện tại bao nhiêu?" và hỏi kho "còn hàng không?".
2. **Gửi thông báo lên bảng tin chung Kafka** — khi chỉ cần báo "việc này đã xảy ra", ai quan tâm thì tự đọc.
   Ví dụ: quầy bán hàng đăng "có đơn mới #12" lên bảng `order-events`; kho đọc để trừ hàng, phòng thư tín đọc để gửi
   email, phòng marketing đọc để xem có chiến dịch nào cần chạy. Quầy bán hàng không cần biết ai đọc.

Vì cách 2 chạy **không đồng bộ**, nhiều thay đổi **mất vài giây mới hiện ra** (trạng thái đơn, điểm thưởng, email).
Khi test, nếu chưa thấy thì đợi 5–30 giây rồi tải lại, đừng vội ghi lỗi.

**Outbox + Debezium là gì?** Khi lưu đơn hàng, order-service ghi thêm một dòng "thư cần gửi" vào bảng `outbox`
**trong cùng một lần lưu**. Debezium đứng canh bảng này, thấy dòng mới thì đăng lên Kafka. Nhờ vậy không bao giờ có
chuyện "đơn đã lưu mà thông báo bị mất" hoặc ngược lại. Hệ quả khi test: **Debezium dừng thì đơn kẹt ở `PENDING`**,
vì không ai mang thư đi.

**Token là gì?** Đăng nhập xong, Keycloak cấp cho trình duyệt một "vé" (JWT) ghi bạn là ai và có vai trò gì, hạn
15 phút (web tự gia hạn). Mỗi yêu cầu đều kèm vé này; gateway và từng service đọc vé để quyết định cho phép hay không.

---

## 0. Khởi động hệ thống

Chi tiết lệnh ở [README.md](../../README.md) (mục *Hướng 2 — Hybrid*). Thứ tự:

| # | Thành phần | Cách chạy | Kiểm tra sống |
|---|---|---|---|
| 1 | Hạ tầng (MariaDB, Kafka, Debezium, Redis, ES, MinIO, MongoDB, Keycloak) | `cd BE` → `docker compose -f docker-compose-infra.yml up -d` | `docker ps` thấy các container `infra-*` đang `Up` |
| 2 | Eureka → Gateway → 8 service Java | IntelliJ hoặc `java -jar <service>/target/<service>-1.0.0.jar` | http://localhost:8761 thấy đủ service |
| 3 | AI: search (Docker), chatbot, recs, forecast | Xem [AI/README.md](../../AI/README.md) | `http://localhost:800X/health` trả 200 |
| 4 | FE | `cd FE` → `npm run dev` | http://localhost:5173 mở được |

Lưu ý trước khi test:

- [ ] **Không dùng** container cũ `infra-eureka`, `infra-gateway` (build từ code cũ). Chạy Eureka/Gateway bằng code `develop`.
- [ ] Debezium có đủ 2 connector: mở http://localhost:8088/connectors → thấy `order-outbox-connector`, `payment-outbox-connector`. Thiếu thì đơn hàng sẽ kẹt ở `PENDING`.
- [ ] Chỉ mục search đã dựng: http://localhost:8001/health thấy `text_index_ready: true`. Chưa có thì `docker exec -it ai-search-service python scripts/build_index.py`.
- [ ] `AI/.env` có `DEEPSEEK_API_KEY` (chatbot cần).
- [ ] Muốn bật lại các trang công cụ: `docker start infra-kibana infra-redis-insight infra-kafka-ui`.
- [ ] Sau khi một AI service vừa tắt/bật lại, gateway có thể trả 503 trong ~10–30 giây (circuit breaker) — đợi rồi thử lại.

---

## 1. Bảng địa chỉ (URL)

### Ứng dụng

| Trang | URL | Ghi chú |
|---|---|---|
| Web khách hàng | http://localhost:5173 | |
| Trang quản trị | http://localhost:5173/admin | Cần tài khoản ADMIN hoặc STAFF |
| API Gateway | http://localhost:8080/api/v1/... | Mọi API đi qua đây |

### Công cụ quản trị hạ tầng

| Công cụ | URL | Đăng nhập | Dùng để |
|---|---|---|---|
| Keycloak (quản trị) | http://localhost:8083/admin | `admin` / `admin` (realm **master**) | Xem/sửa user, role, đặt mật khẩu |
| Eureka | http://localhost:8761 | — | Xem service nào đang đăng ký |
| Kafka UI | http://localhost:8090 | — | Xem message trong các topic |
| Debezium Connect | http://localhost:8088/connectors | — | Kiểm tra connector outbox |
| MinIO Console | http://localhost:9001 | `minio` / mật khẩu trong `BE/docker-compose-infra.yml` (`MINIO_ROOT_PASSWORD`) | Ảnh sản phẩm, ảnh chat (`chat-images`) |
| RedisInsight | http://localhost:5540 | — | Xem tồn kho cache `product:stock:*` |
| Kibana | http://localhost:5601 | — | Xem index Elasticsearch |
| Elasticsearch | http://localhost:9200 | — | |
| MariaDB | `localhost:3308` | `root` / `root` | Dùng DBeaver/HeidiSQL để chạy SQL kiểm chứng |
| MongoDB | `localhost:27017` | không mật khẩu | DB `chat_db` (tin nhắn chat) |

### Swagger của AI (thử API trực tiếp, không cần token)

| Service | Swagger | Health |
|---|---|---|
| search | http://localhost:8001/docs | http://localhost:8001/health |
| chatbot | http://localhost:8002/docs | http://localhost:8002/health |
| recs | http://localhost:8003/docs | http://localhost:8003/health |
| forecast | http://localhost:8004/docs | http://localhost:8004/health |

> Service Java **không có** Swagger UI. Camunda **không có** Cockpit/Tasklist (chỉ nhúng engine + REST) —
> chiến dịch được quản lý hoàn toàn qua tab **Coupon Code** trong trang admin.

---

## 2. Tài khoản test

Realm `ecommerce-realm` có sẵn 3 tài khoản:

| Vai trò | Username | Email | Mật khẩu |
|---|---|---|---|
| ADMIN | `admin` | admin@gmail.com | Mật khẩu nhóm đã đặt; **không có trong repo** |
| STAFF | `staff` | staff@gmail.com | Như trên |
| CUSTOMER | `customer` | customer@gmail.com | **Chưa có mật khẩu** → phải đặt trước khi dùng |

### Đặt mật khẩu chung cho cả 3 tài khoản (khuyến nghị)

Chạy trong PowerShell (Keycloak đang chạy ở 8083). Đổi `Test@123456` nếu muốn:

```powershell
$KC = "http://localhost:8083"; $PW = "Test@123456"
$t = (Invoke-RestMethod -Method Post "$KC/realms/master/protocol/openid-connect/token" `
      -Body @{client_id="admin-cli"; username="admin"; password="admin"; grant_type="password"}).access_token
$h = @{Authorization = "Bearer $t"}
foreach ($u in "admin","staff","customer") {
  $id = (Invoke-RestMethod "$KC/admin/realms/ecommerce-realm/users?username=$u&exact=true" -Headers $h)[0].id
  Invoke-RestMethod -Method Put "$KC/admin/realms/ecommerce-realm/users/$id/reset-password" -Headers $h `
    -ContentType "application/json" -Body "{`"type`":`"password`",`"value`":`"$PW`",`"temporary`":false}"
  "$u -> OK"
}
```

Hoặc làm bằng giao diện: http://localhost:8083/admin → chọn realm **ecommerce-realm** → **Users** → chọn user → tab **Credentials** → **Set password** (tắt *Temporary*).

### Lưu ý quan trọng về tài khoản

- ⚠️ **Keycloak nhập lại realm mỗi lần container khởi động** (`migration.strategy=OVERWRITE_EXISTING`).
  Sau khi restart `infra-keycloak`: mật khẩu vừa đặt và **mọi tài khoản tự đăng ký** sẽ mất → chạy lại đoạn script trên.
- ⚠️ **Email thật:** SMTP trong `BE/.env` là Gmail thật. Các địa chỉ `*@gmail.com` ở trên là của **người khác**.
  Trước khi test email (mục 9), đổi email tài khoản test sang email của bạn (Keycloak → Users → Details → Email),
  hoặc tự đăng ký tài khoản mới bằng email của mình.
- Nên tạo thêm **1 tài khoản khách mới** qua `/register` để test luồng đăng ký và khách "mới tinh" (gợi ý sản phẩm cold-start).

---

## 3. PH1 – Tài khoản, đăng nhập, phân quyền

> **Luồng hoạt động.** Web **không tự giữ mật khẩu**. Bấm đăng nhập/đăng ký, web chuyển bạn sang trang của Keycloak
> (giao diện TechStore). Đăng nhập xong, Keycloak trả bạn về web kèm token. Lần đầu bạn mở một trang cần đăng nhập,
> gateway thấy tài khoản này chưa có hồ sơ nên nhờ user-service **tự tạo hồ sơ**, rồi đăng tin `user-created-events`.
> Phòng marketing đọc tin này để chạy chiến dịch "chào thành viên mới" nếu có.
>
> **Phân quyền có 2 lớp:** gateway chặn thô (mọi đường dẫn `/admin/**` phải là ADMIN hoặc STAFF), còn từng service
> chặn chi tiết (ví dụ chỉ ADMIN mới được xóa sản phẩm, đổi vai trò, hoàn tiền). Vì vậy STAFF **vẫn thấy** mọi tab
> admin, nhưng bấm các thao tác "nguy hiểm" thì bị từ chối. Đó là đúng thiết kế.

| ✔ | Làm gì | Kết quả đúng | Kiểm chứng |
|---|---|---|---|
| [ ] | http://localhost:5173/register → điền thông tin | Chuyển sang trang Keycloak (giao diện `techstore`), tạo xong quay về trang chủ, đã đăng nhập | Keycloak → Users thấy user mới, role `ROLE_CUSTOMER` |
| [ ] | Gọi bất kỳ trang cần đăng nhập lần đầu (vd. `/profile`) | Hồ sơ tự tạo trong user-service | Kafka UI → topic `user-created-events` có message mới |
| [ ] | `/login` bằng `customer` | Vào được, header hiện tên | |
| [ ] | Nút **Google** trên trang đăng nhập Keycloak | Đăng nhập Google được (cần `GOOGLE_CLIENT_ID` trong `.env`) | |
| [ ] | `/profile?tab=account` sửa họ tên, SĐT, ảnh đại diện | Lưu thành công, tải lại vẫn còn | Ảnh nằm trong MinIO |
| [ ] | `/profile?tab=addresses` thêm, sửa, đặt mặc định, xóa địa chỉ | Chọn tỉnh → phường/xã hoạt động | |
| [ ] | `/profile?tab=membership` | Hiện hạng (MEMBER/SILVER/GOLD/VIP) và điểm | |
| [ ] | Đăng xuất → vào `/cart` | Bị chuyển đến đăng nhập | |
| [ ] | Đăng nhập `customer` → mở `/admin` | Bị đẩy về trang chủ | |
| [ ] | Đăng nhập `staff` → `/admin` | Vào được, thấy đủ các tab | |
| [ ] | `staff`: tab **Customers** → thử xóa/đổi role một user; tab **Product List** → nút xóa | Thao tác bị từ chối (403) / nút xóa sản phẩm không hiện — chỉ ADMIN được | |
| [ ] | `admin`: tab **Customers** → đổi hạng, khóa (blacklist), reset mật khẩu một user test | Thành công | |

---

## 4. PH2 – Sản phẩm và tìm kiếm văn bản

> **Luồng hoạt động.** Thông tin sản phẩm nằm ở product-service; khách xem không cần đăng nhập. Mỗi lần mở trang chi
> tiết, product-service đăng tin "khách vừa xem sản phẩm X" (`product-viewed-events`) để phần AI ghi nhận hành vi.
>
> **Có 2 kiểu tìm kiếm văn bản, cần phân biệt khi test:**
>
> 1. **Ô tìm kiếm trên header:** hỏi thẳng product-service, so khớp theo tên/từ khóa (kiểu truyền thống).
> 2. **Tìm kiếm ngữ nghĩa lai** (thử qua Swagger 8001): câu hỏi được tìm song song theo 2 cách, theo **nghĩa**
>    (model multilingual-e5-large hiểu "tai nghe chống ồn" gần với "headphone ANC") và theo **từ khóa** (Elasticsearch BM25). Hai danh sách
>    được trộn bằng **RRF**: sản phẩm đứng cao ở cả hai danh sách thì lên đầu.

### Khách (chưa đăng nhập)

| ✔ | Làm gì | Kết quả đúng |
|---|---|---|
| [ ] | Trang chủ `/` | Có flash deal, danh mục, thương hiệu, khối gợi ý 3 tab |
| [ ] | `/category` → lọc theo danh mục, giá, thương hiệu; đổi sắp xếp; sang trang | Danh sách đổi đúng |
| [ ] | Mở một sản phẩm khi **chưa đăng nhập** `/product/1` | Trang hiện đủ, tên người đánh giá hiện ra (lỗi đã sửa 2026-10-11) |
| [ ] | Trang sản phẩm: chọn phiên bản (màu/dung lượng), phóng to ảnh, xem tab thông số / bảo hành / đánh giá | Giá và tồn kho đổi theo phiên bản |
| [ ] | Bấm **Thêm vào giỏ** khi chưa đăng nhập | Yêu cầu đăng nhập |

### Tìm kiếm

| ✔ | Làm gì | Kết quả đúng | Ghi chú |
|---|---|---|---|
| [ ] | Ô tìm kiếm trên header gõ `iphone` | Trang `/search?q=iphone` có kết quả | Đây là tìm kiếm của product-service (xem mục 13) |
| [ ] | http://localhost:8001/docs → `GET /api/v1/search?q=tai nghe chống ồn` | Kết quả lai (BM25 + vector + RRF) | Tìm kiếm ngữ nghĩa thật — thử qua Swagger |
| [ ] | `GET /api/v1/search/suggest?q=ip` | Danh sách gợi ý từ khóa | |
| [ ] | `GET /api/v1/search/similar/{product_id}` | Sản phẩm tương tự | |

### Đã đăng nhập (`customer`)

| ✔ | Làm gì | Kết quả đúng |
|---|---|---|
| [ ] | Bấm tim trên trang sản phẩm → mở `/wishlist` | Sản phẩm có trong danh sách yêu thích; bỏ tim thì mất |
| [ ] | Viết đánh giá cho sản phẩm **đã nhận hàng** (cần làm mục 5 trước) | Gửi được; sản phẩm chưa mua/chưa giao thì bị chặn |
| [ ] | `admin`: tab **Reviews** → trả lời đánh giá | Câu trả lời hiện dưới đánh giá ở trang sản phẩm |

### Quản trị sản phẩm (`admin`)

| ✔ | Làm gì | Kết quả đúng |
|---|---|---|
| [ ] | **Categories**: thêm danh mục con, thêm thuộc tính | Hiện ở `/category` |
| [ ] | **Brand**: thêm/sửa thương hiệu | |
| [ ] | **Add Products**: tạo sản phẩm có 2 phiên bản + ảnh | Ảnh lên MinIO, sản phẩm hiện ở trang khách |
| [ ] | **Product List**: tìm, sửa, xóa sản phẩm vừa tạo | |

---

## 5. PH3 – Giỏ hàng, đặt hàng, vận chuyển, bảo hành

> **Luồng hoạt động. Đây là luồng quan trọng nhất, nên đọc kỹ.**
>
> 1. **Thêm vào giỏ:** order-service hỏi product-service giá hiện tại và hỏi kho còn hàng không (gọi gRPC, chờ trả lời).
> 2. **Bấm đặt hàng:** order-service **tự tính lại tiền ở server** (không tin số tiền trình duyệt gửi lên, để chống
>    sửa giá), trừ tạm số lượng trong **Redis** (bộ nhớ nhanh, để hai người không cùng mua được món cuối cùng), rồi lưu
>    đơn trạng thái **PENDING** kèm "thư" `OrderCreatedEvent` vào outbox. Mỗi lần mở trang checkout có một mã chống
>    trùng (Idempotency-Key), nên bấm 2 lần cũng chỉ ra 1 đơn.
> 3. **Kho xác nhận:** Debezium đưa thư lên Kafka. inventory-service đọc, trừ kho thật trong database, ghi sổ giao dịch
>    `DEDUCT`, rồi trả lời "đã giữ hàng" → đơn chuyển **AWAITING_PAYMENT** (chờ thanh toán). Nếu kho không đủ thì đơn
>    chuyển **CANCELLED** luôn.
> 4. **Thanh toán** (chi tiết ở mục 7): COD hoặc VNPay thành công → đơn chuyển **CONFIRMED** (đã xác nhận).
> 5. **Sau khi xác nhận**, tin `OrderConfirmedEvent` được nhiều bên đọc cùng lúc: phòng thư tín gửi email, phòng
>    marketing chạy chiến dịch (cộng điểm, phát voucher...), voucher đã dùng chuyển "đã dùng", phần AI ghi hành vi
>    `PURCHASE`.
> 6. **Giao hàng:** admin bấm giao → **SHIPPED** (mã vận đơn giả lập `MOCK-GHTK-...` vì chưa nối hãng vận chuyển thật)
>    → bấm đã giao → **DELIVERED**. Lúc này đơn COD mới tính là đã thu tiền, sản phẩm có bảo hành hiện ở tab Bảo hành,
>    và khách được phép viết đánh giá.
>
> **Khi hủy đơn** (khách hủy được ở PENDING / AWAITING_PAYMENT / CONFIRMED): tin `OrderCancelledEvent` khiến kho
> **trả lại hàng** (`RELEASE`), voucher **trở về ví** (nếu đơn chưa xác nhận; đơn đã xác nhận thì voucher tính là đã dùng), điểm đã dùng **được hoàn**, và nếu đã trả tiền VNPay thì tự hoàn
> tiền. Cách "làm từng bước, bước sau lỗi thì làm ngược lại để bù" này gọi là **Saga**.
>
> **Đơn bỏ dở:** đơn ở PENDING / AWAITING_PAYMENT quá 30 phút sẽ tự hủy và trả hàng về kho.

Luồng chuẩn (đã kiểm chứng): **PENDING → AWAITING_PAYMENT → CONFIRMED → SHIPPED → DELIVERED**, hoặc **CANCELLED**.

### 5.1 Đơn COD đi hết vòng đời

| ✔ | Bước | Kết quả đúng | Kiểm chứng |
|---|---|---|---|
| [ ] | Ghi lại tồn kho sản phẩm định mua (admin → **Quản Lý Tồn Kho**) | | |
| [ ] | `customer` thêm 1 sản phẩm vào giỏ → `/cart` | Giỏ hiện đúng; có khối "gợi ý mua kèm" | |
| [ ] | Đổi số lượng, xóa, thêm lại | Tổng tiền cập nhật | |
| [ ] | `/checkout`: chọn địa chỉ, chọn **COD** | Phí vận chuyển 30.000đ, cộng VAT 10%; tổng tiền do server tính | |
| [ ] | Bấm đặt hàng | Chuyển sang trang đơn; vài giây sau trạng thái **Chờ thanh toán** rồi **Đã xác nhận** | Kafka UI: `order-events` có `OrderCreatedEvent`, `inventory-events` có `CONFIRMED` |
| [ ] | Xem lại tồn kho | Giảm đúng số lượng đã mua | Admin → Tồn kho → lịch sử giao dịch có dòng `DEDUCT` |
| [ ] | `admin` → **Order Management** → mở đơn → **Xác Nhận Giao Hàng** | Trạng thái **SHIPPED**, có mã vận đơn `MOCK-GHTK-...` | |
| [ ] | Bấm **Đã Giao Thành Công** | Trạng thái **DELIVERED** | Thanh toán COD chuyển `SUCCESS` (tab **Transaction**) |
| [ ] | `customer` → `/profile?tab=orders` và `/order/{id}` | Thấy dòng thời gian trạng thái | |
| [ ] | `/profile?tab=warranty` | Có sản phẩm vừa nhận (nếu sản phẩm có thời hạn bảo hành > 0) | Lỗi tra cứu bảo hành đã sửa 2026-10-11 |

### 5.2 Hủy đơn và hoàn kho

| ✔ | Bước | Kết quả đúng |
|---|---|---|
| [ ] | Đặt 1 đơn COD mới → khi **Đã xác nhận** thì khách bấm **Hủy đơn** | **CANCELLED** |
| [ ] | Xem tồn kho | Trả lại đúng số lượng (giao dịch `RELEASE`) |
| [ ] | Đơn đã **SHIPPED** | Không còn nút hủy cho khách; admin dùng **Hủy Giao Hàng** |
| [ ] | Đơn **DELIVERED** / **CANCELLED** | Không đổi trạng thái được nữa (trạng thái cuối) |

### 5.3 Các trường hợp đặc biệt

| ✔ | Làm gì | Kết quả đúng |
|---|---|---|
| [ ] | Đặt số lượng lớn hơn tồn kho | Bị từ chối, báo hết hàng |
| [ ] | Bấm đặt hàng 2 lần thật nhanh | Chỉ tạo 1 đơn (Idempotency-Key) |
| [ ] | Để một đơn VNPay ở **Chờ thanh toán** quá 30 phút | Tự hủy, hoàn kho (job chạy mỗi 5 phút) |

---

## 6. PH4 – Tồn kho

> **Luồng hoạt động.** Tồn kho được giữ ở **2 nơi**. **Redis** là "bảng đếm nhanh", dùng lúc đặt hàng để chặn bán quá
> số lượng ngay tức thì. **Database** của inventory-service là "sổ kho chính thức": mọi thay đổi đều ghi một dòng giao
> dịch (`DEDUCT` khi bán, `RELEASE` khi hủy, `RESTOCK` khi nhập thêm), giống sổ xuất nhập kho. Nếu hai nơi lệch nhau
> (ví dụ sau khi sửa tay database), nút **Đồng bộ Redis** chép số từ sổ chính thức sang bảng đếm nhanh.

| ✔ | Làm gì (`admin` → **Quản Lý Tồn Kho**) | Kết quả đúng |
|---|---|---|
| [ ] | Xem danh sách sắp hết hàng | Hiện các phiên bản tồn thấp |
| [ ] | **Nhập thêm hàng** (restock) cho 1 phiên bản | Số lượng tăng; trang sản phẩm khách thấy còn hàng |
| [ ] | Xem lịch sử giao dịch kho của sản phẩm | Có các dòng `DEDUCT`, `RELEASE`, `RESTOCK` từ các bước trước |
| [ ] | **Đồng bộ Redis** | Số trong RedisInsight (`product:stock:{pid}:{vid}`) khớp DB |

---

## 7. PH5 – Thanh toán (COD, VNPay)

> **Luồng hoạt động.**
>
> - **COD:** khách chọn COD → payment-service ghi nhận "đồng ý giao, thu tiền khi nhận" → đơn **CONFIRMED** ngay.
>   Khoản thanh toán chỉ chuyển **SUCCESS** khi đơn **DELIVERED** (lúc shipper thu tiền).
> - **VNPay:** payment-service tạo một đường link có **chữ ký điện tử** (để không ai sửa được số tiền) → trình duyệt
>   chuyển sang trang VNPay → bạn nhập thẻ test → VNPay gọi lại hệ thống (callback) kèm kết quả và chữ ký. Hệ thống
>   kiểm chữ ký: mã `00` là thành công → đơn **CONFIRMED**; mã khác → đơn **CANCELLED** và trả hàng về kho.
> - Giao dịch VNPay hết hạn sau **15 phút**. Nếu khách trả tiền **sau** khi đơn đã hết hạn/hủy, hệ thống tự hoàn tiền.

| ✔ | Làm gì | Kết quả đúng |
|---|---|---|
| [ ] | `/checkout` chọn **VNPay** → đặt hàng | Chuyển sang trang `sandbox.vnpayment.vn` |
| [ ] | Thanh toán bằng thẻ test sandbox VNPay — ngân hàng **NCB**, số thẻ `9704198526191432198`, tên `NGUYEN VAN A`, ngày phát hành `07/15`, OTP `123456` *(thẻ test công khai của VNPay; nếu VNPay đổi, xem trang sandbox của họ)* | Quay về `/order/{id}?paymentStatus=00`, đơn **CONFIRMED** |
| [ ] | Đặt đơn VNPay khác → bấm **Hủy giao dịch** trên trang VNPay | Đơn **CANCELLED**, hoàn kho |
| [ ] | `admin` → **Transaction** | Thấy các giao dịch COD/VNPay và trạng thái |
| [ ] | `admin` hoàn tiền một giao dịch VNPay thành công | Thành công với `admin`; `staff` bị từ chối (chỉ ADMIN) |

> Callback VNPay trỏ về `http://localhost:8080/...` nên chỉ chạy được trên chính máy đang chạy gateway.

---

## 8. PH6 – Khuyến mãi, chiến dịch Camunda, điểm thưởng

> **Luồng hoạt động.** Thay vì lập trình cứng "mua đơn thì tặng gì", admin **tự vẽ kịch bản** trên giao diện kéo thả:
> *khi nào* (trigger) → *nếu* (điều kiện) → *thì làm gì* (hành động). Ví dụ: "khi có đơn ≥ 100.000đ → nếu khách hạng
> GOLD → cộng 100 điểm và tặng voucher 10%".
>
> 1. Bấm **Deploy**: backend kiểm tra sơ đồ hợp lệ, **dịch sơ đồ sang BPMN** (ngôn ngữ chuẩn để mô tả quy trình) và nạp
>    vào **Camunda**, một "máy chạy quy trình" nằm bên trong promotion-service.
> 2. Khi có sự kiện trên Kafka (đơn được xác nhận, khách mới đăng ký, khách viết đánh giá, AI phát hiện khách sắp rời
>    bỏ...), promotion-service tìm các chiến dịch **đang bật, còn trong thời gian chạy** có trigger tương ứng và khởi
>    động một lượt chạy cho khách đó.
> 3. Camunda đi lần lượt qua từng khối: kiểm điều kiện, rồi thực hiện hành động (gọi user-service cộng điểm, tạo voucher
>    vào ví khách, gửi email...). Mỗi sự kiện chỉ chạy **một lần** cho mỗi chiến dịch (có chống trùng), và chiến dịch
>    ngừng phát khi hết ngân sách.
>
> **Voucher:** chưa dùng → **giữ chỗ** khi đặt hàng → **đã dùng** khi đơn xác nhận; hủy đơn **trước khi xác nhận** thì quay về chưa dùng (đã dùng thì không trả lại).
> **Điểm thưởng:** 1 điểm = 1.000đ khi dùng ở checkout; điểm **chỉ được cộng qua chiến dịch**, không tự cộng theo đơn.

Hệ thống **không có voucher seed sẵn**: voucher và điểm thưởng **chỉ phát qua chiến dịch** (workflow Camunda).

### 8.1 Tạo chiến dịch "đơn thành công → cộng điểm + phát voucher" (đã kiểm chứng 8/8)

| ✔ | Bước | Kết quả đúng |
|---|---|---|
| [ ] | `admin` → tab **Coupon Code** (trình dựng chiến dịch) → tạo mới | Canvas kéo thả hiện ra |
| [ ] | Kéo các khối: **Trigger: Đơn thành công** (giá trị tối thiểu 100.000đ) → **Cộng điểm** (100 điểm, FIXED) → **Phát voucher %** (10%, tối đa 50.000đ, hạn 7 ngày) → **Kết thúc** | |
| [ ] | Đặt ngân sách, ngày bắt đầu (trước hiện tại), ngày kết thúc (ngày mai), bật **Active** → **Validate** | Báo hợp lệ |
| [ ] | **Deploy** | Lưu thành công (đã biên dịch sang BPMN và deploy lên Camunda) |
| [ ] | `customer` đặt 1 đơn COD ≥ 100.000đ → đơn **CONFIRMED** | |
| [ ] | `customer` → `/profile?tab=membership` | Điểm tăng **đúng 100** (đợi ~10–30 giây) |
| [ ] | `/profile?tab=vouchers` | Có 1 voucher 10% mới |
| [ ] | Đặt đơn mới, chọn voucher ở `/checkout` | Giảm giá đúng; voucher chuyển **đã dùng** khi đơn xác nhận |
| [ ] | Đặt đơn **VNPay** có voucher, ở trang VNPay bấm **Hủy giao dịch** (đơn bị hủy khi chưa xác nhận) | Voucher trở lại **chưa dùng** |
| [ ] | Hủy một đơn **COD** có voucher (COD xác nhận ngay) | Voucher **không** trả lại: đã tính là đã dùng (đúng thiết kế) |
| [ ] | `/checkout` dùng điểm thưởng (1 điểm = 1.000đ) | Tổng tiền giảm đúng; hủy đơn thì điểm được hoàn |
| [ ] | `admin` → **Thống kê Promotion** | Số lần kích hoạt, ngân sách đã dùng của chiến dịch tăng |
| [ ] | Tắt (toggle) chiến dịch → đặt thêm đơn | Không phát thêm điểm/voucher |
| [ ] | Xóa chiến dịch (chỉ `admin`) | Biến mất khỏi danh sách |

### 8.2 Các loại trigger/điều kiện/hành động khác (thử thêm nếu kịp)

| Loại | Có trong builder |
|---|---|
| Trigger | Người dùng mới (`NewUser`), Đơn thành công, Đánh giá sản phẩm, **Nguy cơ rời bỏ** (`ChurnRisk`, xem mục 11), Hẹn giờ (cron) |
| Điều kiện | Hạng thành viên, Tổng chi tiêu, Địa chỉ, Chứa danh mục, Chứa sản phẩm, Mức rủi ro churn |
| Hành động | Voucher % / giảm tiền / freeship, Gửi email, Cộng điểm (FIXED hoặc theo giá trị đơn), Nâng hạng |

- [ ] Chiến dịch **Người dùng mới → voucher freeship**: đăng ký tài khoản mới → có voucher trong ví.
- [ ] Chiến dịch **Đánh giá sản phẩm → cộng điểm**: viết đánh giá → điểm tăng.
- [ ] Chiến dịch có **điều kiện Hạng thành viên = GOLD**: khách MEMBER không được, đổi hạng sang GOLD (admin → Customers) thì được.

---

## 9. PH7 – Thông báo email

> **Luồng hoạt động.** notification-service không được ai gọi trực tiếp; nó chỉ **đọc bảng tin Kafka**
> (`order-events`, `payment-events`). Thấy tin "đơn đã xác nhận / đang giao / đã giao / đã hủy" hay "thanh toán thành
> công / thất bại", nó lấy mẫu email tương ứng, điền thông tin đơn và gửi qua SMTP (Gmail). Vì đi qua Kafka nên email
> thường đến **sau vài giây đến một phút**.

> Đổi email tài khoản test sang email của bạn trước (xem mục 2). Nếu `BE/.env` không có `MAIL_USERNAME`/`MAIL_PASSWORD`,
> email chỉ được **ghi vào log** của notification-service (vẫn dùng để kiểm chứng được).

| ✔ | Sự kiện | Email nhận được |
|---|---|---|
| [ ] | Đơn được xác nhận | "Đơn hàng đã xác nhận" |
| [ ] | Thanh toán VNPay thành công / thất bại | Email thanh toán tương ứng |
| [ ] | Admin bấm giao hàng (SHIPPED) | "Đơn hàng đang giao" |
| [ ] | Admin bấm đã giao (DELIVERED) | "Đơn hàng đã giao" |
| [ ] | Hủy đơn | "Đơn hàng đã hủy" |
| [ ] | Chiến dịch có hành động **Gửi email** | Email theo mẫu đã chọn |

---

## 10. PH8 – Theo dõi hành vi, gợi ý sản phẩm

> **Luồng hoạt động.**
>
> 1. **Ghi nhận hành vi:** trình duyệt âm thầm ghi lại việc bạn làm (xem sản phẩm, cuộn trang, tìm kiếm, lọc, vào giỏ,
>    áp voucher...), **gom lại và gửi 10 giây một lần** cho forecast-service. Riêng "xem sản phẩm" và "thêm vào giỏ" do
>    backend tự báo, nên chính xác hơn và không bị trình chặn quảng cáo chặn.
> 2. Tất cả đổ về Kafka. Một bộ đọc ghi chúng vào bảng `user_events` (lịch sử hành vi đầy đủ) và vào Redis (danh sách
>    "vừa xem gần đây" để gợi ý dùng ngay).
> 3. **Gợi ý sản phẩm:** model **SASRec** đọc chuỗi sản phẩm bạn vừa xem/mua **theo thứ tự** và đoán món tiếp theo bạn
>    có thể quan tâm (giống gợi ý "video tiếp theo"). Với khách mới chưa có lịch sử, hoặc khi model chưa vượt qua bài
>    kiểm tra chất lượng (evaluation gate), hệ thống **tự lùi** về danh sách phổ biến/xu hướng. Header
>    `X-Recs-Strategy` cho biết lần này đang dùng cách nào.

### 10.1 Theo dõi hành vi

FE gom sự kiện và gửi mỗi **10 giây** (hoặc khi đóng/ẩn tab) tới `POST /api/v1/public/behavior/events`.

| ✔ | Làm gì | Sự kiện ghi nhận |
|---|---|---|
| [ ] | Xem trang sản phẩm | `VIEW` (từ product-service), `PAGE_DWELL`, `SCROLL_DEPTH`, `PRODUCT_ZOOM` khi phóng ảnh |
| [ ] | Thêm vào giỏ | `ADD_TO_CART` (từ order-service) |
| [ ] | Tìm kiếm, lọc, sắp xếp | `SEARCH`, `FILTER_APPLIED`, `SORT_APPLIED`, `IMPRESSION` |
| [ ] | Vào giỏ, checkout, áp voucher | `VIEW_CART`, `BEGIN_CHECKOUT`, `VIEW_SHIPPING_FEE`, `COUPON_APPLIED` / `COUPON_FAILED` |
| [ ] | Đơn được xác nhận | `PURCHASE` (giờ UTC — lỗi lệch 7 giờ đã sửa 2026-10-11) |

**Kiểm chứng:**

- F12 → tab Network → lọc `behavior` → thấy request trả `{received, accepted}`.
- Kafka UI → topic `user-behavior-events`.
- SQL (MariaDB `localhost:3308`):

```sql
SELECT user_id, session_id, action_type, item_id, created_at
FROM ecommerce_order_db.user_events
ORDER BY created_at DESC
LIMIT 30;
```

### 10.2 Gợi ý sản phẩm

| ✔ | Làm gì | Kết quả đúng |
|---|---|---|
| [ ] | Trang chủ, tab **GỢI Ý CHO BẠN** với tài khoản **mới** | Danh sách phổ biến/xu hướng (khách chưa có lịch sử) |
| [ ] | Xem 5–10 sản phẩm cùng một loại → quay lại trang chủ | Tab **XEM GẦN ĐÂY** hiện đúng các sản phẩm vừa xem; **GỢI Ý CHO BẠN** thay đổi theo |
| [ ] | Tab **XU HƯỚNG MUA SẮM** | Sản phẩm bán/xem nhiều |
| [ ] | F12 → Network → request `recommendations/personal` → tab Headers | Header `X-Recs-Strategy` cho biết chiến lược đang dùng (SASRec hay dự phòng) |
| [ ] | http://localhost:8003/health | Trạng thái model SASRec và kết quả cổng đánh giá |

---

## 11. PH9 – Phân tích AI, churn, quét rủi ro

> **Luồng hoạt động: vòng khép kín "AI phát hiện → tự động giữ chân khách".**
>
> 1. **Huấn luyện:** từ lịch sử đơn hàng và hành vi, hệ thống tính cho mỗi khách 11 chỉ số (bao lâu chưa mua, mua bao
>    nhiêu lần, xem bao nhiêu danh mục, bỏ giỏ...). "Đáp án" để học là khách có **không đặt đơn nào trong 120 ngày tiếp
>    theo** hay không (chỉ xét khách đã nhận ≥ 2 đơn). Hai model được huấn luyện:
>    - **KMeans** chia khách thành 4 nhóm (VIP Champions, Loyal Regulars, At Risk, Lapsed), hiện ở tab AI Analytics;
>    - **Logistic Regression** cho ra **xác suất rời bỏ** của từng khách.
> 2. **Quét rủi ro** (tự chạy mỗi giờ, hoặc bấm tay): chấm điểm toàn bộ khách; ai rủi ro cao thì đăng tin
>    `ChurnRiskDetectedEvent` lên Kafka (topic `user-risk-events`).
> 3. **Tự động hành động:** promotion-service đọc tin đó và chạy chiến dịch có trigger **Nguy cơ rời bỏ**, ví dụ tặng
>    voucher giữ chân. Không cần nhân viên nào nhúng tay.
>
> Lưu ý: dự báo nhu cầu và phát hiện bất thường trên tab AI Analytics **là dữ liệu minh họa** (có ghi rõ trên giao diện).

Thao tác qua Swagger http://localhost:8004/docs (bấm **Try it out** → **Execute**).

| ✔ | Bước | Kết quả đúng |
|---|---|---|
| [ ] | `POST /api/v1/models/train` | Train xong (~15 giây), trả AUC từng fold |
| [ ] | `GET /api/v1/models/card` | Thẻ mô tả model: nhãn đang dùng `churn_label_v2_orders_120d_min2`, số mẫu, chỉ số |
| [ ] | `POST /api/v1/models/label-diagnostics`, `/models/calibration`, `/models/ablation`, `/models/rule-benchmark` | Có số liệu — **lưu lại kết quả cho Chương 4.3** |
| [ ] | `POST /api/v1/rfm/trigger` | Trả về phân bố khách theo 4 nhóm (chỉ tính, không ghi vào user-service) |
| [ ] | `POST /api/v1/risk/trigger-scan` | Danh sách khách có nguy cơ; nếu chưa train sẽ trả `SKIPPED` |
| [ ] | Kafka UI → topic `user-risk-events` | Có `ChurnRiskDetectedEvent` |
| [ ] | Tạo chiến dịch **Trigger: Nguy cơ rời bỏ → voucher** (mục 8), chạy lại quét rủi ro | Khách có nguy cơ nhận voucher giữ chân |
| [ ] | `admin` → **AI Analytics** | Biểu đồ phân khúc khách là **số thật**; dự báo nhu cầu và bất thường có nhãn **dữ liệu minh họa** |
| [ ] | `admin` → **Dashboard** | KPI doanh thu, đơn hàng hiển thị |

> Quét rủi ro cũng tự chạy mỗi giờ (`RISK_SCAN_INTERVAL_HOURS`).

---

## 12. PH10 – Chatbot AI, chat với nhân viên

> **Luồng hoạt động.**
>
> 1. Bạn gõ câu hỏi → chatbot-service nhờ LLM **DeepSeek** đọc câu và xác định **ý định**: hỏi sản phẩm, hỏi chính
>    sách, tra đơn hàng, hỏi điểm/voucher, khiếu nại, hay nói chuyện ngoài lề.
> 2. Tùy ý định, chatbot **đi lấy dữ liệu thật** trước khi trả lời:
>    - hỏi sản phẩm → gọi tìm kiếm của product-service lấy sản phẩm phù hợp;
>    - hỏi chính sách → tìm đoạn liên quan trong 11 tài liệu chính sách (kỹ thuật **RAG**: tra tài liệu rồi mới trả
>      lời, để bot không bịa);
>    - hỏi đơn hàng/điểm/voucher → gọi backend bằng chính token của bạn, nên **phải đăng nhập** và chỉ thấy dữ liệu
>      của mình.
> 3. LLM viết câu trả lời dựa trên dữ liệu vừa lấy, kèm **thẻ sản phẩm** bấm được.
>
> **Gặp nhân viên:** chat-service tạo một **phòng chat** (lưu trong MongoDB) và tự giao cho nhân viên đang online; không
> ai online thì phòng ở trạng thái **chờ**. Tin nhắn được đẩy tức thì qua **WebSocket** (kết nối luôn mở, không cần tải
> lại trang); ảnh gửi trong chat lưu ở MinIO.

### 12.1 Chatbot (biểu tượng chat ở góc mọi trang)

| ✔ | Câu hỏi mẫu | Kết quả đúng |
|---|---|---|
| [ ] | (chưa đăng nhập) `Chính sách đổi trả ra sao?` | Trả lời theo tài liệu chính sách (RAG) |
| [ ] | `Phí vận chuyển bao nhiêu?` / `Bảo hành iPhone bao lâu?` | Trả lời đúng chính sách |
| [ ] | `Gợi ý quà tặng dưới 500 nghìn` / `Laptop gaming cho sinh viên` | Có **thẻ sản phẩm** bấm được |
| [ ] | (chưa đăng nhập) `Đơn hàng của tôi đang ở đâu?` | Yêu cầu đăng nhập |
| [ ] | (đã đăng nhập) `Đơn hàng của tôi đang ở đâu?` / `Điểm thưởng của tôi còn bao nhiêu?` / `Voucher của tôi` | Trả dữ liệu thật của tài khoản |
| [ ] | `Thời tiết hôm nay thế nào?` | Từ chối lịch sự, kéo về chủ đề mua sắm |
| [ ] | Tải lại trang, mở lại chatbot | Còn lịch sử hội thoại |

Thêm 100 câu mẫu theo từng ý định: [AI/chatbot-service/data/test-qa-dataset.md](../../AI/chatbot-service/data/test-qa-dataset.md).

### 12.2 Chuyển sang nhân viên (cần 2 trình duyệt)

| ✔ | Bước | Kết quả đúng |
|---|---|---|
| [ ] | Trình duyệt 1: `staff` (hoặc `admin`) → `/admin` → **Customer Chat** | Nhân viên đang online |
| [ ] | Trình duyệt 2 (ẩn danh): `customer` → chatbot → **Yêu cầu gặp nhân viên trực tuyến** | Phòng chat được tạo và tự gán cho nhân viên online |
| [ ] | Hai bên nhắn qua lại | Tin nhắn hiện **ngay lập tức** (WebSocket), không cần tải lại |
| [ ] | Gửi ảnh trong chat | Ảnh hiện cho bên kia (lưu MinIO bucket `chat-images`) |
| [ ] | Nhân viên **Đóng** phòng | Phòng chuyển trạng thái đóng |
| [ ] | Khi **không** có nhân viên online, yêu cầu gặp nhân viên | Phòng ở trạng thái **chờ** (`WAITING`) |

Kiểm chứng: MongoDB `chat_db` có phòng và tin nhắn.

---

## 13. Hành vi đã biết – không ghi là lỗi mới

Các mục này đã nằm trong mục 4.1 của [MUC_LUC_BAO_CAO.md](../bao-cao/MUC_LUC_BAO_CAO.md):

| Chức năng | Hành vi hiện tại |
|---|---|
| Tìm kiếm trên web | Ô tìm kiếm gọi product-service, chưa gọi tìm kiếm ngữ nghĩa (chỉ thử được qua Swagger 8001) |
| Sản phẩm liên quan | Luôn là 8 sản phẩm đầu danh sách, không phải AI |
| Điểm đánh giá | Trang sản phẩm hiện 0 sao dù có đánh giá |
| `/stores`, `/tradein` | Chưa có backend |
| Vận chuyển | Mã vận đơn giả `MOCK-GHTK-*`, phí cố định 30.000đ |
| Điểm thưởng | **Không** tự cộng cho mọi đơn — chỉ khi có chiến dịch cộng điểm |
| Chiến dịch hẹn giờ | Hành động cần người dùng bị bỏ qua; xóa chiến dịch không gỡ deployment Camunda |
| Thông báo | Không có thông báo đẩy (FCM chỉ lưu token); chuông thông báo admin chỉ trang trí; chưa có email hoàn tiền |
| Gợi ý mua kèm (giỏ hàng) | Trả danh sách phổ biến, chưa dựa vào sản phẩm trong giỏ |
| AI Analytics | Dự báo nhu cầu và phát hiện bất thường là dữ liệu minh họa; nút "khóa"/"đánh dấu an toàn" chỉ hiện thông báo |
| Chatbot | Hỏi theo khoảng giá có thể ra sản phẩm ngoài khoảng; cảm xúc tiêu cực chỉ ghi log |
| Badge xu hướng ở tổng quan đơn hàng (admin) | Số cố định |
| Chiến dịch: điều kiện **Địa chỉ** | Gần như không bao giờ khớp (giao diện gửi tên tỉnh đầy đủ, backend chỉ nhận Hanoi / Ho Chi Minh / Da Nang) |
| Khác | Xem phụ lục B của [GIAI_THICH_LUONG_HE_THONG.md](../bao-cao/GIAI_THICH_LUONG_HE_THONG.md) |

---

## 14. Ghi kết quả và dọn dữ liệu

### Ghi lỗi mới

Mỗi lỗi ghi một dòng (có thể dán vào issue GitHub):

| # | Phân hệ | Bước tái hiện | Kết quả mong đợi | Kết quả thực tế | Ảnh/log | Người test | Ngày |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |

Log hữu ích: cửa sổ chạy service Java/Python, F12 → Console/Network trên trình duyệt, Kafka UI.

### Dọn dữ liệu sau khi test

- Hủy các đơn test chưa giao; nhập lại kho về mức ban đầu (**Quản Lý Tồn Kho** → nhập hàng).
- Tắt và xóa các chiến dịch test.
- Xóa tài khoản test tự đăng ký (Keycloak → Users và admin → **Customers**).
- **Không** gửi message tay vào các topic Kafka dùng chung (`order-events`, `payment-events`...) để test — chỉ tạo dữ liệu qua giao diện/API.
- **Không** dùng `docker compose down -v` (xóa toàn bộ dữ liệu).
