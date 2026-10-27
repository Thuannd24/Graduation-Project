# Hướng Dẫn Phân Quyền Hệ Thống (Roles & Permissions)

Tài liệu này xác định chi tiết quyền hạn truy cập của **3 nhóm vai trò** chính trong hệ thống E-commerce: **`ROLE_ADMIN`**, **`ROLE_STAFF`**, và **`ROLE_CUSTOMER`**. Cấu hình phân quyền này được áp dụng tại **API Gateway** và các **Downstream Microservices**.

> _Rà soát 2026-10-11: các bảng endpoint và đoạn cấu hình ở mục 2–3 đã được đối chiếu lại với các Controller/`SecurityConfig` thực tế. Role được đọc từ claim `realm_access.roles` của JWT Keycloak (tự thêm tiền tố `ROLE_` nếu thiếu)._

---

## 1. Định Nghĩa 3 Nhóm Vai Trò (Roles)

1.  **`ROLE_ADMIN` (Quản trị viên tối cao):**
    *   Toàn quyền kiểm soát hệ thống (Full Access).
    *   Xem báo cáo doanh thu, đối soát tài chính, cấu hình tích hợp cổng thanh toán.
    *   Quản lý danh sách nhân viên (`STAFF`), phân quyền và kiểm tra nhật ký hoạt động.
2.  **`ROLE_STAFF` (Nhân viên vận hành hệ thống):**
    *   Quản lý danh mục sản phẩm, cập nhật giá và tồn kho.
    *   Quản lý đơn hàng (Xác nhận, cập nhật trạng thái vận chuyển).
    *   Quản lý các chiến dịch khuyến mãi (thiết lập chiến dịch BPMN bằng Campaign Builder; voucher do chiến dịch tự phát hành).
    *   Hỗ trợ chăm sóc khách hàng (chat hỗ trợ). Hoàn tiền thủ công chỉ dành cho `ADMIN`.
3.  **`ROLE_CUSTOMER` (Khách hàng / Người mua):**
    *   Quản lý thông tin tài khoản cá nhân, địa chỉ nhận hàng.
    *   Xem sản phẩm, đánh giá sản phẩm.
    *   Quản lý giỏ hàng cá nhân, áp dụng mã giảm giá và đặt hàng.
    *   Theo dõi trạng thái đơn hàng cá nhân.

---

## 2. Bảng Ma Trận Phân Quyền Chi Tiết Theo Microservice

Dưới đây là ma trận phân quyền cho từng API Endpoint của các Microservice (chỉ liệt kê các endpoint tiêu biểu có thật trong code).

> **Quy ước:** ✅ = được phép; ❌ = bị chặn; **(Public)** = không cần đăng nhập. Các endpoint "cá nhân" (giỏ hàng, địa chỉ, checkout...) **chỉ yêu cầu JWT hợp lệ, không kiểm tra role cụ thể** — tài khoản STAFF/ADMIN vẫn gọi được nhưng chỉ thao tác trên dữ liệu của chính mình. Không có endpoint nào dùng `hasRole('CUSTOMER')`.

### 2.1. User Service (Quản lý người dùng & Địa chỉ)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/users/me` | Xem thông tin tài khoản đang đăng nhập | ✅ | ✅ | ✅ |
| `PUT /api/v1/users/me` | Cập nhật thông tin cá nhân | ✅ | ✅ | ✅ |
| `GET /api/v1/users/me/addresses` | Xem danh sách địa chỉ nhận hàng cá nhân | ✅ | ✅ (của mình) | ✅ (của mình) |
| `POST /api/v1/users/me/addresses` | Thêm địa chỉ nhận hàng mới | ✅ | ✅ (của mình) | ✅ (của mình) |
| `DELETE /api/v1/users/me/addresses/{id}` | Xóa địa chỉ nhận hàng cá nhân | ✅ | ✅ (của mình) | ✅ (của mình) |
| `GET /api/v1/users/me/loyalty/points` | Xem điểm thưởng cá nhân | ✅ | ✅ | ✅ |
| `GET /api/v1/users/public/{keycloakUserId}` | Hồ sơ công khai (tên + ảnh người đánh giá) | ✅ (Public) | ✅ | ✅ |
| `GET /api/v1/public/locations/provinces` | Danh sách tỉnh/thành (địa chỉ 2 cấp tỉnh/phường-xã) | ✅ (Public) | ✅ | ✅ |
| `GET /api/v1/admin/users` | Xem danh sách toàn bộ người dùng | ❌ | ✅ | ✅ |
| `GET /api/v1/admin/users/stats` | Thống kê người dùng | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/users` | Tạo tài khoản | ❌ | ❌ | ✅ |
| `PUT /api/v1/admin/users/{userId}/blacklist` | Khóa/Mở khóa tài khoản khách hàng | ❌ | ❌ | ✅ |
| `PUT /api/v1/admin/users/{userId}/roles` | Gán role cho tài khoản | ❌ | ❌ | ✅ |

### 2.2. Product Service (Quản lý sản phẩm & Đánh giá)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/public/products/**` | Xem sản phẩm công khai (danh sách, chi tiết, tìm kiếm, đánh giá) | ✅ (Public) | ✅ | ✅ |
| `POST /api/v1/products/reviews` | Đánh giá sản phẩm đã mua (bắt buộc `orderId`) | ✅ | ✅ | ✅ |
| `GET/POST/DELETE /api/v1/wishlist/**` | Danh sách yêu thích cá nhân | ✅ | ✅ | ✅ |
| `POST /api/v1/admin/products` | Thêm sản phẩm mới | ❌ | ✅ | ✅ |
| `PUT /api/v1/admin/products/{id}` | Sửa đổi thông tin sản phẩm | ❌ | ✅ | ✅ |
| `DELETE /api/v1/admin/products/{id}` | Xóa sản phẩm khỏi hệ thống | ❌ | ❌ | ✅ |
| `POST /api/v1/admin/categories` | Tạo danh mục sản phẩm mới | ❌ | ✅ | ✅ |
| `DELETE /api/v1/admin/categories/{id}` | Xóa danh mục sản phẩm | ❌ | ❌ | ✅ |
| `POST /api/v1/admin/attributes` | Tạo thuộc tính EAV | ❌ | ❌ | ✅ |
| `POST /api/v1/admin/reviews/{id}/reply` | Trả lời đánh giá của khách | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/import/catalog` | Import catalog hàng loạt | ❌ | ❌ | ✅ |

### 2.3. Inventory Service (Quản lý kho hàng)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/inventories/{productId}` | Xem số lượng tồn kho công khai của sản phẩm | ✅ (Public) | ✅ | ✅ |
| `GET /api/v1/inventories/batch` | Xem tồn kho nhiều sản phẩm | ✅ (Public) | ✅ | ✅ |
| `PUT /api/v1/admin/inventories/{productId}` | Cập nhật/điều chỉnh tồn kho | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/inventories/{productId}/restock` | Nhập kho sản phẩm (Tăng tồn kho) | ❌ | ✅ | ✅ |
| `GET /api/v1/admin/inventories/{productId}/transactions` | Lịch sử giao dịch kho | ❌ | ✅ | ✅ |
| `GET /api/v1/admin/inventories/low-stock` | Danh sách sản phẩm sắp hết hàng | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/inventories/sync-redis` | Đồng bộ thủ công tồn kho DB → Redis | ❌ | ✅ | ✅ |

### 2.4. Order Service (Quản lý giỏ hàng & Đơn hàng)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/cart` | Xem giỏ hàng cá nhân | ✅ | ✅ (của mình) | ✅ (của mình) |
| `POST /api/v1/cart` | Thêm sản phẩm vào giỏ hàng | ✅ | ✅ (của mình) | ✅ (của mình) |
| `PUT /api/v1/cart/items/{productId}` | Cập nhật số lượng | ✅ | ✅ (của mình) | ✅ (của mình) |
| `DELETE /api/v1/cart/items/{productId}` | Xóa sản phẩm khỏi giỏ hàng | ✅ | ✅ (của mình) | ✅ (của mình) |
| `POST /api/v1/orders/checkout` | Đặt hàng | ✅ | ✅ (của mình) | ✅ (của mình) |
| `GET /api/v1/orders` | Danh sách đơn hàng (khách: của mình; STAFF/ADMIN: toàn bộ) | ✅ (Chỉ của mình) | ✅ | ✅ |
| `GET /api/v1/orders/{id}` | Xem chi tiết đơn hàng | ✅ (Chỉ của mình)| ✅ | ✅ |
| `POST /api/v1/orders/{id}/cancel` | Hủy đơn hàng (khi `PENDING`/`AWAITING_PAYMENT`/`CONFIRMED`) | ✅ (Chỉ của mình)| ✅ | ✅ |
| `PUT /api/v1/orders/{id}/ship` | Chuyển đơn sang giao hàng (`CONFIRMED` → `SHIPPED`) | ❌ | ✅ | ✅ |
| `PUT /api/v1/orders/{id}/delivery-status?status=` | Cập nhật trạng thái giao hàng (`SHIPPED`/`DELIVERED`/`CANCELLED`) | ❌ | ✅ | ✅ |
| `POST /api/v1/public/orders/shipping-webhook` | Webhook ĐVVC (xác thực bằng chữ ký HMAC `X-Shipping-Signature`) | (Public) | — | — |

> Không có endpoint `/api/v1/admin/orders/**`: quản lý đơn hàng của STAFF/ADMIN dùng chung `/api/v1/orders/**` và được phân biệt bằng role (header `X-User-Roles` do Gateway gắn / `@PreAuthorize`).

### 2.5. Payment Service (Thanh toán & Đối soát)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `POST /api/v1/payments/initiate` | Khởi tạo thanh toán (VNPay hoặc COD) | ✅ | ✅ (của mình) | ✅ (của mình) |
| `GET /api/v1/payments/order/{orderId}` | Xem thanh toán của một đơn | ✅ (Chỉ của mình) | ✅ | ✅ |
| `GET /api/v1/public/payments/vnpay-callback` | Callback VNPay (IPN + redirect trình duyệt, xác thực chữ ký HMAC) | ✅ (Public) | ✅ | ✅ |
| `GET /api/v1/admin/payments` | Tra cứu lịch sử thanh toán toàn hệ thống | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/payments/refund` | Hoàn tiền thủ công | ❌ | ❌ | ✅ |

### 2.6. Promotion Service (Quản lý khuyến mãi Camunda)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/promotions/vouchers/me` | Xem voucher của mình | ✅ | ✅ | ✅ |
| `POST /api/v1/promotions/vouchers/preview` | Kiểm tra/xem trước mã voucher cho giỏ hàng (không ghi DB) | ✅ | ✅ | ✅ |
| `GET /api/v1/public/campaigns/active` | Xem các chiến dịch khuyến mãi đang chạy | ✅ (Public) | ✅ | ✅ |
| `POST /api/v1/admin/campaigns/validate` | Validate workflow chiến dịch | ❌ | ✅ | ✅ |
| `POST /api/v1/admin/campaigns` | Tạo chiến dịch khuyến mãi mới | ❌ | ✅ | ✅ |
| `PUT /api/v1/admin/campaigns/{id}/toggle-active` | Bật/tắt chiến dịch | ❌ | ✅ | ✅ |
| `DELETE /api/v1/admin/campaigns/{id}` | Hủy bỏ chiến dịch khuyến mãi | ❌ | ❌ | ✅ |

### 2.7. Notification Service (Nhật ký thông báo)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `GET /api/v1/notifications` | Xem lịch sử nhận thông báo cá nhân | ✅ | ✅ (của mình) | ✅ (của mình) |
| `POST /api/v1/notifications/fcm-token` | Đăng ký token thông báo thiết bị (FCM) | ✅ | ✅ (của mình) | ✅ (của mình) |

### 2.8. Chat Service (Chat hỗ trợ)

| API Endpoint | Mô tả nghiệp vụ | CUSTOMER | STAFF | ADMIN |
|:---|:---|:---:|:---:|:---:|
| `/api/v1/public/chat/**` (rooms, messages, close, upload-image, handover) | Khách hàng / khách vãng lai chat hỗ trợ | ✅ (Public) | ✅ | ✅ |
| `/api/v1/public/chat/ws` | WebSocket STOMP (JWT hoặc `Guest-Id` trong frame CONNECT) | ✅ (Public) | ✅ | ✅ |
| `/api/v1/admin/chat/**` | Nhân viên tiếp nhận, đóng phòng, xem lịch sử | ❌ | ✅ | ✅ |

---

## 3. Cách Triển Khai Phân Quyền Trong Code Dự Án

### 3.1. Phân quyền thô ở API Gateway (`SecurityConfig.java`)
Tại dự án `api-gateway`, chúng ta phân vùng truy cập thô để tối ưu hiệu năng (trích từ code thực tế):
```java
.pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
// Hồ sơ công khai (tên + ảnh người đánh giá)
.pathMatchers(HttpMethod.GET, "/api/v1/users/public/**").permitAll()
// Whitelist: public endpoints không cần token
.pathMatchers(
        "/api/v1/public/**",
        "/api/v1/inventories/**",
        "/api/v1/chatbot/**",
        "/eureka/**",
        "/actuator/health",
        "/fallback/**",
        "/realms/**",
        "/resources/**"
).permitAll()
// Admin/Staff routes — phân quyền thô tại Gateway
.pathMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "STAFF")
// Chặn tuyệt đối mọi truy cập từ bên ngoài đến API nội bộ
.pathMatchers("/api/internal/**").denyAll()
// Mọi API khác đều cần xác thực (phân quyền chi tiết ở service)
.anyExchange().authenticated()
```

Các API nội bộ `/api/internal/**` bị Gateway chặn (`denyAll`); khi gọi trực tiếp service-to-service, chúng được bảo vệ bằng `InternalApiKeyFilter` (header `X-Internal-Api-Key`).

### 3.2. Phân quyền tinh tại Controller của Microservices
Tại từng microservice, sử dụng Annotation `@PreAuthorize` của Spring Security để bảo vệ API cụ thể:

*   **Chỉ cho phép ADMIN sửa đổi cấu hình nhạy cảm:**
    ```java
    @PostMapping("/refund")   // AdminPaymentController, base path /api/v1/admin/payments
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ApiResponse<Void> processRefund(...) { ... }
    ```
*   **Cho phép cả ADMIN và STAFF vận hành:**
    ```java
    @PutMapping("/{id}/ship")   // OrderController, base path /api/v1/orders
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<OrderResponse> shipOrder(@PathVariable Long id) { ... }
    ```
*   **Endpoint của khách hàng chỉ cần đăng nhập (không kiểm tra role):**
    ```java
    @PostMapping("/checkout")   // OrderController — không có @PreAuthorize
    public ApiResponse<OrderResponse> checkout(
            @RequestHeader(value = "X-User-Id", required = false) String userId, ...) { ... }
    ```
    Quyền sở hữu dữ liệu (chỉ xem/hủy đơn của mình) được kiểm tra trong tầng service dựa trên `X-User-Id`/`X-User-Roles`.
