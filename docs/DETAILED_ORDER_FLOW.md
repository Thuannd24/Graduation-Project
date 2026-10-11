# 📋 TÀI LIỆU THIẾT KẾ: SƠ ĐỒ LUỒNG ĐẶT HÀNG CHI TIẾT (END-TO-END)
## Hệ thống E-Commerce Microservices

Tài liệu này đặc tả chi tiết luồng nghiệp vụ đặt hàng (Checkout & Order Lifecycle) của hệ thống, bao gồm sự tương tác giữa các dịch vụ: **API Gateway, Cart & Order Service, Promotion Service, Inventory Service, Payment Service, Notification Service**, cùng với hạ tầng **Kafka, Debezium (CDC), Redis, MariaDB 10.11** và **MongoDB** (lưu lịch sử thông báo của Notification Service).

> **Rà soát 2026-10-11:** Tài liệu đã được đối chiếu lại với code. Các điểm chính: Outbox được phát lên Kafka bằng **Debezium CDC** (`MySqlConnector` + SMT `EventRouter` đọc binlog bảng `outbox_events`), không có scheduler quét outbox; CSDL là **MariaDB 10.11**; trạng thái thanh toán thành công là `SUCCESS`; callback VNPay là `GET /api/v1/public/payments/vnpay-callback`; đơn quá hạn bị hủy sau **30 phút** (`OrderExpiryScheduler`); Push FCM hiện **chỉ ghi log** (chưa gửi thật).

---

## I. TỔNG QUAN KIẾN TRÚC LUỒNG ĐẶT HÀNG

Hệ thống sử dụng mô hình kết hợp giữa **Đồng bộ (Synchronous - REST/gRPC API)** cho các thao tác trực tiếp của người dùng và **Bất đồng bộ (Asynchronous - Event-Driven via Kafka & Transactional Outbox Pattern + Debezium CDC)** cho các tác vụ xử lý nền, đảm bảo tính nhất quán dữ liệu (Eventual Consistency), hiệu năng cao (High Throughput) và khả năng chịu tải tốt.

**Vòng đời trạng thái đơn hàng** (chỉ đi tiến, không quay lui — `updateOrderStatus` chặn chuyển về trạng thái có thứ hạng thấp hơn):
`PENDING` → `AWAITING_PAYMENT` → `CONFIRMED` → `SHIPPED` → `DELIVERED`, hoặc `CANCELLED` (hủy được khi đơn đang `PENDING` / `AWAITING_PAYMENT` / `CONFIRMED`).

```mermaid
graph TD
    Client["Khách hàng / Frontend"] -->|"1. Request Checkout"| Gateway["API Gateway"]
    Gateway -->|"2. Route"| OS["Cart & Order Service"]
    
    %% Cache & DB Order
    OS <-->|"Redis Locks & Cart"| Redis[("Redis Cache")]
    OS <-->|"ACID Transaction"| DB_Order[("MariaDB: ecommerce_order_db")]
    
    %% gRPC Communication
    OS -->|"3. Get Stock via gRPC"| IS["Inventory Service"]
    
    %% Outbox & Kafka (Debezium CDC)
    OS -->|"4. Save Outbox"| DB_Order
    CDC["Debezium CDC (MySqlConnector + EventRouter)"] -->|"5. Đọc binlog outbox_events"| DB_Order
    CDC -->|"6. Publish Event"| Kafka{"Apache Kafka"}
    
    %% Consumers
    Kafka -->|"7. Consume order-events"| IS
    Kafka -->|"8. Consume inventory-events"| OS
    Kafka -->|"9. Consume payment-events"| OS
    Kafka -->|"10. Consume order-events & payment-events"| NS["Notification Service"]
    
    %% DB & Locks Inventory
    IS <-->|"Redis lock (SETNX) theo orderId"| Redis
    IS <-->|"Pessimistic Lock"| DB_Inv[("MariaDB: ecommerce_inventory_db")]
    IS -->|"Self-Healing"| Redis
    
    %% Payment
    Client -->|"11. Initiate Payment"| PS["Payment Service"]
    PS -->|"12. Redirect Url"| Client
    Client -->|"13. Pay"| VNPAY["VNPAY Gateway"]
    VNPAY -->|"14. Callback (GET)"| PS
    PS -->|"15. Outbox + Debezium: success/fail"| Kafka
    
    %% Notifications
    NS -.->|"Push FCM (hiện chỉ ghi log)"| FCM["Firebase Cloud Messaging"]
    NS -->|"Send HTML Email"| SMTP["SMTP Server"]
```

---

## II. CHI TIẾT CÁC GIAI ĐOẠN XỬ LÝ (SEQUENCES)

Luồng đặt hàng từ khi người dùng click "Đặt hàng" cho đến khi nhận hàng được chia làm 5 giai đoạn chính:

### Giai đoạn 1: Khởi tạo Đơn hàng & Giữ chỗ kho tạm thời (Checkout & Early Reservation)
*   **Mục tiêu**: Nhận request từ người dùng, chống gửi trùng đơn (Idempotency), kiểm tra tồn kho nhanh trên RAM (Redis) để chặn sớm request hết hàng, tự động tải kho từ database qua gRPC nếu Redis bị cache miss, và lưu đơn hàng tạm thời ở trạng thái `PENDING`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng
    participant FE as Frontend
    participant GW as API Gateway
    participant OS as Cart & Order Service
    participant Redis as Redis Cache
    participant IS as Inventory Service
    participant DB as MariaDB (ecommerce_order_db)

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
            OS->>Redis: Lua script giảm kho nguyên tử (tương đương DECRBY có kiểm tra)
            Redis-->>OS: Số lượng còn lại sau khi giảm
            alt Không đủ hàng
                OS->>Redis: INCRBY các sản phẩm đã giảm trước đó (Hoàn kho ảo)
                OS->>Redis: DEL checkout:lock:{userId}:{key} (Giải phóng khóa trùng đơn)
                OS-->>FE: 400 Bad Request (Sản phẩm đã hết hàng)
            end
        end
    end

    rect rgb(240, 255, 240)
        Note over OS, DB: Bước 3: Lưu Đơn hàng PENDING (Transaction 1)
        OS->>DB: BEGIN TRANSACTION (Transaction 1)
        OS->>DB: INSERT INTO orders (status=PENDING, total_amount, ...)
        OS->>DB: INSERT INTO order_items (order_id, product_id, ...)
        OS->>DB: COMMIT TRANSACTION (Transaction 1 committed)
        
        Note over OS: Bước 4: Áp dụng Voucher / Điểm thưởng ngoài Transaction 1
        OS->>OS: Gọi Feign Promotion/User Services
        alt Thao tác voucher/điểm hoặc lưu Outbox Event gặp lỗi
            Note over OS, DB: Bắt lỗi & Kích hoạt Luồng đền bù (Compensation Flow)
            OS->>DB: BEGIN TRANSACTION (Compensation)
            OS->>DB: UPDATE orders SET status=CANCELLED WHERE id=?
            OS->>DB: INSERT INTO outbox_events (event_type="OrderCancelledEvent")
            OS->>DB: COMMIT TRANSACTION
            OS->>OS: Gọi giải phóng voucher & hoàn trả điểm thưởng (Async/Feign)
            Note over OS, Redis: Kho ảo Redis sẽ được inventory-service hoàn lại khi nhận OrderCancelledEvent
            OS->>Redis: DEL checkout:lock:{userId}:{key} (Xóa khóa trùng đơn)
            OS-->>FE: 400 Bad Request / 503 Service Unavailable (Hủy đơn & thông báo lỗi)
        else Tất cả thành công
            OS->>DB: BEGIN TRANSACTION (Transaction 2)
            OS->>DB: INSERT INTO outbox_events (aggregate_id=orderId, event_type="OrderCreatedEvent", payload=JSON)
            OS->>DB: COMMIT TRANSACTION
            OS->>OS: Clear Cart
            OS->>Redis: SET checkout:lock:{userId}:{key} {responseJson} EX 900 (Lưu kết quả tạo đơn)
            OS-->>FE: 200 OK { code: "SUCCESS", data: { orderId, status: PENDING, finalAmount, ... } }
        end
    end
```

---

### Giai đoạn 2: Gửi Event & Trừ kho vật lý (Async Inventory Deduction & State Transition)
*   **Mục tiêu**: Đảm bảo sự kiện tạo đơn được gửi thành công đến Kafka (Transactional Outbox Pattern + Debezium CDC), Inventory Service thực hiện trừ kho vật lý an toàn dưới DB bằng cơ chế Pessimistic Lock (SELECT FOR UPDATE) kết hợp sắp xếp danh sách sản phẩm để tránh deadlock, và chuyển trạng thái đơn hàng sang `AWAITING_PAYMENT`.

```mermaid
sequenceDiagram
    autonumber
    participant OS as Cart & Order Service
    participant DB_O as MariaDB (ecommerce_order_db)
    participant CDC as Debezium Connect
    participant Kafka as Apache Kafka
    participant IS as Inventory Service
    participant DB_I as MariaDB (ecommerce_inventory_db)
    participant Redis as Redis Cache

    rect rgb(240, 248, 255)
        Note over DB_O, Kafka: Bước 1: Debezium CDC đọc binlog & Publish Event lên Kafka
        OS->>DB_O: INSERT INTO outbox_events (đã làm ở Giai đoạn 1, cùng transaction nghiệp vụ)
        CDC->>DB_O: Đọc binlog bảng outbox_events (MySqlConnector, chỉ lấy thao tác INSERT)
        CDC->>Kafka: SMT EventRouter định tuyến → Topic order-events (key = aggregate_id)
        Note over CDC: Không có scheduler quét/đánh dấu PROCESSED.<br/>OutboxCleanupScheduler (02:00 hằng ngày) xóa outbox cũ hơn 2 ngày.
    end

    rect rgb(255, 245, 238)
        Note over Kafka, IS: Bước 2: Tiêu thụ Event & Kiểm tra trùng lắp (Idempotency Consumer)
        Kafka->>IS: Consume OrderCreatedEvent { orderId, items }
        IS->>Redis: SET lock:inventory-consumer:{orderId} NX EX 10 (khóa theo đơn)
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
                Note over IS, Redis: Bước 4: Đồng bộ dữ liệu RAM (Self-Healing Cache, sau commit)
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
            OS->>DB_O: INSERT INTO outbox_events (type="OrderCancelledEvent")
            Note over OS: Kho ảo Redis được inventory-service hoàn lại khi nhận OrderCancelledEvent<br/>(nhánh tombstone CANCEL_RECEIVED vì chưa từng DEDUCT)
        end
    end
```

---

### Giai đoạn 3: Thanh toán Đơn hàng (Payment Integration Flow)
*   **Mục tiêu**: Khách hàng thanh toán qua cổng thanh toán VNPAY (hoặc chọn COD). Payment Service tiếp nhận kết quả qua callback VNPay (IPN và redirect trình duyệt dùng chung một endpoint `GET`), xác thực chữ ký HMAC, và phát sự kiện thanh toán qua Outbox + Debezium. Order Service nhận sự kiện để cập nhật trạng thái đơn sang `CONFIRMED`.
*   Chỉ hỗ trợ **VNPAY** và **COD** (không có MoMo/Stripe). Với COD, Payment Service lưu payment `PENDING` và phát `PaymentCODConfirmedEvent` → Order Service chuyển đơn sang `CONFIRMED`; payment COD chuyển `SUCCESS` khi nhận `OrderDeliveredEvent` (Giai đoạn 5).

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng
    participant FE as Frontend
    participant PS as Payment Service
    participant Redis as Redis Cache
    participant DB_P as MariaDB (ecommerce_payment_db)
    participant GW as Cổng Thanh Toán (VNPAY)
    participant Kafka as Apache Kafka
    participant OS as Cart & Order Service
    participant DB_O as MariaDB (ecommerce_order_db)
    participant NS as Notification Service

    User->>FE: Bấm "Thanh toán đơn hàng"
    FE->>PS: POST /api/v1/payments/initiate { orderId, paymentMethod: 'VNPAY', ... }
    
    rect rgb(240, 248, 255)
        Note over PS, Redis: Bước 1: Khóa phân tán (Redis lock theo orderId)
        PS->>Redis: SET payment:initiate:lock:{orderId} "lockValue" NX EX 15
        alt Khóa đã tồn tại (Yêu cầu đang xử lý)
            Redis-->>PS: NIL (Thất bại)
            PS-->>FE: 409 Conflict (Yêu cầu đang xử lý)
        else Khóa chưa tồn tại (Hợp lệ)
            Redis-->>PS: OK (Thành công)
            PS->>OS: GET /api/internal/orders/{orderId}/summary (chỉ cho thanh toán khi đơn PENDING / AWAITING_PAYMENT)
            PS->>DB_P: INSERT INTO payments (order_id, txn_ref, status=PENDING, amount, method=VNPAY, ...)
            PS->>PS: Sinh mã txnRef & Ký HMAC-SHA512 với Hash Secret
            PS->>Redis: DEL payment:initiate:lock:{orderId} (Giải phóng khóa)
            PS-->>FE: 200 OK { paymentUrl }
        end
    end

    FE->>User: Chuyển hướng trình duyệt sang VNPAY
    User->>GW: Nhập OTP / Quét mã QR thanh toán
    GW->>GW: Xử lý giao dịch nội bộ

    rect rgb(255, 245, 238)
        Note over GW, PS: Bước 2: Nhận callback VNPay (IPN và redirect trình duyệt)
        GW->>PS: GET /api/v1/public/payments/vnpay-callback?vnp_TxnRef=...&vnp_ResponseCode=...&vnp_SecureHash=...
        PS->>PS: Xác thực chữ ký vnp_SecureHash
        alt Chữ ký hợp lệ
            PS->>DB_P: SELECT * FROM payments WHERE txn_ref=? FOR UPDATE (Pessimistic Lock)
            alt Giao dịch chưa xử lý (PENDING)
                alt responseCode == "00" (Thành công)
                    PS->>DB_P: UPDATE payments SET status=SUCCESS, paid_at=now()
                    PS->>DB_P: INSERT INTO outbox_events (PaymentSuccessEvent) → Debezium → payment-events
                else Thất bại
                    PS->>DB_P: UPDATE payments SET status=FAILED
                    PS->>DB_P: INSERT INTO outbox_events (PaymentFailedEvent) → Debezium → payment-events
                end
            else Giao dịch đã xử lý từ trước
                Note over PS: Bỏ qua, trả RspCode "02" (Đảm bảo tính Idempotency)
            end
            PS-->>GW: IPN: 200 OK { RspCode: "00", Message: "Confirm Success" }<br/>Trình duyệt (Accept: text/html): redirect về trang kết quả của Frontend
        end
    end

    rect rgb(240, 255, 240)
        Note over Kafka, OS: Bước 3: Cập nhật đơn hàng & Gửi thông báo
        par Cập nhật Đơn hàng sang CONFIRMED
            Kafka->>OS: Consume PaymentSuccessEvent
            OS->>DB_O: UPDATE orders SET status="CONFIRMED" (updateOrderStatus)
            OS->>DB_O: INSERT INTO outbox_events (type="OrderConfirmedEvent")
        and Gửi thông báo cho khách hàng
            Kafka->>NS: Consume PaymentSuccessEvent (Gửi email: "Thanh toán thành công")
            Note over OS, Kafka: Debezium CDC phát OrderConfirmedEvent lên order-events
            Kafka->>NS: Consume OrderConfirmedEvent (Gửi email: "Đặt hàng thành công")
        end
    end
```

---

### Giai đoạn 4: Hủy đơn hàng và Hoàn trả kho / Hoàn tiền (Cancellation & Rollback Flow)
*   **Mục tiêu**: Xử lý hoàn trả tồn kho vật lý, kho ảo và hoàn tiền (nếu đã thanh toán) khi khách hàng yêu cầu hủy đơn, hoặc khi đơn hàng bị quá hạn thanh toán (`OrderExpiryScheduler` chạy mỗi 5 phút, hủy đơn `PENDING` / `AWAITING_PAYMENT` tạo quá **30 phút**). Ngoài ra, payment VNPAY `PENDING` quá hạn (mặc định 15 phút, `PAYMENT_EXPIRY_MINUTES`) được đối soát bằng VNPay QueryDR trước khi đánh dấu `EXPIRED`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng / Admin
    participant OS as Cart & Order Service
    participant DB_O as MariaDB (ecommerce_order_db)
    participant Kafka as Apache Kafka
    participant IS as Inventory Service
    participant DB_I as MariaDB (ecommerce_inventory_db)
    participant Redis as Redis Cache
    participant PS as Payment Service

    alt Người dùng chủ động hủy
        User->>OS: POST /api/v1/orders/{id}/cancel
    else Hệ thống tự động quét hủy đơn quá hạn thanh toán
        Note over OS: OrderExpiryScheduler (mỗi 5 phút) quét đơn PENDING / AWAITING_PAYMENT > 30 phút
    end

    rect rgb(240, 248, 255)
        Note over OS, DB_O: Bước 1: Phase 1 - Cập nhật DB cục bộ (Short Transaction)
        OS->>DB_O: SELECT ... FROM orders WHERE id = ? FOR UPDATE
        OS->>OS: Kiểm tra trạng thái hiện tại thuộc (PENDING, AWAITING_PAYMENT, CONFIRMED)
        OS->>DB_O: BEGIN TRANSACTION
        OS->>DB_O: UPDATE orders SET status=CANCELLED
        OS->>DB_O: INSERT INTO outbox_events (type="OrderCancelledEvent")
        OS->>DB_O: COMMIT TRANSACTION
        
        Note over OS: Phase 2 - Gọi Feign Services ngoài Transaction (Decoupled)
        OS->>OS: Gọi Feign giải phóng voucher & hoàn trả điểm thưởng
        OS-->>User: 200 OK
    end

    Note over OS, Kafka: Debezium CDC publish OrderCancelledEvent (Topic: order-events)

    rect rgb(255, 245, 238)
        Note over Kafka, IS: Bước 2: Hoàn trả tồn kho vật lý (Inventory Service)
        Kafka->>IS: Consume OrderCancelledEvent { orderId, items }
        IS->>DB_I: SELECT * FROM inventory_transactions WHERE order_id=?
        
        alt Không tìm thấy DEDUCT transaction (Lệch pha Kafka / trừ kho thất bại / Tin hủy đến trước tin tạo)
            Note over IS: Mẫu Tombstone: Ghi nhận hủy trước
            IS->>DB_I: INSERT INTO inventory_transactions (type=CANCEL_RECEIVED, order_id, ...)
            IS->>Redis: INCRBY product:stock:{productId}:{variantId} {quantity} (hoàn kho ảo đã giảm lúc checkout)
        else Tìm thấy DEDUCT transaction & Chưa từng RELEASE (Hợp lệ)
            IS->>DB_I: BEGIN TRANSACTION
            loop Với mỗi sản phẩm cần hoàn trả
                IS->>DB_I: SELECT * FROM inventories WHERE product_id=? AND variant_id=? FOR UPDATE (Pessimistic Lock)
                IS->>DB_I: UPDATE inventories SET quantity = quantity + released_quantity
                IS->>DB_I: INSERT INTO inventory_transactions (type=RELEASE, order_id, ...)
                Note over IS, Redis: Đồng bộ lại Redis sau khi DB Commit (afterCommit)
                IS->>Redis: SET product:stock:{productId}:{variantId} {newQuantity}
            end
            IS->>DB_I: COMMIT TRANSACTION
        end
    end

    rect rgb(245, 240, 255)
        Note over Kafka, PS: Bước 3: Hoàn tiền (Payment Service)
        Kafka->>PS: Consume OrderCancelledEvent { orderId }
        alt Payment đang SUCCESS
            PS->>PS: Chuyển payment sang REFUND_PENDING & tạo bản ghi Refund
            PS->>PS: PaymentScheduler (mỗi 1 phút) gọi API hoàn tiền VNPAY → REFUNDED / PARTIALLY_REFUNDED
        else Payment đang PENDING
            PS->>PS: Chuyển payment sang FAILED
        end
    end
```

---

### Giai đoạn 5: Giao hàng và Hoàn tất đơn hàng (Shipping & Delivery Flow)
*   **Mục tiêu**: Người vận hành duyệt đơn hàng để chuyển vận chuyển, cập nhật trạng thái giao hàng thông qua webhook hành trình của đơn vị vận chuyển (ĐVVC) hoặc thao tác thủ công của Admin/Staff, và kết thúc vòng đời đơn hàng.
*   **Lưu ý**: Vận chuyển hiện là **mock** — không gọi API GHTK thật; mã vận đơn dạng `MOCK-GHTK-XXXXXXXX`, phí ship cố định 30.000đ.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / Staff
    participant OS as Cart & Order Service
    participant DB as MariaDB (ecommerce_order_db)
    participant ĐVVC as Đơn vị Vận Chuyển (Mock GHTK)
    participant Kafka as Apache Kafka
    participant PS as Payment Service
    participant NS as Notification Service

    Admin->>OS: PUT /api/v1/orders/{id}/ship (Yêu cầu giao hàng)
    
    rect rgb(240, 248, 255)
        Note over OS, DB: Bước 1: Duyệt trạng thái sang SHIPPED & sinh mã vận đơn
        OS->>DB: SELECT ... FROM orders WHERE id=? FOR UPDATE
        OS->>OS: Kiểm tra: Trạng thái hiện tại bắt buộc phải là "CONFIRMED"
        OS->>OS: Sinh mã vận đơn mock "MOCK-GHTK-XXXXXXXX"
        OS->>DB: UPDATE orders SET status="SHIPPED", tracking_code="MOCK-GHTK-XXXXXXXX"
        OS->>DB: INSERT INTO outbox_events (type="OrderShippedEvent")
    end
    OS-->>Admin: 200 OK { status: SHIPPED, trackingCode }

    rect rgb(255, 245, 238)
        Note over ĐVVC, OS: Bước 2: Cập nhật hành trình (webhook ĐVVC hoặc Admin thao tác tay)
        alt Webhook từ ĐVVC
            ĐVVC->>OS: POST /api/v1/public/orders/shipping-webhook { trackingCode, status }<br/>[Header X-Shipping-Signature = HMAC-SHA256(secret, trackingCode|status)]
        else Admin / Staff
            Admin->>OS: PUT /api/v1/orders/{id}/delivery-status?status=DELIVERED
        end
        alt status == "SHIPPED"
            OS->>DB: Bỏ qua nếu đã là SHIPPED
        else status == "DELIVERED" (Giao hàng thành công)
            OS->>DB: UPDATE orders SET status="DELIVERED"
            OS->>DB: INSERT INTO outbox_events (type="OrderDeliveredEvent")
        end
        OS-->>ĐVVC: 200 OK
    end

    rect rgb(245, 240, 255)
        Note over Kafka, NS: Bước 3: Debezium CDC phát sự kiện → cập nhật COD & gửi Email
        Kafka->>PS: Consume OrderDeliveredEvent (payment COD đang PENDING → SUCCESS)
        Kafka->>NS: Consume OrderShippedEvent / OrderDeliveredEvent
        NS->>NS: Gửi Email HTML (SMTP) báo cho khách hàng; Push FCM hiện chỉ ghi log
    end
```

---

## III. ĐẶC TẢ CHI TIẾT CÁC CƠ CHẾ AN TOÀN & HIỆU NĂNG

> [!IMPORTANT]
> **1. Chống trùng lặp (Idempotency) & Đồng bộ ở các tầng:**
> *   **Tầng API Checkout**: Sử dụng Header `Idempotency-Key` (UUID sinh từ Client) lưu vào Redis dưới dạng `checkout:lock:{userId}:{key}` trong 15 phút. Nếu double-submit, request thứ hai bị từ chối ngay lập tức hoặc nhận về kết quả cũ đã được cache lại.
> *   **Tầng Khởi tạo Thanh toán**: Áp dụng **Redis Distributed Lock** với key `payment:initiate:lock:{orderId}` trong 15 giây. Khi chạy đa pod (Horizontal Scaling), cơ chế này chặn tuyệt đối việc 2 request gửi đồng thời tới 2 pod khác nhau tạo ra 2 đường link thanh toán và 2 bản ghi Payment trùng lặp cho cùng một Order.
> *   **Tầng Callback VNPay (IPN)**: Sử dụng **Pessimistic Lock (`FOR UPDATE`)** trong database khi truy vấn thông tin thanh toán (`findByTxnRefWithLock`). Nếu VNPay gọi IPN đồng thời hoặc khách hàng redirect trình duyệt cùng lúc, giao dịch sẽ được khóa và xử lý tuần tự, kiểm tra trạng thái khác `PENDING` để bỏ qua.
>     *   *Tránh trùng lặp / Race Condition Redirect*: Nếu IPN callback từ VNPay xử lý xong trước và cập nhật trạng thái thanh toán thành `SUCCESS`, trình duyệt redirect của khách hàng đến sau sẽ nhận mã phản hồi `"02"` (Đã thanh toán). Hệ thống tự động phát hiện và ghi đè hiển thị mã `"00"` trên trình duyệt để tránh việc khách hàng bị báo lỗi giả gây hoang mang.
> *   **Tầng Hoàn tiền (Auto-Refund)**: Kiểm tra sự tồn tại của bản ghi hoàn tiền bằng `existsByPaymentId` trước khi lưu để chặn trùng lặp khi Kafka tiêu thụ lại tin nhắn. Đồng thời, Scheduler xử lý hoàn tiền chạy trên nhiều pod được bảo vệ bởi khóa phân tán Redis và chạy từng tác vụ hoàn tiền trong các Transaction riêng biệt.
>     *   *Xử lý thanh toán muộn (Late Payment)*: Nếu khách hàng thanh toán thành công trên VNPay nhưng payment đã bị đánh dấu quá hạn trước đó (`EXPIRED`/`FAILED` trên DB của ta), hệ thống sẽ tự động cập nhật trạng thái thanh toán thành `REFUND_PENDING` và ghi nhận một Refund tự động vào hàng đợi để hoàn trả lại tiền cho khách hàng, tránh thất thoát tài sản.
>     *   *Đối soát QueryDR*: Trước khi đánh dấu payment VNPAY quá hạn là `EXPIRED`, `PaymentScheduler` gọi VNPay QueryDR; nếu VNPay xác nhận đã thanh toán thì cập nhật `SUCCESS` thay vì hủy.
> *   **Tầng Inventory (Deduction)**: Inventory Service kiểm tra bảng `inventory_transactions` theo cặp `(order_id, transaction_type='DEDUCT')`. 
>     *   *Đặc biệt (Kafka Out-of-Order)*: Nếu tin nhắn hủy đến trước tin nhắn tạo đơn, hệ thống sẽ chèn một dòng **Tombstone (`CANCEL_RECEIVED`)** vào bảng transaction. Khi tin nhắn tạo đơn đến sau, hệ thống thấy dòng Tombstone này sẽ tự động bỏ qua (skip) thao tác trừ kho vật lý.

> [!WARNING]
> **2. Chống thất thoát Sự kiện & Giao dịch bù đắp (Transactional Outbox & Compensation Flow):**
> *   **Tách biệt Feign Calls khỏi Transaction**: Các tác vụ gọi dịch vụ ngoài (Voucher, Loyalty Points) được tách khỏi khối `@Transactional` chính khi hủy đơn hay tạo đơn. Điều này giúp đóng/commit kết nối cơ sở dữ liệu cực nhanh, tránh hiện tượng nghẽn kết nối (Connection Pool Starvation) nếu dịch vụ ngoài bị phản hồi chậm.
> *   **Luồng đền bù tự động (Compensation Flow)**: Khi Checkout đơn hàng, Giao dịch 1 sẽ commit lưu Order ở trạng thái `PENDING`. Sau đó, hệ thống gọi dịch vụ ngoài. Nếu bất kỳ lỗi nào xảy ra (lỗi áp voucher, lỗi điểm thưởng, hoặc lỗi lưu Outbox Event ở Giao dịch 2), một khối đền bù (Compensation) sẽ tự động chạy: chuyển trạng thái Order về `CANCELLED` (kèm `OrderCancelledEvent` trong outbox), gọi API trả lại voucher và trả lại điểm thưởng. Nếu lời gọi trả voucher/hoàn điểm thất bại, tác vụ được lưu vào bảng `compensation_tasks` và `CompensationRetryScheduler` thử lại mỗi 5 phút.
> *   **Hoàn trả kho ảo trên Redis**: `order-service` chỉ tự `INCRBY` hoàn kho ảo khi checkout thất bại **trước khi** Giao dịch 1 commit. Khi đơn đã được lưu rồi mới bị hủy (kể cả khi trừ kho vật lý thất bại — `InventoryDeductedEvent` dạng `FAILED`), việc hoàn kho ảo do `inventory-service` đảm nhận khi nhận `OrderCancelledEvent`: nếu chưa từng `DEDUCT` thì ghi tombstone và `INCRBY` Redis; nếu đã `DEDUCT` thì `RELEASE` kho vật lý rồi ghi đè lại Redis.
> *   **Transactional Outbox + Debezium CDC**: Ghi nhận sự kiện (`OrderCreatedEvent`, `OrderCancelledEvent`, `OrderConfirmedEvent`, `OrderShippedEvent`, `OrderDeliveredEvent`; ở payment-service là `PaymentSuccessEvent`, `PaymentFailedEvent`, `PaymentCODConfirmedEvent`) vào bảng `outbox_events` trong cùng một transaction nghiệp vụ tương ứng để đảm bảo tính Atomic. **Debezium Connect** (`io.debezium.connector.mysql.MySqlConnector`, SMT `io.debezium.transforms.outbox.EventRouter`) đọc binlog MariaDB của bảng `outbox_events` (connector `order-outbox-connector` → topic `order-events`, `payment-outbox-connector` → topic `payment-events`) và publish lên Kafka. Không có scheduler quét outbox; mỗi ngày lúc 02:00 một cronjob xóa các bản ghi outbox cũ hơn 2 ngày để tránh đầy bảng.

> [!TIP]
> **3. Cơ chế tự phục hồi dữ liệu kho (Self-Healing Cache) & Giao dịch Bất đồng bộ:**
> *   Để tối ưu tốc độ checkout, số lượng tồn kho khả dụng được giảm nhanh trên Redis (Lua script nguyên tử).
> *   **Đồng bộ Redis sau Commit (afterCommit)**: Để tránh tình trạng dữ liệu Redis bị cập nhật bẩn (dirty read) khi giao dịch database bị rollback, `inventory-service` đăng ký hook đồng bộ Redis thông qua `TransactionSynchronizationManager.registerSynchronization`. Dữ liệu tồn kho trên Redis chỉ được cập nhật mới sau khi giao dịch cơ sở dữ liệu đã commit thành công.
> *   `InventorySyncScheduler` chạy **hằng ngày lúc 02:00** quét toàn bộ bảng `inventories` và đồng bộ lại sang Redis để dọn dẹp các sai lệch tích lũy (Admin cũng có thể kích hoạt thủ công qua `POST /api/v1/admin/inventories/sync-redis`). Ngoài ra, lúc **23:00** hằng ngày scheduler chụp snapshot tồn kho vào bảng `inventory_daily_snapshots`.

---
*Tài liệu thiết kế chi tiết luồng xử lý đơn hàng hệ thống E-Commerce AI.*
