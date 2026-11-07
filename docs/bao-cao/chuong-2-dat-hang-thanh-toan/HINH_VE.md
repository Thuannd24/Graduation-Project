# Bộ sơ đồ đặt hàng và thanh toán

Đối chiếu source local ngày 06/11/2026; hoàn tất bộ render ngày 07/11/2026. [Mở mục lục ảnh](diagrams/index.html) · [Đối chiếu mã nguồn](diagrams/DOI_CHIEU_2026-11-06.md).

Các hình lớn nên đọc bằng SVG có phóng to. Mã DH-1…DH-4 và TT-1…TT-4 là mã tạm để nhóm đổi theo mục lục báo cáo.

## UC04.1 — Đặt hàng

### Use case

Use case phân biệt preview với tạo đơn thực sự, chỉ rõ product-service, inventory-service, promotion-service và user-service ở ngoài ranh giới phân hệ. Voucher và điểm là hành vi có điều kiện. Preview không được vẽ thành API bắt buộc phải thành công trước checkout.

![Đặt hàng — Use case](diagrams/dat-hang/01-use-case.svg)

**Hình DH-1.** Đặt hàng — Use case, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/dat-hang/01-use-case.svg) · [PNG](diagrams/dat-hang/01-use-case.png) · [PlantUML](diagrams/dat-hang/01-use-case.puml)

### Activity

Activity phân làn CheckoutPage, OrderController/OrderServiceImpl, Redis, các dịch vụ gRPC/Feign và MariaDB/JPA. Luồng thể hiện idempotency, đọc lại giá, giữ tồn từng item, TX1, ưu đãi, TX2 và xử lý lỗi trước/sau commit.

![Đặt hàng — Activity](diagrams/dat-hang/02-activity.svg)

**Hình DH-2.** Đặt hàng — Activity, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/dat-hang/02-activity.svg) · [PNG](diagrams/dat-hang/02-activity.png) · [PlantUML](diagrams/dat-hang/02-activity.puml)

### Sequence

Sequence đã được duyệt làm mẫu: 15 lifeline với controller, service, client, repository và database thực tế. Transaction lưu đơn, các lần cập nhật giá và transaction Outbox được tách rõ. Những phần rút gọn có khung ref và bảng đối chiếu riêng.

![Đặt hàng — Sequence](diagrams/dat-hang/03-sequence.svg)

**Hình DH-3.** Đặt hàng — Sequence, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/dat-hang/03-sequence.svg) · [PNG](diagrams/dat-hang/03-sequence.png) · [PlantUML](diagrams/dat-hang/03-sequence.puml)

### Trạng thái

State theo Order.status, bao gồm PENDING, AWAITING_PAYMENT, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, RETURNING và RETURNED. Trigger từ consumer, người dùng, quản trị và shipping webhook được ghi trên cạnh; không đồng nhất CONFIRMED với đã thu tiền.

![Đặt hàng — Trạng thái](diagrams/dat-hang/04-state.svg)

**Hình DH-4.** Đặt hàng — Trạng thái, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/dat-hang/04-state.svg) · [PNG](diagrams/dat-hang/04-state.png) · [PlantUML](diagrams/dat-hang/04-state.puml)

## UC04.2 — Thanh toán

### Use case

Use case bao gồm VNPay, COD, retry, callback, đọc trạng thái và các nghiệp vụ hoàn tiền. VNPay và order-service là actor ngoài phân hệ. Quyền ADMIN hoàn tiền được tách với quyền ADMIN/STAFF xem trạng thái; scheduler là thành phần nội bộ.

![Thanh toán — Use case](diagrams/thanh-toan/01-use-case.svg)

**Hình TT-1.** Thanh toán — Use case, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/thanh-toan/01-use-case.svg) · [PNG](diagrams/thanh-toan/01-use-case.png) · [PlantUML](diagrams/thanh-toan/01-use-case.puml)

### Activity

Activity mô tả khởi tạo, kiểm tra lượt cũ, nhánh COD/VNPay và xử lý callback hiện tại/cũ/muộn. Request callback là tương tác độc lập. Browser nhận redirect rồi FE đọc trạng thái chính thức; IPN nhận JSON xác nhận xử lý.

![Thanh toán — Activity](diagrams/thanh-toan/02-activity.svg)

**Hình TT-2.** Thanh toán — Activity, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/thanh-toan/02-activity.svg) · [PNG](diagrams/thanh-toan/02-activity.png) · [PlantUML](diagrams/thanh-toan/02-activity.puml)

### Sequence

Sequence chỉ rõ PaymentController, PaymentServiceImpl, WebhookController, Redis, Order, các repository, MariaDB, VNPay, CDC, Kafka và PaymentScheduler. Gọi Order/QueryDR ở ngoài transaction Payment; callback lưu Payment/log/Outbox trong transaction. Các ref mô tả lượt cũ, scheduler, consumer và worker hoàn tiền.

![Thanh toán — Sequence](diagrams/thanh-toan/03-sequence.svg)

**Hình TT-3.** Thanh toán — Sequence, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/thanh-toan/03-sequence.svg) · [PNG](diagrams/thanh-toan/03-sequence.png) · [PlantUML](diagrams/thanh-toan/03-sequence.puml)

### Trạng thái

State theo Payment.status với đủ bảy trạng thái được ghi trong service, bao gồm PARTIALLY_REFUNDED và REFUNDED. Chú thích phân biệt Refund PENDING/PENDING_MANUAL với Payment REFUND_PENDING; COD vẫn PENDING cho tới sự kiện giao thành công.

![Thanh toán — Trạng thái](diagrams/thanh-toan/04-state.svg)

**Hình TT-4.** Thanh toán — Trạng thái, đối chiếu thành phần và hành vi trong code.

[SVG](diagrams/thanh-toan/04-state.svg) · [PNG](diagrams/thanh-toan/04-state.png) · [PlantUML](diagrams/thanh-toan/04-state.puml)

## Lưu ý khi thuyết minh

Tạo đơn và khởi tạo thanh toán là hai API riêng. Order CONFIRMED có thể là đã chọn COD trong khi Payment vẫn PENDING. Callback trả RspCode=00 chỉ xác nhận đã xử lý webhook; kết quả thu tiền phải đọc từ Payment. Lượt VNPay thất bại/hết hạn chưa tự hủy Order. Hủy sau giao vận đi qua RETURNING rồi RETURNED trước khi hoàn kho/tiền qua cancellation event.

Các transaction chỉ cục bộ trong từng service. Outbox/CDC và consumer không bảo đảm thứ tự so với HTTP response. Xem bảng đối chiếu để biết điều kiện của từng nhánh, phần được rút gọn và giới hạn kiểm chứng.
