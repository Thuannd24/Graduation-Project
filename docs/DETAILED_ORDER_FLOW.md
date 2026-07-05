# 📋 TÀI LIỆU THIẾT KẾ: SƠ ĐỒ LUỒNG ĐẶT HÀNG CHI TIẾT (END-TO-END)
## Hệ thống E-Commerce Microservices

Tài liệu này đặc tả chi tiết luồng nghiệp vụ đặt hàng (Checkout & Order Lifecycle) của hệ thống, bao gồm sự tương tác giữa các dịch vụ: **API Gateway, Cart & Order Service, Promotion Service, Inventory Service, Payment Service, Notification Service**, cùng với hạ tầng **Kafka, Redis, PostgreSQL** và **MongoDB**.

---

## I. TỔNG QUAN KIẾN TRÚC LUỒNG ĐẶT HÀNG

Hệ thống sử dụng mô hình kết hợp giữa **Đồng bộ (Synchronous - REST/gRPC API)** cho các thao tác trực tiếp của người dùng và **Bất đồng bộ (Asynchronous - Event-Driven via Kafka & Transactional Outbox Pattern)** cho các tác vụ xử lý nền, đảm bảo tính nhất quán dữ liệu (Eventual Consistency), hiệu năng cao (High Throughput) và khả năng chịu tải tốt.

```mermaid
graph TD
    Client["Khách hàng / Frontend"] -->|"1. Request Checkout"| Gateway["API Gateway"]
    Gateway -->|"2. Route"| OS["Cart & Order Service"]
    
    %% Cache & DB Order
    OS <-->|"Redis Locks & Cart"| Redis[("Redis Cache")]
    OS <-->|"ACID Transaction"| DB_Order[("PostgreSQL: order_db")]
    
    %% gRPC Communication
    OS -->|"3. Get Stock via gRPC"| IS["Inventory Service"]
    
    %% Outbox & Kafka
    OS -->|"4. Save Outbox"| DB_Order
    Scheduler["Outbox Scheduler"] -->|"5. Read Outbox"| DB_Order
    Scheduler -->|"6. Publish Event"| Kafka{"Apache Kafka"}
    
    %% Consumers
    Kafka -->|"7. Consume order-events"| IS
    Kafka -->|"8. Consume inventory-events"| OS
    Kafka -->|"9. Consume payment-events"| OS
    Kafka -->|"10. Consume all events"| NS["Notification Service"]
    
    %% DB & Locks Inventory
    IS <-->|"Redisson Lock"| Redis
    IS <-->|"Pessimistic Lock"| DB_Inv[("PostgreSQL: inventory_db")]
    IS -->|"Self-Healing"| Redis
    
    %% Payment
    Client -->|"11. Initiate Payment"| PS["Payment Service"]
    PS -->|"12. Redirect Url"| Client
    Client -->|"13. Pay"| VNPAY["VNPAY Gateway"]
    VNPAY -->|"14. Webhook Callback"| PS
    PS -->|"15. Publish success/fail"| Kafka
    
    %% Notifications
    NS -->|"Push Notification"| FCM["Firebase Cloud Messaging"]
    NS -->|"Send HTML Email"| SMTP["SMTP Server"]
```

---

## II. CHI TIẾT CÁC GIAI ĐOẠN XỬ LÝ (SEQUENCES)

Luồng đặt hàng từ khi người dùng click "Đặt hàng" cho đến khi nhận hàng được chia làm 5 giai đoạn chính:

### Giai đoạn 1: Khởi tạo Đơn hàng & Giữ chỗ kho tạm thời (Checkout & Early Reservation)
*   **Mục tiêu**: Nhận request từ người dùng, chống gửi trùng đơn (Idempotency), kiểm tra tồn kho nhanh trên RAM (Redis) để chặn sớm 99% request hết hàng, tự động tải kho từ database qua gRPC nếu Redis bị cache miss, và lưu đơn hàng tạm thời ở trạng thái `PENDING`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng
    participant FE as Frontend
    participant GW as API Gateway
    participant OS as Cart & Order Service
    participant Redis as Redis Cache
    participant IS as Inventory Service
    participant DB as PostgreSQL (order_db)

    User->>FE: Click "Đặt hàng"
    Note over FE: Sinh UUID làm Idempotency-Key
    FE->>GW: POST /api/v1/orders/checkout<br/>[Headers: Idempotency-Key, Authorization]
    GW->>OS: Route Request
    
    rect rgb(240, 248, 255)
        Note over OS, Redis: Bước 1: Kiểm tra chống trùng đơn (Idempotency)
        OS->>Redis: SET checkout:lock:{userId}:{key} "PROCESSING" NX EX 900
        alt Khóa đã tồn tại (Đang xử lý hoặc đã xong)
            Redis-->>OS: NIL (Thất bại)
            OS-->>FE: 409 Conflict (Yêu cầu đang được xử lý)
        else Khóa chưa tồn tại (Hợp lệ)
            Redis-->>OS: OK (Thành công)
        end
    end

    rect rgb(255, 245, 238)
        Note over OS, Redis: Bước 2: Kiểm tra & Giảm kho ảo trên Redis (Early Reservation)
        OS->>OS: Lấy thông tin giỏ hàng từ CartService
        loop Mỗi sản phẩm trong giỏ hàng
            OS->>Redis: GET product:stock:{productId}:{variantId}
            alt Cache Miss (Không tìm thấy trên Redis)
                OS->>Redis: SET product:stock:lock:{productId}:{variantId} NX EX 5 (Acquire Lock)
                OS->>IS: [gRPC] getInventory(productId, variantId)
                IS-->>OS: Trả về số lượng thực dưới DB
                OS->>Redis: SET product:stock:{productId}:{variantId} {quantity}
                OS->>Redis: DEL product:stock:lock:{productId}:{variantId} (Release Lock)
            end
            OS->>Redis: DECRBY product:stock:{productId}:{variantId} {quantity}
            Redis-->>OS: Số lượng còn lại sau khi giảm
            alt Số lượng < 0 (Hết hàng)
                OS->>Redis: INCRBY product:stock:{productId}:{variantId} {quantity} (Hoàn kho ảo)
                OS->>Redis: DEL checkout:lock:{userId}:{key} (Giải phóng khóa trùng đơn)
                OS-->>FE: 400 Bad Request (Sản phẩm đã hết hàng)
            end
        end
    end

    rect rgb(240, 255, 240)
        Note over OS, DB: Bước 3: Lưu Đơn hàng PENDING & Outbox Event (ACID Transaction)
        OS->>DB: BEGIN TRANSACTION
        OS->>DB: INSERT INTO orders (status=PENDING, final_amount, total_weight, ...)
        OS->>DB: INSERT INTO order_items (order_id, product_id, unit_price, quantity, ...)
        OS->>DB: INSERT INTO outbox_events (aggregate_id=orderId, event_type="OrderCreatedEvent", payload=JSON)
        OS->>DB: COMMIT TRANSACTION
        OS->>OS: Clear Cart
        OS->>Redis: SET checkout:lock:{userId}:{key} {responseJson} EX 900 (Lưu kết quả tạo đơn)
        OS-->>FE: 201 Created { orderId, status: PENDING, finalAmount }
    end
```

---

### Giai đoạn 2: Gửi Event & Trừ kho vật lý (Async Inventory Deduction & State Transition)
*   **Mục tiêu**: Đảm bảo sự kiện tạo đơn được gửi thành công đến Kafka (Transactional Outbox Pattern), Inventory Service thực hiện trừ kho vật lý an toàn dưới DB bằng cơ chế Pessimistic Lock (SELECT FOR UPDATE) kết hợp sắp xếp danh sách sản phẩm để tránh deadlock, và chuyển trạng thái đơn hàng sang `AWAITING_PAYMENT`.

```mermaid
sequenceDiagram
    autonumber
    participant OS as Cart & Order Service
    participant DB_O as PostgreSQL (order_db)
    participant Kafka as Apache Kafka
    participant IS as Inventory Service
    participant DB_I as PostgreSQL (inventory_db)
    participant Redis as Redis Cache

    rect rgb(240, 248, 255)
        Note over OS, Kafka: Bước 1: Quét Outbox & Publish Event lên Kafka
        loop Định kỳ mỗi 5 giây (Outbox Scheduler)
            OS->>DB_O: SELECT * FROM outbox_events WHERE status=PENDING ORDER BY created_at ASC LIMIT 100
            DB_O-->>OS: Danh sách Event
            OS->>Kafka: Publish OrderCreatedEvent (Topic: order-events)
            alt Publish thành công
                OS->>DB_O: UPDATE outbox_events SET status=PROCESSED, processed_at=now()
            else Publish thất bại
                OS->>DB_O: UPDATE outbox_events SET retry_count = retry_count + 1
                Note over OS: Nếu retry >= 5, chuyển trạng thái sang FAILED (Cảnh báo Admin)
            end
        end
    end

    rect rgb(255, 245, 238)
        Note over Kafka, IS: Bước 2: Tiêu thụ Event & Kiểm tra trùng lắp (Idempotency Consumer)
        Kafka->>IS: Consume OrderCreatedEvent { orderId, items }
        IS->>DB_I: SELECT * FROM inventory_transactions WHERE order_id=? AND transaction_type='DEDUCT'
        alt Event đã được xử lý từ trước (Duplicate)
            DB_I-->>IS: Bản ghi tồn tại
            IS->>Kafka: Publish InventoryDeductedEvent (status: CONFIRMED)
            Note over IS: Bỏ qua và gửi lại sự kiện thành công để đảm bảo tính hội tụ
        end
    end

    rect rgb(245, 240, 255)
        Note over IS, DB_I: Bước 3: Trừ kho vật lý (DB Transaction)
        IS->>DB_I: BEGIN TRANSACTION
        IS->>IS: Sắp xếp các sản phẩm theo ID để tránh DB Deadlock
        loop Với mỗi sản phẩm trong Event
            IS->>DB_I: SELECT * FROM inventories WHERE product_id=? AND variant_id=? FOR UPDATE (Pessimistic Lock)
            alt Tồn kho thực tế < Số lượng yêu cầu
                IS->>DB_I: ROLLBACK (Thất bại do hết hàng)
                Note over IS: Bắt InsufficientStockException & Ack Kafka
                IS->>Kafka: Publish InventoryDeductedEvent (status: FAILED, failReason: OUT_OF_STOCK)
            else Tồn kho thực tế hợp lệ
                IS->>DB_I: UPDATE inventories SET quantity = quantity - requested
                IS->>DB_I: INSERT INTO inventory_transactions (type=DEDUCT, order_id, quantity_changed, ...)
                Note over IS, Redis: Bước 4: Đồng bộ dữ liệu RAM (Self-Healing Cache)
                IS->>Redis: SET product:stock:{productId}:{variantId} {newQuantity}
            end
        end
        IS->>DB_I: COMMIT TRANSACTION (Thành công)
        IS->>Kafka: Publish InventoryDeductedEvent (status: CONFIRMED) (Topic: inventory-events)
    end

    rect rgb(240, 255, 240)
        Note over Kafka, OS: Bước 5: Cập nhật Trạng thái Đơn hàng ở Order Service
        Kafka->>OS: Consume InventoryDeductedEvent { orderId, status }
        alt status == "CONFIRMED"
            OS->>DB_O: UPDATE orders SET status="AWAITING_PAYMENT"
        else status == "FAILED"
            OS->>DB_O: UPDATE orders SET status="CANCELLED"
            OS->>Redis: Hoàn trả lại kho ảo trên Redis (INCRBY)
            OS->>DB_O: INSERT INTO outbox_events (type="OrderCancelledEvent")
        end
    end
```

---

### Giai đoạn 3: Thanh toán Đơn hàng (Payment Integration Flow)
*   **Mục tiêu**: Khách hàng thanh toán qua cổng thanh toán (VNPAY). Payment Service tiếp nhận kết quả qua Webhook bất đồng bộ (IPN), xác thực HMAC chữ ký bảo mật, và phát sự kiện thanh toán. Order Service nhận sự kiện để cập nhật trạng thái đơn sang `CONFIRMED`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng
    participant FE as Frontend
    participant PS as Payment Service
    participant DB_P as PostgreSQL (payment_db)
    participant GW as Cổng Thanh Toán (VNPAY)
    participant Kafka as Apache Kafka
    participant OS as Cart & Order Service
    participant DB_O as PostgreSQL (order_db)
    participant NS as Notification Service

    User->>FE: Bấm "Thanh toán đơn hàng"
    FE->>PS: POST /api/payments/initiate { orderId, method: 'VNPAY', ... }
    
    rect rgb(240, 248, 255)
        Note over PS, DB_P: Bước 1: Khởi tạo bản ghi Giao dịch
        PS->>DB_P: INSERT INTO payments (order_id, txn_ref, status=PENDING, amount, method=VNPAY, ...)
        PS->>PS: Sinh mã txnRef & Ký HMAC-SHA512 với Hash Secret
        PS-->>FE: 200 OK { paymentUrl }
    end

    FE->>User: Chuyển hướng trình duyệt sang VNPAY
    User->>GW: Nhập OTP / Quét mã QR thanh toán
    GW->>GW: Xử lý giao dịch nội bộ
    GW-->>FE: Redirect về returnUrl (Hiển thị kết quả tạm thời trên UI)

    rect rgb(255, 245, 238)
        Note over GW, PS: Bước 2: Nhận Webhook bất đồng bộ (IPN Callback)
        GW->>PS: POST /api/payments/webhook/vnpay { txnRef, responseCode, secureHash, ... }
        PS->>PS: Xác thực chữ ký secureHash
        alt Chữ ký hợp lệ & Giao dịch chưa xử lý (PENDING)
            PS->>DB_P: BEGIN TRANSACTION
            alt responseCode == "00" (Thành công)
                PS->>DB_P: UPDATE payments SET status=COMPLETED, paid_at=now()
                PS->>DB_P: COMMIT TRANSACTION
                PS->>Kafka: Publish PaymentSuccessEvent (Topic: payment-events)
            else Thất bại
                PS->>DB_P: UPDATE payments SET status=FAILED
                PS->>DB_P: COMMIT TRANSACTION
                PS->>Kafka: Publish PaymentFailedEvent (Topic: payment-events)
            end
            PS-->>GW: 200 OK { RspCode: "00", Message: "Confirm Success" }
        end
    end

    rect rgb(240, 255, 240)
        Note over Kafka, OS: Bước 3: Cập nhật đơn hàng & Gửi thông báo
        par Cập nhật Đơn hàng sang CONFIRMED
            Kafka->>OS: Consume PaymentSuccessEvent
            OS->>DB_O: UPDATE orders SET status="CONFIRMED" (updateOrderStatus)
            OS->>DB_O: INSERT INTO outbox_events (type="OrderConfirmedEvent")
        and Gửi thông báo cho khách hàng
            Kafka->>NS: Consume PaymentSuccessEvent (Gửi mail/push: "Thanh toán thành công")
            OS->>Kafka: Outbox Scheduler phát OrderConfirmedEvent
            Kafka->>NS: Consume OrderConfirmedEvent (Gửi mail/push: "Đặt hàng thành công")
        end
    end
```

---

### Giai đoạn 4: Hủy đơn hàng và Hoàn trả kho / Hoàn tiền (Cancellation & Rollback Flow)
*   **Mục tiêu**: Xử lý hoàn trả tồn kho vật lý, kho ảo và hoàn tiền (nếu đã thanh toán) khi khách hàng yêu cầu hủy đơn, hoặc khi đơn hàng bị quá hạn thanh toán (Timeout sau 15 phút).

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng / Admin
    participant OS as Cart & Order Service
    participant DB_O as PostgreSQL (order_db)
    participant Kafka as Apache Kafka
    participant IS as Inventory Service
    participant DB_I as PostgreSQL (inventory_db)
    participant Redis as Redis Cache
    participant PS as Payment Service

    alt Người dùng chủ động hủy
        User->>OS: POST /api/v1/orders/{id}/cancel
    else Hệ thống tự động quét hủy đơn quá hạn thanh toán
        Note over OS: Cronjob quét đơn hàng PENDING / AWAITING_PAYMENT > 15 phút
    end

    rect rgb(240, 248, 255)
        Note over OS, DB_O: Bước 1: Cập nhật trạng thái đơn hàng về CANCELLED
        OS->>DB_O: SELECT status FROM orders WHERE id = ?
        OS->>OS: Kiểm tra: Trạng thái hiện tại thuộc (PENDING, AWAITING_PAYMENT, CONFIRMED)
        OS->>DB_O: BEGIN TRANSACTION
        OS->>DB_O: UPDATE orders SET status=CANCELLED
        OS->>DB_O: INSERT INTO outbox_events (type="OrderCancelledEvent")
        OS->>DB_O: COMMIT TRANSACTION
        
        Note over OS, Redis: Hoàn trả lại kho ảo trên Redis
        loop Mỗi sản phẩm
            OS->>Redis: INCRBY product:stock:{productId}:{variantId} {quantity}
        end
        OS-->>User: 200 OK { status: CANCELLED }
    end

    OS->>Kafka: Outbox Scheduler publish OrderCancelledEvent (Topic: order-events)

    rect rgb(255, 245, 238)
        Note over Kafka, IS: Bước 2: Hoàn trả tồn kho vật lý (Inventory Service)
        Kafka->>IS: Consume OrderCancelledEvent { orderId }
        IS->>DB_I: SELECT * FROM inventory_transactions WHERE order_id=? AND transaction_type='RELEASE'
        alt Trùng lặp Event (Idempotency)
            DB_I-->>IS: Bản ghi tồn tại (Bỏ qua)
        else Hợp lệ
            IS->>DB_I: BEGIN TRANSACTION
            loop Với mỗi sản phẩm cần hoàn trả
                IS->>DB_I: SELECT * FROM inventories WHERE product_id=? AND variant_id=? FOR UPDATE (Pessimistic Lock)
                IS->>DB_I: UPDATE inventories SET quantity = quantity + released_quantity
                IS->>DB_I: INSERT INTO inventory_transactions (type=RELEASE, order_id, ...)
                Note over IS, Redis: Đồng bộ lại Redis
                IS->>Redis: SET product:stock:{productId}:{variantId} {newQuantity}
            end
            IS->>DB_I: COMMIT TRANSACTION
        end
    end

    rect rgb(245, 240, 255)
        Note over Kafka, PS: Bước 3: Hoàn tiền (Payment Service)
        Kafka->>PS: Consume OrderCancelledEvent { orderId }
        PS->>PS: Kiểm tra nếu đơn hàng đã được COMPLETED thanh toán trước đó
        PS->>PS: Gọi API hoàn tiền sang cổng thanh toán VNPAY (Refund) nếu cần
    end
```

---

### Giai đoạn 5: Giao hàng và Hoàn tất đơn hàng (Shipping & Delivery Flow)
*   **Mục tiêu**: Người vận hành duyệt đơn hàng để chuyển vận chuyển, cập nhật trạng thái giao hàng thông qua webhook hành trình của đơn vị vận chuyển (ĐVVC), và kết thúc vòng đời đơn hàng.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant OS as Cart & Order Service
    participant DB as PostgreSQL (order_db)
    participant ĐVVC as Đơn vị Vận Chuyển (GHTK)
    participant Kafka as Apache Kafka
    participant NS as Notification Service

    Admin->>OS: PUT /api/v1/orders/{id}/ship (Yêu cầu giao hàng)
    
    rect rgb(240, 248, 255)
        Note over OS, DB: Bước 1: Duyệt trạng thái sang SHIPPED & sinh mã vận đơn
        OS->>DB: SELECT status FROM orders WHERE id=?
        OS->>OS: Kiểm tra: Trạng thái hiện tại bắt buộc phải là "CONFIRMED"
        OS->>OS: Gửi yêu cầu sang ĐVVC (hoặc Mock GHTK API) để sinh vận đơn
        OS->>DB: UPDATE orders SET status="SHIPPED", tracking_code="MOCK-GHTK-XXXX"
        OS->>DB: INSERT INTO outbox_events (type="OrderShippedEvent")
    end
    OS-->>Admin: 200 OK { status: SHIPPED, trackingCode }

    rect rgb(255, 245, 238)
        Note over ĐVVC, OS: Bước 2: Webhook nhận cập nhật hành trình từ ĐVVC
        loop Bưu tá cập nhật trạng thái đơn hàng trên app ĐVVC
            ĐVVC->>OS: POST /api/v1/orders/public/webhook/shipping { trackingCode, status }
            alt status == "SHIPPED"
                OS->>DB: UPDATE orders SET status="SHIPPED" (Skip nếu đã là SHIPPED)
            else status == "DELIVERED" (Giao hàng thành công)
                OS->>DB: UPDATE orders SET status="DELIVERED"
                OS->>DB: INSERT INTO outbox_events (type="OrderDeliveredEvent")
            end
            OS-->>ĐVVC: 200 OK
        end
    end

    rect rgb(245, 240, 255)
        Note over Kafka, NS: Bước 3: Gửi Push Notification / Email báo trạng thái
        Kafka->>NS: Consume OrderShippedEvent / OrderDeliveredEvent
        NS->>NS: Gửi thông báo Email HTML và Push Notification (FCM) báo cho khách hàng
    end
```

---

## III. ĐẶC TẢ CHI TIẾT CÁC CƠ CHẾ AN TOÀN & HIỆU NĂNG

> [!IMPORTANT]
> **1. Chống trùng lặp (Idempotency) ở 3 tầng:**
> *   **Tầng API (Checkout)**: Sử dụng Header `Idempotency-Key` (UUID sinh từ Client) lưu vào Redis dưới dạng `checkout:lock:{userId}:{key}` trong 15 phút. Nếu double-submit, request thứ hai bị từ chối ngay lập tức hoặc nhận về kết quả cũ đã được cache lại.
> *   **Tầng Inventory (Deduction)**: Inventory Service kiểm tra bảng `inventory_transactions` theo cặp `(order_id, transaction_type='DEDUCT')`. Nếu đã tồn tại, bỏ qua nghiệp vụ và trả về kết quả thành công ngay để đảm bảo tính hội tụ.
> *   **Tầng Webhook (Payment)**: Cổng thanh toán có thể gọi lại Webhook nhiều lần nếu timeout. Payment Service kiểm tra trạng thái giao dịch trong DB trước khi xử lý, nếu trạng thái đã là `COMPLETED` hoặc `FAILED` thì trả về `200 OK` ngay.

> [!WARNING]
> **2. Chống thất thoát Sự kiện (Exactly-Once Delivery via Transactional Outbox Pattern):**
> Việc ghi vào DB và gửi message sang Broker (Kafka) KHÔNG thể thực hiện một cách atomic (lỗi mạng có thể làm hỏng bước 2 sau khi bước 1 thành công). Để giải quyết:
> *   Khi cập nhật trạng thái đơn hàng (tạo đơn, hủy đơn, giao hàng), thông tin sự kiện được chèn vào bảng `outbox_events` trong **cùng một Transaction DB** của đơn hàng.
> *   Một luồng OutboxScheduler chạy ngầm quét bảng `outbox_events` định kỳ mỗi 5 giây, gửi tin nhắn lên Kafka, và chỉ cập nhật trạng thái sự kiện thành `PROCESSED` khi nhận được ACK thành công từ Kafka Broker. Hàng ngày vào lúc 2:00 AM, một cronjob dọn dẹp các outbox đã xử lý quá 48 giờ để tránh đầy bảng.

> [!TIP]
> **3. Cơ chế tự phục hồi dữ liệu kho (Self-Healing Cache):**
> *   Để tối ưu tốc độ checkout, số lượng tồn kho khả dụng được giảm nhanh trên Redis (`DECRBY`).
> *   Tuy nhiên, dữ liệu trên Redis có thể bị lệch (drift) so với DB vật lý do lỗi mạng khi rollback hoặc server crash.
> *   Sau mỗi thao tác thay đổi kho vật lý (trừ kho, nhập kho, hoàn kho), Inventory Service sẽ truy vấn số lượng thực tế từ DB và thực hiện `SET product:stock:{productId}:{variantId} {actualQuantity}` ghi đè lên Redis.
> *   Một Scheduler định kỳ hàng giờ (fixedDelay = 1h) quét toàn bộ bảng `inventories` và đồng bộ lại sang Redis để dọn dẹp các sai lệch tích lũy.

---
*Tài liệu thiết kế chi tiết luồng xử lý đơn hàng hệ thống E-Commerce AI.*
