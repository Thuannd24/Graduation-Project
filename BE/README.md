# HƯỚNG DẪN BUILD & CHẠY BACKEND MICROSERVICES (TECHSTORE)

Tài liệu này hướng dẫn chi tiết cách cấu hình môi trường và khởi chạy Backend của TechStore theo hai phương pháp chính.

---

## I. YÊU CẦU HỆ THỐNG CẦN CÀI ĐẶT CỤC BỘ

*   **Java JDK 17** (Cài đặt biến môi trường `JAVA_HOME`)
*   **Apache Maven 3.8+** (Hoặc sử dụng Maven đóng gói sẵn trong IntelliJ)
*   **Docker & Docker Desktop** (Kèm docker-compose phiên bản 2.x trở lên)
*   **IntelliJ IDEA** (Bản Ultimate hoặc Community)

---

## II. PHƯƠNG PHÁP 1: CHẠY FULL DOCKER COMPOSE
Phương pháp này đóng gói toàn bộ Backend bao gồm Eureka, Gateway, các databases, middlewares, và toàn bộ 7 microservices nghiệp vụ chạy bên trong Docker container. Để tối ưu hóa tốc độ build (giảm từ 10-15 phút xuống chỉ còn 1-2 giây), Dockerfile được thiết kế để copy trực tiếp file JAR đã được biên dịch từ máy Host thay vì biên dịch lại trong container.

### Bước 1: Khởi tạo tệp tin `.env` và cài đặt JAR
Copy tệp cấu hình môi trường mẫu và build/cài đặt code Java trên máy Host:
```bash
cp .env.example .env
mvn clean install -DskipTests
```

### Bước 2: Khởi chạy toàn bộ hệ thống
Sau khi Maven build thành công các file JAR, chạy lệnh khởi động Docker Compose:
```bash
docker compose up -d --build
```
Hệ thống sẽ tạo image cực kỳ nhanh và khởi chạy ngầm tất cả các container. Bạn có thể kiểm tra danh sách container qua lệnh:
```bash
docker ps
```

---

## III. PHƯƠNG PHÁP 2: CHẠY HYBRID (INFRA + EUREKA + GATEWAY IN DOCKER, CODE TRÊN INTELLIJ)
Phương pháp này tối ưu nhất cho nhà phát triển. Toàn bộ cơ sở dữ liệu, Kafka, Redis, Keycloak cùng với **Eureka Server** và **API Gateway** được chạy trong Docker thông qua file cấu hình `docker-compose-infra.yml`. Các microservice nghiệp vụ (`user`, `product`, `order`, etc.) sẽ được chạy và debug trực tiếp trên IntelliJ IDEA.

### Bước 1: Khởi tạo tệp tin `.env` và cài đặt JAR
```bash
cp .env.example .env
mvn clean install -DskipTests
```

> [!NOTE]
> Lệnh `mvn clean install` là bắt buộc khi chạy lần đầu để biên dịch và sinh ra các class gRPC (từ các file `.proto` trong module `grpc-common`), đồng thời cài đặt module dùng chung giúp IntelliJ nhận diện code không bị báo đỏ lỗi.

### Bước 2: Khởi động Hạ tầng Docker (Infra + Eureka + Gateway)
Chạy lệnh sau:
```bash
docker compose -f docker-compose-infra.yml up -d --build
```
Lúc này, các service hạ tầng bao gồm Eureka Server (`8761`) và API Gateway (`8080`) đã được khởi chạy trong Docker. Bạn không cần phải khởi động hay build Eureka và Gateway trong IntelliJ nữa.

### Bước 3: Chạy các microservice nghiệp vụ bằng IntelliJ
Mở dự án bằng IntelliJ IDEA và khởi chạy trực tiếp các class main của các dịch vụ sau:
1.  **`user-service`** (`com.ecommerce.userservice.UserServiceApplication`)
2.  **`product-service`** (`com.ecommerce.productservice.ProductServiceApplication`)
3.  **`order-service`** (`com.ecommerce.orderservice.OrderServiceApplication`)
4.  **`inventory-service`** (`com.ecommerce.inventoryservice.InventoryServiceApplication`)
5.  **`payment-service`** (`com.ecommerce.paymentservice.PaymentServiceApplication`)
6.  **`notification-service`** (`com.ecommerce.notificationservice.NotificationServiceApplication`)
7.  **`promotion-service`** (`com.ecommerce.promotionservice.PromotionServiceApplication`)

*(Các service này sẽ tự động kết nối và đăng ký thành công với Eureka Server đang chạy trong Docker).*

---
