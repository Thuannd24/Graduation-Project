# TechStore - Hệ Thống Thương Mại Điện Tử Phân Tán (Microservices)

TechStore là hệ thống thương mại điện tử kiến trúc Microservices hiệu năng cao, sử dụng giao tiếp gRPC và Event-Driven với Apache Kafka để đảm bảo tính nhất quán dữ liệu.

---

## 🛠️ KIẾN TRÚC & CÔNG NGHỆ

*   **Backend:** Spring Boot 3.x, Spring Cloud Gateway, Netflix Eureka, FastAPI.
*   **Frontend:** ReactJS, Vite, Vanilla CSS.
*   **Databases & Caches:** MariaDB, MongoDB, Redis.
*   **Middlewares:** Apache Kafka, Elasticsearch, MinIO.
*   **IAM:** Keycloak 24.x (OpenID Connect).

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT NHANH

### Bước chung: Cấu hình biến môi trường (.env)

1.  **Backend (.env):** Vào thư mục `BE/`, copy file `.env.example` thành `.env`:
    ```bash
    cd BE
    cp .env.example .env
    ```
2.  **Frontend (.env):** Vào thư mục `FE/`, copy file `.env.example` thành `.env`:
    ```bash
    cd FE
    cp .env.example .env
    ```

---

### HƯỚNG 1: CHẠY TOÀN BỘ BẰNG DOCKER (FULL DOCKER)
*Phù hợp để demo nhanh toàn bộ hệ thống.*

1.  **Build file JAR trên máy Host:**
    ```bash
    cd BE
    mvn clean package -DskipTests
    ```
2.  **Khởi động các dịch vụ bằng Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```
3.  **Khởi động Frontend:**
    ```bash
    cd ../FE
    npm install
    npm run dev
    ```

---

### HƯỚNG 2: CHẠY HYBRID (INFRA DOCKER + CODE INTELLIJ)
*Phù hợp cho môi trường phát triển (Development) để debug dễ dàng.*

1.  **Khởi động hạ tầng lõi trên Docker:**
    ```bash
    cd BE
    docker-compose -f docker-compose-infra.yml up -d --build
    ```
2.  **Chạy các service nghiệp vụ trên IntelliJ:**
    Mở dự án `BE` và chạy các class Spring Boot Application tương ứng:
    *   `user-service` (Port `8085`)
    *   `product-service` (Port `8089`)
    *   `order-service` (Port `8082`)
    *   `inventory-service` (Port `8093`)
    *   `payment-service` (Port `8084`)
    *   `notification-service` (Port `8086`)
    *   `promotion-service` (Port `8087`)
3.  **Khởi động Frontend:**
    ```bash
    cd ../FE
   
    
    ```

---

## 💡 CÁC LỆNH DOCKER & BUILD THƯỜNG DÙNG

### 1. Khi bật máy tính (Khởi động lại hệ thống đã có)
Nếu hệ thống đã được build từ trước, bạn chỉ cần khởi động lại container mà không cần build lại:
*   **Chạy Full Docker:**
    ```bash
    cd BE
    docker-compose start
    ```
*   **Chạy Hybrid (Chỉ chạy Infra):**
    ```bash
    cd BE
    docker-compose -f docker-compose-infra.yml start
    ```

### 2. Khi cập nhật code của một Service cụ thể
Ví dụ khi chỉnh sửa code trong `product-service`, để cập nhật lên Docker mà không cần rebuild lại toàn bộ dự án:
```bash
# B1: Build lại file JAR của riêng service đó
mvn clean package -pl product-service -am -DskipTests

# B2: Recreate và restart riêng container đó
docker-compose up -d --build product-service
```

### 3. Xem Log của các Service nghiệp vụ
```bash
# Xem log thời gian thực
docker-compose logs -f --tail=100 <service-name>

# Ví dụ:
docker-compose logs -f --tail=100 product-service
docker-compose logs -f --tail=100 api-gateway
```

### 4. Dừng toàn bộ hệ thống
*   **Tạm dừng (Giữ nguyên trạng thái):**
    ```bash
    docker-compose stop
    ```
*   **Dừng hoàn toàn (Giải phóng tài nguyên):**
    ```bash
    docker-compose down
    ```

---

## 📊 THÔNG TIN CỔNG DỊCH VỤ & QUẢN TRỊ

| Dịch vụ / Công cụ | Port / URL | Tài khoản / Mật khẩu |
|---|---|---|
| **Frontend** | http://localhost:5173 | Đăng ký trực tiếp hoặc qua Google OAuth |
| **Eureka Dashboard** | http://localhost:8761 | - |
| **API Gateway Entry** | http://localhost:8080 | - |
| **Keycloak Admin** | http://localhost:8083 | `admin` / `admin` |
| **MinIO Console** | http://localhost:9001 | `minio` / `12345678a@` |
| **Kafka UI** | http://localhost:8090 | - |
| **Redis Insight** | http://localhost:5540 | - |
| **MariaDB** | localhost:3308 | `root` / `root` |
| **MongoDB** | localhost:27017 | - |
