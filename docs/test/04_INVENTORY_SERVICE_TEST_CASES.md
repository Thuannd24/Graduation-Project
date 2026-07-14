# TEST CASE — INVENTORY SERVICE

## 1. Phạm vi (Scope)

Tài liệu này mô tả chi tiết test case (Unit Test - UT và Integration Test - IT) cho `inventory-service`, được xây dựng dựa trên **code thật** tại `BE/inventory-service` (đối chiếu với `docs/services/04_INVENTORY_SERVICE.md`, các điểm lệch được ghi chú trong mục 1.3).

> **Đã rút gọn (2026-07-14):** tài liệu gốc có 101 test case, được rút gọn còn 59 test case theo yêu cầu tập trung vào các luồng quan trọng. Nguyên tắc rút gọn:
> - Giữ đầy đủ các luồng ưu tiên cao nhất: trừ kho theo order (saga, pessimistic lock chống oversell), rollback kho khi hủy order, đồng bộ Redis (delta vs absolute, mất kết nối Redis không ảnh hưởng DB commit), restock, race condition 2 request đồng thời cùng variant.
> - Gộp các test case chỉ validate field đơn lẻ (quantity âm, id không tồn tại lặp lại ở nhiều method, thiếu field tùy chọn...) thành 1 dòng đại diện cho mỗi nhóm.
> - Bỏ các test case về field/behavior không tồn tại hoặc không thuộc phạm vi nghiệp vụ chính (workflow approve/reject restock chưa implement, snapshot không có method, các edge case số học hiếm gặp mức Low).
> - Giữ lại các gap/khác biệt so với doc gốc (không có field `redisStock`, sync không tự-heal ngay như doc mô tả, biên strict `<` ở low-stock, transaction type `CANCEL_RECEIVED`...) vì phản ánh hành vi thật cần test.

### 1.1. Các thành phần được cover

- **`InventoryService`** (`service/InventoryService.java`): `getInventory`, `getBatchInventory`, `updateInventory` (set tuyệt đối), `restock` (cộng dồn), `getTransactions` (phân trang), `getLowStockProducts`, `syncRedisFromDatabase` (full resync, phân trang 1000), `syncSingleProductToRedis` (Lua script incrby, delta vs absolute), `validateProductAndVariant` (Feign sang product-service).
- **`InventoryDeductService`** (`service/InventoryDeductService.java` — saga trừ/hoàn kho theo Order): `processOrderCreated`, `deductInventory` (pessimistic lock `findByProductIdAndVariantIdForUpdate`), `processOrderCancelled`, `releaseInventory`, các cơ chế idempotency (`DEDUCT`/`RELEASE`/`CANCEL_RECEIVED` tombstone), race condition cancel-trước-created.
- **`InventoryKafkaConsumer`**: distributed lock Redis theo `orderId`, xử lý retry/ack, phân nhánh `InsufficientStockException` (ack, không retry) vs lỗi hệ thống khác (không ack, retry).
- **Controller**: `AdminInventoryController` (`/api/v1/admin/inventories/**`, role `ADMIN`/`STAFF`), `InventoryController` (`/api/v1/inventories/**`, public/permitAll).
- **Entity**: `Inventory`, `InventoryTransaction`, `InventoryDailySnapshot`, `RestockRequest`.

### 1.2. Ngoài phạm vi

- gRPC server `InventoryGrpcServerService` (kênh nội bộ order-service gọi trực tiếp, không phải REST — có thể bổ sung ở tài liệu riêng nếu cần).
- `InventorySyncScheduler` (job định kỳ) — chỉ nêu tham chiếu ở mục low-priority, không đi sâu do không đọc chi tiết cron config trong lần review này.
- `InventoryDailySnapshot` — không có service method ghi/đọc snapshot trong code hiện tại, không có test case nghiệp vụ tương ứng (chỉ liệt kê ở mục Entity Model để tham chiếu).

### 1.3. Điểm code thật lệch với `docs/services/04_INVENTORY_SERVICE.md` (áp dụng khi test)

| # | Nội dung docs | Thực tế code | Ảnh hưởng khi viết/chạy test |
|---|---|---|---|
| 1 | Endpoint prefix `/api/inventories`, `/api/admin/inventories` | Thực tế `/api/v1/inventories`, `/api/v1/admin/inventories` | Test case dùng path `v1` |
| 2 | `InventoryResponse` có field `redisStock` | Không có field này, chỉ có `productId, variantId, quantity, lastUpdated` | Không assert `redisStock` trong response |
| 3 | Sync Redis "self-healing ngay sau update DB" trong transaction | Dùng `TransactionSynchronization.afterCommit()` — chỉ sync SAU khi DB commit thành công | Test phải verify Redis sync xảy ra sau commit, không phải trong transaction |
| 4 | Sequence "DEDUCT xong tự sync Redis absolute" | `deductInventory` **không** sync Redis (dựa vào early reservation ở order-service, tránh Lost Update) | Không assert Redis bị set lại sau deduct |
| 5 | `transaction_type` enum: DEDUCT/RELEASE/RESTOCK | Thực tế còn có `"CANCEL_RECEIVED"` (tombstone khi cancel đến trước created) | Bổ sung test case cho giá trị thứ 4 |
| 6 | `restock_requests.requested_by` kiểu BIGINT | Thực tế `String` (lấy trực tiếp từ header `X-User-Id`, không parse số) | Test truyền giá trị không phải số cho header vẫn phải chạy được |
| 7 | `restock_requests.status` có workflow PENDING→APPROVED→COMPLETED/REJECTED | Code hiện tại luôn tạo trực tiếp `status = "COMPLETED"`, không có method chuyển trạng thái | Không test workflow approve/reject (chưa implement) |
| 8 | Không đề cập distributed lock theo orderId ở Kafka consumer | Có lock Redis `lock:inventory-consumer:{orderId}` (TTL 10s, retry 50 lần x 100ms = 5s) | Bổ sung test case race condition ở consumer |
| 9 | Low-stock threshold không nêu rõ biên | Code dùng **strict `<`** (không phải `<=`) | Test biên: quantity == threshold phải KHÔNG nằm trong kết quả |

### 1.4. Quy ước Test ID

- `UT-INVENTORY-xxx`: Unit Test (mock repository/Feign/Redis, test logic method đơn lẻ trong service, không cần Spring context đầy đủ / DB thật).
- `IT-INVENTORY-xxx`: Integration Test (có DB thật/Testcontainers, Redis thật, gọi qua REST controller hoặc qua Kafka consumer thật, hoặc test tương tác giữa nhiều thành phần: DB + Redis + Feign).
- Priority: **High / Medium / Low**.

---

## 2. Module: Get Inventory (đơn lẻ theo product + variant)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-001 | InventoryService.getInventory | Unit | Lấy tồn kho thành công theo variantId cụ thể; variantId=null được coerce về 0 | Mock `findByProductIdAndVariantId` trả `Inventory{productId=101, variantId=5, quantity=50}`; case null coerce mock riêng với `variantId=0` | Gọi `getInventory(101L, 5L)` và `getInventory(101L, null)` | Trả đúng `InventoryResponse` tương ứng cho từng case; repository luôn được gọi với `variantId=0L` khi input null | High |
| UT-INVENTORY-002 | InventoryService.getInventory | Unit | Không tìm thấy inventory → 404 | Mock repository trả `Optional.empty()` | Gọi `getInventory(999L, 0L)` | Throw `ResourceNotFoundException` với message chứa `"999:0"` | High |
| IT-INVENTORY-001 | GET /api/v1/inventories/{productId}[?variantId=] | Integration | Lấy tồn kho qua REST thành công, không cần auth, đúng theo variantId truyền vào | DB có `Inventory(101,0,50)` và `Inventory(101,5,30)` | `GET /api/v1/inventories/101` và `GET /api/v1/inventories/101?variantId=5` | HTTP 200 cả 2 case; `data.quantity` đúng theo từng variant (không lấy nhầm variant 0) | High |
| IT-INVENTORY-002 | GET /api/v1/inventories/{productId} | Integration | productId không tồn tại → 404 | DB không có record cho productId=888 | `GET /api/v1/inventories/888` | HTTP 404, `ApiResponse.success=false`, message chứa "Inventory not found" | High |

---

## 3. Module: Batch Get Inventory

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-003 | InventoryService.getBatchInventory | Unit | Lấy batch thành công; id không tồn tại bị bỏ qua âm thầm (không throw); danh sách rỗng trả rỗng | Mock `findByProductIdIn` với 3 input: `[101,102,103]` đủ, `[101,999]` thiếu 1, `[]` rỗng | Gọi `getBatchInventory` với 3 input trên | Trả đúng list tương ứng cho từng case, KHÔNG throw exception cho id thiếu | Medium |
| IT-INVENTORY-003 | GET /api/v1/inventories/batch?productIds=... | Integration | Lấy batch qua REST thành công, id không tồn tại bị bỏ qua | DB có record cho 101,102,103 | `GET .../batch?productIds=101,102,103` và `?productIds=101,999` | HTTP 200 cả 2 case, `data` trả đúng subset tồn tại | Medium |
| IT-INVENTORY-004 | GET /api/v1/inventories/batch | Integration | Thiếu param bắt buộc `productIds` | Không truyền query param | `GET /api/v1/inventories/batch` | HTTP 400 (thiếu required param), không 500 | Medium |

---

## 4. Module: Admin Update Inventory (set tuyệt đối)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-004 | InventoryService.updateInventory | Unit | Set tồn kho tuyệt đối thành công cả 2 chiều (tăng và giảm), không cộng dồn | Mock inventory hiện có `quantity=10` (case tăng) và `quantity=100` (case giảm); `validateProductAndVariant` pass | Gọi `updateInventory(101L,0L,50)` và `updateInventory(101L,0L,20)` | `quantity` được SET (không cộng dồn) trong cả 2 case; transaction log `type="RESTOCK"` (không phải "DEDUCT" dù giảm), `quantityChanged=Math.abs(after-before)` | High |
| UT-INVENTORY-005 | InventoryService.updateInventory | Unit | productId hoặc variantId không tồn tại/không khớp ở product-service → 404 | Mock `validateProductAndVariant` throw `ResourceNotFoundException` (product không tồn tại hoặc variantId không thuộc danh sách variants trả về) | Gọi `updateInventory` với `productId=9999` và với `variantId=99` không thuộc product | Throw `ResourceNotFoundException` tương ứng cho từng case; `inventoryRepository.save` KHÔNG được gọi | High |
| UT-INVENTORY-006 | InventoryService.updateInventory | Unit | Feign timeout/lỗi mạng khi validate | Mock Feign throw `FeignException`/timeout không phải `ResourceNotFoundException` | Gọi `updateInventory(101L, 0L, 10)` | Throw `RuntimeException` message "Không thể xác thực thông tin sản phẩm..."; không lưu DB | High |
| UT-INVENTORY-007 | InventoryService.updateInventory | Unit | Redis sync chỉ chạy sau khi DB transaction commit (afterCommit); fallback set ngay nếu không có transaction active | Mock `TransactionSynchronizationManager` active và không active | Gọi `updateInventory` trong và ngoài context `@Transactional` | Có transaction: `syncSingleProductToRedis` chỉ gọi trong callback `afterCommit()`, KHÔNG gọi ngay lúc `save()`. Không có transaction: gọi ngay (nhánh else fallback) | High |
| IT-INVENTORY-005 | PUT /api/v1/admin/inventories/{productId} | Integration | Admin/Staff set tồn kho thành công qua REST | Role `ADMIN` hoặc `STAFF`; DB có `Inventory(101, 0, 10)`; product-service trả product hợp lệ | `PUT /api/v1/admin/inventories/101` body `{"quantity": 100}` | HTTP 200, `data.quantity=100`; DB record được cập nhật; Redis key `product:stock:101:0` được set=100 SAU khi response trả về | High |
| IT-INVENTORY-006 | PUT /api/v1/admin/inventories/{productId} | Integration | User không có role ADMIN/STAFF bị chặn | User role `CUSTOMER` | `PUT /api/v1/admin/inventories/101` body `{"quantity": 50}` | HTTP 403 Forbidden | High |
| IT-INVENTORY-007 | PUT /api/v1/admin/inventories/{productId} | Integration | Validation lỗi (quantity âm/thiếu field) và productId không tồn tại ở product-service | Role ADMIN | `PUT .../101` body `{"quantity": -5}`, body `{}`, và `PUT .../9999` body `{"quantity": 10}` | HTTP 400 cho 2 case đầu (field error tương ứng "cannot be negative" / "is required"); HTTP 404 cho case productId không tồn tại; DB không thay đổi trong cả 3 case | High |

---

## 5. Module: Restock (cộng thêm tồn kho)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-008 | InventoryService.restock | Unit | Restock cộng dồn thành công, ghi transaction log + RestockRequest đầy đủ | Mock inventory hiện có `quantity=50`; `validateProductAndVariant` pass | Gọi `restock(101L, 0L, {quantity:30, supplier:"ACME", note:"Nhập hàng tháng 7"}, "admin1")` | `newQuantity=80` được save; `InventoryTransaction{type="RESTOCK", quantityBefore=50, quantityAfter=80, referenceId="ACME"}`; `RestockRequest{status="COMPLETED", requestedBy="admin1"}` được tạo; response `previousQuantity/addedQuantity/currentQuantity` đúng | High |
| UT-INVENTORY-009 | InventoryService.restock | Unit | quantity <= 0 bị chặn bởi validation DTO (`@Min(1)`) trước khi vào service | `RestockRequestDto{quantity:0}` | Validate DTO | Validation fail, không gọi tới `restock()` | High |
| UT-INVENTORY-010 | InventoryService.restock | Unit | productId không tồn tại ở product-service → 404 | Mock `validateProductAndVariant` throw `ResourceNotFoundException` | Gọi `restock(9999L, 0L, {...}, "admin1")` | Throw `ResourceNotFoundException`; không tạo `RestockRequest`, không tạo `InventoryTransaction` | High |
| UT-INVENTORY-011 | InventoryService.restock | Unit | Redis sync sau restock dùng delta dương (incrby), không set absolute nếu Lua script trả về hợp lệ | Mock Redis Lua script trả `newStock >= 0` | Gọi `restock(101L, 0L, {quantity:30,...}, "admin1")`, trigger `afterCommit()` | `syncSingleProductToRedis(productId, variantId, delta=30)` được gọi với delta dương; KHÔNG set absolute | High |
| IT-INVENTORY-008 | POST /api/v1/admin/inventories/{productId}/restock | Integration | Restock thành công qua REST (header `X-User-Id` hoặc default "admin"), kể cả với variantId cụ thể khác 0 | Role ADMIN; DB có inventory `quantity=20` (variant 0) và `quantity=15` (variant 5) | `POST .../101/restock` body `{"quantity":50,...}` (có/không header `X-User-Id`) và `POST .../101/restock?variantId=5` body `{"quantity":25}` | HTTP 200; `data.currentQuantity` đúng theo từng case; `RestockRequest.requestedBy` đúng theo header hoặc default "admin"; variant khác không bị ảnh hưởng chéo | High |
| IT-INVENTORY-009 | POST /api/v1/admin/inventories/{productId}/restock | Integration | quantity <= 0 bị chặn | Role ADMIN | `POST .../101/restock` body `{"quantity":0}` | HTTP 400, message "Quantity must be at least 1" | High |
| IT-INVENTORY-010 | POST /api/v1/admin/inventories/{productId}/restock | Integration | User không có role ADMIN/STAFF bị chặn | Role CUSTOMER | `POST .../101/restock` body `{"quantity":10}` | HTTP 403 | High |

---

## 6. Module: Trừ kho khi tạo Order (InventoryDeductService — Saga)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-012 | InventoryDeductService.deductInventory | Unit | Trừ kho thành công khi đủ hàng, kể cả trường hợp trừ đúng bằng số dư còn lại (biên) | Mock `findByProductIdAndVariantIdForUpdate` trả `Inventory{quantity=100}` và `Inventory{quantity=1}` | Gọi `deductInventory(101L,0L,30,555L)` và `deductInventory(101L,0L,1,555L)` | `newQuantity` đúng (70 và 0) được save; `InventoryTransaction{type="DEDUCT", orderId, quantityChanged, referenceId="ORDER-{id}"}` được lưu; KHÔNG gọi sync Redis trong method này | High |
| UT-INVENTORY-013 | InventoryDeductService.deductInventory | Unit | Không đủ hàng hoặc chưa từng có inventory record → throw `InsufficientStockException`, không save | Mock inventory `quantity=5` (thiếu hàng) hoặc `Optional.empty()` (chưa khởi tạo) | Gọi `deductInventory(101L,0L,10,555L)` và `deductInventory(999L,0L,5,555L)` | Throw `InsufficientStockException` với message tương ứng ("requested=10, available=5" hoặc "not found in inventory"); `save()` KHÔNG được gọi | High |
| UT-INVENTORY-014 | InventoryDeductService.processOrderCreated | Unit | Xử lý order nhiều item thành công, sort theo (productId,variantId) trước khi lock để tránh deadlock | Order có items không theo thứ tự, đủ hàng cho tất cả | Gọi `processOrderCreated(event)` | Thứ tự gọi `deductInventory` theo (productId,variantId) tăng dần; publish `InventoryDeductedEvent{status="CONFIRMED"}` sau commit | High |
| UT-INVENTORY-015 | InventoryDeductService.processOrderCreated | Unit | Idempotency: order đã DEDUCT trước đó (message duplicate) | Mock `findByOrderIdAndTransactionType(orderId,"DEDUCT")` trả record đã tồn tại | Gọi `processOrderCreated(event)` lần 2 | KHÔNG gọi `deductInventory` lại; chỉ re-publish `publishSuccessEvent(orderId)` | High |
| UT-INVENTORY-016 | InventoryDeductService.processOrderCreated | Unit | Race condition: lệnh CANCEL đến trước lệnh CREATED (out-of-order message) | Mock `findByOrderIdAndTransactionType(orderId,"CANCEL_RECEIVED")` đã tồn tại | Gọi `processOrderCreated(event)` | Return ngay, KHÔNG gọi `deductInventory`, KHÔNG publish event nào | High |
| UT-INVENTORY-017 | InventoryDeductService.processOrderCreated | Unit | Một item hết hàng giữa danh sách nhiều item → rollback toàn bộ | Order có 3 item, item thứ 2 không đủ hàng | Gọi `processOrderCreated(event)` | `InsufficientStockException` propagate ra ngoài; `@Transactional(rollbackFor=Exception.class)` rollback toàn bộ (item 1 đã trừ cũng bị rollback); KHÔNG publish CONFIRMED event | High |
| IT-INVENTORY-011 | Kafka: order-events → InventoryKafkaConsumer → processOrderCreated | Integration | Xử lý OrderCreatedEvent end-to-end thành công | DB có đủ tồn kho cho các item trong order | Publish `OrderCreatedEvent{orderId=1001, items:[...]}` lên topic `order-events` | Consumer xử lý, DB `quantity` giảm đúng; `inventory_transactions` có record `type=DEDUCT`; message được acknowledge; `InventoryDeductedEvent{status=CONFIRMED}` được publish | High |
| IT-INVENTORY-012 | Kafka: order-events → InventoryKafkaConsumer | Integration | Hết hàng thực sự (InsufficientStockException) → ack, publish FAILED, không retry | DB tồn kho không đủ cho order | Publish `OrderCreatedEvent{orderId=1002, items:[{productId:101,quantity:9999}]}` | Consumer catch `InsufficientStockException`, gọi `publishFailureEvent`, acknowledge message (không redeliver); `InventoryDeductedEvent{status=FAILED}` được publish | High |
| IT-INVENTORY-013 | Kafka: order-events → InventoryKafkaConsumer | Integration | Lỗi hệ thống (DB down, timeout) → không ack, Kafka retry | Giả lập DB connection lỗi tạm thời trong lúc xử lý | Publish `OrderCreatedEvent{orderId=1003,...}` khi DB tạm gián đoạn | Consumer catch generic Exception, throw lại `RuntimeException`, KHÔNG acknowledge; sau khi DB phục hồi, Kafka redeliver message và xử lý thành công | Medium |
| IT-INVENTORY-014 | Race condition: 2 request trừ kho đồng thời cùng 1 variant, tồn kho chỉ còn 1 | Integration | **Oversell prevention** — kiểm tra pessimistic lock hoạt động đúng | DB `Inventory(101,0,quantity=1)`; 2 order (2001, 2002) cùng đặt mua `quantity=1` sản phẩm này, gửi đồng thời | Gửi đồng thời 2 `OrderCreatedEvent` cho 2 order | Chỉ **1 trong 2** order trừ kho thành công (`quantity` cuối=0, không âm); order còn lại nhận `InsufficientStockException` → FAILED; `findByProductIdAndVariantIdForUpdate` dùng `SELECT ... FOR UPDATE` khiến request thứ 2 đợi request thứ 1 commit rồi mới đọc được `quantity=0`, không đọc stale data | High |
| IT-INVENTORY-015 | Kafka consumer distributed lock theo orderId | Integration | 2 message trùng orderId đến gần đồng thời (duplicate delivery) bị chặn bởi Redis lock | Redis khả dụng; gửi 2 message giống nhau `OrderCreatedEvent{orderId=3001}` cách nhau vài ms | Publish liên tiếp 2 message cùng orderId | Message thứ 2 phải chờ lock `lock:inventory-consumer:3001` được giải phóng (retry tối đa 50 lần x 100ms); nhờ idempotency check DEDUCT đã tồn tại, message 2 không trừ kho lần 2 | High |
| IT-INVENTORY-016 | Kafka consumer distributed lock timeout | Integration | Không lấy được lock trong 5s (bị giữ bởi tiến trình khác quá lâu) | Giả lập lock `lock:inventory-consumer:3002` bị giữ, không release trong >5s | Publish `OrderCreatedEvent{orderId=3002}` | Sau 50 lần retry (~5s), consumer throw `RuntimeException`, KHÔNG acknowledge, message được Kafka redeliver sau đó | Medium |

---

## 7. Module: Rollback kho khi Order bị hủy (processOrderCancelled / releaseInventory)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-018 | InventoryDeductService.releaseInventory | Unit | Hoàn kho thành công (cộng lại); trường hợp không tìm thấy inventory record khi release → RuntimeException | Mock inventory hiện có `quantity=70` (đã bị trừ 30 trước đó); case khác: `findByProductIdAndVariantIdForUpdate` trả rỗng | Gọi `releaseInventory(101L,0L,30,555L)` và `releaseInventory(999L,0L,10,555L)` | Case 1: `newQuantity=100` save; `InventoryTransaction{type="RELEASE"}`; Redis `incrementRedisStock` (+30) sau commit. Case 2: throw `RuntimeException` "not found in inventory" | High |
| UT-INVENTORY-019 | InventoryDeductService.processOrderCancelled | Unit | Hủy order đã từng DEDUCT thành công — release toàn bộ item, đã sort trước khi lock | Mock `findByOrderId(orderId)` trả 2 transaction DEDUCT (item A, item B) | Gọi `processOrderCancelled(event)` | Gọi `releaseInventory` cho cả 2 item theo thứ tự (productId,variantId); mỗi item cộng lại đúng `quantityChanged` đã trừ trước đó | High |
| UT-INVENTORY-020 | InventoryDeductService.processOrderCancelled | Unit | Idempotency: order đã RELEASE trước đó (duplicate cancel event) | Mock tồn tại transaction `type="RELEASE"` cho orderId | Gọi `processOrderCancelled(event)` lần 2 | Return ngay, KHÔNG gọi `releaseInventory` lại | High |
| UT-INVENTORY-021 | InventoryDeductService.processOrderCancelled | Unit | Race condition: Cancel đến TRƯỚC Created (chưa từng deduct) — tạo tombstone, rollback Redis, không đụng DB | Mock `findByOrderId(orderId)` trả rỗng; chưa có tombstone `CANCEL_RECEIVED` | Gọi `processOrderCancelled(event)` với `items=[{productId:101,variantId:0,quantity:5}]` | Tạo tombstone `InventoryTransaction{type="CANCEL_RECEIVED"}`; gọi `incrementRedisStock` rollback Redis (vì Redis đã bị trừ sớm ở order-service) nhưng KHÔNG động vào DB `inventories` | High |
| UT-INVENTORY-022 | InventoryDeductService.processOrderCancelled | Unit | Cancel đến trước Created, gửi trùng lần 2 (duplicate tombstone) | Mock đã có tombstone `CANCEL_RECEIVED` cho orderId | Gọi `processOrderCancelled(event)` lần 2 | Return ngay sau khi phát hiện tombstone đã tồn tại, KHÔNG rollback Redis lần 2 (tránh cộng dư 2 lần) | High |
| UT-INVENTORY-023 | InventoryDeductService.incrementRedisStock | Unit | Redis key không tồn tại (cache miss) khi rollback | Mock Lua script trả `-1` | Gọi `incrementRedisStock(productId,variantId,quantity)` | Log info "key does not exist, skipping"; KHÔNG set absolute fallback (khác với `syncSingleProductToRedis` ở InventoryService) | Medium |
| IT-INVENTORY-017 | Kafka: order-events (OrderCancelledEvent) → processOrderCancelled | Integration | Hủy order thành công end-to-end sau khi đã trừ kho | Order 1001 đã DEDUCT thành công trước đó | Publish `OrderCancelledEvent{orderId=1001,...}` | DB `quantity` được cộng lại đúng; `inventory_transactions` có thêm record `type=RELEASE`; Redis key tương ứng được incrby cộng lại | High |
| IT-INVENTORY-018 | Kafka: OrderCancelledEvent đến trước OrderCreatedEvent (network out-of-order) | Integration | Kiểm tra toàn vẹn dữ liệu khi 2 message tới sai thứ tự | Chưa publish OrderCreatedEvent cho order 4001 | Publish `OrderCancelledEvent{orderId=4001}` trước, sau đó `OrderCreatedEvent{orderId=4001}` | Cancel event tạo tombstone + rollback Redis; Created event đọc thấy tombstone `CANCEL_RECEIVED` → return ngay, không trừ kho; kết quả cuối: `inventories.quantity` KHÔNG bị trừ | High |

---

## 8. Module: Đồng bộ Redis (Sync)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-024 | InventoryService.syncSingleProductToRedis | Unit | Sync delta thành công khi key Redis tồn tại (incrby); fallback set absolute khi key miss | Mock Lua script trả `newStock=80` (case 1) hoặc `-1` kèm DB trả `quantity=100` (case 2) | Gọi `syncSingleProductToRedis(101L,0L,delta=30)` ở cả 2 case | Case 1: chỉ gọi Lua incrby, KHÔNG set absolute. Case 2: sau khi Lua trả -1, gọi `set(key, "100")` (giá trị tuyệt đối từ DB, KHÔNG phải delta) | High |
| UT-INVENTORY-025 | InventoryService.syncSingleProductToRedis | Unit | Sync absolute khi delta=null | delta=null | Gọi `syncSingleProductToRedis(101L, 0L, null)` | Bỏ qua hoàn toàn Lua script, set absolute trực tiếp bằng `inventory.quantity` hiện tại | High |
| UT-INVENTORY-026 | InventoryService.syncSingleProductToRedis | Unit | Redis mất kết nối trong lúc sync — không ảnh hưởng DB đã commit | Mock `redisTemplate.execute(...)` throw `RedisConnectionFailureException` | Gọi `syncSingleProductToRedis(101L,0L,30)` (giả lập gọi từ `afterCommit()` sau khi DB đã commit thành công) | Exception bị nuốt trong try/catch nội bộ, chỉ log error; method KHÔNG throw ra ngoài; **DB transaction đã commit trước đó không bị ảnh hưởng/rollback** | High |
| UT-INVENTORY-027 | InventoryService.syncRedisFromDatabase | Unit | Sync toàn bộ DB → Redis, phân trang đúng 1000 record/trang; bảng rỗng không lỗi | Mock repository có 2500 record (3 trang: 1000,1000,500) hoặc 0 record | Gọi `syncRedisFromDatabase()` ở cả 2 case | Repository được query đúng số trang; mỗi trang dùng `executePipelined` để SET absolute; case rỗng: log tổng synced=0, không gọi Redis pipeline lần nào | High |
| UT-INVENTORY-028 | InventoryService.syncRedisFromDatabase | Unit | Redis lỗi giữa lúc pipeline đang chạy (ví dụ ở trang thứ 2) | Mock `executePipelined` throw exception ở lần gọi thứ 2 | Gọi `syncRedisFromDatabase()` | Method KHÔNG có try/catch riêng bọc quanh `executePipelined` → exception propagate ra caller (khác với `syncSingleProductToRedis` là nuốt lỗi); caller (controller `/sync-redis`) nhận lỗi 500 | Medium |
| IT-INVENTORY-019 | POST /api/v1/admin/inventories/sync-redis | Integration | Trigger full sync qua REST thành công, kể cả dataset lớn (>1000 record, nhiều trang) | Role ADMIN; DB có sẵn N record (bao gồm case N=3500); Redis khả dụng | `POST /api/v1/admin/inventories/sync-redis` | HTTP 200, message "Redis sync triggered successfully"; toàn bộ key `product:stock:{productId}:{variantId}` khớp đúng giá trị `quantity` trong DB, kể cả case nhiều trang | High |
| IT-INVENTORY-020 | Update inventory khi Redis đang mất kết nối (Integration end-to-end) | Integration | Xác nhận DB transaction vẫn thành công dù Redis down | Ngắt kết nối Redis; DB vẫn khả dụng | `PUT /api/v1/admin/inventories/101` body `{"quantity": 999}` trong lúc Redis down | HTTP 200 (API vẫn thành công); DB `quantity=999` được commit thành công; log ghi nhận lỗi sync Redis nhưng KHÔNG trả lỗi ra client, KHÔNG rollback DB (chỉ sync Redis SAU KHI COMMIT, lỗi sync không ảnh hưởng transaction DB) | High |
| IT-INVENTORY-021 | Khôi phục Redis sau IT-INVENTORY-020 rồi trigger sync lại | Integration | Xác nhận KHÔNG có cơ chế tự phục hồi (self-healing) ngay lập tức — phải trigger sync-redis thủ công/scheduler mới hết drift (khác doc mô tả "tự sync ngay trong transaction") | Nối lại Redis sau khi đã update DB lúc Redis down, TRƯỚC KHI gọi sync thủ công | Kiểm tra Redis ngay sau khi Redis reconnect (chưa gọi sync), rồi gọi `POST /api/v1/admin/inventories/sync-redis` | Trước khi gọi sync: Redis vẫn còn drift so với DB; chỉ sau khi gọi sync thủ công thì key `product:stock:101:0` mới được set lại =999 (khớp DB) | Medium |

---

## 9. Module: Low-stock query

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-029 | InventoryService.getLowStockProducts | Unit | Lấy đúng danh sách sản phẩm dưới threshold | Mock JPQL `quantity < :threshold` trả các record có quantity 3, 7, 9 (threshold=10) | Gọi `getLowStockProducts(10)` | Trả list gồm 3 `InventoryResponse` tương ứng (3,7,9) | High |
| UT-INVENTORY-030 | InventoryService.getLowStockProducts | Unit | Biên: quantity đúng bằng threshold KHÔNG được coi là low-stock (strict `<`, không phải `<=`) | Mock DB có record `quantity=10`, threshold=10 | Gọi `getLowStockProducts(10)` | Record `quantity=10` KHÔNG xuất hiện trong kết quả | High |
| IT-INVENTORY-022 | GET /api/v1/admin/inventories/low-stock[?threshold=] | Integration | Lấy danh sách low-stock qua REST, đúng biên strict `<`, và default threshold=10 khi không truyền | Role ADMIN; DB có sản phẩm quantity=3,9,10,15 | `GET .../low-stock?threshold=10` và `GET .../low-stock` (không truyền param) | HTTP 200 cả 2 case; `data` chỉ gồm sản phẩm quantity=3 và 9, KHÔNG có quantity=10 (default threshold cũng =10) | High |

---

## 10. Module: Lịch sử Transaction (phân trang)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-031 | InventoryService.getTransactions | Unit | Lấy lịch sử theo variantId cụ thể (>0) dùng `findByProductIdAndVariantId`; variantId=null dùng `findByProductId` (lấy tất cả biến thể) | Mock 2 repository method tương ứng | Gọi `getTransactions(101L,5L,pageable)` và `getTransactions(101L,null,pageable)` | Đúng repository method được gọi cho từng case; trả `Page<InventoryTransactionResponse>` map đầy đủ field | High |
| UT-INVENTORY-032 | InventoryService.getTransactions | Unit | variantId=0 tường minh cũng dùng `findByProductId` (không filter theo variant=0 cụ thể) — hành vi thật của code (`variantId != null && variantId > 0` mới filter), khác kỳ vọng nghiệp vụ thông thường | Gọi `getTransactions(101L, 0L, pageable)` | Dùng `findByProductId` (không filter theo variant=0), cần assert đúng như vậy dù có thể gây nhầm lẫn nghiệp vụ | High |
| IT-INVENTORY-023 | GET /api/v1/admin/inventories/{productId}/transactions | Integration | Phân trang mặc định và tùy chỉnh | Role ADMIN; DB có 25 transaction cho productId=101 | `GET .../101/transactions` (default) và `?page=1&size=10` | HTTP 200; default: `page=0,size=20`, content 20 phần tử, `totalElements=25`; custom: content 10 phần tử (record thứ 11-20) | Medium |
| IT-INVENTORY-024 | GET /api/v1/admin/inventories/{productId}/transactions | Integration | Không có transaction nào cho product → trả rỗng, không 404 | DB không có transaction nào cho productId=777 | `GET .../777/transactions` | HTTP 200, `data.content` rỗng, `totalElements=0` | Medium |
| IT-INVENTORY-025 | GET /api/v1/admin/inventories/{productId}/transactions | Integration | Transaction type "CANCEL_RECEIVED" xuất hiện đúng trong lịch sử (docs chỉ nêu 3 loại DEDUCT/RELEASE/RESTOCK) | DB có tombstone record `type="CANCEL_RECEIVED"` cho 1 order bị hủy trước khi tạo | Query lịch sử transaction liên quan đến order đó | Record `type="CANCEL_RECEIVED"` được trả về đúng như 3 loại khác, xác nhận gap với doc | Low |

---

## 11. Edge Case tổng hợp

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-INVENTORY-033 | InventoryService (nhiều method) | Unit | variantId=0 xuyên suốt — sản phẩm không có biến thể; variantId=null luôn được coerce về 0 một cách nhất quán ở mọi method | DB chỉ có `Inventory(productId=300, variantId=0)` | Gọi `getInventory(300L, null)`, `updateInventory(300L, null, 20)`, `restock(300L, null, {...}, "admin")` | Tất cả method coerce `variantId=null → 0L` nhất quán, không tạo ra 2 record song song (variantId=0 vs null bị lẫn) | High |
| IT-INVENTORY-026 | InventoryController vs AdminInventoryController — cùng productId nhưng khác endpoint | Integration | Đảm bảo endpoint public không cho phép sửa dữ liệu (chỉ GET) | — | Thử `PUT /api/v1/inventories/101` (path công khai, không phải admin) | HTTP 404/405 (không tồn tại route PUT ở controller public) | Medium |

---

## 12. Tổng hợp số lượng test case

| Module | Số UT | Số IT | Tổng |
|---|---|---|---|
| Get Inventory (đơn) | 2 | 2 | 4 |
| Batch Get Inventory | 1 | 2 | 3 |
| Admin Update Inventory | 4 | 3 | 7 |
| Restock | 4 | 3 | 7 |
| Trừ kho khi tạo Order (Saga) | 6 | 6 | 12 |
| Rollback khi Order bị hủy | 6 | 2 | 8 |
| Đồng bộ Redis | 5 | 3 | 8 |
| Low-stock query | 2 | 1 | 3 |
| Lịch sử Transaction | 2 | 3 | 5 |
| Edge case tổng hợp | 1 | 1 | 2 |
| **Tổng** | **33** | **26** | **59** |

> Từ 101 test case gốc rút gọn còn 59 (giảm ~41.6%), giữ đầy đủ các luồng ưu tiên cao nhất (saga trừ/hoàn kho, race condition, đồng bộ Redis, restock) theo mục 1.3, gộp các test case validate field đơn lẻ trùng lặp giữa các method.
