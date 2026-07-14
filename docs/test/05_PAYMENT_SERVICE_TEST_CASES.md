# TEST CASE CHI TIẾT: PAYMENT SERVICE

> Nguồn tham chiếu chính: mã nguồn thực tế `BE/payment-service/src/main/java/com/ecommerce/paymentservice/**`
> (đặc biệt `service/impl/PaymentServiceImpl.java`, `controller/*.java`, `entity/Payment.java`, `entity/Refund.java`,
> `scheduler/PaymentScheduler.java`, `event/consumer/OrderKafkaConsumer.java`).
> Tài liệu `docs/services/05_PAYMENT_SERVICE.md` được dùng làm bối cảnh nghiệp vụ, nhưng khi có sai khác
> (ví dụ: tài liệu mô tả kiến trúc multi-gateway Strategy Pattern với Momo/Stripe, trạng thái `COMPLETED`,
> cột `failure_message`, `requested_by` bắt buộc — trong khi code thực tế **chỉ có VNPAY + COD**, trạng thái
> thực là `SUCCESS` (không phải `COMPLETED`), không có cột `failure_message`, và `Refund.requestedBy` không
> được set trong `processRefund`) thì **test case dưới đây bám theo code thật**.
>
> **Bản rút gọn**: tài liệu này đã được rút gọn (~40% test case) theo yêu cầu — chỉ tập trung vào các luồng
> quan trọng (initiate COD/VNPAY, callback/IPN, refund full/partial/vượt hạn mức/race condition, payment
> expiry scheduler, xác nhận COD qua Kafka, auto-refund khi hủy đơn, outbox pattern). Các test case validate
> field đơn lẻ, format sai, input thiếu, hoặc edge case độ ưu tiên Thấp đã được gộp thành 1 dòng đại diện
> hoặc bỏ qua.

---

## 0. PHẠM VI (SCOPE) VÀ GHI CHÚ MÔI TRƯỜNG TEST

### 0.1. Các module trong phạm vi

| # | Module | Class/Method liên quan |
|---|---|---|
| 1 | Khởi tạo thanh toán COD | `PaymentServiceImpl.initiatePayment()` (nhánh `METHOD_COD`) |
| 2 | Khởi tạo thanh toán VNPAY (build URL) | `PaymentServiceImpl.initiatePayment()` (nhánh VNPAY) + `buildVnPayUrl()` |
| 3 | Callback/IPN VNPAY | `PaymentServiceImpl.verifyVnPayCallback()`, `WebhookController.vnpayCallback()` |
| 4 | Đối soát giao dịch (QueryDR) | `PaymentServiceImpl.checkVnPayTransactionStatus()` |
| 5 | Hoàn tiền (Refund) — full & partial | `PaymentServiceImpl.processRefund()`, `callVnPayRefundApi()`, `applyGatewayResult()` |
| 6 | Refund tự động khi hủy đơn | `PaymentServiceImpl.initiateAutoRefund()` (consume `OrderCancelledEvent`) |
| 7 | Retry refund nền (scheduler) | `PaymentServiceImpl.processPendingRefunds()` |
| 8 | Payment expiry scheduler | `PaymentServiceImpl.cancelExpiredPayments()`, `PaymentScheduler.cleanupExpiredPayments()` |
| 9 | Xác nhận COD khi giao hàng | `OrderKafkaConsumer.consumeOrderEvent()` (nhánh `OrderDeliveredEvent`) |
| 10 | API tra cứu / Admin | `PaymentController`, `AdminPaymentController` |
| 11 | Outbox event cho Kafka | `publishPaymentEvent()`, `OutboxEvent` |

### 0.2. Cần mock VNPAY sandbox (Unit Test / IT có WireMock/MockRestServiceServer)

Các luồng gọi ra ngoài tới VNPAY (`restTemplate`/`standardRestTemplate.postForObject`) **phải mock** vì phụ thuộc mạng ngoài,
độ trễ, và kết quả không xác định (sandbox VNPAY có thể down/đổi response code):

- Build URL thanh toán (không gọi API ngoài thực sự — chỉ build chuỗi ký, nhưng vẫn nằm trong UT thuần vì không cần DB/HTTP thật)
- `callVnPayRefundApi()` — gọi `POST {vnp_query_url}` (refund command) → mock response `vnp_ResponseCode` = 00/91/94/95/99, mock timeout/exception
- `checkVnPayTransactionStatus()` — gọi QueryDR → mock `vnp_TransactionStatus` = 00/01/02, mock lỗi kết nối
- Callback IPN: test **không** cần gọi VNPAY thật — chỉ cần giả lập `queryParams` do VNPAY gửi tới (map các `vnp_*` field) rồi tính chữ ký hợp lệ/không hợp lệ bằng cùng thuật toán HMAC-SHA512 với `hash-secret` test.

### 0.3. Test được với DB thật (Integration Test)

- Idempotency khi initiate payment (kiểm tra bản ghi `Payment` trong Postgres/H2)
- Refund logic tính tổng `sumSuccessfulRefunds`, khóa pessimistic (`findByIdWithLock`, `findByTxnRefWithLock`)
- Payment expiry scheduler quét `findAllByStatusAndCreatedAtBefore`
- Outbox event ghi vào bảng `outbox_events` (không cần Kafka thật, chỉ cần verify bản ghi outbox — Debezium CDC nằm ngoài phạm vi IT của service này)
- Redis lock cho `initiatePayment` (cần Redis thật hoặc Testcontainers Redis) — race condition test

### 0.4. Quy ước Test ID

- `UT-PAYMENT-0xx`: Unit Test — mock toàn bộ dependency (Repository, RestTemplate, KafkaTemplate, Redis).
- `IT-PAYMENT-0xx`: Integration Test — dùng DB thật (Testcontainers Postgres/H2), Redis thật, mock VNPAY qua WireMock/MockRestServiceServer.

---

## 1. MODULE: KHỞI TẠO THANH TOÁN (INITIATE PAYMENT)

### 1.1. COD (Cash On Delivery)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-001 | `initiatePayment` — COD | Unit | Khởi tạo thanh toán COD tạo Payment PENDING và publish `PaymentCODConfirmedEvent` ngay lập tức | Mock order-service trả `status=PENDING`, `finalAmount=500000`, `userId` khớp | Gọi `initiatePayment(request)` với `paymentMethod=COD`, `orderId=100`, `userId="u1"` | - `paymentRepository.save()` được gọi với `status=PENDING`<br>- `publishPaymentEvent("PaymentCODConfirmedEvent", ...)` được gọi đúng 1 lần với `amount` = amount đã verify<br>- Response trả `redirectUrl=""`, có `paymentId`, `txnRef` | Cao |
| IT-PAYMENT-001 | `POST /api/v1/payments/initiate` — COD | Integration | Kiểm tra bản ghi Payment thực trong DB sau khi initiate COD | order-service mock trả order hợp lệ (WireMock), DB thật (Testcontainers) | Gọi API `initiate` với method=COD | - Bản ghi `payments` có `status=PENDING`, `payment_method=COD`, `amount` bằng `finalAmount` verify từ order-service (không phải amount client gửi)<br>- Có 1 bản ghi `outbox_events` với `event_type=PaymentCODConfirmedEvent`, `published=false` | Cao |
| UT-PAYMENT-002 | `initiatePayment` — Security | Unit | Amount client gửi bị ghi đè bởi amount verify từ order-service (chống price tampering) | Request client gửi `amount=1` (giả mạo), order-service trả `finalAmount=999000` | Gọi `initiatePayment` với amount giả mạo | Payment được lưu với `amount=999000` (không phải 1) | Cao |
| UT-PAYMENT-003 | `initiatePayment` — Access denied / order state không hợp lệ | Unit | Gộp 2 nhánh chặn khởi tạo: (a) `orderUserId` khác `request.getUserId()`; (b) order không ở trạng thái PENDING/AWAITING_PAYMENT | (a) order-service trả `userId="owner-A"`, request `userId="attacker-B"`; (b) order-service trả `status=CANCELLED` | Gọi `initiatePayment` cho từng case | (a) Ném `IllegalArgumentException` "Access Denied..."; không tạo Payment; log cảnh báo security<br>(b) Ném `RuntimeException` "Cannot pay for order in status: CANCELLED" | Cao |
| UT-PAYMENT-004 | `initiatePayment` — Idempotency (reuse PENDING) | Unit | Nếu đã có Payment PENDING cho order, tái sử dụng record thay vì tạo mới | `paymentRepository.findByOrderId` trả về Payment PENDING sẵn có (id=50) | Gọi `initiatePayment` lần 2 cho cùng orderId | Payment id=50 được cập nhật lại (`txnRef` mới, `status=PENDING`), không tạo Payment thứ 2 | Cao |
| UT-PAYMENT-005 | `initiatePayment` — Idempotency (đã SUCCESS/REFUNDED) | Unit | Không cho khởi tạo lại nếu payment đã hoàn tất theo 1 trong 2 trạng thái cuối | Payment hiện có `status=SUCCESS` hoặc `status=REFUNDED` | Gọi `initiatePayment` cho từng trạng thái | Ném `IllegalStateException` — "...already been successfully completed..." (SUCCESS) hoặc "...already been refunded..." (REFUNDED) | Cao |
| IT-PAYMENT-002 | `initiatePayment` — Race condition | Integration | Hai request initiate đồng thời cho cùng 1 `orderId` → chỉ 1 thành công nhờ Redis lock | Redis thật, 2 thread gọi song song cùng `orderId` | Bắn 2 request đồng thời | Request thứ 2 nhận `IllegalStateException` "Payment initiation already in progress..." (do không lấy được lock `payment:initiate:lock:{orderId}`); chỉ có tối đa 1 Payment record hợp lệ được tạo | Cao |

### 1.2. VNPAY — Build URL redirect

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-006 | `initiatePayment` — VNPAY | Unit | Khởi tạo thanh toán VNPAY trả về `redirectUrl` hợp lệ, Payment ở PENDING (chưa publish event thành công) | order-service trả order hợp lệ; config `vnpay.pay-url`, `tmn-code`, `hash-secret` test | Gọi `initiatePayment` với `paymentMethod=VNPAY` | - Payment lưu `status=PENDING`<br>- Response `redirectUrl` bắt đầu bằng `vnpPayUrl?...`<br>- **Không** publish `PaymentCODConfirmedEvent` (khác với nhánh COD) | Cao |
| UT-PAYMENT-007 | `buildVnPayUrl` | Unit | URL chứa đầy đủ tham số bắt buộc và đúng thứ tự alphabet (TreeMap) trước khi ký | Payment với `amount=500000`, `orderId=100`, `ipAddress="1.2.3.4"` | Gọi `buildVnPayUrl(payment, txnRef, ip)` | URL chứa `vnp_Version`, `vnp_Command=pay`, `vnp_TmnCode`, `vnp_Amount=50000000` (x100), `vnp_CurrCode=VND`, `vnp_TxnRef`, `vnp_OrderInfo`, `vnp_IpAddr=1.2.3.4`, `vnp_CreateDate`, `vnp_ExpireDate`, và `vnp_SecureHash` ở cuối | Cao |
| UT-PAYMENT-008 | `buildVnPayUrl` — checksum đúng | Unit | Chữ ký HMAC-SHA512 tính trên `hashData` (dùng `URLEncoder.encode` cho value, key giữ nguyên) khớp với giá trị tính độc lập trong test | Cùng `hash-secret` | Tính lại HMAC-SHA512 thủ công trên cùng chuỗi tham số đã sort, so sánh với `vnp_SecureHash` trong URL trả về | Hai giá trị hash khớp nhau chính xác (không phân biệt hoa/thường theo cách so sánh `equalsIgnoreCase` dùng ở phía verify) | Cao |
| UT-PAYMENT-009 | `buildVnPayUrl` — edge case (IP + expiry) | Unit | Gộp 2 edge case: (a) IP client IPv6 loopback fallback về `127.0.0.1`; (b) `vnp_ExpireDate` = `vnp_CreateDate` + `paymentExpiryMinutes` | (a) `ipAddress="0:0:0:0:0:0:0:1"`; (b) `app.payment-expiry-minutes=15` | Gọi `buildVnPayUrl` cho từng case | (a) `vnp_IpAddr=127.0.0.1` trong URL<br>(b) Hiệu số giữa `vnp_ExpireDate` và `vnp_CreateDate` đúng 15 phút | Trung bình |
| IT-PAYMENT-003 | `POST /api/v1/payments/initiate` — VNPAY | Integration | End-to-end initiate VNPAY với DB thật, order-service mock qua WireMock | WireMock trả order hợp lệ | Gọi API initiate với method=VNPAY | HTTP 200, `data.redirectUrl` chứa domain VNPAY sandbox cấu hình test; bản ghi `payments` có `status=PENDING`, `txn_ref` khớp với `vnp_TxnRef` trong URL | Cao |

---

## 2. MODULE: XỬ LÝ CALLBACK / IPN VNPAY

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-010 | `verifyVnPayCallback` — thiếu field bắt buộc | Unit | Gộp 2 case thiếu field: (a) thiếu `vnp_SecureHash`; (b) thiếu `vnp_Amount` — cả hai đều phải reject ngay | (a) `queryParams` không có `vnp_SecureHash`; (b) không có `vnp_Amount` | Gọi `verifyVnPayCallback(queryParams)` cho từng case | (a) Trả `"97"`; `webhookLogRepository.save()` với `signatureValid=false, processed=false`; **không** gọi `findByTxnRefWithLock`<br>(b) Trả `"04"` | Cao |
| UT-PAYMENT-011 | `verifyVnPayCallback` — checksum sai | Unit | Chữ ký gửi lên không khớp HMAC tính lại → phải reject (không được cập nhật payment) | `queryParams` có `vnp_SecureHash` giả mạo/không khớp `hash-secret` thật | Gọi `verifyVnPayCallback` | Trả về `"97"`; log `warn` "VNPAY signature mismatch"; `webhookLog` lưu `signatureValid=false`; Payment **không đổi trạng thái**; không publish event nào | Cao |
| UT-PAYMENT-012 | `verifyVnPayCallback` — responseCode 00 (thành công) | Unit | Callback hợp lệ, `vnp_ResponseCode=00`, payment đang PENDING → chuyển SUCCESS và publish `PaymentSuccessEvent` | Payment PENDING tồn tại với `txnRef` khớp, `amount` khớp `vnp_Amount` (x100) | Gọi `verifyVnPayCallback` với hash hợp lệ, `vnp_ResponseCode=00` | Trả `"00"`; `payment.status=SUCCESS`, `paidAt` được set; `publishPaymentEvent("PaymentSuccessEvent", ...)` gọi 1 lần; `webhookLog.processed=true` | Cao |
| UT-PAYMENT-013 | `verifyVnPayCallback` — responseCode khác 00 (thất bại) | Unit | `vnp_ResponseCode=24` (khách hủy) → payment chuyển FAILED, publish `PaymentFailedEvent`, nhưng vẫn trả `"00"` cho VNPAY (đã xử lý webhook thành công) | Payment PENDING tồn tại | Gọi `verifyVnPayCallback` với `vnp_ResponseCode=24` | Trả `"00"`; `payment.status=FAILED`, `failureCode="24"`; publish `PaymentFailedEvent` | Cao |
| UT-PAYMENT-014 | `verifyVnPayCallback` — sai số tiền (chống price tampering) | Unit | `vnp_Amount` gửi lên không khớp `payment.amount * 100` | Payment tồn tại `amount=500000`; `vnp_Amount="1000"` (giả mạo) | Gọi `verifyVnPayCallback` | Trả `"04"`; payment không đổi trạng thái; log warn mismatch | Cao |
| UT-PAYMENT-015 | `verifyVnPayCallback` — Idempotency: đã SUCCESS, callback lại 00 | Unit | VNPAY gửi lại webhook trùng (retry) cho payment đã SUCCESS | Payment `status=SUCCESS` | Gọi lại `verifyVnPayCallback` với cùng `txnRef`, `responseCode=00` | Trả `"02"` ("Order already paid"); **không** publish lại event; `webhookLog.processed=true` được ghi thêm 1 dòng log mới (audit) nhưng payment không đổi | Cao |
| UT-PAYMENT-016 | `verifyVnPayCallback` — Late payment sau EXPIRED/FAILED | Unit | Payment đã bị đánh EXPIRED hoặc FAILED (bởi scheduler hoặc callback thất bại trước đó), nhưng VNPAY vẫn gửi webhook `responseCode=00` muộn → không được mất tiền khách, phải tạo Refund tự động | Payment `status=EXPIRED` hoặc `status=FAILED` | Gọi `verifyVnPayCallback` với `responseCode=00` cho từng trạng thái | `payment.status=REFUND_PENDING`, `paidAt` set; tạo `Refund` mới với `status=PENDING`, `reason` chứa "Auto-refund: Late payment..."; trả `"00"` | Cao |
| IT-PAYMENT-004 | `GET /api/v1/public/payments/vnpay-callback` — IPN (Accept: application/json) | Integration | Endpoint webhook không yêu cầu JWT, trả JSON `{RspCode, Message}` cho VNPAY background IPN | DB thật có Payment PENDING; request không có header `Accept: text/html` | Gọi GET callback với params hợp lệ, `responseCode=00` | HTTP 200, body `{"RspCode":"00","Message":"Confirm Success"}`; DB payment cập nhật SUCCESS | Cao |

---

## 3. MODULE: ĐỐI SOÁT GIAO DỊCH (VNPAY QueryDR) & PAYMENT EXPIRY SCHEDULER

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-017 | `checkVnPayTransactionStatus` — các response code | Unit | Gộp 3 mã QueryDR: `00` (thành công), `01` (chưa hoàn tất), `91` (không tìm thấy giao dịch) | Mock response QueryDR trả từng `vnp_ResponseCode`/`vnp_TransactionStatus` tương ứng | Gọi `checkVnPayTransactionStatus(payment)` cho từng case | Trả `"00"` / `"01"` / `"NOT_FOUND"` tương ứng | Trung bình |
| UT-PAYMENT-018 | `checkVnPayTransactionStatus`/`cancelExpiredPayments` — QueryDR lỗi/timeout | Unit | Khi QueryDR timeout/exception, hàm phải trả `null` (không ném ra ngoài) và ở tầng `cancelExpiredPayments`, payment liên quan phải **giữ nguyên PENDING**, không publish event nào | Mock `RestTemplate` ném `ResourceAccessException`/timeout | Gọi `checkVnPayTransactionStatus`, sau đó gọi `cancelExpiredPayments()` | `checkVnPayTransactionStatus` trả `null`; `cancelExpiredPayments()` giữ payment ở PENDING, log warn "unclear/error status" | Cao |
| UT-PAYMENT-019 | `cancelExpiredPayments` — QueryDR xác nhận rescue vs expire thật | Unit | Gộp 2 nhánh: (a) QueryDR trả `00` → payment "được cứu", chuyển SUCCESS (không phải EXPIRED); (b) QueryDR trả `01`/`02`/`NOT_FOUND` → payment thật sự chuyển EXPIRED | `findAllByStatusAndCreatedAtBefore` trả payment VNPAY PENDING quá 15p | (a) Mock QueryDR trả `"00"`; (b) Mock trả `"01"`/`"02"`/`"NOT_FOUND"` | (a) `status=SUCCESS`, `paidAt` set, publish `PaymentSuccessEvent` ("VNPAY QueryDR sync success")<br>(b) `status=EXPIRED`, publish `PaymentFailedEvent` ("Payment session expired") | Cao |
| UT-PAYMENT-020 | `cancelExpiredPayments` — COD bị SKIP, không bao giờ expire | Unit | Payment `paymentMethod=COD`, `status=PENDING`, `createdAt` quá hạn 15 phút | `findAllByStatusAndCreatedAtBefore` trả về payment COD này | Gọi `cancelExpiredPayments()` | Payment COD **không đổi trạng thái** (log "Payment txnRef ... is COD. Skipping expiration."); không gọi `checkVnPayTransactionStatus` cho payment COD | Cao |
| IT-PAYMENT-005 | `PaymentScheduler.cleanupExpiredPayments` | Integration | Scheduler chạy với Redis lock, DB thật, WireMock giả VNPAY QueryDR trả timeout/lỗi | 1 payment VNPAY PENDING tạo cách đây > 15 phút (`created_at` set thủ công trong DB test) | Trigger job (gọi trực tiếp method hoặc chờ cron test) | Payment vẫn `PENDING` (do QueryDR lỗi → skip); job không throw exception làm crash scheduler | Trung bình |

---

## 4. MODULE: HOÀN TIỀN (REFUND) — ADMIN

### 4.1. Refund hợp lệ (full & partial)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-021 | `processRefund` — Partial refund VNPAY | Unit | Refund một phần số tiền, VNPAY refund API trả 00 → Refund SUCCESS, payment chuyển PARTIALLY_REFUNDED | Payment `status=SUCCESS`, `amount=1000000`; request `amount=300000`; mock `callVnPayRefundApi` trả `success=true` | Gọi `processRefund(request)` | `refund.status=SUCCESS`, `refund.gatewayRefundId` set; `payment.status=PARTIALLY_REFUNDED`; publish `RefundCompletedEvent` với `amount=300000` | Cao |
| UT-PAYMENT-022 | `processRefund` — Full refund VNPAY (đúng 100%) | Unit | Refund đúng bằng toàn bộ `payment.amount` (chưa có refund trước đó) → status = REFUNDED (không phải PARTIALLY_REFUNDED) | Payment `amount=1000000`, chưa có refund nào; request `amount=1000000` | Gọi `processRefund` | `isFullRefund=true` → `payment.status=REFUNDED`; `vnp_TransactionType="02"` được gửi trong request VNPAY (full refund code) | Cao |
| UT-PAYMENT-023 | `processRefund` — Refund COD | Unit | Payment method COD → không gọi VNPAY API, refund coi như xác nhận offline, tự động SUCCESS | Payment `paymentMethod=COD`, `status=SUCCESS` | Gọi `processRefund` với amount hợp lệ | `callVnPayRefundApi` **không được gọi**; `refund.status=SUCCESS` ngay (gatewayResult=null); payment status cập nhật đúng full/partial | Cao |
| UT-PAYMENT-024 | `processRefund` — Cộng dồn nhiều refund vừa đủ | Unit | Gộp 2 case cộng dồn: refund thêm sau khi đã PARTIALLY_REFUNDED, và 3 lần refund nhỏ cộng lại đúng 100% (200k+300k+500k=1,000,000) | Payment `amount=1000000`; đã có refund SUCCESS trước đó (300000, hoặc 200000+300000) | Gọi `processRefund` với phần còn lại đúng số dư (`remaining`) | `remaining` được tính đúng bằng `amount - sumSuccessfulRefunds`; khi request khớp đúng phần còn lại → `isFullRefund=true` → `payment.status=REFUNDED` | Cao |
| IT-PAYMENT-006 | `POST /api/v1/admin/payments/refund` — Partial refund | Integration | End-to-end refund một phần với DB thật, mock VNPAY refund API qua WireMock trả 00 | Payment SUCCESS trong DB, `amount=1000000` | Gọi API refund với `amount=400000`, role ADMIN | HTTP 200; DB `payments.status=PARTIALLY_REFUNDED`; DB `refunds` có 1 dòng `status=SUCCESS`, `refund_amount=400000` | Cao |
| IT-PAYMENT-007 | `POST /api/v1/admin/payments/refund` — Full refund | Integration | Refund đúng 100% → DB payment chuyển REFUNDED | Payment SUCCESS, `amount=1000000`, chưa refund | Gọi API refund `amount=1000000` | DB `payments.status=REFUNDED` (không phải PARTIALLY_REFUNDED) | Cao |

### 4.2. Refund lỗi / Edge case bảo mật

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-025 | `processRefund` — Vượt số tiền còn lại (Security Violation) | Unit | Refund amount lớn hơn phần còn lại refund được | Payment `amount=1000000`, đã refund SUCCESS 800000 (remaining=200000); request `amount=300000` | Gọi `processRefund` | Ném `IllegalArgumentException` "Security Violation: Refund amount (300000) exceeds remaining refundable amount (200000)."; **không** gọi VNPAY API (check chạy ở STEP 1 snapshot trước khi gọi gateway); không tạo Refund record | Cao |
| UT-PAYMENT-026 | `processRefund` — Refund khi trạng thái payment không hợp lệ | Unit | Gộp 3 trạng thái không được refund: `PENDING` (chưa thanh toán xong), `FAILED`, `REFUNDED` (đã hoàn hết) | Payment ở từng trạng thái `PENDING`/`FAILED`/`REFUNDED` | Gọi `processRefund` với amount bất kỳ > 0 cho từng trạng thái | Ném `RuntimeException` "Cannot refund payment in status: {status}"; không gọi gateway, không tạo Refund | Cao |
| UT-PAYMENT-027 | `processRefund` — Amount <= 0 | Unit | Request `amount=0` hoặc âm | Payment SUCCESS | Gọi `processRefund` | Ném `IllegalArgumentException` "Refund amount must be greater than zero." (Lưu ý: DTO có `@Positive` nên tầng validate Controller cũng chặn trước khi vào service — test cả 2 lớp) | Trung bình |
| UT-PAYMENT-028 | `callVnPayRefundApi` — VNPAY trả lỗi rejected (94/95) — không ghi nhận thành công | Unit | Mock response `vnp_ResponseCode=95` ("giao dịch không hợp lệ để hoàn tiền") | Payment SUCCESS | Gọi `processRefund`, VNPAY reject | `gatewayResult.success()=false, retryable()=false`; `refund.status=PENDING_MANUAL` (không phải SUCCESS); `payment.status` giữ nguyên (KHÔNG chuyển REFUNDED/PARTIALLY_REFUNDED); không publish `RefundCompletedEvent` | Cao |
| UT-PAYMENT-029 | `callVnPayRefundApi` — Lỗi tạm thời (timeout/response null/91/99) | Unit | Gộp 3 kiểu lỗi gateway tạm thời đều dẫn tới cùng kết quả `retryable=true`: timeout/exception, response null, `vnp_ResponseCode=91` hoặc `99` | Mock `standardRestTemplate.postForObject` ném exception, trả `null`, hoặc trả `vnp_ResponseCode=91/99` | Gọi `callVnPayRefundApi`/`processRefund` cho từng case | `VnPayRefundResult(success=false, retryable=true, ...)`; `refund.status=PENDING` (không phải `PENDING_MANUAL`); payment status **không đổi**; refund sẽ được `processPendingRefunds` scheduler retry sau | Cao |
| IT-PAYMENT-008 | `POST /api/v1/admin/payments/refund` — Vượt hạn mức | Integration | Test qua API thật với DB, không mock service | Payment SUCCESS `amount=500000`, đã refund 500000 trước đó (REFUNDED) | Gọi API refund `amount=100000` | HTTP 4xx (theo `GlobalExceptionHandler` map `IllegalArgumentException`/`RuntimeException`); DB không có refund mới được tạo | Cao |

### 4.3. Race condition — Refund đồng thời

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-PAYMENT-009 | `processRefund` — 2 refund đồng thời cùng payment (race condition) | Integration | Đảm bảo pessimistic lock (`findByIdWithLock`) chặn được double-refund vượt hạn mức khi 2 request refund gửi đồng thời | Payment SUCCESS `amount=1000000`, DB thật (Postgres/Testcontainers) hỗ trợ lock thật; mock VNPAY luôn trả 00 | 2 thread gọi `processRefund` đồng thời, mỗi thread refund `amount=600000` (tổng 1,200,000 > amount payment) | Chỉ 1 request refund thành công (`SUCCESS`, tổng refund ≤ 1,000,000); request còn lại nhận `IllegalArgumentException` "Security Violation..." khi re-validate dưới lock ở STEP 3 (dù đã pass check ở STEP 1 snapshot do race) — tổng `refund_amount` trong DB **không vượt** `payment.amount` | Cao |
| UT-PAYMENT-030 | `processRefund` — Snapshot pass nhưng lock re-check fail | Unit | Mô phỏng race: STEP 1 snapshot đọc `remaining=600000` (đủ), nhưng giữa lúc gọi VNPAY và lúc vào transaction, refund khác đã commit trước làm remaining thực tế còn 0 | Mock `sumSuccessfulRefunds` trả về giá trị khác nhau giữa 2 lần gọi (snapshot vs trong transaction) | Gọi `processRefund` | Sau khi gọi VNPAY (tốn tiền phí gọi API dù có thể lãng phí), transaction re-check tại STEP 3 ném `IllegalArgumentException` Security Violation → refund KHÔNG được lưu là SUCCESS dù VNPAY đã trả 00 ở bước gateway (rủi ro cần lưu ý: tiền đã bị trừ ở VNPAY nhưng DB reject — cần theo dõi log để xử lý thủ công) | Cao |
| IT-PAYMENT-010 | `processPendingRefunds` — Scheduler + lock chống xử lý trùng | Integration | Refund `status=PENDING` được 2 instance scheduler lấy song song, chỉ 1 xử lý thành công nhờ `findByIdWithLock` | 1 Refund PENDING; 2 thread gọi `processPendingRefunds()` đồng thời | Chạy đồng thời | Refund chỉ được set `SUCCESS` một lần; thread thứ 2 thấy `status` không còn PENDING (do đã xử lý) → log "already processed by another instance" và skip | Cao |

---

## 5. MODULE: PAYMENT EXPIRY SCHEDULER (bổ sung — Outbox rollback & E2E)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-031 | `cancelExpiredPayments` — Publish event lỗi thì rollback | Unit | Nếu `publishPaymentEvent` ném exception (lỗi ghi outbox) khi đánh EXPIRED, phải throw để rollback transaction (payment không bị đánh EXPIRED mà event lại mất) | Mock `outboxEventRepository.save` ném exception | Gọi `cancelExpiredPayments()` cho 1 payment VNPAY hết hạn, QueryDR trả `"02"` | Transaction ném `RuntimeException`, payment KHÔNG được commit là EXPIRED (rollback) — nhất quán DB/outbox | Cao |
| IT-PAYMENT-011 | Cron `cleanupExpiredPayments` | Integration | Payment VNPAY PENDING tạo hơn 15 phút trước, QueryDR mock trả `"02"` (thất bại) | DB thật, WireMock QueryDR trả 02 | Trigger scheduler | DB `payments.status=EXPIRED`; có `outbox_events` record `PaymentFailedEvent` | Cao |
| IT-PAYMENT-012 | Payment COD không bao giờ bị scheduler đụng tới | Integration | Payment COD PENDING tạo cách đây 1 năm (rất cũ) | DB có 1 payment COD PENDING với `created_at` rất cũ | Trigger `cleanupExpiredPayments` nhiều lần | Payment COD **vẫn PENDING** vĩnh viễn qua nhiều lần chạy job (đúng thiết kế: COD chỉ chuyển SUCCESS khi nhận `OrderDeliveredEvent`, không bị expire theo thời gian) | Cao |

---

## 6. MODULE: XÁC NHẬN COD KHI GIAO HÀNG (Kafka Consumer) & AUTO-REFUND KHI HỦY ĐƠN

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-032 | `OrderKafkaConsumer` — `OrderDeliveredEvent` cho COD PENDING | Unit | Nhận event giao hàng thành công, payment COD PENDING → chuyển SUCCESS | Payment `paymentMethod=COD`, `status=PENDING` | Consume message `{"eventType":"OrderDeliveredEvent","orderId":100}` | `payment.status=SUCCESS`, `paidAt` set; `ack.acknowledge()` được gọi | Cao |
| UT-PAYMENT-033 | `OrderKafkaConsumer` — `OrderCancelledEvent` → gọi `initiateAutoRefund` | Unit | Consumer route đúng sang `initiateAutoRefund(orderId)` | — | Consume `{"eventType":"OrderCancelledEvent","orderId":100}` | `paymentService.initiateAutoRefund(100)` được gọi | Cao |
| UT-PAYMENT-034 | `initiateAutoRefund` — Tạo Refund PENDING full amount + Idempotency | Unit | Gộp 2 case: (a) Order bị hủy sau khi đã thanh toán xong → tạo Refund full amount; (b) event xử lý trùng do Kafka retry → không tạo Refund thứ 2 | (a) Payment `status=SUCCESS`, chưa có Refund; (b) `refundRepository.existsByPaymentId=true` | Gọi `initiateAutoRefund(orderId)` cho từng case | (a) `payment.status=REFUND_PENDING`; tạo `Refund` mới `status=PENDING`, `refundAmount=payment.amount`, `reason` chứa "Auto-refund: Order cancelled by user"<br>(b) Không tạo thêm Refund; log warn "Skipping duplicate initiateAutoRefund" | Cao |
| UT-PAYMENT-035 | `initiateAutoRefund` — Payment còn PENDING → chuyển FAILED (không refund vì chưa trả tiền) | Unit | Order hủy khi chưa thanh toán xong | Payment `status=PENDING` | Gọi `initiateAutoRefund` | `payment.status=FAILED`, `failureCode="ORDER_CANCELLED"`; không tạo Refund | Trung bình |

---

## 7. MODULE: API TRA CỨU & ADMIN LIST

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-036 | `getPaymentByOrderId` — Chủ sở hữu / Admin xem được | Unit | Gộp 2 case hợp lệ: user xem đúng payment của mình; admin/staff bỏ qua check chủ sở hữu | Payment `userId="u1"` | Gọi `getPaymentByOrderId(orderId, "u1", false)` và `getPaymentByOrderId(orderId, "adminX", true)` | Cả 2 trả về `PaymentResponse` đầy đủ, không ném exception | Trung bình |
| UT-PAYMENT-037 | `getPaymentByOrderId` — IDOR: user khác bị chặn | Unit | User khác cố xem payment không thuộc về mình | Payment `userId="u1"`, caller `userId="u2"` | Gọi `getPaymentByOrderId(orderId, "u2", false)` | Ném `AccessDeniedException` | Cao |
| IT-PAYMENT-013 | `POST /api/v1/payments/initiate` — Header giả mạo bị bỏ qua khi có JWT | Integration | `X-User-Id` header giả mạo nhưng có JWT hợp lệ khác → phải dùng JWT | Header `X-User-Id: attacker`, JWT `sub=real-user` | Gọi API initiate | Payment lưu `userId` = giá trị lấy từ `jwt.getSubject()`, không phải header | Cao |

---

## 8. MODULE: OUTBOX EVENT (Đảm bảo atomicity DB + Kafka)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PAYMENT-038 | `publishPaymentEvent` — Lưu vào Outbox thay vì gửi Kafka trực tiếp | Unit | Xác nhận event được ghi vào `outboxEventRepository`, không gọi `kafkaTemplate.send()` trực tiếp trong luồng này | — | Gọi `publishPaymentEvent("PaymentSuccessEvent", payment, amount, "test")` | `outboxEventRepository.save()` được gọi với `aggregateType="Payment"`, `eventType="PaymentSuccessEvent"`, `published=false`; `kafkaTemplate.send` **không** được gọi trực tiếp trong hàm này | Trung bình |
| UT-PAYMENT-039 | `publishPaymentEvent` — Lỗi serialize/lưu outbox → rollback | Unit | Nếu lưu outbox thất bại (DB lỗi), phải ném exception để rollback transaction cha (tránh mất event) | Mock `outboxEventRepository.save` ném `Exception` | Gọi trong context `processRefund`/`verifyVnPayCallback` | Ném `RuntimeException` "Failed to save payment event to outbox..."; transaction cha rollback (payment status không được commit) | Cao |

---

## 9. TỔNG HỢP MA TRẬN TRẠNG THÁI PAYMENT/REFUND (tham chiếu nhanh khi viết test data)

### 9.1. `Payment.status` (thực tế trong code — không phải theo docs `COMPLETED`)

`PENDING → SUCCESS | FAILED | EXPIRED`
`SUCCESS → REFUND_PENDING → REFUNDED | PARTIALLY_REFUNDED`
`EXPIRED/FAILED → REFUND_PENDING` (chỉ khi có late payment webhook `responseCode=00`)

### 9.2. `Refund.status`

`PENDING → SUCCESS | PENDING (retry) | PENDING_MANUAL (cần người xử lý)`

### 9.3. Ghi chú quan trọng khi thiết kế dữ liệu test

- `amount` trong DB là VND nguyên (BigDecimal, scale 2); khi gửi tới VNPAY phải nhân 100 (`vnp_Amount`) — mọi test liên quan tới amount phải kiểm tra cả 2 đơn vị.
- `txnRef` là UUID sinh mới **mỗi lần initiate** (kể cả khi reuse Payment PENDING cũ) — không giả định `txnRef` bất biến giữa các lần gọi initiate liên tiếp.
- Test refund luôn cần dựng sẵn ít nhất 1 Payment `status=SUCCESS` với `amount` cố định, và danh sách `Refund` với `status=SUCCESS` để tính đúng `sumSuccessfulRefunds` (chỉ cộng refund có status SUCCESS, bỏ qua PENDING/FAILED/PENDING_MANUAL).
