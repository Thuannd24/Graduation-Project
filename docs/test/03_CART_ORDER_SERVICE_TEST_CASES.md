# TEST CASE CHI TIẾT — CART & ORDER SERVICE (order-service)

> **Nguồn đối chiếu:** Code thật tại `BE/order-service/src/main/java/com/ecommerce/orderservice/**` (ưu tiên khi lệch với tài liệu thiết kế `docs/services/03_CART_ORDER_SERVICE.md`).
> **Ngày viết:** 2026-07-14. **Phạm vi:** Cart (Redis), Checkout/Order Saga (Outbox + Debezium CDC + Kafka), Cancel, Admin Shipping, Shipping Webhook, Scheduler (Expiry/Compensation/Outbox Cleanup).
> **Rút gọn:** Bản này đã được rút gọn từ 124 → 75 test case theo yêu cầu dự án — ưu tiên tối đa các luồng SAGA quan trọng (transition trạng thái order, checkout COD/VNPAY, consumer Kafka, cancel, admin shipping, outbox pattern, scheduler, race condition); các case chỉ validate field/format lẻ tẻ được gộp thành 1-2 dòng đại diện. Test ID đã đánh số lại liên tục.

---

## 1. TÓM TẮT PHẠM VI (SCOPE SUMMARY)

### 1.1. Kiến trúc liên quan
- **Cart:** lưu 100% trên Redis Hash (`cart:{userId}`), không có entity DB. Giá/tên/ảnh lấy real-time qua gRPC từ `product-service`; tồn kho cache tại key `product:stock:{productId}:{variantId}` (khởi tạo lười từ `inventory-service` qua gRPC nếu cache miss, fail-open khi lỗi gRPC ở bước validateStock).
- **Order:** entity `orders` (PostgreSQL), field `status` dạng String tự do (không enum JPA), các state: `PENDING → AWAITING_PAYMENT → CONFIRMED → SHIPPED → DELIVERED`, nhánh `CANCELLED` (final). Có `getStatusRank()` để chặn hạ cấp trạng thái (downgrade).
- **Saga checkout:**
  1. `OrderServiceImpl.createOrder()`: giữ chỗ kho bằng Lua script Redis DECRBY (atomic), lưu `Order` + `OrderItem` (transaction 1), áp voucher/point (gọi ngoài transaction 1), lưu `OutboxEvent` loại `OrderCreatedEvent` (transaction 2), rồi clear cart.
  2. `InventoryKafkaConsumer` lắng nghe topic `inventory-events`: `CONFIRMED` → `updateOrderStatus(orderId, "AWAITING_PAYMENT")`; `FAILED` → `updateOrderStatus(orderId, "CANCELLED")`.
  3. `PaymentKafkaConsumer` lắng nghe topic `payment-events`: `PaymentSuccessEvent`/`PaymentCODConfirmedEvent` → `updateOrderStatus(orderId, "CONFIRMED")`; `PaymentFailedEvent` → `cancelOrder(orderId, userId, email)`.
  4. Admin/Carrier: `shipOrder()` (CONFIRMED→SHIPPED), `handleShippingWebhook()`/`updateDeliveryStatusByAdmin()` (SHIPPED→DELIVERED hoặc →CANCELLED).
  5. Mọi thay đổi trạng thái quan trọng (CREATED/CANCELLED/CONFIRMED/SHIPPED/DELIVERED) đều ghi `OutboxEvent` **trong cùng transaction DB** với thay đổi status → Debezium CDC đọc binlog và publish lên topic `order-events` (không dùng scheduler poll như tài liệu cũ mô tả).
  6. **Không có bảng "processed_event" idempotency riêng cho consumer** — cơ chế chống trùng lặp thực tế nằm ở tầng nghiệp vụ: `updateOrderStatus()` so sánh `status` hiện tại (bỏ qua nếu bằng, chặn nếu rank thấp hơn hoặc order đã ở final state DELIVERED/CANCELLED); `cancelOrder()` bắt `InvalidOrderStateException` nếu order không còn ở PENDING/AWAITING_PAYMENT/CONFIRMED.
- **Order còn có cơ chế:** Idempotency-Key (Redis lock `checkout:lock:{userId}:{key}`, TTL 15 phút) chống double-submit checkout; `CompensationTask` + `CompensationRetryScheduler` để retry release voucher/refund điểm khi promotion-service/user-service tạm gián đoạn; `OrderExpiryScheduler` tự hủy đơn PENDING/AWAITING_PAYMENT quá 30 phút.
- **Không có field `paymentMethod` trong `CheckoutRequest`** — COD hay VNPAY được quyết định bởi `payment-service` (ngoài phạm vi service này); order-service chỉ phản ứng theo event `PaymentSuccessEvent` (VNPAY) / `PaymentCODConfirmedEvent` (COD) / `PaymentFailedEvent`, đều dẫn tới cùng logic `updateOrderStatus`/`cancelOrder`.
- **Không có trường voucher/campaign riêng "áp dụng % giảm"** — field liên quan: `Order.couponCode`, `Order.appliedCampaignId`, `Order.discountAmount`, `Order.shippingDiscountAmount`, `Order.pointDiscountAmount`, `Order.pointsRedeemed`, `Order.vatAmount`, `Order.shippingFee`, `Order.finalAmount`, `Order.totalWeight`.

### 1.2. Phân loại mức test (quan trọng để scope hóa môi trường)

| Mức | Môi trường cần | Ghi chú |
|---|---|---|
| **Unit Test (UT)** | Không cần Kafka/Debezium/Redis/DB thật — mock `OrderRepository`, `OutboxEventRepository`, `RedisTemplate`, `KafkaListener` gọi trực tiếp method Java (không qua broker), `PromotionClient`/`UserClient`/`InventoryGrpcClient`/`ProductGrpcClient` mock. | Test logic transition trạng thái, guard rank, exception, tính toán pricing, tính weight, idempotency key theo Redis mock. |
| **Integration Test (IT) — mức Service + DB thật (Testcontainers Postgres + Redis)** | Cần Postgres + Redis thật (Testcontainers), KHÔNG cần Kafka thật. Gọi trực tiếp REST endpoint hoặc Service method, sau đó **query trực tiếp bảng `outbox_events`** để xác nhận có row tương ứng trong cùng transaction tạo đơn. | Đây là cách test Outbox Pattern *atomicity* mà không cần Kafka. |
| **Integration Test (IT) — Saga end-to-end (Kafka + Debezium thật)** | Cần Kafka broker + Kafka Connect (Debezium PostgreSQL connector) + topic `order-events`, `inventory-events`, `payment-events` chạy thật (docker-compose full stack). | Dùng để verify: outbox row → Debezium CDC → message thật trên topic `order-events` → consumer inventory-service/payment-service xử lý → event ngược lại → `InventoryKafkaConsumer`/`PaymentKafkaConsumer` của order-service nhận và cập nhật trạng thái. Các case này được đánh dấu rõ **[CẦN KAFKA+DEBEZIUM THẬT]** trong bảng. Nếu không có hạ tầng này, có thể giả lập bằng cách publish message tay lên topic test (Embedded Kafka) — vẫn coverage được logic Consumer nhưng KHÔNG coverage được phần Debezium CDC (outbox → Kafka) thật.

### 1.3. Không thuộc phạm vi service này (loại trừ)
- Logic tính giá/áp voucher chi tiết bên `promotion-service` (chỉ test contract gọi qua `PromotionClient` bằng mock).
- Logic trừ kho thật bên `inventory-service` (chỉ test phản ứng của order-service khi nhận event `CONFIRMED`/`FAILED`).
- Logic thanh toán VNPAY/COD thật bên `payment-service` (chỉ test phản ứng khi nhận `PaymentSuccessEvent`/`PaymentCODConfirmedEvent`/`PaymentFailedEvent`).
- Warranty OTP lookup (`WarrantyOtpService`, `PublicOrderController`) — tính năng phụ, không nằm trong yêu cầu cart/order/saga, không đưa vào bảng dưới (có thể viết test case riêng nếu cần).
- Các case chỉ validate field lẻ tẻ (thiếu trường, sai format request body...) đã được gộp thành 1-2 dòng đại diện trong mỗi module — không tách riêng từng field theo yêu cầu rút gọn của dự án.

---

## 2. MODULE: CART (Redis Hash) — `CartController` / `CartServiceImpl`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-001 | CartServiceImpl.getCart | Unit | Lấy giỏ hàng rỗng | Redis không có key `cart:{userId}` | Gọi `getCart("cart:u1")` | Trả `CartResponse` với `items=[]`, `totalAmount=0`, `userId="u1"` | Medium |
| UT-ORDER-002 | CartServiceImpl.getCart | Unit | Lấy giỏ hàng có item, map đúng giá/ảnh/variant từ gRPC product-service (gộp case sản phẩm không còn tồn tại ở product-service) | Redis có field `101:5` = `{productId:101, variantId:5, quantity:2}`; mock `ProductGrpcClient.getPriceInfo` trả variant có `variantPrice`, `imageUrl`, `variantAttrJson` | Gọi `getCart` | `CartItemResponse.unitPrice=variantPrice` (ưu tiên giá biến thể), `subtotal` đúng, `totalAmount` = tổng subtotal; item không còn tồn tại ở product-service bị bỏ qua, không throw | High |
| UT-ORDER-003 | CartServiceImpl.getCart / validateStock | Unit | gRPC product-service lỗi/timeout ở `getCart`; gRPC inventory-service lỗi khi cache-miss ở `addItemToCart` (fail-open) | Mock client throw Exception | Gọi `getCart`; và riêng `addItemToCart` khi stock cache miss + gRPC lỗi | `getCart` → throw `ServiceUnavailableException`; `addItemToCart` fail-open (KHÔNG throw, item vẫn thêm, log warning) — hai hành vi khác nhau có chủ đích cần verify đúng | High |
| UT-ORDER-004 | CartServiceImpl.addItemToCart | Unit | Thêm sản phẩm mới vào giỏ trống / cộng dồn số lượng nếu đã có / vượt tồn kho (3 case gộp) | Redis rỗng hoặc có sẵn field `101:0`; stock cache đủ hoặc không đủ theo case | `addItemToCart(cartKey, {productId, quantity})` với quantity hợp lệ và với quantity vượt tồn kho | Case hợp lệ: `quantity` lưu đúng (mới hoặc cộng dồn), TTL giỏ 30 ngày; case vượt tồn kho: throw `InsufficientStockException`, KHÔNG lưu vào Redis | High |
| UT-ORDER-005 | CartServiceImpl.updateItemQuantity / removeItemFromCart / clearCart | Unit | Cập nhật số lượng hợp lệ, quantity<=0 (tự xoá item), xoá 1 item theo productId+variantId, xoá cả giỏ (gộp các case CRUD còn lại) | Giỏ có sẵn item(s) | Gọi từng method tương ứng | Từng case cập nhật/xoá đúng field trong Redis Hash; update vượt tồn kho vẫn throw `InsufficientStockException`, quantity cũ không đổi | Medium |
| IT-ORDER-001 | /api/v1/cart (GET/POST/PUT/DELETE) | Integration | Luồng CRUD giỏ hàng end-to-end qua REST (Redis thật, Testcontainers) + 1 case request thiếu field/format sai (gộp 4 case IT cũ) | Redis instance thật, stock cache pre-set | Gọi lần lượt GET → POST (thêm item) → PUT (update quantity) → DELETE (xoá item); riêng 1 request POST thiếu `productId` | Mỗi bước phản ánh đúng thay đổi khi `GET` lại; request thiếu field trả HTTP 400 `code=VALIDATION_ERROR` | Medium |

---

## 3. MODULE: CHECKOUT / TẠO ĐƠN HÀNG — `OrderServiceImpl.createOrder` / `OrderController`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-006 | createOrder | Unit | Checkout khi giỏ hàng rỗng | `cartService.getCart()` trả `items=[]` | `createOrder(userId, request, null, email)` | Throw `InvalidOrderStateException("Cart is empty")`; không tạo `Order`/`OutboxEvent`; nếu có idempotency lock đã set thì bị xoá (rollback) | High |
| UT-ORDER-007 | createOrder | Unit | Checkout thành công, không coupon, không điểm (đại diện luồng COD) | Cart có 1 item hợp lệ; stock đủ; `pointsToRedeem=null` | `createOrder(userId, {shippingAddress, phoneNumber}, "key-1", email)` | `Order` được lưu `status=PENDING`, `discountAmount=0`; `OrderItem` lưu đúng snapshot; `OutboxEvent` loại `OrderCreatedEvent` được lưu; cart bị clear; trả `OrderResponse.status=PENDING` | Critical |
| UT-ORDER-008 | createOrder | Unit | Checkout thành công có coupon hợp lệ (đại diện luồng VNPAY/voucher) | `couponCode="SALE10"`; mock `promotionClient.applyVoucher` trả `applied=true` | `createOrder(userId, {..., couponCode:"SALE10"}, key, email)` | `Order.couponCode="SALE10"`, `discountAmount>0`, `finalAmount` giảm tương ứng; Transaction 1 (Order+Items) commit trước, sau đó Transaction 2 lưu `OutboxEvent` | Critical |
| UT-ORDER-009 | createOrder | Unit | Coupon không hợp lệ (promotion-service trả `applied=false`) | Mock `applyVoucher` trả `applied=false` | `createOrder` với `couponCode` không hợp lệ | Throw `InvalidCouponException`; order (Transaction 1) bị compensation cập nhật `status=CANCELLED`; KHÔNG lưu `OrderCreatedEvent` | High |
| UT-ORDER-010 | createOrder | Unit | Redeem điểm thất bại (user-service lỗi/số dư không đủ) | `pointsToRedeem=500`; mock `userClient.redeemPoints` trả lỗi | `createOrder` | Throw `InvalidOrderStateException`; order bị `markOrderCancelledAndReleaseVoucher` (status=CANCELLED + release voucher nếu có coupon) | High |
| UT-ORDER-011 | createOrder | Unit | Hết hàng ở bước giữ chỗ Redis (Lua DECRBY trả -2), hoặc stock cache bị evict giữa lúc check/decrement (Lua trả -1) — 2 case race condition gộp | Stock key nhỏ hơn quantity yêu cầu; hoặc giả lập cache bị evict | `createOrder` với item vượt tồn kho / với race evict | Case -2: throw `InsufficientStockException`, các item đã decrement được rollback (`INCRBY`), idempotency lock bị xoá; case -1: throw `ServiceUnavailableException` | Critical |
| UT-ORDER-012 | createOrder | Unit | Idempotency-Key trùng, request trước đang xử lý | Redis key `checkout:lock:{userId}:{key}` = `"PROCESSING"` | `createOrder` lần 2 với cùng key | Throw `DuplicateRequestException` ("Request is already being processed") | High |
| UT-ORDER-013 | createOrder | Unit | Idempotency-Key trùng, request trước đã hoàn tất | Redis key đã lưu `responseJson` hợp lệ | `createOrder` lần 2 với cùng key | Trả lại **response đã cache** (parse từ JSON), KHÔNG tạo order mới, KHÔNG gọi lại `cartService`/`orderRepository.save` | Critical |
| UT-ORDER-014 | createOrder | Unit | Lỗi khi lưu OutboxEvent sau khi Transaction 1 (Order+Items) đã commit | Mock `outboxEventRepository.save` throw Exception | `createOrder` | Order (transaction 1) được cập nhật `status=CANCELLED` (compensation); một `OrderCancelledEvent` được cố lưu vào outbox; nếu bước này cũng lỗi → throw `RuntimeException` để `OrderExpiryScheduler` retry sau | High |
| IT-ORDER-002 | POST /api/v1/orders/checkout | Integration | Checkout thành công end-to-end (Postgres + Redis thật, KHÔNG cần Kafka) — verify Outbox Pattern ghi đúng transaction (gộp case checkout giỏ hàng rỗng ở mức REST) | Testcontainers Postgres + Redis; cart pre-populated; mock gRPC/Feign clients ở boundary | `POST /api/v1/orders/checkout` với `Idempotency-Key` | HTTP 201/200 `code=SUCCESS`, `data.status=PENDING`; **query trực tiếp bảng `outbox_events`**: tồn tại đúng 1 row `event_type=OrderCreatedEvent`, `aggregate_id=<orderId>` — xác nhận Outbox Pattern ghi cùng transaction; riêng case giỏ hàng rỗng trả HTTP 400 `code=INVALID_STATE` | Critical |
| IT-ORDER-003 | POST /api/v1/orders/checkout | Integration | Checkout sản phẩm hết hàng | Stock cache Redis = 0 hoặc nhỏ hơn quantity trong giỏ | `POST /api/v1/orders/checkout` | HTTP 400, `code=OUT_OF_STOCK`; không có row mới trong `orders` (hoặc row bị CANCELLED nếu transaction 1 đã lỡ commit) | High |
| IT-ORDER-004 | POST /api/v1/orders/checkout | Integration | 2 request checkout đồng thời cùng `Idempotency-Key` (race condition) | 2 thread gửi cùng lúc cùng `userId` + cùng `Idempotency-Key`, cùng giỏ hàng | Gửi song song qua `ExecutorService`/`CompletableFuture` | Chỉ **1** request tạo order thành công (SETNX thắng); request còn lại nhận `DuplicateRequestException` (409) HOẶC response cache giống nhau; bảng `orders` chỉ có **đúng 1** row mới | Critical |
| IT-ORDER-005 | POST /api/v1/orders/checkout | Integration | 2 request checkout đồng thời khác `Idempotency-Key` nhưng cùng sản phẩm số lượng giới hạn (race stock) | Stock cache = 1; 2 request cùng mua quantity=1 sản phẩm đó, khác `userId` | Gửi song song | Chỉ 1 request thành công (Lua script atomic DECRBY đảm bảo không âm); request thua nhận `OUT_OF_STOCK` (400) | High |

---

## 4. MODULE: SAGA — INVENTORY KAFKA CONSUMER (`InventoryKafkaConsumer`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-015 | InventoryKafkaConsumer.consumeInventoryEvent | Unit | Nhận event `status=CONFIRMED` | Order đang `PENDING`; mock `orderService.updateOrderStatus` | Gọi `consumeInventoryEvent('{"orderId":10,"status":"CONFIRMED"}', ack)` | `orderService.updateOrderStatus(10, "AWAITING_PAYMENT")` được gọi đúng 1 lần; `ack.acknowledge()` được gọi | Critical |
| UT-ORDER-016 | InventoryKafkaConsumer.consumeInventoryEvent | Unit | Nhận event `status=FAILED` kèm `failReason` | Order đang `PENDING` | `{"orderId":10,"status":"FAILED","failReason":"Out of stock"}` | `orderService.updateOrderStatus(10, "CANCELLED")` được gọi; log cảnh báo có `failReason`; `ack.acknowledge()` được gọi | Critical |
| UT-ORDER-017 | InventoryKafkaConsumer.consumeInventoryEvent | Unit | Payload JSON lỗi cú pháp / thiếu field `orderId`/`status` (gộp 2 case) | Message lỗi format hoặc thiếu field | Gọi consumer | Throw `RuntimeException`/`IllegalArgumentException`, KHÔNG gọi `ack.acknowledge()` → message route tới DLQ | High |
| UT-ORDER-018 | InventoryKafkaConsumer.consumeInventoryEvent | Unit | Nhận trùng lặp event `CONFIRMED` cho order đã ở `AWAITING_PAYMENT` (idempotency qua state guard) | Order đã `AWAITING_PAYMENT` | Gửi lại cùng message `CONFIRMED` | `updateOrderStatus` bị bỏ qua do rank bằng nhau → không đổi trạng thái, không lưu outbox mới; không throw; `ack.acknowledge()` vẫn được gọi | Critical |
| UT-ORDER-019 | InventoryKafkaConsumer.consumeInventoryEvent | Unit | Nhận event `FAILED` cho order đã `CANCELLED` (trùng lặp) | Order đã `CANCELLED` | Gửi lại `FAILED` | `updateOrderStatus` no-op do status đã trùng (idempotency check đầu hàm); không lưu outbox trùng; không throw | High |
| IT-ORDER-006 | Saga Inventory → Order | **[CẦN KAFKA THẬT]** Integration | Order tạo xong (PENDING), publish message thật lên topic `inventory-events` với `CONFIRMED` | Kafka broker thật (Testcontainers/Embedded Kafka); consumer đang lắng nghe | Produce message `{"orderId":<id>,"status":"CONFIRMED"}` lên topic `inventory-events` | Trong vài giây, `orders.status` chuyển `PENDING → AWAITING_PAYMENT` | High |
| IT-ORDER-007 | Saga Inventory → Order | **[CẦN KAFKA + DEBEZIUM THẬT]** Integration | Toàn luồng: Checkout → Outbox `OrderCreatedEvent` → Debezium CDC đọc binlog Postgres → publish thật lên `order-events` → inventory-service (giả lập consumer test) nhận → trừ kho → publish `inventory-events` CONFIRMED → order-service nhận → AWAITING_PAYMENT | Full docker-compose: Postgres + Kafka Connect (Debezium PG connector) + Kafka + order-service | Checkout API thật, không publish tay | Xác nhận `orders.status=AWAITING_PAYMENT` cuối cùng bằng polling DB (timeout ~30s); xác nhận Debezium đã publish message lên `order-events` | Medium (chạy pipeline nightly/regression, không mỗi lần commit) |

---

## 5. MODULE: SAGA — PAYMENT KAFKA CONSUMER (`PaymentKafkaConsumer`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-020 | PaymentKafkaConsumer.consumePaymentEvent | Unit | Nhận `PaymentSuccessEvent` (luồng VNPAY) và `PaymentCODConfirmedEvent` (luồng COD) — 2 event khác nhau nhưng cùng dẫn tới CONFIRMED (gộp 2 case theo 2 phương thức thanh toán) | Order đang `AWAITING_PAYMENT` | `{"eventType":"PaymentSuccessEvent",...}` và `{"eventType":"PaymentCODConfirmedEvent",...}` | Cả 2 case: `orderService.updateOrderStatus(orderId, "CONFIRMED")` được gọi (case-insensitive); `ack.acknowledge()` | Critical |
| UT-ORDER-021 | PaymentKafkaConsumer.consumePaymentEvent | Unit | Nhận `PaymentFailedEvent` | Order đang `AWAITING_PAYMENT` | `{"eventType":"PaymentFailedEvent","orderId":10,"userId":"u1","email":"a@b.com"}` | `orderService.cancelOrder(10, "u1", "a@b.com")` được gọi; `ack.acknowledge()` | Critical |
| UT-ORDER-022 | PaymentKafkaConsumer.consumePaymentEvent | Unit | `PaymentFailedEvent` nhưng order đã `SHIPPED`/`CANCELLED` (trùng lặp/late event) | Order đã ở trạng thái không thể hủy | Gửi `PaymentFailedEvent` | `orderService.cancelOrder` throw `InvalidOrderStateException` → được **bắt tại consumer**, chỉ log warning, KHÔNG rethrow, `ack.acknowledge()` vẫn được gọi (tránh retry vô hạn) | High |
| UT-ORDER-023 | PaymentKafkaConsumer.consumePaymentEvent | Unit | Payload JSON lỗi cú pháp / thiếu `eventType`/`orderId` (gộp 2 case) | Message lỗi format hoặc thiếu field | Gọi consumer | Throw `RuntimeException`/`IllegalArgumentException`, không ack → route DLQ | High |
| UT-ORDER-024 | PaymentKafkaConsumer.consumePaymentEvent | Unit | Nhận trùng lặp `PaymentSuccessEvent` cho order đã `CONFIRMED` (idempotency) | Order đã `CONFIRMED` | Gửi lại `PaymentSuccessEvent` cùng orderId | `updateOrderStatus` no-op (status đã bằng `CONFIRMED`) → không redeem voucher lần 2, không tạo `OrderConfirmedEvent` outbox lần 2; không throw | Critical |
| UT-ORDER-025 | PaymentKafkaConsumer.consumePaymentEvent | Unit | Lỗi không mong đợi khi update status (ví dụ DB down) | Mock `orderService.updateOrderStatus` throw `RuntimeException` bất kỳ | Gửi `PaymentSuccessEvent` | Exception được rethrow, không ack → Kafka sẽ retry/redeliver theo cấu hình | Medium |
| IT-ORDER-008 | Saga Payment → Order | **[CẦN KAFKA THẬT]** Integration | Publish `PaymentSuccessEvent` thật lên `payment-events`, xác nhận DB đổi trạng thái | Kafka thật; order đang `AWAITING_PAYMENT` | Produce message lên topic `payment-events` | `orders.status` chuyển `AWAITING_PAYMENT → CONFIRMED`; outbox có thêm row `OrderConfirmedEvent` | High |
| IT-ORDER-009 | Saga Payment → Order | **[CẦN KAFKA THẬT]** Integration | Publish `PaymentFailedEvent` thật, xác nhận huỷ đơn + hoàn kho | Kafka thật; order đang `AWAITING_PAYMENT` | Produce message `PaymentFailedEvent` | `orders.status → CANCELLED`; outbox có `OrderCancelledEvent`; (nếu có Debezium) event lan tới `inventory-service` để hoàn kho | High |

---

## 6. MODULE: CHUYỂN TRẠNG THÁI ĐƠN — `OrderServiceImpl.updateOrderStatus` (dùng chung bởi 2 consumer trên)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-026 | updateOrderStatus | Unit | Idempotent: status mới == status hiện tại | Order `status=CONFIRMED` | `updateOrderStatus(id, "CONFIRMED")` | Method return sớm, KHÔNG `save`, KHÔNG lưu outbox, log info "already in status" | High |
| UT-ORDER-027 | updateOrderStatus | Unit | Chặn downgrade (rank thấp hơn hoặc bằng) | Order `status=CONFIRMED` (rank 3) | `updateOrderStatus(id, "PENDING")` (rank 1) | Method return sớm (log warning), KHÔNG đổi status trong DB | Critical |
| UT-ORDER-028 | updateOrderStatus | Unit | Guard final state — order đã `DELIVERED` hoặc `CANCELLED` (gộp 2 case) | Order ở 1 trong 2 final state | `updateOrderStatus(id, <status khác>)` | Method return sớm, log warning "in final state", KHÔNG đổi | High |
| UT-ORDER-029 | updateOrderStatus | Unit | Chuyển hợp lệ sang `CONFIRMED` | Order `status=AWAITING_PAYMENT` | `updateOrderStatus(id, "CONFIRMED")` | `Order.status=CONFIRMED` lưu DB; `OutboxEvent OrderConfirmedEvent` được lưu cùng transaction; sau commit, `redeemVoucherForOrder` được gọi bất đồng bộ (`afterCommit`) | Critical |
| UT-ORDER-030 | updateOrderStatus | Unit | Chuyển hợp lệ sang `CANCELLED` | Order `status=PENDING` | `updateOrderStatus(id, "CANCELLED")` | `Order.status=CANCELLED`; `OutboxEvent OrderCancelledEvent` lưu cùng transaction (kèm item để hoàn kho); sau commit, `releaseVoucherForOrder` + `refundPointsForOrder` được gọi bất đồng bộ | Critical |
| UT-ORDER-031 | updateOrderStatus | Unit | Lỗi khi lưu OutboxEvent cho CANCELLED hoặc CONFIRMED (gộp 2 case) | Mock `outboxEventRepository.save` throw Exception | `updateOrderStatus(id, "CANCELLED")` và riêng `updateOrderStatus(id, "CONFIRMED")` | Cả 2 case: throw `RuntimeException` → toàn bộ `@Transactional` rollback, `Order.status` KHÔNG bị đổi trong DB | High |
| UT-ORDER-032 | updateOrderStatus | Unit | Pessimistic lock: `findByIdForUpdate` được dùng | — | Kiểm tra code path gọi `orderRepository.findByIdForUpdate` (không phải `findById`) | Xác nhận method sử dụng lock ghi để tránh race giữa webhook/consumer/cancel cùng lúc | Medium |

---

## 7. MODULE: HỦY ĐƠN HÀNG — `cancelOrder` / `POST /api/v1/orders/{id}/cancel`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-033 | cancelOrder | Unit | Hủy đơn khi `status=PENDING`/`AWAITING_PAYMENT`/`CONFIRMED` (gộp 3 case thành công) | Order thuộc user, ở 1 trong 3 trạng thái trên | `cancelOrder(orderId, userId, email)` | `status=CANCELLED`; `OutboxEvent OrderCancelledEvent` lưu cùng transaction; sau đó gọi `releaseVoucherForOrder` + `refundPointsForOrder` (ngoài transaction) | Critical |
| UT-ORDER-034 | cancelOrder | Unit | **Không thể hủy đơn đã `SHIPPED`/`DELIVERED`/`CANCELLED`** (gộp 3 case final-state guard) | Order ở 1 trong 3 trạng thái cuối | `cancelOrder(...)` | Throw `InvalidOrderStateException("Cannot cancel order in status: ...")`; HTTP 400 `code=INVALID_STATE` | Critical |
| UT-ORDER-035 | cancelOrder(withRoles) | Unit | User không phải chủ đơn và không phải Admin/Staff → chặn; Staff hủy đơn của khách khác → hợp lệ (gộp 2 case role guard) | `order.userId != requestUserId`, roles khác nhau | `cancelOrder(id, userId, email, role)` với `ROLE_USER` (khác chủ đơn) và với `ROLE_STAFF` | `ROLE_USER` khác chủ đơn: throw `AccessDeniedException`; `ROLE_STAFF`: hủy thành công (Staff có quyền như Admin) | Critical |
| UT-ORDER-036 | cancelOrder(withRoles) | Unit | Admin hủy đơn thay khách — event phải mang identity của khách, không phải admin | `order.userId="customer1"`, request từ `adminUserId="admin9"`, roles chứa `ROLE_ADMIN` | `cancelOrder(id, "admin9", "admin@x.com", "ROLE_ADMIN")` | `OrderCancelledEvent.userId="customer1"` và `email=order.getEmail()` (KHÔNG phải "admin9"/"admin@x.com") — regression test cho bug đã fix | High |
| UT-ORDER-037 | cancelOrder | Unit | Lỗi lưu OutboxEvent khi hủy | Mock outbox save throw Exception | `cancelOrder(...)` trên order PENDING | Throw `RuntimeException` → transaction rollback, `Order.status` vẫn giữ nguyên giá trị cũ trong DB | High |
| IT-ORDER-010 | POST /api/v1/orders/{id}/cancel | Integration | Hủy đơn thành công qua REST (DB thật) | Order PENDING tồn tại trong Postgres | `POST /api/v1/orders/{id}/cancel` header đúng user | HTTP 200 `code=SUCCESS`; query DB: `orders.status=CANCELLED`; `outbox_events` có thêm row `OrderCancelledEvent` cùng `aggregate_id=<id>` | Critical |
| IT-ORDER-011 | POST /api/v1/orders/{id}/cancel | Integration | 2 request hủy đơn đồng thời trên cùng 1 order (race condition) | Order PENDING; 2 thread gọi cancel cùng lúc | Gửi song song `POST .../cancel` | Nhờ `findByIdForUpdate` (pessimistic lock), chỉ 1 request cập nhật thành công `CANCELLED` + ghi đúng 1 outbox event; request thứ 2 nhận `InvalidOrderStateException` (400); **không có 2 outbox event trùng lặp** | Critical |

---

## 8. MODULE: ADMIN SHIPPING — `shipOrder` / `updateDeliveryStatusByAdmin`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-038 | shipOrder | Unit | Chuyển `CONFIRMED → SHIPPED` thành công | Order status CONFIRMED | `shipOrder(orderId)` | `status=SHIPPED`, `trackingCode` dạng `MOCK-GHTK-XXXXXXXX` được set; `OutboxEvent OrderShippedEvent` lưu cùng transaction; trả `OrderResponse` | Critical |
| UT-ORDER-039 | shipOrder | Unit | Không thể ship đơn chưa `CONFIRMED` | Order ở trạng thái khác CONFIRMED | `shipOrder(orderId)` | Throw `InvalidOrderStateException("Cannot ship order in current status: ...")` | Critical |
| UT-ORDER-040 | shipOrder | Unit | Lỗi lưu OutboxEvent OrderShippedEvent | Mock outbox save throw Exception | `shipOrder(orderId)` trên order CONFIRMED | Throw `RuntimeException`, `@Transactional` rollback → `status` KHÔNG chuyển thành SHIPPED trong DB | High |
| UT-ORDER-041 | updateDeliveryStatusByAdmin | Unit | **[DEFECT ĐÃ PHÁT HIỆN — CẦN FIX]** Admin chuyển `CONFIRMED → SHIPPED`: outbox `eventType` bị gán **SAI** thành `"OrderCancelledEvent"` | Order CONFIRMED | `updateDeliveryStatusByAdmin(id, "SHIPPED")` | Code hiện tại build eventType bằng ternary `"DELIVERED".equals(targetStatus) ? OrderDeliveredEvent : OrderCancelledEvent`; khi `targetStatus="SHIPPED"` (giá trị hợp lệ), ternary rơi vào nhánh else nên `eventType` bị nhãn nhầm thành `OrderCancelledEvent` thay vì `OrderShippedEvent` — **đây là defect cần dev fix, bổ sung nhánh riêng cho SHIPPED**, KHÔNG cắt case này khỏi bảng test | High |
| UT-ORDER-042 | updateDeliveryStatusByAdmin | Unit | Admin chuyển `SHIPPED → DELIVERED` | Order SHIPPED | `updateDeliveryStatusByAdmin(id, "DELIVERED")` | `status=DELIVERED`; outbox `OrderDeliveredEvent` lưu đúng | Critical |
| UT-ORDER-043 | updateDeliveryStatusByAdmin | Unit | Admin hủy đơn qua API này (CANCELLED); đơn đã ở final state (DELIVERED/CANCELLED) → guard; status không hợp lệ (không phải SHIPPED/DELIVERED/CANCELLED) (gộp 3 case guard/validation) | Order ở các trạng thái tương ứng | `updateDeliveryStatusByAdmin(id, "CANCELLED"/"DELIVERED"(khi đã final)/"FOO")` | CANCELLED hợp lệ: status đổi + outbox `OrderCancelledEvent` + release voucher/refund điểm; final state: throw `InvalidOrderStateException`; status không hỗ trợ: throw `IllegalArgumentException` | High |
| UT-ORDER-044 | OrderController.shipOrder / updateDeliveryStatus | Unit | Kiểm tra `@PreAuthorize` chỉ cho ROLE_ADMIN/ROLE_STAFF | User thường (ROLE_USER) gọi | Gọi `PUT /{id}/ship` với JWT/role user thường | HTTP 403 Forbidden (Spring Security chặn trước khi vào Controller) | High |
| IT-ORDER-012 | PUT /api/v1/orders/{id}/ship | Integration | Admin ship đơn thành công (DB thật) | Order CONFIRMED trong DB; caller có role ADMIN | `PUT /api/v1/orders/{id}/ship` | HTTP 200; DB: `status=SHIPPED`, `tracking_code` không null; `outbox_events` có row `OrderShippedEvent` | High |
| IT-ORDER-013 | PUT /api/v1/orders/{id}/delivery-status | Integration | Admin cập nhật DELIVERED (DB thật) | Order SHIPPED | `PUT .../delivery-status?status=DELIVERED` | HTTP 200; DB `status=DELIVERED`; outbox `OrderDeliveredEvent` | High |

---

## 9. MODULE: SHIPPING WEBHOOK (Carrier callback) — `handleShippingWebhook` / `PublicShippingWebhookController`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-045 | handleShippingWebhook | Unit | Webhook hợp lệ chuyển `SHIPPED → DELIVERED` | Order tồn tại theo `trackingCode`, status SHIPPED | `handleShippingWebhook(trackingCode, "DELIVERED")` | `status=DELIVERED`; outbox `OrderDeliveredEvent` lưu cùng transaction | Critical |
| UT-ORDER-046 | handleShippingWebhook | Unit | Webhook báo `CANCELLED` từ carrier (giao thất bại/trả hàng) | Order SHIPPED | `handleShippingWebhook(trackingCode, "CANCELLED")` | `status=CANCELLED`; outbox `OrderCancelledEvent`; sau commit gọi release voucher + refund points | High |
| UT-ORDER-047 | handleShippingWebhook | Unit | Webhook lặp lại cùng status (idempotency) / webhook trên order đã final-state khác (gộp 2 case guard) | Order đã `DELIVERED` (webhook lặp lại `DELIVERED`) hoặc order `CANCELLED` (webhook báo `SHIPPED`) | Gọi method tương ứng | Cả 2 case: no-op (return sớm), không lưu outbox trùng, log warning, không đổi | High |
| UT-ORDER-048 | ShippingWebhookSigner.verify | Unit | Chữ ký HMAC hợp lệ trả `true`; chữ ký sai/giả mạo trả `false` (gộp 2 case) | secret cấu hình đúng | `verify(secret, trackingCode, status, correctSignature)` và `verify(..., "fake-signature")` | Case đúng: trả `true`; case giả mạo: trả `false` | Critical |
| IT-ORDER-014 | POST /api/v1/public/orders/shipping-webhook | Integration | Webhook hợp lệ end-to-end (ký HMAC đúng) | Order SHIPPED trong DB; `app.shipping.webhook-secret` cấu hình | `POST .../shipping-webhook` header `X-Shipping-Signature` đúng, body `{trackingCode, status:"DELIVERED"}` | HTTP 200; DB `status=DELIVERED` | Critical |
| IT-ORDER-015 | POST /api/v1/public/orders/shipping-webhook | Integration | Chữ ký sai | Header signature không khớp | `POST .../shipping-webhook` | HTTP 401, message "Chữ ký webhook không hợp lệ." | Critical |

---

## 10. MODULE: SCHEDULER — Order Expiry / Compensation Retry / Outbox Cleanup

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-049 | OrderServiceImpl.expireOrder | Unit | Order PENDING hoặc AWAITING_PAYMENT quá hạn 30 phút (gộp 2 case) | Order ở 1 trong 2 trạng thái trên | `expireOrder(orderId)` | `status=CANCELLED`; outbox `OrderCancelledEvent` lưu cùng transaction; sau commit gọi async `releaseVoucherForOrder`/`refundPointsForOrder` | High |
| UT-ORDER-050 | OrderServiceImpl.expireOrder | Unit | Order đã CONFIRMED/SHIPPED/DELIVERED/CANCELLED (không còn PENDING/AWAITING_PAYMENT) | Order status CONFIRMED | `expireOrder(orderId)` | Method return sớm, log "already in status ... Skipping", không đổi gì | Medium |
| UT-ORDER-051 | CompensationRetryScheduler / retryCompensationTask | Unit | Retry `RELEASE_VOUCHER` thành công | `CompensationTask` status PENDING, taskType RELEASE_VOUCHER; mock `promotionClient.releaseVoucher` thành công | `retryCompensationTask(taskId)` | Task chuyển `status=COMPLETED` | High |
| UT-ORDER-052 | retryCompensationTask | Unit | Retry `REFUND_POINTS` thất bại lần thứ N < MAX (10) | Mock `userClient.refundPoints` throw Exception; `attempts=3` | `retryCompensationTask(taskId)` | Task vẫn `status=PENDING`, `attempts=4`, `lastError` cập nhật | High |
| UT-ORDER-053 | retryCompensationTask | Unit | Retry đạt max attempts (10 lần) → đánh dấu thất bại vĩnh viễn | `attempts=9`, lần retry thứ 10 vẫn lỗi | `retryCompensationTask(taskId)` | Task chuyển `status=FAILED_PERMANENT`, cần can thiệp thủ công (ghi log error rõ ràng) | Critical |
| IT-ORDER-016 | OrderExpiryScheduler | Integration | Order thật trong DB có `created_at` > 30 phút trước, status PENDING | Insert trực tiếp order với `created_at` giả lập cũ vào Testcontainers Postgres | Trigger `cleanupExpiredOrders()` thủ công | DB: `orders.status=CANCELLED`; `outbox_events` có thêm `OrderCancelledEvent` | Medium |
| IT-ORDER-017 | CompensationRetryScheduler | Integration | `CompensationTask` PENDING trong DB được retry và cập nhật | Insert `compensation_tasks` row PENDING; mock `PromotionClient` ở boundary trả thành công | Trigger `retryPendingCompensationTasks()` | DB: task `status=COMPLETED` | Medium |

---

## 11. MODULE: OUTBOX PATTERN — KIỂM TRA ATOMICITY (xuyên suốt các luồng trên)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-ORDER-018 | Outbox atomicity — Create | Integration | Đảm bảo `orders` + `order_items` + `outbox_events` (OrderCreatedEvent) commit/rollback cùng nhau | Testcontainers Postgres; simulate lỗi ở bước lưu `OrderItem` TRƯỚC khi outbox được ghi | Gọi `createOrder` khi `orderItemRepository.saveAll` lỗi | Transaction 1 rollback toàn bộ: KHÔNG có row nào trong `orders`, `order_items`; KHÔNG có `outbox_events` liên quan | Critical |
| IT-ORDER-019 | Outbox atomicity — Cancel | Integration | Đảm bảo update `orders.status=CANCELLED` và insert `outbox_events` cùng transaction | Giả lập lỗi khi serialize payload JSON | Gọi `cancelOrder` | Transaction rollback hoàn toàn: `orders.status` VẪN LÀ giá trị cũ, KHÔNG có outbox row mới | Critical |
| IT-ORDER-020 | Outbox schema | Integration | Kiểm tra cấu trúc row outbox đúng chuẩn hệ thống (`eventId`, `eventType`, `timestamp` trong payload JSON) | Sau khi checkout thành công | Query `outbox_events`, parse `payload` JSON | Payload chứa đủ `eventId` (UUID v4), `eventType="OrderCreatedEvent"`, `timestamp` (ISO-8601), `orderId`, `userId`, `email`, `items[]` | Medium |
| IT-ORDER-021 | Outbox → Debezium | **[CẦN KAFKA + DEBEZIUM THẬT]** Integration | Debezium CDC đọc row mới trong `outbox_events` và publish đúng lên topic `order-events` với key = `aggregate_id` | Kafka Connect + Debezium PostgreSQL connector + EventRouter SMT đã cấu hình trỏ tới bảng `outbox_events` | Checkout tạo đơn → chờ Debezium poll binlog | Test consumer đọc topic `order-events` nhận được message với `key=<orderId>`, payload JSON khớp với `outbox_events.payload` đã ghi | Medium |

---

## 12. MODULE: VOUCHER & ĐIỂM THƯỞNG (Pricing edge cases) — `OrderPricingHelper` liên quan tới Order

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-ORDER-054 | applyCouponToOrder / applyPointsToOrder | Unit | Đơn hàng nhiều item, áp voucher (%/`maxDiscount`) VÀ dùng điểm thưởng cùng lúc — thứ tự áp dụng đúng: coupon trước, điểm sau (gộp case voucher đơn lẻ + điểm đơn lẻ + combo multi-item) | Cart 3 item, `couponCode` hợp lệ, `pointsToRedeem=100` | `createOrder(...)` với coupon + points | `order.couponCode`, `discountAmount`, `pointsRedeemed`, `pointDiscountAmount` được set đúng; `finalAmount` = total − productDiscount − shippingDiscount − pointDiscount, không âm (`max(BigDecimal.ZERO)`) | High |

---

## 13. GHI CHÚ TRIỂN KHAI TEST

1. **Mock boundary chuẩn cho UT:** `OrderRepository`, `OrderItemRepository`, `OutboxEventRepository`, `CompensationTaskRepository`, `CartService`, `InventoryGrpcClient`, `ProductGrpcClient`, `PromotionClient`, `UserClient`, `RedisTemplate<String,String>` (mock `opsForValue`, `execute` cho Lua script trả về long theo từng case: `>=0` thành công, `-1` cache miss, `-2` hết hàng), `TransactionTemplate` (có thể dùng `TransactionTemplate` thật với H2/embedded hoặc mock `execute`/`executeWithoutResult` chạy callback ngay lập tức đồng bộ trong test).
2. **IT mức Service+DB (Testcontainers):** dùng Postgres thật + Redis thật, nhưng **stub tầng gRPC/Feign ra ngoài** (product-service, inventory-service, promotion-service, user-service) bằng WireMock/MockServer hoặc `@MockBean`, để cách ly khỏi các service khác — mục tiêu là verify đúng transaction DB (Order + OrderItem + OutboxEvent) và Redis (cart, lock, stock).
3. **IT saga end-to-end [CẦN KAFKA+DEBEZIUM THẬT]:** chạy trong môi trường riêng (docker-compose đầy đủ: Postgres, Kafka, Kafka Connect + Debezium connector, Redis, order-service, và ít nhất consumer giả lập cho `inventory-events`/`payment-events` nếu chưa deploy đủ inventory-service/payment-service thật). Đây là các test **chậm và tốn tài nguyên**, nên chạy ở pipeline nightly/regression, không chạy mỗi lần commit.
4. **Idempotency Kafka consumer:** lưu ý code hiện tại **không có bảng dedup riêng theo `(orderId, eventType)`** ở `InventoryKafkaConsumer`/`PaymentKafkaConsumer` — khả năng chống trùng dựa hoàn toàn vào guard trạng thái trong `updateOrderStatus`/`cancelOrder`. Test case UT-ORDER-018, UT-ORDER-019, UT-ORDER-024 dùng để xác nhận cơ chế "idempotent bằng state machine" này hoạt động đúng thay vì dựa vào Unique Key như `NOTIFICATION_SERVICE` mô tả trong `BE/CLAUDE.md` mục VI.2 — cần lưu ý sự khác biệt này khi review.
5. **Lỗi tiềm ẩn cần dev xác nhận (không phải test case PASS/FAIL chắc chắn, ghi nhận riêng — DEFECT):** UT-ORDER-041 — nhánh `updateDeliveryStatusByAdmin` build `eventType` bằng ternary `"DELIVERED".equals(targetStatus) ? "OrderDeliveredEvent" : "OrderCancelledEvent"`; khi `targetStatus="SHIPPED"` (một giá trị hợp lệ theo validate phía trên), event bị gán nhầm thành `OrderCancelledEvent`. Đề xuất báo bug riêng và bổ sung nhánh `SHIPPED → "OrderShippedEvent"`. Case này được giữ nguyên trong bảng rút gọn vì là finding quan trọng, không được cắt bỏ.
6. **Phạm vi đã rút gọn (2026-07-14):** Từ 124 test case gốc rút xuống 75 (54 UT + 21 IT), giảm ~40%. Ưu tiên giữ nguyên/đầy đủ: toàn bộ transition trạng thái order, checkout COD/VNPAY, 2 Kafka consumer, cancel theo state guard, admin shipping, outbox atomicity, scheduler, race condition/concurrency. Các case chỉ validate field/format lẻ tẻ (ví dụ giỏ hàng thiếu field, request body sai định dạng, các guard status trùng lặp cùng bản chất) đã được gộp thành 1 dòng đại diện có ghi rõ "(gộp N case)" trong cột Mô tả.
