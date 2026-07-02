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
Phương pháp này đóng gói toàn bộ Backend bao gồm Eureka, Gateway, các databases, middlewares, và toàn bộ 7 microservices nghiệp vụ chạy bên trong Docker container. Docker sẽ tự tải Maven và biên dịch code trong container.

### Bước 1: Khởi tạo tệp tin `.env`
Copy tệp cấu hình môi trường mẫu:
```bash
cp .env.example .env
```

### Bước 2: Khởi chạy toàn bộ hệ thống
```bash
docker-compose up -d --build
```
Hệ thống sẽ tự động tải các base image, biên dịch mã nguồn Java bằng Maven Container, và khởi chạy ngầm tất cả các container. Bạn có thể kiểm tra danh sách container qua lệnh:
```bash
docker ps
```

---

## III. PHƯƠNG PHÁP 2: CHẠY HYBRID (INFRA + EUREKA + GATEWAY IN DOCKER, CODE TRÊN INTELLIJ)
Phương pháp này tối ưu nhất cho nhà phát triển. Toàn bộ cơ sở dữ liệu, Kafka, Redis, Keycloak cùng với **Eureka Server** và **API Gateway** được chạy trong Docker thông qua file cấu hình `docker-compose-infra.yml`. Các microservice nghiệp vụ (`user`, `product`, `order`, etc.) sẽ được chạy và debug trực tiếp trên IntelliJ IDEA.

### Bước 1: Khởi tạo tệp tin `.env` và đóng gói JAR
```bash
cp .env.example .env
mvn clean package -DskipTests
```

### Bước 2: Khởi động Hạ tầng Docker (Infra + Eureka + Gateway)
Chạy lệnh sau:
```bash
docker-compose -f docker-compose-infra.yml up -d --build
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

## IV. BẢNG THÔNG TIN INFRASTRUCTURE & CỔNG DỊCH VỤ

| Tên Dịch Vụ | Port External | Địa Chỉ Localhost | Tài khoản / Mật khẩu |
|---|---|---|---|
| **API Gateway** | `8080` | http://localhost:8080 | Điểm nhận mọi API Request |
| **Eureka Server** | `8761` | http://localhost:8761 | Dashboard theo dõi đăng ký dịch vụ |
| **Keycloak IAM** | `8083` | http://localhost:8083 | `admin` / `admin` |
| **MinIO Console** | `9001` | http://localhost:9001 | `minio` / `12345678a@` |
| **Kafka UI** | `8090` | http://localhost:8090 | Theo dõi Kafka Topic/Consumer |
| **Redis Insight** | `5540` | http://localhost:5540 | Quản trị bộ đệm Redis Cache |
| **MariaDB** | `3308` | localhost:3308 | `root` / `root` |
| **MongoDB** | `27017` | localhost:27017 | Không mật khẩu |
| **Elasticsearch** | `9200` | http://localhost:9200 | Mặc định tắt security dev mode |
| **Kibana UI** | `5601` | http://localhost:5601 | Dashboard quản trị Elasticsearch |

---

## V. CHI TIẾT CÁC BIẾN MÔI TRƯỜNG CHÍNH TRONG `.env`

*   `DB_HOST` & `DB_PORT`: Địa chỉ kết nối MariaDB (Mặc định `localhost` và `3308` cho chạy ngoài, `mariadb` và `3306` trong mạng Docker).
*   `KAFKA_BOOTSTRAP_SERVERS`: Địa chỉ broker Kafka (`localhost:29092` bên ngoài, `kafka:9092` bên trong Docker).
*   `KEYCLOAK_ISSUER_URI`: URL Realm của Keycloak cung cấp JWKS public key.
*   `MAIL_USERNAME` & `MAIL_PASSWORD`: Cấu hình tài khoản và mật khẩu ứng dụng Gmail SMTP dùng cho Notification Service.
