# Kịch bản demo hệ thống TechStore

Tài liệu này hướng dẫn demo từng chức năng của hệ thống theo thứ tự: chuẩn bị, mở màn, rồi lần lượt 10 phân hệ.
Mỗi bước ghi rõ **làm gì**, **nói gì** và **kết quả phải thấy**.

- Bản đầy đủ: khoảng 45 phút.
- Bản rút gọn: khoảng 15 phút, gồm các mục có dấu ⭐.
- Mục [Lưu ý khi demo](#lưu-ý-khi-demo) liệt kê những giới hạn còn lại. Đọc trước để không bị bất ngờ.
- Cập nhật ngày 21/10/2026, sau đợt sửa nghiệp vụ (nhánh `fix/business-gaps` đã merge vào `develop`).

---

## 0. Chuẩn bị (làm trước buổi demo 30 phút)

### 0.1 Khởi động hệ thống

Làm đúng thứ tự. Mỗi bước phải xong mới sang bước sau.

```powershell
# 1. Hạ tầng + Eureka + Gateway (Docker Desktop phải đang chạy)
cd A:\Graduation-Project\BE
docker compose -f docker-compose-infra.yml up -d

# 2. 8 service Java — bắt buộc JDK 17 (JDK 23 làm Lombok lỗi)
#    Chạy trong IntelliJ, hoặc java -jar <service>\target\<service>-1.0.0.jar (nhớ nạp biến trong BE\.env)
#    Khi build lại jar: dùng `mvn clean package -DskipTests` (không bỏ `clean`), vì extension Java của VS Code
#    tự biên dịch vào target/ và có thể làm jar khởi động lỗi.

# 3. AI services (sau khi BE đã lên). Các container đã được tạo sẵn, chỉ cần start:
docker start ai-search-service ai-recs-service ai-forecast-service ai-chatbot-service
#    Không chạy `docker compose up -d` cho forecast/chatbot: hai container này được tạo với URL
#    host.docker.internal (service Java chạy trên máy host), compose sẽ báo trùng tên.

# 4. Frontend
cd A:\Graduation-Project\FE
npm run dev
```

### 0.2 Kiểm tra sẵn sàng

| Kiểm tra | URL | Kết quả đúng |
|---|---|---|
| Eureka | http://localhost:8761 | Đủ 9 service UP (API-GATEWAY, USER, PRODUCT, ORDER, INVENTORY, PAYMENT, PROMOTION, NOTIFICATION, CHAT) |
| Gateway | http://localhost:8080/api/v1/public/products?page=0&size=1 | HTTP 200, `"code":"SUCCESS"` |
| AI | http://localhost:8001/health … http://localhost:8004/health | Cả 4 đều `"status":"UP"` |
| Debezium | http://localhost:8088/connectors?expand=status | `order-outbox-connector` và `payment-outbox-connector` đều RUNNING |
| Web | http://localhost:5173 | Trang chủ có sản phẩm |

Kiểm tra nhanh bằng PowerShell:

```powershell
foreach ($u in 'http://localhost:5173/','http://localhost:8080/api/v1/public/products?page=0&size=1',
               'http://localhost:8001/health','http://localhost:8002/health','http://localhost:8003/health','http://localhost:8004/health') {
  try { "$u -> " + (Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 8).StatusCode } catch { "$u -> LỖI" } }
```

### 0.3 Tài khoản demo

Mật khẩu chung cho cả 3 tài khoản là `12345678`.

| Vai trò | Tài khoản | Dùng để |
|---|---|---|
| Khách hàng | `customer` | Mua hàng, chatbot, hồ sơ |
| Nhân viên | `staff` | Quản trị (không được xóa, không được hoàn tiền), chat hỗ trợ |
| Quản trị viên | `admin` | Toàn quyền |

> ⚠️ **Keycloak nhập lại realm mỗi lần container khởi động lại, nên mật khẩu sẽ bị xóa.**
> Nếu đăng nhập báo sai mật khẩu, đặt lại như sau:
> http://localhost:8083 → chọn realm **ecommerce-realm** → **Users** → chọn user → tab **Credentials** →
> **Reset password**, nhập `12345678`, **tắt Temporary**, rồi **Save**
> (hoặc chạy script trong `docs/test/HUONG_DAN_TEST_THU_CONG.md`, mục "Đặt mật khẩu chung").

### 0.4 Chuẩn bị trình duyệt và dữ liệu

- **Trình duyệt 1** (cửa sổ thường): đăng nhập `customer`.
- **Trình duyệt 2** (cửa sổ ẩn danh, hoặc trình duyệt khác): đăng nhập `admin`. Dùng thêm `staff` khi demo phần chat.
- Mở sẵn các tab: http://localhost:5173, http://localhost:8761, http://localhost:8001/docs, http://localhost:8004/docs.
- Mỗi khách chỉ được có **tối đa 3 đơn chưa thanh toán** cùng lúc. Trước buổi demo, hủy các đơn test còn treo của `customer`.
- Đóng các ứng dụng nặng. Toàn hệ thống dùng khoảng 20 GB RAM; khi máy thiếu RAM, trang đăng nhập Keycloak sẽ rất chậm.

---

## 1. Mở màn: kiến trúc hệ thống (3 phút) ⭐

| Làm gì | Nói gì |
|---|---|
| Mở http://localhost:8761 | "Hệ thống gồm 8 microservice Spring Boot. Tất cả đăng ký với Eureka và đi qua API Gateway ở cổng 8080." |
| Mở Docker Desktop (hoặc `docker ps`) | "Hạ tầng chạy trong Docker: MariaDB (mỗi service một database riêng), MongoDB, Redis, Kafka, Debezium, Elasticsearch, MinIO, Keycloak." |
| Mở http://localhost:8001/docs | "Có 4 dịch vụ AI viết bằng Python FastAPI: tìm kiếm, gợi ý, dự đoán khách rời bỏ, chatbot." |
| Mở http://localhost:8088/connectors | "Debezium đọc binlog MariaDB theo mẫu Transactional Outbox để phát sự kiện lên Kafka. Đây là cách các service đồng bộ với nhau trong luồng đặt hàng (Saga)." |

---

## 2. PH1: Tài khoản, đăng nhập và phân quyền (4 phút) ⭐

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 1.1 | Trình duyệt 1: bấm **Đăng nhập** | Chuyển sang trang Keycloak (giao diện TechStore) | "Web không tự giữ mật khẩu. Đăng nhập dùng Keycloak theo chuẩn OAuth2/OIDC." |
| 1.2 | Đăng nhập `customer` | Quay về trang chủ, header hiện tên khách | "Lần đầu đăng nhập, gateway tự tạo hồ sơ trong user-service." |
| 1.3 | Vào `/profile?tab=addresses`, thêm 1 địa chỉ với số điện thoại `abcxyz` | Báo "Số điện thoại không hợp lệ (10 số bắt đầu bằng 0, hoặc +84 và 9 số)" | "Số điện thoại được kiểm tra ở cả giao diện lẫn backend." |
| 1.4 | Sửa lại số điện thoại đúng, chọn tỉnh rồi phường/xã, lưu | Lưu thành công, có thể đặt làm mặc định | "Địa chỉ 2 cấp tỉnh/thành và phường/xã theo đơn vị hành chính mới từ 01/07/2025." |
| 1.5 | `/profile?tab=account`: đổi họ tên, rồi tải lại trang | Tên mới vẫn giữ nguyên | "Hồ sơ trong user-service là nguồn dữ liệu chính; tên từ Keycloak chỉ dùng khi hồ sơ còn trống." |
| 1.6 | Gõ thẳng URL http://localhost:5173/admin | Bị đẩy về trang chủ | "Phân quyền có 2 lớp: gateway chặn `/admin/**`, và từng service kiểm tra quyền chi tiết." |
| 1.7 | Trình duyệt 2: đăng nhập `admin` → **Khách hàng** → đổi hạng một khách sang GOLD | Đổi thành công | "Chỉ ADMIN được đổi hạng, khóa tài khoản hay phân quyền. Nếu đồng bộ Keycloak lỗi khi khóa tài khoản, hệ thống báo lỗi chứ không báo thành công giả." |

---

## 3. PH2: Sản phẩm và tìm kiếm (5 phút) ⭐

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 2.1 | Trang chủ | Có flash deal, danh mục, thương hiệu, khối gợi ý 3 tab. Thẻ sản phẩm hiện số sao thật, hoặc "Chưa có đánh giá" | "Catalog có khoảng 1.100 sản phẩm. Giá đã gồm VAT; đơn từ 500.000đ được miễn phí vận chuyển." |
| 2.2 | `/category`: lọc danh mục **Laptop**, chọn mức giá có sẵn **2 – 10 triệu**, sắp xếp theo giá | Danh sách đổi đúng, bộ lọc giữ đúng mức giá | |
| 2.3 | Mở một sản phẩm, đổi phiên bản (màu, dung lượng) | Giá và tồn kho đổi theo phiên bản; có điểm đánh giá trung bình và số lượt đánh giá; "Sản phẩm liên quan" cùng loại | |
| 2.4 ⭐ | Gõ `tai nghe chống ồn` vào ô tìm kiếm trên header | Ra các tai nghe chống ồn, kể cả sản phẩm không chứa đúng cụm từ | "Ô tìm kiếm dùng tìm kiếm ngữ nghĩa: BM25 của Elasticsearch kết hợp vector của model e5, trộn bằng RRF. Nếu dịch vụ AI chậm quá 4 giây, web tự dùng kết quả tìm theo từ khóa." |
| 2.5 | Admin → **Thêm sản phẩm**: tạo 1 sản phẩm có 2 phiên bản, dán link ảnh | Sản phẩm hiện ở trang khách và tìm thấy bằng ô tìm kiếm | "Sau khi lưu, sản phẩm được đưa vào Elasticsearch và cache được xóa. Giá vốn chỉ trả về cho trang quản trị, API công khai không lộ giá vốn." |
| 2.6 | (Tùy chọn) Admin → **Danh sách sản phẩm** → tắt một sản phẩm, rồi mở sản phẩm đó ở trang khách | Hiện "Ngừng kinh doanh", nút mua bị khóa; sản phẩm biến mất khỏi danh sách và tìm kiếm | |

---

## 4. PH3 + PH4 + PH5: Mua hàng từ đầu đến cuối (10 phút) ⭐

Đây là luồng quan trọng nhất. Nên demo liền mạch.

### 4.1 Ghi lại tồn kho trước khi mua
Trình duyệt 2 (admin) → **Tồn kho** → tìm sản phẩm sắp mua → nhớ số lượng.

### 4.2 Đặt hàng COD (trình duyệt 1, `customer`)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 3.1 | Thêm 1 sản phẩm vào giỏ → mở `/cart` | Giỏ đúng sản phẩm; khối "Gợi ý mua kèm" là phụ kiện hợp với món trong giỏ (sạc, ốp, pin dự phòng cho điện thoại) | "Gợi ý mua kèm dựa trên chính sản phẩm trong giỏ: sản phẩm thường được mua cùng và phụ kiện cùng hệ." |
| 3.2 | Bấm **+** liên tục | Dừng ở 5 sản phẩm | "Mỗi sản phẩm tối đa 5 chiếc một đơn, chống gom hàng để bán lại." |
| 3.3 | Xem tóm tắt đơn ở giỏ | Phí vận chuyển "Tính ở bước sau" hoặc "Miễn phí"; dòng "Trong đó VAT (10%)" | "Giá niêm yết đã gồm VAT; VAT chỉ được tách ra để hiển thị trên hóa đơn, không cộng thêm." |
| 3.4 | `/checkout`: chọn địa chỉ, chọn **COD** | Tổng tiền đúng bằng số server tính | "Tổng tiền do server tính lại, không tin số tiền trình duyệt gửi lên. Có Idempotency-Key để bấm 2 lần cũng chỉ ra 1 đơn." |
| 3.5 | Bấm **Xác nhận & Đặt hàng** | Màn hình **ĐẶT HÀNG THÀNH CÔNG!**, có tên, số điện thoại, địa chỉ người nhận | "Mỗi đơn lưu riêng tên và số điện thoại người nhận, để mua tặng hoặc nhờ người nhận hộ." |
| 3.6 | Bấm **Chi tiết đơn hàng** và đợi vài giây | Trạng thái chuyển **Chờ xác nhận** → **Đã xác nhận** | "Đây là Saga: order-service ghi đơn kèm sự kiện vào bảng outbox; Debezium đưa sự kiện lên Kafka; inventory-service trừ kho và xác nhận giữ hàng; payment-service xác nhận COD; đơn chuyển CONFIRMED." |

### 4.3 Tồn kho và giao hàng (trình duyệt 2, `admin`)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 3.7 | **Tồn kho** → xem lại sản phẩm | Tồn kho giảm đúng số lượng; lịch sử có dòng `DEDUCT` | "Tồn kho giữ ở 2 nơi: Redis để chặn bán vượt số lượng ngay tức thì, MariaDB là sổ kho chính thức." |
| 3.8 | **Đơn hàng** → mở đơn | Ngăn chi tiết chỉ hiện các thao tác hợp lệ: **Bàn giao vận chuyển** và **Hủy đơn hàng** | "Trạng thái đơn đi theo máy trạng thái ở backend: không thể nhảy thẳng từ chưa thanh toán sang Đã giao." |
| 3.9 | Bấm **Bàn giao vận chuyển** | Trạng thái **Đang giao hàng**, có mã vận đơn `MOCK-GHTK-...` | "Đơn vị vận chuyển hiện là giả lập. Trạng thái giao hàng nhận qua webhook có chữ ký HMAC." |
| 3.10 | Bấm **Đã giao thành công** | Trạng thái **Đã giao hàng** | |
| 3.11 | **Giao dịch** | Giao dịch COD chuyển **Thành công** | "Đơn COD chỉ được tính là đã thu tiền khi giao xong." |

### 4.4 Sau khi nhận hàng (trình duyệt 1)

| # | Làm gì | Kết quả phải thấy |
|---|---|---|
| 3.12 | `/profile?tab=orders` → mở đơn | Có dòng thời gian trạng thái |
| 3.13 | `/profile?tab=warranty` | Có sản phẩm vừa nhận cùng hạn bảo hành |
| 3.14 | Vào trang sản phẩm → viết đánh giá 5 sao | Gửi thành công, điểm trung bình cập nhật. Sản phẩm chưa nhận hàng thì bị chặn |

### 4.5 Hủy đơn trước khi giao (2 phút)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 3.15 | Khách đặt 1 đơn COD mới (có dùng voucher nếu có) → khi **Đã xác nhận** bấm **Hủy đơn** | Hiện hộp thoại bắt chọn lý do hủy; xác nhận xong đơn **Đã hủy**, hiện lý do hủy | "Khách được hủy khi đơn chưa bàn giao cho vận chuyển; quy tắc này kiểm tra ở backend theo trạng thái. Lý do hủy được lưu để thống kê." |
| 3.16 | `/profile?tab=vouchers` | Voucher đã dùng được trả lại (nếu còn hạn) | "Hủy đơn là bước bù trừ của Saga: trả hàng về kho, trả voucher kể cả đơn COD, hoàn điểm, và tự hoàn tiền VNPay nếu đã trả." |
| 3.17 | Admin → **Tồn kho** | Tồn kho được trả lại, lịch sử có dòng `RELEASE` | |

### 4.6 Hủy đơn đang giao: hoàn hàng (2 phút)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 3.18 | Khách đặt đơn COD mới; admin **Bàn giao vận chuyển** | Đơn **Đang giao hàng** | |
| 3.19 | Khách mở đơn | Không còn nút **Hủy đơn** | "Đơn đã giao cho vận chuyển thì khách không tự hủy được nữa, phải liên hệ CSKH." |
| 3.20 | Admin mở đơn → **Hủy giao hàng (hoàn hàng)** → chọn lý do (ví dụ "Khách từ chối nhận") | Đơn **Chờ hoàn hàng**; **Tồn kho** chưa tăng | "Hàng vẫn đang nằm ở đơn vị vận chuyển, nên chưa được cộng lại kho để tránh bán món không có thật." |
| 3.21 | Admin bấm **Xác nhận đã nhận hàng hoàn** | Đơn **Đã nhận hàng hoàn**; **Tồn kho** tăng lại, có dòng `RELEASE` | "Kho chỉ cộng lại khi hàng hoàn về và được kiểm tra. Nếu đơn đã trả online thì hệ thống tự hoàn tiền ở bước này." |

### 4.7 Thanh toán VNPay sandbox (3 phút)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 3.22 | Thêm 1 sản phẩm trên 20 triệu vào giỏ → `/checkout` | Lựa chọn **COD** bị khóa, ghi "Không áp dụng cho đơn trên 20.000.000đ" | "Đơn giá trị cao phải trả trước, giảm rủi ro bom hàng. Backend cũng chặn, không chỉ giao diện." |
| 3.23 | Chọn **VNPay** → **Xác nhận & Đặt hàng** | Chuyển sang trang `sandbox.vnpayment.vn` | "Link thanh toán được ký HMAC-SHA512 để không ai sửa được số tiền." |
| 3.24 | Ở trang VNPay bấm **Hủy giao dịch** | Quay về trang đơn: banner "Thanh toán không thành công (khách hàng đã hủy giao dịch)", đơn vẫn **Chờ thanh toán**, có nút **Thanh toán lại qua VNPAY** | "Kết quả lấy từ server, không dựa vào tham số trên URL. Thanh toán thất bại không hủy đơn: hàng được giữ 30 phút để khách thanh toán lại." |
| 3.25 | Bấm **Thanh toán lại qua VNPAY** → chọn **Thẻ nội địa và tài khoản ngân hàng** → **NCB** → nhập thẻ test (bên dưới) → OTP | VNPay báo thành công, quay về trang đơn: banner "Thanh toán thành công", đơn **Đã xác nhận**; admin → **Giao dịch** thấy giao dịch VNPay **Thành công** | "VNPay gọi lại hệ thống (IPN). Hệ thống kiểm tra chữ ký và số tiền; chỉ mã `00` mới xác nhận đơn." |
| 3.26 | (Tùy chọn) Với đơn dưới 20 triệu: hủy ở VNPay rồi bấm **Đổi sang thanh toán khi nhận hàng** | Đơn chuyển **Đã xác nhận** với COD | "Khách nhập sai OTP cũng không mất đơn: có thể thanh toán lại hoặc đổi sang COD." |
| 3.27 | (Tùy chọn) Admin → **Giao dịch** → hoàn tiền giao dịch VNPay vừa trả | Thông báo theo kết quả thật của cổng: "Hoàn tiền thành công" hoặc "Đã gửi yêu cầu hoàn tiền, đang chờ VNPay xác nhận" | |

Thẻ test sandbox (ngân hàng **NCB**):

| Trường | Giá trị |
|---|---|
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | `NGUYEN VAN A` |
| Ngày phát hành | `07/15` |
| Mã OTP | `123456` |

> Merchant sandbox đang dùng là `8W2J66V5` (đăng ký ngày 18/10/2026; cấu hình trong `BE/.env`, không đưa lên git).
> Có thể xem lịch sử giao dịch test tại https://sandbox.vnpayment.vn/merchantv2/ (đăng nhập bằng email đã đăng ký merchant).
> Callback trả về `http://localhost:8080/...`, nên chỉ hoạt động trên chính máy đang chạy hệ thống.
> Nếu VNPay báo "Website này chưa được phê duyệt", nghĩa là merchant đã bị khóa hoặc hết hạn: đăng ký merchant mới tại
> https://sandbox.vnpayment.vn/devreg/, thay `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` trong `BE/.env`, rồi khởi động lại payment-service.

---

## 5. PH6: Chiến dịch khuyến mãi tự động (5 phút) ⭐

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 6.1 | Admin → **Khuyến mãi & Voucher** → **➕ Tạo chiến dịch mới** | Canvas kéo thả, có sẵn khối Bắt đầu và Kết thúc | "Admin tự vẽ kịch bản khuyến mãi: Khi nào (trigger) → Nếu (điều kiện) → Thì làm gì (hành động)." |
| 6.2 | Ở khối Bắt đầu, đổi trigger sang **Đơn hàng thành công** (bảng thuộc tính bên phải) | Toast "Đã đổi Trigger" | |
| 6.3 | Bấm thẻ **Tặng điểm thưởng**, rồi thẻ **Tặng voucher %** ở hộp công cụ | 2 khối được chèn trước khối Kết thúc | |
| 6.4 | Bấm **Kiểm tra sơ đồ** | Báo hợp lệ | "Backend kiểm tra sơ đồ trước khi cho triển khai, kể cả cạnh trỏ tới khối không tồn tại." |
| 6.5 | Bấm **🚀 Triển khai ngay** → nhập tên → **🚀 Xác Nhận & Triển Khai** | Chiến dịch xuất hiện trong danh sách, trạng thái **KÍCH HOẠT** | "Sơ đồ được biên dịch sang BPMN 2.0 và deploy lên Camunda chạy bên trong promotion-service." |
| 6.6 | Trình duyệt 1: đặt 1 đơn COD ≥ 100.000đ, đợi **Đã xác nhận** | | |
| 6.7 | `/profile?tab=membership`, rồi `/profile?tab=vouchers` (đợi 10–30 giây) | Điểm tăng 100; có voucher 10% mới | "Camunda nhận sự kiện đơn thành công từ Kafka và tự cộng điểm, phát voucher. Lỗi tạm thời khi phát thưởng sẽ được Camunda tự thử lại." |
| 6.8 | Đặt đơn mới, chọn voucher và dùng điểm ở `/checkout` | Giảm 10% (tối đa 50.000đ) và trừ điểm; tổng tiền khớp với đơn tạo ra | |
| 6.9 | Admin → **Thống kê khuyến mãi** | Số voucher đã phát, ngân sách đã dùng tăng | |
| 6.10 | **Quan trọng:** tắt chiến dịch (toggle), rồi xóa | Không còn chiến dịch nào chạy | "Tắt chiến dịch là dừng hẳn tiến trình trên Camunda." Nếu để chiến dịch chạy, nó sẽ phát thưởng cho mọi đơn sau buổi demo. |

> Tránh khối **Gửi Email** trong chiến dịch: sẽ gửi email thật.

---

## 6. PH7: Thông báo email (1 phút)

| Làm gì | Nói gì |
|---|---|
| Kể lại: mỗi khi đơn xác nhận, đang giao, đã giao, bị hủy hoặc được hoàn tiền, khách nhận một email | "notification-service đọc sự kiện từ Kafka (`order-events`, `payment-events`), lấy đúng email khách từ user-service, điền mẫu email (có danh sách sản phẩm và tổng tiền) rồi gửi qua SMTP; gửi lỗi thì tự thử lại." |

> Muốn cho xem email thật: trước buổi demo, đổi email của tài khoản `customer` sang email của bạn
> (Keycloak → Users → Details → Email), và chạy notification-service với cấu hình SMTP trong `BE/.env`.

---

## 7. PH8: Theo dõi hành vi và gợi ý sản phẩm (3 phút)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 8.1 | Trang chủ → tab **GỢI Ý CHO BẠN** (đã đăng nhập) | Danh sách gợi ý | "Model SASRec đọc chuỗi sản phẩm khách đã xem, đã mua theo thứ tự để đoán món tiếp theo. Sau model có bước sắp xếp lại: ưu tiên cùng tầm giá khách hay mua, đa dạng danh mục, loại sản phẩm hết hàng hoặc ngừng bán." |
| 8.2 | Mở 2 trang sản phẩm khác nhau, quay về trang chủ, đợi khoảng 15 giây → tab **XEM GẦN ĐÂY** | 2 sản phẩm vừa xem nằm đầu danh sách | |
| 8.3 | Tab **XU HƯỚNG MUA SẮM** | Sản phẩm phổ biến | "Khách mới chưa có lịch sử thì hệ thống tự lùi về danh sách phổ biến (SASRec → Recency → Popularity)." |
| 8.4 | F12 → Network → lọc `recommendations` → xem Response Headers | Có header `X-Recs-Strategy: sasrec` (khách) hoặc `popularity` (khách vãng lai) | |
| 8.5 | F12 → Network → lọc `behavior`, rồi cuộn và xem vài trang | Khoảng 10 giây có một request `POST /public/behavior/events` | "Trình duyệt gom các hành vi (xem, cuộn, lọc, tìm kiếm…) rồi gửi theo lô 10 giây một lần. Có 19 loại hành vi." |

---

## 8. PH9: Phân tích AI và dự đoán khách rời bỏ (3 phút)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 9.1 | Admin → **Tổng quan** | KPI doanh thu, số đơn; chuông thông báo đếm đơn cần xử lý và sản phẩm sắp hết hàng | |
| 9.2 | Admin → **Phân tích AI** | Biểu đồ dự báo gắn nhãn **Dữ liệu minh họa**; bảng **Khuyến nghị nhập hàng** gắn nhãn **Dữ liệu thật** (tính từ tồn kho thực tế) | "Phần nào chưa có dữ liệu thật thì ghi rõ là minh họa, không để quản lý ra quyết định dựa trên số giả." |
| 9.3 | Tab http://localhost:8004/docs → `GET /api/v1/models/card` → **Execute** | Thẻ mô tả model: nhãn, số mẫu, các chỉ số | "Từ lịch sử đơn và hành vi, hệ thống tính 11 chỉ số cho mỗi khách. KMeans chia khách thành 4 nhóm; Logistic Regression cho ra xác suất rời bỏ." |
| 9.4 | `POST /api/v1/risk/trigger-scan` → **Execute** khi để trống header | HTTP **401** | "API quét rủi ro có thể phát voucher hàng loạt, nên chỉ quản trị viên được gọi." |
| 9.5 | Gọi lại, điền `X-User-Id` = `admin`, `X-User-Roles` = `ROLE_ADMIN` | Số khách được chấm điểm, số khách có nguy cơ | "Thực tế 2 header này do gateway gắn sau khi xác thực token, client không tự gửi được. Quét rủi ro tự chạy mỗi giờ; khách nguy cơ cao kích hoạt chiến dịch **Nguy cơ rời bỏ** để tặng voucher giữ chân." |

> ⚠️ Nói rõ khi demo: dữ liệu dùng để huấn luyện là **dữ liệu tổng hợp** (300 khách, 890 đơn) do `tools/data-seed` sinh ra.

---

## 9. PH10: Chatbot AI và chat với nhân viên (5 phút) ⭐

### 9.1 Chatbot (trình duyệt 1)

| # | Gõ vào chatbot (nút chat ở góc màn hình) | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 10.1 | `Chính sách đổi trả ra sao?` | Trả lời theo tài liệu chính sách | "Chatbot dùng RAG: tra đoạn liên quan trong tài liệu chính sách rồi mới trả lời, để không bịa." |
| 10.2 | Bấm gợi ý có sẵn **Gợi ý quà tặng dưới 500 nghìn** | Thẻ sản phẩm đều dưới 500.000đ (ốp lưng, sạc, pin dự phòng) | "Chatbot hiểu khoảng giá: dưới, trên, từ… đến…, nghìn, triệu." |
| 10.3 | `Laptop gaming cho sinh viên` | Có thẻ sản phẩm bấm được | "LLM DeepSeek xác định ý định, rồi gọi tìm kiếm sản phẩm thật trước khi trả lời." |
| 10.4 | `Đơn hàng của tôi đâu rồi?` | Danh sách 5 đơn gần nhất kèm trạng thái, bấm vào mở chi tiết đơn | "Khách đã đăng nhập không phải nhập mã đơn; danh tính lấy từ token, không tin user id gửi trong nội dung." |
| 10.5 | `Thời tiết hôm nay thế nào?` | Từ chối lịch sự, kéo về chủ đề mua sắm | |

> Chatbot dùng LLM nên câu trả lời mỗi lần mỗi khác, và cần Internet để gọi DeepSeek.

### 9.2 Chuyển sang nhân viên (2 trình duyệt)

| # | Làm gì | Kết quả phải thấy | Nói gì |
|---|---|---|---|
| 10.6 | Trình duyệt 2: đăng nhập `staff` → **Chat hỗ trợ** | Nhân viên đang online | |
| 10.7 | Trình duyệt 1: trong chatbot bấm **Yêu cầu gặp nhân viên trực tuyến** | Phòng chat được tự giao cho nhân viên đang online | "chat-service tự gán phòng cho nhân viên đang có ít phòng nhất. Nếu không ai online, tin nhắn được lưu và báo cho bộ phận hỗ trợ, nhân viên phản hồi trong giờ làm việc." |
| 10.8 | Hai bên nhắn qua lại, gửi 1 ảnh | Tin nhắn hiện ngay lập tức, không cần tải lại trang | "Chat thời gian thực qua WebSocket (STOMP); ảnh lưu trên MinIO. Mỗi khách chỉ đọc và gửi được vào phòng của chính mình." |
| 10.9 | Nhân viên đóng phòng | Phòng chuyển trạng thái đã đóng | |

---

## 10. Kết thúc: chất lượng và kiểm thử (2 phút)

| Làm gì | Nói gì |
|---|---|
| Mở `docs/test/SQA_TechStore.xlsx` → sheet **Phần_1-Công việc chung** | "Hệ thống được kiểm thử theo quy trình SQA: 780 ca giao diện, API và unit test, 30 kịch bản hiệu năng. Các lỗi phát hiện được ghi kèm bằng chứng và đề xuất sửa." |
| Mở `docs/bao-cao/THIEU_SOT_NGHIEP_VU.md` → mục **Trạng thái xử lý** | "Sau đợt kiểm thử, các thiếu sót nghiệp vụ ưu tiên đã được sửa và kiểm chứng lại: 232 unit test Java, 272 test Python và 41 kịch bản E2E qua gateway đều đạt." |
| Mở một sheet **Kiểm thử hiệu năng** | "Đa số API đọc có p95 dưới 50 ms với 20 người dùng đồng thời và dưới 150 ms với 50 người dùng. Gateway giới hạn 20 request/giây cho mỗi người dùng để chống lạm dụng." |

---

## Lưu ý khi demo

| Khu vực | Lưu ý | Cách xử lý khi demo |
|---|---|---|
| Đơn chưa thanh toán | Mỗi khách tối đa 3 đơn chưa thanh toán; đơn VNPay bỏ dở tự hủy sau 30 phút | Hủy các đơn test còn treo trước buổi demo |
| Số lượng | Mỗi sản phẩm tối đa 5 chiếc một đơn | Không demo mua số lượng lớn |
| Giá sản phẩm | 311 sản phẩm trang nguồn ghi "Liên hệ" đang dùng **giá tham khảo** ước tính | Nếu bị hỏi, mở `tools/catalog-import/price-estimates.csv` (có căn cứ từng sản phẩm) |
| Chiến dịch | Chiến dịch vẫn chạy sau buổi demo nếu chưa tắt | Luôn tắt rồi xóa ở bước 6.10 |
| Chatbot | Câu trả lời không cố định; cần Internet | Dùng các câu ở mục 9.1 |
| Chuyển sang nhân viên | Nhân viên chỉ thấy tin nhắn từ lúc chuyển, chưa thấy đoạn chat với AI trước đó | Nói rõ đây là hướng phát triển |
| Dữ liệu AI | Model gợi ý và rời bỏ huấn luyện trên dữ liệu tổng hợp; biểu đồ dự báo là minh họa | Nói rõ khi demo |
| Vận chuyển | Hãng vận chuyển là giả lập; phí ship theo ngưỡng (30.000đ, miễn phí từ 500.000đ), chưa theo vùng | Nói rõ là hướng phát triển |
| Đổi trả, bảo hành | Chưa có luồng gửi yêu cầu online, xử lý qua hotline/CSKH | Nói rõ là hướng phát triển |

## Nếu có sự cố trong lúc demo

| Sự cố | Cách xử lý nhanh |
|---|---|
| Trang báo "Dịch vụ … tạm thời không khả dụng" (503) | Mở http://localhost:8761 xem service nào thiếu, rồi khởi động lại service đó |
| Đăng nhập báo sai mật khẩu | Keycloak đã khởi động lại; đặt lại mật khẩu theo mục 0.3 |
| Mở http://localhost:5173 phải chờ rất lâu (thường sau khi máy sleep) | Web đang chờ Keycloak kiểm tra phiên đăng nhập. Thử: `curl -o NUL -w "%{time_total}" "http://localhost:8083/realms/ecommerce-realm/protocol/openid-connect/auth?client_id=ecommerce-frontend&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2F&response_type=code&scope=openid&prompt=none"`. Nếu quá vài giây: **khởi động lại máy** (hoặc Docker Desktop), không `docker restart infra-keycloak` vì container có thể bị treo hẳn |
| Sau khi khởi động lại máy / Docker Desktop | `docker start infra-eureka infra-gateway ai-recs-service ai-search-service` (4 container này không tự bật), đặt lại mật khẩu theo mục 0.3, rồi chạy lại 8 service Java |
| Trang đăng nhập Keycloak quay mãi | Máy thiếu RAM: đóng bớt ứng dụng, đợi 1–2 phút rồi thử lại |
| Đơn đứng mãi ở **Chờ xác nhận** / **Chờ thanh toán** (COD) | Mở http://localhost:8088/connectors?expand=status. Nếu task của connector báo FAILED: `curl -X POST http://localhost:8088/connectors/payment-outbox-connector/tasks/0/restart` (hoặc `order-outbox-connector`); sự kiện tồn đọng sẽ được giao tiếp |
| Chatbot không trả lời | Kiểm tra http://localhost:8002/health; chatbot cần Internet để gọi DeepSeek |
| Service Java build lại xong không khởi động | Build lại bằng `mvn clean package -DskipTests` với JDK 17 |
| Máy chậm, service tự tắt | Thiếu RAM: đóng bớt ứng dụng, tắt các service AI không cần (`docker stop ai-forecast-service`…) |

## Dọn dẹp sau buổi demo

- Tắt và xóa các chiến dịch đã tạo (admin → **Khuyến mãi & Voucher**).
- Hủy các đơn test chưa giao (đơn chưa thanh toán sẽ tự hủy sau 30 phút).
- Xóa sản phẩm test đã tạo ở mục 2.6 (admin → **Danh sách sản phẩm**).
