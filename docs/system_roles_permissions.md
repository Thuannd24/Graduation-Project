# Hướng Dẫn Phân Quyền Hệ Thống (Roles & Permissions)

Tài liệu này xác định chi tiết quyền hạn truy cập của **3 nhóm vai trò** chính trong hệ thống E-commerce: **`ROLE_ADMIN`**, **`ROLE_STAFF`**, và **`ROLE_CUSTOMER`**. Cấu hình phân quyền này được áp dụng tại **API Gateway** và các **Downstream Microservices**.

---

## 1. Định Nghĩa 3 Nhóm Vai Trò (Roles)

1.  **`ROLE_ADMIN` (Quản trị viên tối cao):**
    *   Toàn quyền kiểm soát hệ thống (Full Access).
    *   Xem báo cáo doanh thu, đối soát tài chính, cấu hình tích hợp cổng thanh toán.
    *   Quản lý danh sách nhân viên (`STAFF`), phân quyền và kiểm tra nhật ký hoạt động.
2.  **`ROLE_STAFF` (Nhân viên vận hành hệ thống):**
    *   Quản lý danh mục sản phẩm, cập nhật giá và tồn kho.
    *   Quản lý đơn hàng (Xác nhận, cập nhật trạng thái vận chuyển).
    *   Quản lý các chiến dịch khuyến mãi (Tạo coupon, thiết lập chiến dịch BPMN).
    *   Hỗ trợ chăm sóc khách hàng và xử lý yêu cầu đổi trả/hoàn tiền.
3.  **`ROLE_CUSTOMER` (Khách hàng / Người mua):**
    *   Quản lý thông tin tài khoản cá nhân, địa chỉ nhận hàng.
    *   Xem sản phẩm, đánh giá sản phẩm.
    *   Quản lý giỏ hàng cá nhân, áp dụng mã giảm giá và đặt hàng.
    *   Theo dõi trạng thái đơn hàng cá nhân.

---

## 2. Bảng Ma Trận Phân Quyền Chi Tiết Theo Microservice

Dưới đây là ma trận phân quyền cho từng API Endpoint của các Microservice:

### 2.1. User Service (Quản lý người dùng & Địa chỉ)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/users/me` | Xem thông tin tài khoản đang đăng nhập | ✅ | ✅ | ✅ |
| `PUT /api/v1/users/me` | Cập nhật thông tin cá nhân | ✅ | ✅ | ✅ |
| `GET /api/v1/users/me/addresses` | Xem danh sách địa chỉ nhận hàng cá nhân | ✅ | ❌ | ❌ |
| `POST /api/v1/users/me/addresses` | Thêm địa chỉ nhận hàng mới | ✅ | ❌ | ❌ |
| `DELETE /api/v1/users/me/addresses/{id}` | Xóa địa chỉ nhận hàng cá nhân | ✅ | ❌ | ❌ |
| `GET /api/v1/admin/users` | Xem danh sách toàn bộ khách hàng | ❌ | ✅ | ✅ |
| `PUT /api/v1/admin/users/{id}/blacklist` | Khóa/Mở khóa tài khoản khách hàng | ❌ | ❌ | ✅ |

### 2.2. Product Service (Quản lý sản phẩm & Đánh giá)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/public/products/**` | Xem sản phẩm công khai (danh sách, chi tiết, tìm kiếm) | ✅ (Public) | ✅ | ✅ |
| `POST /api/v1/products/{id}/reviews` | Đánh giá sản phẩm đã mua | ✅ | ❌ | ❌ |
| `POST /api/v1/admin/products` | Thêm sản phẩm mới | ❌ | ✅ | ✅ |
| `PUT /api/v1/admin/products/{id}` | Sửa đổi thông tin sản phẩm | ❌ | ✅ | ✅ |
| `DELETE /api/v1/admin/products/{id}` | Xóa sản phẩm khỏi hệ thống | ❌ | ❌ | ✅ |
| `POST /api/v1/admin/categories` | Tạo danh mục sản phẩm mới | ❌ | ✅ | ✅ |
| `DELETE /api/v1/admin/categories/{id}` | Xóa danh mục sản phẩm | ❌ | ❌ | ✅ |

### 2.3. Inventory Service (Quản lý kho hàng)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/public/inventories/product/{id}`| Xem số lượng tồn kho công khai của sản phẩm | ✅ (Public) | ✅ | ✅ |
| `POST /api/v1/admin/inventories/stock-in` | Nhập kho sản phẩm (Tăng tồn kho) | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/inventories/adjust` | Điều chỉnh lệch tồn kho vật lý | ❌ | ✅ | ✅ |
| `PUT /api/v1/admin/inventories/safety-stock` | Cấu hình mức tồn kho an toàn | ❌ | ❌ | ✅ |

### 2.4. Order Service (Quản lý giỏ hàng & Đơn hàng)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/cart` | Xem giỏ hàng cá nhân | ✅ | ❌ | ❌ |
| `POST /api/v1/cart/items` | Thêm/Cập nhật sản phẩm vào giỏ hàng | ✅ | ❌ | ❌ |
| `DELETE /api/v1/cart/items/{id}` | Xóa sản phẩm khỏi giỏ hàng | ✅ | ❌ | ❌ |
| `POST /api/v1/orders/checkout` | Đặt hàng và thanh toán | ✅ | ❌ | ❌ |
| `GET /api/v1/orders` | Xem danh sách đơn hàng cá nhân | ✅ | ❌ | ❌ |
| `GET /api/v1/orders/{id}` | Xem chi tiết đơn hàng | ✅ (Chỉ của mình)| ✅ | ✅ |
| `POST /api/v1/orders/{id}/cancel` | Hủy đơn hàng | ✅ (Khi chưa giao)| ✅ | ✅ |
| `GET /api/v1/admin/orders` | Quản lý danh sách toàn bộ đơn hàng | ❌ | ✅ | ✅ |
| `PUT /api/v1/admin/orders/{id}/status` | Cập nhật trạng thái đơn hàng (Xác nhận, Giao hàng) | ❌ | ✅ | ✅ |

### 2.5. Payment Service (Thanh toán & Đối soát)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `POST /api/v1/payments/initiate` | Khởi tạo link thanh toán VNPay | ✅ | ❌ | ❌ |
| `GET /api/v1/payments/ipn` | Webhook tự động từ ngân hàng | ✅ (Public) | ✅ | ✅ |
| `GET /api/v1/admin/payments` | Tra cứu lịch sử thanh toán toàn hệ thống | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/payments/refund` | Phê duyệt hoàn tiền đơn hàng bị hủy | ❌ | ❌ | ✅ |

### 2.6. Promotion Service (Quản lý khuyến mãi Camunda)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `POST /api/v1/public/campaigns/evaluate` | Đánh giá chương trình khuyến mãi cho giỏ hàng | ✅ | ✅ | ✅ |
| `GET /api/v1/public/campaigns/active` | Xem các chiến dịch khuyến mãi đang chạy | ✅ (Public) | ✅ | ✅ |
| `POST /api/v1/admin/campaigns` | Tạo chiến dịch khuyến mãi mới | ❌ | ✅ | ✅ |
| `DELETE /api/v1/admin/campaigns/{id}` | Hủy bỏ chiến dịch khuyến mãi | ❌ | ❌ | ✅ |

### 2.7. Notification Service (Nhật ký thông báo)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/notifications` | Xem lịch sử nhận thông báo cá nhân | ✅ | ❌ | ❌ |
| `POST /api/v1/notifications/fcm-token` | Đăng ký token thông báo thiết bị (FCM) | ✅ | ❌ | ❌ |

---

## 3. Cách Triển Khai Phân Quyền Trong Code Dự Án

### 3.1. Phân quyền thô ở API Gateway (`SecurityConfig.java`)
Tại dự án `api-gateway`, chúng ta phân vùng truy cập thô để tối ưu hiệu năng:
```java
// Cho phép tất cả xem danh mục / sản phẩm công khai
.pathMatchers("/api/v1/public/**", "/api/v1/products/**", "/eureka/**").permitAll()

// Bắt buộc xác thực với mọi API quản trị hoặc giỏ hàng/thanh toán
.pathMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "STAFF")
.anyExchange().authenticated()
```

### 3.2. Phân quyền tinh tại Controller của Microservices
Tại từng microservice, sử dụng Annotation `@PreAuthorize` của Spring Security để bảo vệ API cụ thể:

*   **Chỉ cho phép ADMIN sửa đổi cấu hình nhạy cảm:**
    ```java
    @PostMapping("/api/v1/admin/payments/refund")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Void> processRefund(...) { ... }
    ```
*   **Cho phép cả ADMIN và STAFF vận hành:**
    ```java
    @PutMapping("/api/v1/admin/orders/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    public ApiResponse<Void> updateOrderStatus(...) { ... }
    ```
*   **Chỉ cho phép CUSTOMER thực hiện:**
    ```java
    @PostMapping("/api/v1/orders/checkout")
    @PreAuthorize("hasRole('CUSTOMER')")
    public ApiResponse<OrderResponse> checkout(...) { ... }
    ```
