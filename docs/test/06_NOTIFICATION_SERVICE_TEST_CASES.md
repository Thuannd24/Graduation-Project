# TEST CASE: NOTIFICATION SERVICE

> Nguồn đối chiếu: code thật tại `BE/notification-service/src/main/java/com/ecommerce/notificationservice/**` (ưu tiên) và tài liệu `docs/services/06_NOTIFICATION_SERVICE.md` (tham khảo ngữ cảnh).
> Ngày viết: 2026-07-14 (rút gọn từ bản 57 test case, tập trung các luồng quan trọng)

---

## 0. Phạm vi (Scope)

Bộ test case này đã được **rút gọn**, tập trung vào các luồng quan trọng nhất của `notification-service`, bỏ qua các test case validate field/lẻ tẻ không ảnh hưởng nghiệp vụ chính:

1. **NotificationTemplateSeeder** — seed 7 template mặc định khi DB rỗng, không tạo trùng khi đã tồn tại.
2. **TemplateRenderer** — render placeholder `{{key}}` bằng giá trị động, và các edge case quan trọng (thiếu biến, HTML không escape).
3. **NotificationServiceImpl** — chọn template, render nội dung, gửi email thật qua `JavaMailSender`, giả lập push FCM, lưu `Notification`.
4. **NotificationKafkaConsumer** — 2 listener `order-events` và `payment-events`, map `eventType` → template tương ứng, và **đặc biệt là hành vi xử lý event trùng lặp (idempotency)**.
5. **NotificationController** / **InternalNotificationController** — các API chính, ưu tiên các case liên quan bảo mật/dữ liệu sai lệch.

### ⚠️ Sai khác quan trọng giữa code thật và tài liệu thiết kế `06_NOTIFICATION_SERVICE.md`

Các test case dưới đây được viết dựa trên **hành vi thực tế của code**. Những điểm lệch so với tài liệu/quy ước `BE/CLAUDE.md` được đánh dấu **[GAP]**:

| # | Tài liệu / Quy ước mong đợi | Code thật hiện tại | Ảnh hưởng |
|---|---|---|---|
| G1 | `BE/CLAUDE.md` mục "Idempotent Consumer": consumer phải kiểm tra trùng theo `(orderId, eventType)` trước khi xử lý | `NotificationKafkaConsumer` **không có bất kỳ bước kiểm tra trùng lặp nào** trước khi gọi `notificationService.sendNotification(...)`. `NotificationRepository` cũng không có method `findByOrderIdAndEventType` | Event bị Kafka gửi lại (retry/rebalance) → gửi **email trùng** nhiều lần cho cùng 1 đơn hàng — **đây là gap quan trọng nhất được phát hiện trong service này** |
| G2 | Tài liệu: consumer lắng nghe nhiều loại event hơn (`OrderShippedEvent`, `RefundCompletedEvent`, `UserRegisteredEvent`...) | Code thật chỉ xử lý `OrderConfirmedEvent`, `OrderCancelledEvent` (order-events) và `PaymentSuccessEvent`, `PaymentFailedEvent` (payment-events) | Các event ngoài danh sách trên bị **bỏ qua âm thầm** (ack luôn, không log lỗi) |
| G3 | Tài liệu: gửi SMS qua Twilio/ESMS, Push qua Firebase HTTP API thật | Code thật: phần "push" trong `NotificationServiceImpl.dispatch()` chỉ **log**, không gọi FCM thật. `deliveryResults` luôn ghi cứng `"PUSH:SENT"` | Trạng thái giao hàng cho kênh Push/SMS trong log là **giả** |
| G5 | Tài liệu: seed 1 lần khi DB rỗng | `NotificationTemplateSeeder.run()` **luôn ghi đè** nội dung template mỗi lần service khởi động (upsert theo `code`) | Nội dung template bị **tự động cập nhật lại** mỗi lần deploy/restart, dù admin đã sửa tay trong DB |
| G6 | — | Nếu `mailSender` (Optional) không được cấu hình, `Notification.status` vẫn được set = `"SENT"` giả dù không gửi email thật | Dữ liệu thống kê "đã gửi" sai lệch khi môi trường không cấu hình SMTP |
| G7 | — | `TemplateRenderer.render()` không escape HTML — biến động được nội suy trực tiếp vào HTML email | Rủi ro HTML/script injection nếu nguồn input chưa được sanitize từ trước |

Các test case liên quan G1–G7 vẫn được viết đầy đủ theo đúng **hành vi hiện tại** (Expected Result phản ánh code thật) và có ghi chú `[GAP]` để phân biệt với hành vi "đúng" theo spec/CLAUDE.md.

---

## 1. Module: NotificationTemplateSeeder (seed template khi khởi động)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-NOTI-001 | NotificationTemplateSeeder.run() | Unit | Seed đủ 7 template mặc định khi collection `notification_templates` rỗng | DB Mongo test rỗng | Khởi tạo seeder với repository mock rỗng → gọi `run(args)` | `templateRepository.save()` được gọi đúng 7 lần với 7 `code` mặc định (`welcome_template`, `sms_otp_template`, `promotion_voucher_template`, `order_confirmed_template`, `order_cancelled_template`, `payment_success_template`, `payment_failed_template`), mỗi template có `name`, `titleTemplate`, `bodyTemplate` non-blank và `channel` đúng | High |
| UT-NOTI-002 | NotificationTemplateSeeder.run() | Unit | Không tạo document mới (không duplicate) nếu template đã tồn tại theo `code` | DB đã có sẵn 7 template | Gọi lại `run(args)` lần thứ 2 | `findByCode(code)` trả về Optional có giá trị cho cả 7 code → giữ nguyên `_id` → tổng số document vẫn là 7 (không tăng lên 14) | High |
| UT-NOTI-003 | NotificationTemplateSeeder.run() | Unit | **[GAP-G5]** Nội dung template bị ghi đè khi service restart, dù dữ liệu trong DB đã bị sửa tay | Template `order_confirmed_template` đã bị admin sửa tay `titleTemplate` (giả lập chỉnh trực tiếp Mongo) | Gọi lại `run(args)` | `titleTemplate` bị **ghi đè lại** thành giá trị hard-code trong `NotificationTemplateSeeder.java`, giá trị admin sửa tay bị mất — xác nhận hành vi "upsert luôn", không phải "seed nếu chưa có" | Medium |

---

## 2. Module: TemplateRenderer (render biến động)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-NOTI-004 | TemplateRenderer.render() | Unit | Render đúng khi có đầy đủ biến, kể cả tiếng Việt có dấu và ký tự đặc biệt | — | `render("Đơn #{{orderId}} của {{customerName}}", {orderId:"1024", customerName:"Đặng Thị Ngọc Ánh"})` | Trả về đúng nguyên vẹn UTF-8, thay thế đúng từng placeholder, không làm sai lệch dấu tiếng Việt, không escape `&`/`%` | High |
| UT-NOTI-005 | TemplateRenderer.render() | Unit | Gộp các edge case: template null/blank, map biến null/rỗng, placeholder thiếu key tương ứng | — | `render(null,...)`, `render("",...)`, `render("Chào {{email}}", null)`, `render("Đơn {{orderId}} - {{shipperName}}", {orderId:"5"})` | Template null/blank → trả về `""` (không NPE). Map null/rỗng → trả về template nguyên bản, placeholder giữ literal. Key thiếu trong map → placeholder tương ứng giữ nguyên `{{shipperName}}` (lộ ra ngoài email — defect UX cần lưu ý) | High |
| UT-NOTI-006 | TemplateRenderer.render() | Unit | **[GAP-G7]** Biến chứa HTML/script không bị escape | — | `render("Chào {{customerName}}", {customerName: "<script>alert(1)</script>"})` | Kết quả trả về **chứa nguyên literal** `<script>alert(1)</script>` — không có escaping/sanitize. Ghi nhận là rủi ro nếu giá trị biến có nguồn từ input người dùng chưa được làm sạch ở service khác | Medium |

---

## 3. Module: NotificationServiceImpl — resolveMessage / dispatch (gửi email thật)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-NOTI-007 | NotificationServiceImpl.sendNotification(request) | Unit | Gửi thành công với `templateId` hợp lệ và `mailSender` cấu hình OK | Template `order_confirmed_template` tồn tại; `JavaMailSender` mock trả về thành công | `sendNotification(SendNotificationRequest{userId:"U1", email:"a@example.com", orderId:100L, eventType:"OrderConfirmedEvent", templateId:"order_confirmed_template"})` | `mailSender.send(...)` được gọi 1 lần đúng `to`; `Notification` được lưu với `status` cuối = `"SENT"`, `subject` đã render `{{orderId}}` (chứa `"Đơn #100"`), `deliveryResults="EMAIL:SENT; PUSH:SENT"` | High |
| UT-NOTI-008 | NotificationServiceImpl.resolveMessage() | Unit | Render đúng `subject` và `content` từ template theo biến trong `templateVariables` + biến tự động (`orderId`, `email`, `userId`) | Template `payment_success_template` tồn tại | `sendNotification(request)` với `orderId=555L`, `templateVariables={"customerName":"Trần Thị B"}` | `subject` render ra `"💳 Thanh toán thành công — Đơn #555"`; `content` (HTML) chứa `#555` tại vị trí order badge | High |
| UT-NOTI-009 | NotificationServiceImpl.resolveMessage() | Unit | **Template không tồn tại/đã bị xoá** khi cần dùng → ném lỗi, không gửi được | Template `"template_khong_ton_tai"` **không có** trong DB | `sendNotification(SendNotificationRequest{... templateId:"template_khong_ton_tai"})` | Ném `IllegalArgumentException("Notification template not found: template_khong_ton_tai")`. `notificationRepository.save()` **không được gọi** → không có `Notification` nào được tạo, không gửi email | High |
| UT-NOTI-010 | NotificationServiceImpl.resolveMessage() | Unit | Không truyền `templateId` → dùng `subject`/`content` raw từ request (nếu có) hoặc giá trị mặc định (nếu không có), vẫn render biến động | — | (a) `sendNotification` không set `templateId`, set `subject="Xin chào {{userId}}"`, `content="Nội dung {{orderId}}"`. (b) không set gì ngoài `userId`, `email`, `orderId` | (a) `subject`="Xin chào U9", `content`="Nội dung 9" (render qua `TemplateRenderer`, không cần DB template). (b) `subject` = `DEFAULT_SUBJECT` ("Thông báo từ E-Commerce"), `content` = render của `DEFAULT_BODY` | Medium |
| UT-NOTI-011 | NotificationServiceImpl.dispatch() | Unit | Gửi tới địa chỉ email không hợp lệ (`email` rỗng/null) → fallback sang email giả theo `userId` | Request có `email=""`/`null`, `userId="U77"` | `sendNotification(request)` | `emailRecipient` được set = `"U77@ecommerce.com"` (không validate format email thật). `Notification.recipient` lưu giá trị này, email được gửi tới địa chỉ giả này thay vì email thật của khách — ghi nhận là hành vi hiện tại (không có `@Email` validate ở `@RequestBody`) | High |
| UT-NOTI-012 | NotificationServiceImpl.dispatch() | Unit | **SMTP/mail server lỗi** khi gửi (VD: `MailSendException`, timeout kết nối) | `JavaMailSender` mock ném `MailSendException` khi gọi `send(preparator)` | `sendNotification(request)` với template hợp lệ | Exception bị **catch nội bộ** trong `dispatch()` (log lỗi), **không** rethrow ra ngoài → `Notification.status` cuối = `"FAILED"`, vẫn được lưu vào DB. **Không có cơ chế retry tự động nào ở tầng service** | High |
| UT-NOTI-013 | NotificationServiceImpl.dispatch() | Unit | **[GAP-G6]** `mailSender` không được cấu hình (Optional rỗng — môi trường không set SMTP) | `Optional<JavaMailSender>` inject rỗng | `sendNotification(request)` với template hợp lệ | Log "Simulating email dispatch..."; **không gọi** `send()`; nhưng `Notification.status` vẫn được set = `"SENT"` (vì `!mailSender.isPresent()` = `true`) → **trạng thái SENT giả**, email thực tế **không được gửi** | High |
| UT-NOTI-014 | NotificationServiceImpl.dispatch() | Unit | Push FCM: gộp case user có nhiều token và user không có token nào | (a) `FCMTokenRepository.findByUserId("U1")` trả về 2 token. (b) `findByUserId("U2")` trả về list rỗng | `sendNotification(request)` với `userId="U1"` và với `userId="U2"` | (a) Mỗi token có 1 dòng log "Simulating FCM Push..." (không gọi Firebase thật), `deliveryResults` luôn kết thúc `"PUSH:SENT"` bất kể kết quả thật. (b) Log "No FCM tokens registered... Skipping push notification" — luồng gửi email vẫn tiếp tục bình thường, không lỗi | Medium |

---

## 4. Module: NotificationKafkaConsumer — topic `order-events`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-NOTI-001 | consumeOrderEvent() | Integration | Nhận `OrderConfirmedEvent` hợp lệ → gửi đúng email "xác nhận đơn hàng" | Kafka test container/embedded, template `order_confirmed_template` đã seed, mail server test (GreenMail/MailHog) chạy | Publish `{"eventType":"OrderConfirmedEvent","orderId":1001,"userId":"U1","email":"khachhang@example.com"}` lên `order-events` | Consumer build `SendNotificationRequest{templateId:"order_confirmed_template", orderId:1001, email:"khachhang@example.com"}` → email thật được gửi tới đúng địa chỉ, subject chứa `"#1001"`; `Notification.eventType="OrderConfirmedEvent"`, `status="SENT"`; `ack.acknowledge()` được gọi | High |
| IT-NOTI-002 | consumeOrderEvent() | Integration | Nhận `OrderCancelledEvent` hợp lệ → gửi đúng email "đơn hàng bị hủy" | Tương tự IT-NOTI-001, dùng template `order_cancelled_template` | Publish `{"eventType":"OrderCancelledEvent","orderId":1002,"userId":"U2","email":"b@example.com"}` | `templateId="order_cancelled_template"` được chọn đúng, subject render `"❌ Đơn hàng #1002 đã bị hủy"`, `Notification.eventType="OrderCancelledEvent"` | High |
| IT-NOTI-003 | consumeOrderEvent() | Integration | Event `eventType` không thuộc danh sách xử lý (VD `OrderShippedEvent`) → bị bỏ qua âm thầm **[GAP-G2]** | Consumer chỉ handle 2 loại event của order-events | Publish `{"eventType":"OrderShippedEvent","orderId":1003,"userId":"U3","email":"c@example.com"}` | `notificationService.sendNotification()` **không được gọi**, không có `Notification` mới, **không log lỗi** (silent no-op), `ack.acknowledge()` vẫn được gọi (message coi như đã xử lý xong) | High |
| IT-NOTI-004 | consumeOrderEvent() | Integration | Payload lỗi định dạng hoặc thiếu field bắt buộc (`eventType`/`orderId`) | — | Publish JSON malformed (`"{orderId: 100,"`) hoặc thiếu `eventType`/`orderId` | Exception (parse lỗi hoặc NPE khi đọc field null) bị catch trong consumer → log lỗi → `ack.acknowledge()` vẫn được gọi → **message bị drop, không retry**, không có `Notification` nào được tạo | Medium |
| IT-NOTI-005 | consumeOrderEvent() | Integration | Template cần dùng (`order_confirmed_template`) **đã bị xoá** khỏi DB trước khi consumer xử lý event | Xoá document `order_confirmed_template` khỏi `notification_templates` trước khi publish event | Publish `{"eventType":"OrderConfirmedEvent","orderId":1007,"userId":"U7","email":"f@example.com"}` | `sendNotification()` ném `IllegalArgumentException` → bị catch trong consumer → log lỗi → `ack.acknowledge()` vẫn được gọi → **không có Notification nào được tạo, không gửi email, không retry** — khách hàng **không nhận được thông báo xác nhận đơn hàng** mà không ai biết (chỉ 1 dòng log ERROR) | High |

---

## 5. Module: NotificationKafkaConsumer — topic `payment-events`

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-NOTI-006 | consumePaymentEvent() | Integration | Nhận `PaymentSuccessEvent` hợp lệ → gửi đúng email "thanh toán thành công" | Template `payment_success_template` đã seed | Publish `{"eventType":"PaymentSuccessEvent","orderId":2001,"userId":"U8","email":"g@example.com"}` lên `payment-events` | `templateId="payment_success_template"` được chọn, subject render `"💳 Thanh toán thành công — Đơn #2001"`, email gửi đúng địa chỉ, `Notification.eventType="PaymentSuccessEvent"`, `status="SENT"` | High |
| IT-NOTI-007 | consumePaymentEvent() | Integration | Nhận `PaymentFailedEvent` hợp lệ → gửi đúng email "thanh toán thất bại" | Template `payment_failed_template` đã seed | Publish `{"eventType":"PaymentFailedEvent","orderId":2002,"userId":"U9","email":"h@example.com"}` | `templateId="payment_failed_template"`, subject render `"⚠️ Thanh toán thất bại — Đơn #2002"` | High |
| IT-NOTI-008 | consumePaymentEvent() | Integration | Event `RefundCompletedEvent` (có trong tài liệu nhưng chưa implement) **[GAP-G2]** | — | Publish `{"eventType":"RefundCompletedEvent","orderId":2004,"userId":"U11","email":"j@example.com"}` | Không có nhánh `if/else` nào khớp → không gửi thông báo nào, không tạo `Notification`, `ack.acknowledge()` vẫn được gọi — **khách hàng hoàn tiền không nhận được email xác nhận hoàn tiền** dù nghiệp vụ đã hoàn tiền thành công ở Payment Service | High |
| IT-NOTI-009 | consumePaymentEvent() | Integration | SMTP server down toàn bộ khi consumer đang xử lý nhiều event liên tiếp | Mock/stop mail server (GreenMail) trước khi publish | Publish liên tiếp 3 event `PaymentSuccessEvent` cho 3 `orderId` khác nhau trong khi SMTP không khả dụng | Với mỗi event: lỗi gửi mail bị catch trong `dispatch()` → `Notification.status="FAILED"` cho cả 3, nhưng Kafka **vẫn commit offset** (lỗi mail không lan ra ngoài để consumer retry) → 3 message coi như "đã xử lý" nhưng thực chất **không có email nào được gửi** | High |

---

## 6. Module: Idempotency — chống gửi trùng khi Kafka retry / duplicate message [GAP-G1]

> Đây là gap quan trọng nhất phát hiện được: consumer **không có** bước kiểm tra trùng theo `(orderId, eventType)` như `BE/CLAUDE.md` yêu cầu. Các test case dưới đối chiếu hành vi kỳ vọng và hành vi thực tế để làm rõ gap này.

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-NOTI-010 | consumeOrderEvent() | Integration | Kafka gửi lại (retry) đúng 1 message `OrderConfirmedEvent` 2 lần liên tiếp cho cùng `orderId` (VD: consumer restart giữa lúc xử lý trước khi ack kịp, hoặc broker redeliver do rebalance) | Template `order_confirmed_template` đã seed, mail server test hoạt động | Publish 2 lần **cùng nội dung** `{"eventType":"OrderConfirmedEvent","orderId":3001,"userId":"U12","email":"k@example.com"}` lên `order-events` | **Kỳ vọng theo CLAUDE.md**: chỉ 1 `Notification` được tạo, chỉ 1 email được gửi cho cặp `orderId=3001` + `eventType=OrderConfirmedEvent`. **Hành vi thực tế**: do không có bước kiểm tra trùng, `dispatch()` được gọi 2 lần độc lập → **2 document `Notification` riêng biệt** và **2 email trùng nội dung được gửi thật tới khách hàng** → **FAIL** so với yêu cầu idempotency, cần bổ sung unique index/check theo `(orderId, eventType)` trước khi gọi `dispatch()` | High |
| IT-NOTI-011 | consumePaymentEvent() | Integration | Retry trùng lặp cho `PaymentSuccessEvent` (đúng orderId, đúng eventType) | Tương tự IT-NOTI-010 nhưng cho topic `payment-events` | Publish 2 lần `{"eventType":"PaymentSuccessEvent","orderId":3002,"userId":"U13","email":"l@example.com"}` | Tương tự: thực tế tạo 2 `Notification`, gửi 2 email "thanh toán thành công" cho khách — xác nhận gap G1 áp dụng cho cả 2 Kafka listener | High |
| IT-NOTI-012 | consumeOrderEvent() + consumePaymentEvent() | Integration | Nhiều `eventType` khác nhau dồn về cùng lúc cho **cùng 1 orderId** (VD: `OrderConfirmedEvent` và `PaymentSuccessEvent` cho `orderId=3003`) — phân biệt với case duplicate thật ở trên | Cả 2 topic có message cho `orderId=3003` | Publish gần đồng thời: `order-events` → `OrderConfirmedEvent` và `payment-events` → `PaymentSuccessEvent`, cùng `orderId=3003` | Đây là 2 `eventType` khác nhau cho cùng `orderId` nên **đều hợp lệ, không phải duplicate** — kỳ vọng 2 `Notification` riêng được tạo, khách nhận đủ 2 email, không xung đột nhau (mỗi `@KafkaListener` có consumer riêng) | Medium |
| UT-NOTI-016 | NotificationRepository | Unit | Không tồn tại method truy vấn trùng lặp theo `(orderId, eventType)` | Đọc `NotificationRepository` | Kiểm tra interface `NotificationRepository` | Xác nhận **không có** method như `existsByOrderIdAndEventType(Long orderId, String eventType)` — đây là thiếu sót cần bổ sung để hiện thực hoá idempotency theo CLAUDE.md | Medium |

---

## 7. Module: NotificationController / InternalNotificationController (REST API)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-NOTI-013 | GET /api/v1/notifications | Integration | Lấy danh sách thông báo của user hiện tại (qua header `X-User-Id`), sắp xếp mới nhất trước | DB có sẵn 2 `Notification` cho `userId="U20"` | `GET /api/v1/notifications` với header `X-User-Id: U20` | HTTP 200, `ApiResponse.code="SUCCESS"`, `data` là list 2 `NotificationDto`, thứ tự mới nhất trước | High |
| IT-NOTI-014 | POST /api/v1/notifications/fcm-token | Integration | Đăng ký FCM token mới, và trường hợp token đã tồn tại bị đăng ký lại từ user khác (thiết bị đổi chủ) | (a) Header `X-User-Id: U21`. (b) Token `"tok-xyz"` đã gắn `userId="U21"` | (a) `POST .../fcm-token` body `{"fcmToken":"tok-xyz","platform":"ANDROID","deviceId":"dev-1"}`. (b) `POST .../fcm-token` header `X-User-Id: U22` cùng token | (a) HTTP 200, document mới trong `fcm_tokens` với `userId="U21"`. (b) HTTP 200, token được **cập nhật** sang `userId="U22"` — U21 mất quyền nhận push qua token này mà không có cảnh báo, xác nhận không có kiểm tra "token đang được dùng bởi user khác" | Medium |
| IT-NOTI-015 | POST /api/internal/notifications/send | Integration | Endpoint internal gửi thông báo trực tiếp (không qua Kafka), dùng `templateId` hợp lệ | Template `welcome_template` tồn tại | `POST /api/internal/notifications/send` body `{"userId":"U23","email":"m@example.com","eventType":"UserRegisteredEvent","templateId":"welcome_template"}` | HTTP 200, `ApiResponse.code="SUCCESS"`; email chào mừng được gửi; `Notification.eventType="UserRegisteredEvent"` | Medium |
| IT-NOTI-016 | POST /api/internal/notifications/send | Integration | Endpoint internal với `templateId` không tồn tại → lỗi 500 không có `GlobalExceptionHandler` riêng | — | `POST /api/internal/notifications/send` body `{"userId":"U24","templateId":"template_sai"}` | `IllegalArgumentException` không bị catch ở controller → **HTTP 500 mặc định của Spring Boot** (có thể lộ stack trace nếu `server.error.include-stacktrace` không tắt) — cần verify theo `BE/CLAUDE.md` mục VII (không được lộ raw stack trace) | High |
| UT-NOTI-017 | InternalNotificationController — auth | Unit/Static | Endpoint internal không yêu cầu xác thực JWT/API-key | Đọc code `InternalNotificationController` | Kiểm tra annotation trên class/method | Xác nhận **không có** `@PreAuthorize`, filter JWT, hay kiểm tra API key/internal-secret nào bảo vệ `/api/internal/notifications/send` — nếu endpoint lộ ra ngoài (không chỉ giới hạn network nội bộ/gateway), bất kỳ ai gọi được cũng có thể spam gửi email tuỳ ý (`email` là input tự do, không validate) | High |

---

## 8. Edge case tổng hợp

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-NOTI-017 | Kafka consumer — nhiều event dồn về / nhiều loại event liên tiếp cho cùng đơn hàng | Integration | Burst nhiều event khác `orderId` gần đồng thời, và trường hợp 1 đơn hàng nhận 2 loại event khác nhau cách nhau vài ms (VD `OrderConfirmedEvent` rồi `OrderCancelledEvent`) | Template đã seed, mail server test | Publish liên tiếp nhiều message `OrderConfirmedEvent` cho các `orderId` khác nhau trong <1 giây; và publish `OrderConfirmedEvent` rồi `OrderCancelledEvent` liên tiếp cho cùng 1 `orderId` | Mỗi message được xử lý đúng, không lẫn dữ liệu giữa các message (không có shared mutable state race condition). Với 2 event khác `eventType` cho cùng đơn hàng: cả 2 email đều được gửi (không bị coi là duplicate vì `eventType` khác nhau) — khách có thể nhận cả email "đặt hàng thành công" và "đã hủy" gần như cùng lúc, là hạn chế UX cần lưu ý nhưng đúng theo logic hiện tại | Low |

---

## 9. Bảng tổng hợp Test ID theo module

| Module | Test ID range |
|---|---|
| NotificationTemplateSeeder | UT-NOTI-001 → UT-NOTI-003 |
| TemplateRenderer | UT-NOTI-004 → UT-NOTI-006 |
| NotificationServiceImpl (unit) | UT-NOTI-007 → UT-NOTI-014 |
| Kafka consumer — order-events | IT-NOTI-001 → IT-NOTI-005 |
| Kafka consumer — payment-events | IT-NOTI-006 → IT-NOTI-009 |
| Idempotency / duplicate event [GAP-G1] | IT-NOTI-010 → IT-NOTI-012, UT-NOTI-016 |
| REST API (Notification/Internal Controller) | IT-NOTI-013 → IT-NOTI-016, UT-NOTI-017 |
| Edge case tổng hợp | IT-NOTI-017 |

**Tổng số test case:** 33 (17 Unit Test, 16 Integration Test) — rút gọn từ bản đầy đủ 57 test case (giảm ~42%), tập trung vào các luồng quan trọng: consumer nhận đúng event → gửi đúng email, render template theo biến động, seeder khởi tạo template, và đặc biệt gap idempotency. Các test case validate field thiếu/lẻ tẻ, load test nhẹ, và các trường hợp không ảnh hưởng nghiệp vụ chính đã được gộp hoặc bỏ qua theo yêu cầu.

**Khuyến nghị ưu tiên xử lý defect trước khi ra release (theo mức độ ảnh hưởng thực tế phát hiện qua test case):**
1. G1 — Bổ sung idempotency check `(orderId, eventType)` trong `NotificationKafkaConsumer` trước khi gọi `sendNotification()` (liên quan IT-NOTI-010, IT-NOTI-011).
2. IT-NOTI-005 / UT-NOTI-009 — Template bị thiếu làm mất thông báo hoàn toàn, không retry, không alert admin — cần bắt riêng exception này để lưu `Notification` với `status=FAILED` thay vì để mất trắng.
3. UT-NOTI-013 (G6) — Trạng thái `SENT` giả khi `mailSender` không cấu hình cần sửa thành `FAILED`/`SKIPPED` để không sai lệch số liệu.
4. UT-NOTI-017 — Xác thực/giới hạn truy cập cho `/api/internal/notifications/send` nếu endpoint có thể bị gọi từ ngoài network nội bộ.
