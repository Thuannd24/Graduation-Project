# Đối chiếu báo cáo với mã nguồn

## Phạm vi căn cứ

Căn cứ chính là **file trong workspace** `Graduation-Project-feat-final-integration`, đối chiếu ngày 01/11/2026. Khi thiết lập Git để lưu báo cáo, mã nguồn ứng dụng được xác nhận khớp commit [`6b1e1c4ad018af21b03f36bec51816062da151fa`](https://github.com/Thuannd24/Graduation-Project/commit/6b1e1c4ad018af21b03f36bec51816062da151fa) của nhánh nguồn [`feat/final-integration`](https://github.com/Thuannd24/Graduation-Project/tree/feat/final-integration). Các tài liệu bổ sung được lưu trên nhánh riêng `docs/bao-cao-uml-20261101`.

Google Docs được đọc để nhận diện thẻ `Báo cáo` (`t.0`) và bố cục Chương 2; không dùng các mô tả trong đó để thay thế hành vi code. Không chỉnh sửa Docs trong công việc này. Các nhận xét dưới đây là kết quả đọc source, không phải xác nhận đã chạy tích hợp với Redis, MySQL, Kafka, SMTP hay VNPay.

## Ma trận truy vết

Đường dẫn tương đối có thể mở từ repo. Tên phương thức là vị trí tìm kiếm ổn định khi số dòng thay đổi.

| Mã | Nội dung báo cáo/sơ đồ | File và vị trí kiểm tra |
|---|---|---|
| S01 | Nhập giao nhận, preview, checkout rồi khởi tạo thanh toán riêng | [CheckoutPage.jsx](../../../FE/src/features/checkout/pages/CheckoutPage.jsx): lời gọi `previewCheckout`, `createOrder`, `initiatePayment`, chuyển `window.location.href` |
| S02 | Khóa Idempotency-Key do FE gửi | [orderApi.ts](../../../FE/src/services/orderApi.ts): `createOrder`, `previewCheckout`, `initiatePayment` |
| S03 | Endpoint preview/checkout và policy | [OrderController.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/controller/OrderController.java): `previewCheckout`, `checkout`, `getOrderPolicy` |
| S04 | Dữ liệu nhập không gồm một tổng tiền được tin cậy từ client | [CheckoutRequest.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/dto/request/CheckoutRequest.java) |
| S05 | Preview không giữ hàng, chưa kiểm tra số dư điểm thực tế | [OrderServiceImpl.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java): `previewCheckout` |
| S06 | Công thức VAT đã nằm trong giá, giảm phí ship có chặn, 1 điểm = 1.000 đồng | [OrderPricingHelper.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/support/OrderPricingHelper.java): `calculate`, `calculatePointDiscount` |
| S07 | Ship 30.000 đồng, miễn phí từ 500.000 đồng sau giảm sản phẩm | [ShippingFeeCalculator.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/support/ShippingFeeCalculator.java): `calculate` |
| S08 | Giới hạn 5 đơn vị/mục, 3 đơn chưa trả, điện thoại Việt Nam | [OrderPolicy.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/support/OrderPolicy.java); `validateCheckoutRules` trong S05/S09 |
| S09 | Khóa checkout 15 phút, giữ Redis theo từng mục, lưu đơn và bù trừ sau commit | [OrderServiceImpl.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java): `createOrder` |
| S10 | Lua chỉ kiểm tra và giảm trên một khóa mỗi lần | [RedisLuaScripts.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/config/RedisLuaScripts.java): `stockDecrementScript`, `stockIncrementScript` |
| S11 | Lấy tồn qua gRPC khi thiếu cache | [InventoryGrpcClient.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/grpc/InventoryGrpcClient.java): `getInventory` |
| S12 | Giá chính thức, ý nghĩa tổng discount, đổi điểm theo kết quả dịch vụ | [OrderServiceImpl.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java): `applyCouponToOrder`, `applyPricingToOrder`, `resolveProductDiscount`, `applyPointsToOrder` |
| S13 | Preview voucher và apply là hai hợp đồng khác nhau | [PromotionClient.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/client/PromotionClient.java): `previewVoucher`, các thao tác voucher theo đơn |
| S14 | Điểm dùng thật phải kiểm tra số dư/hạn mức; không chỉ chặn tiền preview | [LoyaltyPointServiceImpl.java](../../../BE/user-service/src/main/java/com/ecommerce/userservice/service/impl/LoyaltyPointServiceImpl.java): `redeemForOrder`; [LoyaltyPointPolicy.java](../../../BE/user-service/src/main/java/com/ecommerce/userservice/domain/LoyaltyPointPolicy.java) |
| S15 | Order không có trạng thái PAID/PAYMENT_FAILED; cập nhật có kiểm soát | [OrderStatusMachine.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/support/OrderStatusMachine.java); `updateOrderStatus` trong S09 |
| S16 | Trừ kho do OrderCreatedEvent, không phải PaymentSuccessEvent | [InventoryKafkaConsumer.java](../../../BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/kafka/consumer/InventoryKafkaConsumer.java): `consumeOrderEvent`; [InventoryDeductService.java](../../../BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/service/InventoryDeductService.java): `processOrderCreated`, `deductInventory` |
| S17 | Kho phản hồi, Order chuyển AWAITING_PAYMENT khi hợp lệ | [InventoryKafkaConsumer.java của order](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/event/consumer/InventoryKafkaConsumer.java): `consumeInventoryEvent` |
| S18 | Kết quả kho gửi trực tiếp Kafka sau commit, không có Outbox ở nhánh này | [InventoryKafkaProducer.java](../../../BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/kafka/producer/InventoryKafkaProducer.java): `publishInventoryEvent`; `processOrderCreated` trong S16 |
| S19 | Hoàn theo DEDUCT/RELEASE, dấu CANCEL_RECEIVED, cộng Redis sau commit | [InventoryDeductService.java](../../../BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/service/InventoryDeductService.java): `processOrderCancelled`, `releaseInventory`, `incrementRedisStock` |
| S20 | Initiate/retry/status có kiểm tra định danh | [PaymentController.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/controller/PaymentController.java): `initiatePayment`, `retryPayment`, `getPaymentStatus` |
| S21 | Tóm tắt đơn dùng kiểm tra chủ đơn, số tiền và hạn | [InternalOrderController.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/controller/InternalOrderController.java); [OrderSummaryDto.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/dto/response/OrderSummaryDto.java) |
| S22 | Khởi tạo Payment, tái sử dụng, khóa Redis theo đơn, ký URL | [PaymentServiceImpl.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/service/impl/PaymentServiceImpl.java): `initiatePayment`, `fetchOrderSummary`, `buildVnPayUrl`, `guardInFlightVnPayAttempt` |
| S23 | Callback, chữ ký, số tiền ×100, mã đáp ứng và log | [PaymentServiceImpl.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/service/impl/PaymentServiceImpl.java): `verifyVnPayCallback`, `saveWebhookLog` |
| S24 | IPN và trình duyệt dùng cùng endpoint; phân biệt mã tiếp nhận/kết quả trả tiền | [WebhookController.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/controller/WebhookController.java): `vnpayCallback` |
| S25 | Khóa dòng Payment và tra cứu mã lượt cũ | [PaymentRepository.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/repository/PaymentRepository.java): `findByTxnRefWithLock`, `findByOrderIdWithLock`, `findBySupersededTxnRefWithLock` |
| S26 | Callback cũ/muộn có đường đối soát hoặc tạo refund | [PaymentServiceImpl.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/service/impl/PaymentServiceImpl.java): `handleSupersededVnPayCallback`, `verifyVnPayCallback`, `processPendingRefunds` |
| S27 | Một lượt FAILED không mặc định hủy đơn | [PaymentKafkaConsumer.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/event/consumer/PaymentKafkaConsumer.java): xử lý `GATEWAY_DECLINED`, `ATTEMPT_EXPIRED` và sự kiện kiểu cũ |
| S28 | Order xác nhận và Outbox OrderConfirmedEvent | [OrderServiceImpl.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/service/impl/OrderServiceImpl.java): `updateOrderStatus`, `saveOrderCreatedOutboxEvent`, `saveOutboxEvent` |
| S29 | Hạn đơn 30 phút, quét 5 phút | [OrderExpiryScheduler.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/scheduler/OrderExpiryScheduler.java); `expireOrder` trong S09 |
| S30 | Hết hạn lượt và hoàn tiền định kỳ | [PaymentScheduler.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/scheduler/PaymentScheduler.java); [application.yml](../../../BE/payment-service/src/main/resources/application.yml): `payment-expiry-minutes` |
| S31 | COD xác nhận khác nhận tiền; khi giao hàng mới SUCCESS | [OrderKafkaConsumer.java của payment](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/event/consumer/OrderKafkaConsumer.java): `OrderDeliveredEvent`; `initiatePayment` trong S22 |
| S32 | Hai loại email theo OrderConfirmedEvent và PaymentSuccessEvent | [NotificationKafkaConsumer.java](../../../BE/notification-service/src/main/java/com/ecommerce/notificationservice/event/consumer/NotificationKafkaConsumer.java): `consumeOrderEvent`, `consumePaymentEvent`, `alreadyProcessed` |
| S33 | Orders, OrderItem và Outbox order | [Order.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/entity/Order.java), [OrderItem.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/entity/OrderItem.java), [OutboxEvent.java](../../../BE/order-service/src/main/java/com/ecommerce/orderservice/entity/OutboxEvent.java) |
| S34 | Payment, Refund, log không có paymentId, Outbox payment | [Payment.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/entity/Payment.java), [Refund.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/entity/Refund.java), [WebhookLog.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/entity/WebhookLog.java), [OutboxEvent.java](../../../BE/payment-service/src/main/java/com/ecommerce/paymentservice/entity/OutboxEvent.java) |
| S35 | Unique sản phẩm–biến thể, lịch sử biến động | [Inventory.java](../../../BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/entity/Inventory.java), [InventoryTransaction.java](../../../BE/inventory-service/src/main/java/com/ecommerce/inventoryservice/entity/InventoryTransaction.java) |

## Những chỗ phải khác mô tả ban đầu/tài liệu tham khảo

| Cách mô tả dễ gây sai | Cách dùng trong bộ báo cáo này |
|---|---|
| Tạm tính + VAT + phí − giảm giá | Giá đã gồm VAT; VAT là phần tách để hiển thị |
| Giữ toàn bộ giỏ nguyên tử | Nguyên tử từng khóa; nhiều mục có bù trừ khi thất bại |
| VNPay thành công mới trừ kho vật lý | Trừ theo OrderCreatedEvent; nhánh kho và nhánh thanh toán bất đồng bộ |
| Đơn chuyển PAID hoặc PAYMENT_FAILED | Dùng trạng thái Order trong OrderStatusMachine; kết quả trả tiền ở Payment |
| Cổng hủy là hủy đơn ngay | Lượt FAILED còn cho thử lại; scheduler đơn quyết định quá hạn |
| Mọi timeout đều là 15 phút | Khóa checkout 15 phút; hạn đơn 30 phút; lượt payment có cấu hình riêng (mặc định 15 phút) |
| RspCode 00 luôn là khách đã trả tiền | Đó là mã tiếp nhận callback; hiển thị dựa trạng thái Payment thật |
| Mọi callback kiểm tra thêm TransactionStatus | Nhánh callback chính đọc ResponseCode; không tự thêm bước kiểm tra chưa có |
| Order và Outbox tạo đơn luôn commit cùng một lần | createOrder chia giao dịch và có bù trừ; không nói thành một transaction xuyên dịch vụ |
| Mọi dịch vụ đều phát sự kiện bằng Outbox | Nhánh kết quả kho dùng producer Kafka trực tiếp sau commit |
| Order–Payment là 1–1 với FK/UNIQUE đã chứng minh | Ngữ nghĩa dùng một Payment chính; entity không khai báo unique order_id, không có FK liên dịch vụ |
| Payment–WebhookLog là FK 1–n | Log không có payment_id; liên hệ theo payload |
| Một Payment chỉ có tối đa một Refund | Có thể có nhiều Refund, ví dụ hoàn một phần hoặc đối soát |

## Giới hạn hiện thực cần nói rõ khi bảo vệ

- Khóa checkout có hiệu lực khi caller cung cấp và tái sử dụng đúng Idempotency-Key; đây không phải cơ chế nhận dạng mọi lần nhấn nút bất kể khóa.
- Khóa Lua nguyên tử không loại bỏ mọi tình huống Redis mất cache, khởi tạo lại tồn khi còn đơn đang xử lý hoặc tiến trình chết giữa các bước. Những trường hợp đó cần kiểm thử tích hợp/đối soát.
- Kho gửi sự kiện sau commit, nhưng đoạn producer được đọc chỉ log khi gửi lỗi. Không khẳng định hoàn toàn không mất tín hiệu kết quả kho khi tiến trình dừng.
- Preview đổi điểm và đổi điểm thật là hai đường: tạo đơn gọi user-service để kiểm tra số dư và hạn mức, rồi dùng số tiền giảm trả về. Preview dùng giá trị hàng sau giảm sản phẩm; `applyPointsToOrder` còn trừ `shippingDiscount` khi tạo `orderAmount`. Không coi mức giảm preview là một khoản đã được chấp nhận; yêu cầu vượt mức ở user-service bị từ chối, không tự giảm xuống hạn mức.
- Consumer thông báo kiểm tra trùng rồi gửi; lỗi vẫn được acknowledge trong các nhánh đọc được. Không gán bảo đảm email tới hộp thư hoặc exactly-once từ riêng kiểm tra tồn tại bản ghi.
- Kiểm tra số đơn chưa trả là một phép đếm trước tạo đơn, không phải quota được khóa nguyên tử theo khách.
- Thời hạn đơn và scheduler chỉ là cơ chế xử lý định kỳ; không mô tả việc hoàn tất bù trừ đúng thời điểm hết hạn hoặc không bao giờ cần vận hành can thiệp.

## Nguồn kiểm thử hiện có

| Nhóm | File |
|---|---|
| Tính giá | [OrderPricingHelperTest.java](../../../BE/order-service/src/test/java/com/ecommerce/orderservice/support/OrderPricingHelperTest.java) |
| Checkout/đơn | [OrderServiceImplTest.java](../../../BE/order-service/src/test/java/com/ecommerce/orderservice/service/OrderServiceImplTest.java) |
| Thanh toán | [PaymentServiceImplTest.java](../../../BE/payment-service/src/test/java/com/ecommerce/paymentservice/service/PaymentServiceImplTest.java) |
| Trừ/hoàn kho | [InventoryDeductServiceTest.java](../../../BE/inventory-service/src/test/java/com/ecommerce/inventoryservice/service/InventoryDeductServiceTest.java) |
| Case thủ công đơn | [03_CART_ORDER_SERVICE_TEST_CASES.md](../../test/03_CART_ORDER_SERVICE_TEST_CASES.md) |
| Case thủ công kho | [04_INVENTORY_SERVICE_TEST_CASES.md](../../test/04_INVENTORY_SERVICE_TEST_CASES.md) |
| Case thủ công thanh toán | [05_PAYMENT_SERVICE_TEST_CASES.md](../../test/05_PAYMENT_SERVICE_TEST_CASES.md) |

## Kiểm tra bộ tài liệu

Kiểm tra nguồn PlantUML bằng renderer cục bộ; kiểm tra SVG là XML hợp lệ và liên kết file tương đối tồn tại. Bộ hình hiện tại có 8 sơ đồ chi tiết, 1 Use Case tổng quát và 2 bảng đặc tả trong `HINH_VE.md`; `BAO_CAO.md` giữ bản nội dung trước khi tách hai UC. Các kiểm tra này xác nhận cấu trúc tài liệu, không thay cho chạy test Java hoặc thử thanh toán VNPay.

Đã gọi cả `agent-check.ps1 -Fast` và `agent-check.ps1`: script báo không tìm thấy lệnh build/test được nhận diện ở thư mục gốc, nên không có test ứng dụng nào được thực thi bởi hai lệnh này. Ở lần biên soạn đầu, Git chưa có trong PATH và workspace chưa có `.git`, nên chỉ rà soát trực tiếp file tài liệu; sau khi thiết lập Git, thay đổi được đối chiếu với commit gốc nêu trên. Không diễn giải exit code 0 của các script thành kết luận test Java đã đạt.
