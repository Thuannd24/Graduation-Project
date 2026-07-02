# Kịch Bản Kiểm Thử Quy Trình Đặt Hàng - Thanh Toán - Giao Vận (E-commerce Order & Payment Workflow)

Tài liệu này hướng dẫn chi tiết các kịch bản kiểm thử (Test Cases) từ lúc khách hàng tạo đơn, lựa chọn phương thức thanh toán (COD hoặc VNPAY), cho đến khi Admin xác nhận, shipper giao hàng thành công hoặc hủy đơn.

---

## 🛠️ Chuẩn bị trước khi test
1. Đảm bảo toàn bộ các microservices (`api-gateway`, `order-service`, `payment-service`, `product-service`, `notification-service`) và các hạ tầng (`Kafka`, `MariaDB`, `Redis`) đang chạy.
2. Trình duyệt đã đăng nhập bằng 2 tài khoản khác nhau:
   * **Khách hàng:** Để thực hiện đặt hàng và xem chi tiết đơn hàng cá nhân.
   * **Admin/Staff:** Đăng nhập vào trang Admin Dashboard (`/admin`) để quản trị đơn hàng.

---

## 📋 Bảng tổng hợp các kịch bản kiểm thử

| ID | Tên kịch bản | Phương thức | Mô tả ngắn gọn | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Quy trình COD thành công | COD | Đặt hàng COD -> Giao hàng -> Giao thành công. | Giao dịch tự động chuyển SUCCESS sau khi giao hàng thành công. |
| **TC-02** | Hủy đơn hàng COD | COD | Đặt hàng COD -> Khách hàng hoặc Admin hủy đơn sớm. | Đơn hàng chuyển sang CANCELLED, hoàn tồn kho tự động. |
| **TC-03** | Quy trình VNPAY thành công | VNPAY | Đặt hàng VNPAY -> Quét mã QR thành công -> Giao hàng -> Hoàn thành. | Thanh toán SUCCESS ngay lập tức, đơn chuyển CONFIRMED để Admin giao hàng. |
| **TC-04** | Khách hủy thanh toán VNPAY | VNPAY | Đặt hàng VNPAY -> Nhấn nút "Hủy thanh toán" trên cổng VNPAY. | Đơn hàng tự động đổi sang CANCELLED, giải phóng tồn kho. |
| **TC-05** | Hết hạn thanh toán VNPAY | VNPAY | Đặt hàng VNPAY -> Không quét mã QR, đợi hết 15 phút. | Scheduler quét ngầm chuyển giao dịch thành EXPIRED, đơn thành CANCELLED. |
| **TC-06** | Cố tình thanh toán đơn đã hủy | VNPAY | Đặt hàng VNPAY -> Admin hủy đơn -> Khách vẫn quét QR thanh toán thành công. | Hiện banner đỏ cảnh báo đơn đã hủy, không chuyển đơn thành CONFIRMED. |

---

## 📑 Chi tiết các bước thực hiện & Kết quả mong đợi

### 🟢 TC-01: Quy trình Ship COD thành công
* **Mục tiêu:** Kiểm tra luồng giao dịch trả sau (COD) từ lúc đặt hàng đến khi nhận tiền mặt.
* **Các bước thực hiện:**
  1. Khách hàng thêm sản phẩm vào giỏ hàng và tiến hành checkout.
  2. Tại trang checkout, chọn phương thức thanh toán **Thanh toán khi nhận hàng (COD)** và nhấn Đặt hàng.
  3. Hệ thống chuyển hướng khách hàng về trang xem đơn hàng.
  4. Admin vào Dashboard -> Tab **Quản lý đơn hàng** (Orders).
* **Kết quả mong đợi:**
  * **Trạng thái đơn hàng trên FE của khách:** `CONFIRMED` (Đã xác nhận).
  * **Trạng thái trên bảng Admin:** Đơn hàng nằm ở đầu danh sách (mới nhất), cột *Thanh toán* hiện badge màu xám `Ship COD`, trạng thái giao dịch màu vàng `PENDING`.
  * **Trong Drawer chi tiết (Saga timeline):** 
    * Bước 3 (Xác thực thanh toán) hiển thị màu xanh: *Ship COD - Đã xác nhận đơn hàng*.
    * Nút **Xác Nhận Giao Hàng** (Ship) và **Hủy Đơn Hàng** được hiển thị.
  5. Admin nhấn nút **Xác Nhận Giao Hàng** (Ship).
     * *Kết quả:* Trạng thái đổi sang `SHIPPED` (Đang giao hàng), hệ thống sinh ra mã vận đơn ảo (Ví dụ: `MOCK-GHTK-ABCD123`).
  6. Tại phần giả lập Webhook của Shipper ở góc dưới Drawer, Admin bấm nút **Đã Giao Thành Công**.
     * *Kết quả:* Trạng thái đơn hàng đổi sang `DELIVERED` (Đã giao hàng). Trạng thái giao dịch COD tự động cập nhật sang màu xanh `SUCCESS` (Vì tiền mặt đã được shipper thu hộ và bàn giao).

---

### 🔴 TC-02: Hủy đơn hàng COD
* **Mục tiêu:** Kiểm tra luồng hủy đơn và tự động hoàn trả số lượng kho.
* **Các bước thực hiện:**
  1. Khách hàng đặt đơn hàng COD mới.
  2. Tại trang Admin Dashboard hoặc trang quản lý của Khách hàng, nhấn nút **Hủy đơn hàng**.
* **Kết quả mong đợi:**
  * Trạng thái đơn hàng cập nhật ngay lập tức thành `CANCELLED`.
  * Số lượng sản phẩm mua trong kho (Redis & Database) được tự động cộng trả lại.
  * Phía Admin, các nút cập nhật trạng thái shipper bị **vô hiệu hóa (disabled)** để tránh chỉnh sửa đơn đã hủy.
  * Dòng thời gian Saga chuyển màu đỏ tại các bước tiếp theo để báo hiệu luồng bị ngắt.

---

### 🔵 TC-03: Quy trình thanh toán online VNPAY thành công
* **Mục tiêu:** Kiểm tra thanh toán online qua cổng VNPAY Sandbox và đồng bộ trạng thái giao vận.
* **Các bước thực hiện:**
  1. Khách hàng chọn mua sản phẩm, tiến hành Checkout bằng phương thức **Thanh toán qua VNPAY**.
  2. Hệ thống chuyển hướng sang cổng Sandbox của VNPAY.
  3. Khách hàng sử dụng thông tin thẻ test của VNPAY (Ví dụ: Ngân hàng NCB, số thẻ: `9704198526136101`, tên chủ thẻ: `NGUYEN VAN A`, ngày phát hành: `07/15`, OTP: `123456`) để hoàn tất thanh toán.
  4. VNPAY redirect trình duyệt của khách hàng quay trở lại website của bạn.
* **Kết quả mong đợi:**
  * Trình duyệt chuyển hướng về trang Chi tiết đơn hàng với tham số URL `?paymentStatus=00`.
  * Trên cùng trang hiển thị banner màu xanh lá: **"Thanh toán thành công qua cổng VNPAY! Đơn hàng của bạn đang được chuẩn bị để giao nhận."**
  * Trạng thái đơn hàng đổi thành `CONFIRMED`.
  * Tại Admin Dashboard, cột *Thanh toán* hiện badge màu tím `Online (VNPAY)` và trạng thái giao dịch màu xanh `SUCCESS`.
  * Admin lúc này mới được phép bấm nút **Xác Nhận Giao Hàng** (Ship) và tiến hành giao thành công như luồng bình thường.

---

### 🟠 TC-04: Khách hàng chủ động hủy thanh toán VNPAY
* **Mục tiêu:** Đảm bảo khi khách hàng từ chối thanh toán trên cổng VNPAY, đơn hàng sẽ chuyển sang trạng thái hủy để giải phóng tồn kho.
* **Các bước thực hiện:**
  1. Khách hàng checkout bằng phương thức **VNPAY**.
  2. Sau khi chuyển sang trang hiển thị mã QR thanh toán của VNPAY Sandbox, khách hàng nhấn nút **"Hủy thanh toán"** (Cancel Payment) ở cuối trang của VNPAY.
* **Kết quả mong đợi:**
  * VNPAY chuyển hướng khách hàng quay trở lại website của bạn kèm mã lỗi (ví dụ: `24` hoặc `02`).
  * Trang chi tiết đơn hàng hiển thị banner màu đỏ: **"Thanh toán qua cổng VNPAY không thành công hoặc giao dịch đã bị hủy..."**
  * Trạng thái đơn hàng tự động chuyển thành `CANCELLED`.
  * Tồn kho sản phẩm được hoàn trả lại cho hệ thống ngay lập tức.

---

### ⏱️ TC-05: Hết hạn thanh toán VNPAY (15 Phút)
* **Mục tiêu:** Kiểm tra cơ chế tự động dọn dẹp các giao dịch "treo" khi khách hàng tắt trình duyệt không thanh toán.
* **Các bước thực hiện:**
  1. Khách hàng checkout đơn hàng bằng **VNPAY**.
  2. Khi trang VNPAY hiển thị mã QR, khách hàng tắt trình duyệt (hoặc không thực hiện bất kỳ thao tác quét mã nào).
  3. Đợi quá **15 phút** (thời gian cấu hình tối đa để giữ đơn chờ thanh toán).
* **Kết quả mong đợi:**
  * Class ngầm `PaymentScheduler` (chạy định kỳ mỗi 5 phút) quét qua database và phát hiện giao dịch `PENDING` đã quá 15 phút.
  * Scheduler cập nhật trạng thái giao dịch thanh toán thành `EXPIRED`.
  * Kafka gửi sự kiện báo lỗi thanh toán, `order-service` nhận được sự kiện sẽ chuyển trạng thái đơn hàng thành `CANCELLED`.
  * Tồn kho hàng hóa được tự động giải phóng hoàn trả về kho.

---

### ⚠️ TC-06: Khách cố tình thanh toán đơn hàng VNPAY đã bị Admin hủy trước đó (Race Condition)
* **Mục tiêu:** Đảm bảo tính nhất quán của dữ liệu khi xảy ra xung đột trạng thái (Admin đã hủy đơn nhưng khách hàng vẫn cố quét mã QR đang hiển thị để chuyển tiền).
* **Các bước thực hiện:**
  1. Khách hàng checkout đơn hàng bằng **VNPAY** và dừng lại ở trang hiển thị mã QR.
  2. Admin (ở một tab/thiết bị khác) truy cập Dashboard và bấm nút **Hủy đơn hàng** này (ví dụ: do phát hiện sai sót thông tin hoặc muốn hủy sớm).
  3. Khách hàng quay lại màn hình QR, tiến hành quét mã và thanh toán thành công số tiền đơn hàng đó.
* **Kết quả mong đợi:**
  * VNPAY trừ tiền của khách hàng và gửi yêu cầu xác minh thanh toán về cổng Webhook của bạn (`vnpay-callback`).
  * Do ở Backend trạng thái thanh toán đã bị đổi thành `FAILED` (khi đơn hàng bị hủy ở bước 2), hàm kiểm tra `verifyVnPayCallback` sẽ từ chối xử lý và trả về mã lỗi `"02"` (Giao dịch không còn ở trạng thái chờ xử lý).
  * **Trang chi tiết đơn hàng phía khách hàng hiển thị banner cảnh báo màu đỏ:** *"Giao dịch thanh toán VNPAY được ghi nhận thành công, nhưng đơn hàng này đã bị hủy trước đó. Vui lòng liên hệ chăm sóc khách hàng để tiến hành hoàn tiền."*
  * Trạng thái đơn hàng vẫn giữ nguyên là `CANCELLED`, đảm bảo dữ liệu đơn hàng và kiểm soát kho không bị sai lệch.
