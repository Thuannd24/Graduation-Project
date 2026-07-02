# TECHSTORE - HỆ THỐNG THƯƠNG MẠI ĐIỆN TỬ PHÂN TÁN (MICROSERVICES)

TechStore là hệ thống thương mại điện tử kiến trúc Microservices được thiết kế để chịu tải cao, đảm bảo tính nhất quán dữ liệu qua Kafka Event-Driven và giao tiếp gRPC hiệu năng cao.

---

## 🛠️ KIẾN TRÚC & CÔNG NGHỆ SỬ DỤNG

*   **Backend:** Spring Boot 3.x, Spring Cloud Gateway, Netflix Eureka, Camunda BPM 7, Python FastAPI.
*   **Frontend:** ReactJS, Vite, Vanilla CSS.
*   **Databases & Caches:** MariaDB, MongoDB, Redis, PostgreSQL (Keycloak DB, Inventory DB, Payment DB).
*   **Middlewares:** Apache Kafka, Elasticsearch, MinIO.
*   **IAM:** Keycloak 24.x (OpenID Connect).

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT CHI TIẾT (2 CÁCH)

Hệ thống hỗ trợ 2 hướng chạy phục vụ cho môi trường phát triển (Local Development) và môi trường thử nghiệm nhanh.

### 📝 CHUẨN BỊ CHUNG: CẤU HÌNH BIẾN MÔI TRƯỜNG (.env)

Trước khi chạy, bạn cần cấu hình các file môi trường `.env` cho cả Backend và Frontend:

#### 1. Cấu hình Backend (.env)
Vào thư mục `BE/`, copy file `.env.example` thành `.env` và cập nhật thông tin (ví dụ: cấu hình SMTP Mail để nhận OTP):
```bash
cd BE
cp .env.example .env
```
*Mặc định, các cấu hình trong `.env` đã được thiết lập tối ưu để chạy cục bộ (localhost).*

#### 2. Cấu hình Frontend (.env)
Vào thư mục `FE/`, copy file `.env.example` thành `.env`:
```bash
cd FE
cp .env.example .env
```
Nội dung file `FE/.env`:
```env
VITE_API_URL=http://localhost:8080/api/v1
VITE_KEYCLOAK_URL=http://localhost:8083
VITE_KEYCLOAK_REALM=ecommerce-realm
VITE_KEYCLOAK_CLIENT_ID=ecommerce-frontend
```

---

### HƯỚNG 1: CHẠY TOÀN BỘ BACKEND BẰNG DOCKER (FULL DOCKER)
Cách này phù hợp khi bạn muốn chạy nhanh toàn bộ hệ thống Backend mà không cần cài đặt JDK hay Maven trên máy Host. Docker sẽ tự biên dịch mã nguồn Java và khởi chạy.

#### Bước 1: Khởi động toàn bộ container
Từ thư mục `BE/`, chạy lệnh khởi động Docker Compose (lệnh này tự động tải Maven image, biên dịch mã nguồn và build các container nghiệp vụ):
```bash
cd BE
docker-compose up -d --build
```
Lệnh này sẽ khởi động:
*   **Cơ sở dữ liệu & Middleware:** MariaDB, MongoDB, Redis, Kafka, Elasticsearch, MinIO, Keycloak.
*   **Hạ tầng lõi:** Eureka Server, API Gateway.
*   **Các dịch vụ nghiệp vụ:** User Service, Product Service, Order Service, Inventory Service, Payment Service, Notification Service, Promotion Service.
*   **Công cụ UI:** Redis Insight (`5540`), Kafka UI (`8090`), Kibana (`5601`).

#### Bước 2: Khởi động Frontend
Mở một terminal mới:
```bash
cd FE
npm install
npm run dev
```
Truy cập ứng dụng tại: `http://localhost:5173`.

---

### HƯỚNG 2: CHẠY INFRA + EUREKA + GATEWAY BẰNG DOCKER & CODE NGHIỆP VỤ BẰNG INTELLIJ
Cách này phù hợp nhất cho lập trình viên (Developer). Để giảm tải việc khởi chạy và cấu hình Eureka Server cùng API Gateway trên IntelliJ, **chúng đã được đưa vào Docker Compose Infra**. 

Bạn chỉ cần chạy IntelliJ cho các Service nghiệp vụ đang trực tiếp code mà không cần chạy thủ công Eureka hay Gateway.

#### Bước 1: Build mã nguồn Java
```bash
cd BE
mvn clean package -DskipTests
```

#### Bước 2: Khởi động hạ tầng cùng Eureka & Gateway trong Docker
Chạy docker-compose với file cấu hình hạ tầng:
```bash
docker-compose -f docker-compose-infra.yml up -d --build
```
*Lưu ý: Lệnh này sẽ build Eureka Server và API Gateway chạy ổn định trực tiếp trong Docker, giải phóng tài nguyên RAM của bạn khỏi việc chạy chúng trong IntelliJ.*

#### Bước 3: Chạy các microservice nghiệp vụ trong IntelliJ
Mở project `BE` bằng IntelliJ IDEA. Bạn có thể chọn khởi chạy các service nghiệp vụ cần debug theo thứ tự:
1.  `user-service` (port `8085`)
2.  `product-service` (port `8089`)
3.  `order-service` (port `8082`)
4.  `inventory-service` (port `8093`)
5.  `payment-service` (port `8084`)
6.  `notification-service` (port `8086`)
7.  `promotion-service` (port `8087`)

*(Mặc định, các service trên IntelliJ sẽ kết nối tới các dịch vụ hạ tầng, Eureka Server và API Gateway thông qua các port đã expose ra localhost).*

#### Bước 4: Khởi động Frontend
```bash
cd FE
npm install
npm run dev
```

---

## 📊 THÔNG TIN CỔNG DỊCH VỤ & THÔNG TIN ĐĂNG NHẬP

| Dịch vụ / Công cụ | Port / URL | Tài khoản / Mật khẩu |
|---|---|---|
| **Eureka Dashboard** | http://localhost:8761 | - |
| **API Gateway Entry** | http://localhost:8080 | - |
| **Keycloak Admin** | http://localhost:8083 | `admin` / `admin` |
| **MinIO Console** | http://localhost:9001 | `minio` / `12345678a@` |
| **Kafka UI** | http://localhost:8090 | - |
| **Redis Insight** | http://localhost:5540 | - |
| **MariaDB** | localhost:3308 | `root` / `root` |
| **MongoDB** | localhost:27017 | - |
