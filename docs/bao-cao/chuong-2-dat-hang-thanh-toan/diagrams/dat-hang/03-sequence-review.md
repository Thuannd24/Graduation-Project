# Bản duyệt đầu tiên: sequence tạo đơn

Ngày đối chiếu: 06/11/2026. Nguồn là working tree local tại thời điểm vẽ, HEAD `63852a2`; cấu hình đang sửa trong working tree cũng được đọc. Biểu đồ `dat-hang/03-sequence` đã được người dùng duyệt làm mẫu cho bộ còn lại. Đối chiếu của cả bộ nằm trong `../DOI_CHIEU_2026-11-06.md`.

## Phạm vi và cách đọc

- Interaction chính: `POST /api/v1/orders/checkout`, từ FE gửi yêu cầu đến HTTP response; gồm tạo đơn thành công, trả lại kết quả idempotency, từ chối trùng và bù trừ khi exception.
- Các lifeline thể hiện lớp trong order-service và dịch vụ bên ngoài. Tên client dưới tên dịch vụ cho biết adapter gọi dịch vụ đó, không có nghĩa client chạy bên trong dịch vụ đích.
- `group TransactionTemplate` là transaction MariaDB cục bộ. Redis, gRPC, Feign không cùng transaction này. Các mũi tên SQL biểu diễn thao tác persistence tương ứng, không khẳng định câu SQL do Hibernate sinh ra có đúng nguyên văn như nhãn.
- Nhánh `alt` thành công mô tả toàn bộ đường đi bình thường. Nhánh lỗi dùng `ref` để chỉ phần tiền tố đã chạy tới điểm lỗi, sau đó mới mô tả catch; không có nghĩa mọi thao tác thành công đã chạy trước mọi lỗi.
- Các khung `ref` rút gọn: provision tài khoản tại Gateway; cạnh tranh khóa khởi tạo cache tồn; phát sự kiện hành vi giỏ; lưu tác vụ retry bù trừ; ánh xạ exception; chuyển sang khởi tạo thanh toán.
- Preview giá, tùy chọn lưu địa chỉ mới, nội bộ các dịch vụ ngoài, CDC/consumer, retry scheduler và vòng đời thanh toán không được triển khai thành interaction đầy đủ trong bản này. Chú thích chỉ xác định điểm nối với chúng.
- Các nhánh kiểm tra form/JWT không hợp lệ nằm ngoài tiền điều kiện của luồng chính. Lỗi `@Valid` trước service và lỗi idempotency trước `try` được phân biệt với catch bù trừ tạo đơn.

## Đối chiếu với code

Các đường dẫn dưới đây tính từ thư mục gốc repository.

| Phần biểu đồ | Nguồn kiểm tra | Kết luận dùng để vẽ |
| --- | --- | --- |
| FE gửi checkout và chuyển sang payment | `FE/src/features/checkout/pages/CheckoutPage.jsx:293`, `FE/src/services/orderApi.ts:28` | `CheckoutRequest` không chứa phương thức thanh toán hoặc danh sách item được chọn. FE gọi `initiatePayment` sau checkout cho cả COD và VNPAY. Lỗi initiate không tự hủy đơn vừa tạo. |
| Gateway | `BE/api-gateway/src/main/java/com/ecommerce/apigateway/filter/UserHeaderFilter.java:61`, `BE/api-gateway/src/main/resources/application.yml` | Header người dùng được lấy từ JWT; Gateway có bước `ensureProvisioned` với cache Redis và gọi user-service khi cần. |
| Controller | `BE/order-service/src/main/java/com/ecommerce/orderservice/controller/OrderController.java:43` | `@Valid CheckoutRequest`, resolve user, gọi service và bọc `ApiResponse.success`; thành công HTTP 200. |
| Idempotency và điều phối | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:94` | Khóa `checkout:lock:{userId}:{key}`, TTL 15 phút, lưu PROCESSING hoặc JSON response; phần này đứng trước try/catch bù trừ. |
| Giỏ và giá sản phẩm | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/CartServiceImpl.java:70` | Đọc giỏ Redis, gọi batch `ProductGrpcClient.getPriceInfo`, dựng lại giá/thông tin item. Item không tìm thấy trong dữ liệu sản phẩm bị bỏ qua; diagram không giả định giữ nguyên mọi entry Redis. |
| Quy tắc checkout | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:486`, `BE/order-service/src/main/java/com/ecommerce/orderservice/support/OrderPolicy.java`, `BE/order-service/src/main/java/com/ecommerce/orderservice/support/OrderStatusMachine.java` | Chuẩn hóa số điện thoại; từ chối quantity > 5, active = false; tối đa 3 đơn thuộc PENDING/AWAITING_PAYMENT trước khi tạo thêm. |
| Giữ tồn | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:132`, `BE/order-service/src/main/java/com/ecommerce/orderservice/config/RedisLuaScripts.java:24` | Chỉ đọc inventory bằng gRPC khi cần nạp cache. Giữ tồn bằng Lua GET/SET nguyên tử trong Redis. Khóa nạp cache TTL 5 giây, tối đa 10 lượt thử. Mã -2 là thiếu tồn; -1/null là lỗi sẵn sàng. |
| TX1 và ưu đãi | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:277`, `:1186`, `:1246` | TX1 ghi orders + order_items. Áp voucher/đổi điểm sau TX1; mỗi helper tính giá và lưu order. Hai nhánh có/không coupon có cùng TX1 nên được gộp trong diagram. |
| Tính giá | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:1225`, `BE/order-service/src/main/java/com/ecommerce/orderservice/support/OrderPricingHelper.java:37` | Shipping tính tại server; VAT đã nằm trong giá, không cộng thêm. Khi đổi điểm, orderAmount gửi user-service là max(totalAmount − productDiscount − shippingDiscount, 0), đúng biểu thức hiện tại trong code. |
| TX2 và CDC | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:330`, `:1637`, `BE/order-service/src/main/resources/application.yml`, `BE/docker-compose.yml:124` | Outbox OrderCreatedEvent được lưu trong TX2 riêng, database MariaDB. Cấu hình Debezium đọc ecommerce_order_db.outbox_events và route sang order-events. Sơ đồ không đặt CDC sau HTTP response theo một thứ tự bắt buộc. |
| Xóa giỏ và response | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/CartServiceImpl.java:371`, `BE/order-service/src/main/java/com/ecommerce/orderservice/event/producer/CartEventProducer.java`, `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:368` | Xóa giỏ, gửi CLEAR_CART không chờ Kafka ack, dựng response, cache response. Tham số producer thực tế là cartKey; nhãn không đổi thành userId thuần. Lỗi cache response chỉ được ghi log. |
| Catch bù trừ | `BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java:390`, `:1301`, `:1331`, `:1343` | Trước commit: cộng lại Redis cho item đã giữ. Sau commit: thử CANCELLED + cancellation outbox trong một transaction, rồi trả voucher/hoàn điểm; không cộng Redis trực tiếp lần nữa. Có xử lý hủy cục bộ trước catch khi voucher/điểm lỗi. |
| Xử lý tồn qua sự kiện hủy | `BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/kafka/consumer/InventoryKafkaConsumer.java:78`, `BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/service/InventoryDeductService.java:135` | Consumer nhận OrderCancelledEvent; chi tiết xử lý bất đồng bộ nằm ngoài interaction HTTP này. |
| HTTP lỗi | `BE/order-service/src/main/java/com/ecommerce/orderservice/exception/GlobalExceptionHandler.java` | Các lỗi nghiệp vụ được vẽ: 400; duplicate: 409; unavailable: 503; exception ngoài dự kiến: 500. |

## Kiểm tra và giới hạn

Đối chiếu tĩnh với source và cấu hình hiện có; không phải kết quả chạy end-to-end hoặc bảo đảm hệ thống đang triển khai giống cấu hình local. Các phép rút gọn ở trên được ghi rõ để không coi một diagram là toàn bộ hệ thống.

Các file PNG và SVG được render trực tiếp từ cùng `03-sequence.puml` bằng PlantUML 1.2026.9, không dựng ảnh riêng khác nội dung nguồn. Mở SVG và phóng to để duyệt chi tiết 15 lifeline.

Lệnh tái tạo (PowerShell, thay đường dẫn JAR theo máy):

```powershell
$jar = "$env:TEMP/plantuml-1.2026.9.jar"
$diagram = 'docs/bao-cao/chuong-2-dat-hang-thanh-toan/diagrams/dat-hang/03-sequence.puml'
java '-Djava.awt.headless=true' '-DPLANTUML_LIMIT_SIZE=16000' -jar $jar -charset UTF-8 -checkonly $diagram
java '-Djava.awt.headless=true' '-DPLANTUML_LIMIT_SIZE=16000' -jar $jar -charset UTF-8 -tsvg $diagram
java '-Djava.awt.headless=true' '-DPLANTUML_LIMIT_SIZE=16000' -jar $jar -charset UTF-8 -tpng $diagram
```
