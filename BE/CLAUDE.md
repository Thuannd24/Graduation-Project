# HƯỚNG DẪN QUY ƯỚC LẬP TRÌNH TOÀN HỆ THỐNG (SYSTEM CODES & ARCHITECTURE CONVENTIONS)
## (Tài liệu chỉ dẫn cho AI Code Assistant - Claude / Gemini)

> **Mục tiêu:** Đảm bảo toàn bộ mã nguồn Java Spring Boot và Python FastAPI được tạo ra có chung cấu trúc, chuẩn đặt tên, cơ chế bảo mật, xử lý lỗi và đồng bộ dữ liệu.

---

## I. THÔNG TIN CÔNG NGHỆ CHUẨN (TECH STACK CONVENTIONS)

Khi viết code cho bất kỳ service nào, trợ lý AI phải tuân thủ đúng phiên bản và thư viện sau:

*   **Java Services:** Spring Boot `3.2.x`, Java `17`, Build tool **Maven** (`pom.xml`).
    *   *Dependency Management:* Khai báo tập trung trong Maven Parent POM để quản lý phiên bản thống nhất.
    *   *Database ORM:* Spring Data JPA + Hibernate.
    *   *NoSQL ORM:* Spring Data MongoDB.
    *   *Communication:* Spring Cloud OpenFeign (gọi REST nội bộ), WebClient (Non-blocking).
    *   *Json Library:* Jackson (chỉnh cấu hình mặc định là Snake Case hoặc Camel Case tương ứng từng DB).
*   **Python AI Service:** Python `3.10+`, Web Framework `FastAPI`.
    *   *ML/DL:* PyTorch, Scikit-learn, LightGBM, Prophet.
    *   *Task Queue:* Celery + Redis.
*   **Databases:**
    *   PostgreSQL `15.x` (mặc định cho dữ liệu giao dịch).
    *   MongoDB `6.x` (cho chat log, similar items, notifications).
    *   Redis `7.x` (Cache & Distributed Lock).
    *   Elasticsearch `8.x` (Semantic & Vector Search).
*   **Message Broker:** Apache Kafka `3.x`.

---

## II. QUY ƯỚC THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE NAMING CONVENTIONS)

### 2.1. Đối với cơ sở dữ liệu quan hệ (PostgreSQL)
1.  **Tên bảng (Tables):** Sử dụng danh từ số nhiều, chữ thường, cách nhau bằng dấu gạch dưới (snake_case). Ví dụ: `orders`, `order_items`, `products`.
2.  **Tên cột (Columns):** Chữ thường (snake_case). Ví dụ: `user_id`, `created_at`, `total_amount`.
3.  **Khóa chính (PK):** Luôn dùng kiểu `BIGSERIAL` (hoặc `BIGINT` tự tăng) với tên cột là `id`.
4.  **Khóa ngoại (FK):** Do đây là kiến trúc Microservice độc lập DB, **không tạo Physical Foreign Key** giữa các DB của các service khác nhau (Logical FK). Tên cột khóa ngoại đặt dạng `singular_table_name_id` (Ví dụ: `user_id`, `product_id`).
5.  **Cột Audit mặc định:** Mọi bảng giao dịch bắt buộc phải có:
    *   `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
    *   `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`

### 2.2. Đối với NoSQL (MongoDB)
1.  **Tên Collection:** Số nhiều, kiểu camelCase (Ví dụ: `chatMessages`, `productSimilarities`, `notifications`).
2.  **Trường dữ liệu:** Kiểu camelCase (Ví dụ: `productId`, `similarityScore`, `updatedAt`).
3.  **Khóa chính:** Luôn dùng mặc định `_id` của MongoDB kiểu `ObjectId`.

---

## III. CẤU TRÚC THƯ MỤC DỰ ÁN CHUẨN (STANDARD DIRECTORY STRUCTURE)

Mọi Microservice tạo ra phải tuân thủ cấu trúc thư mục sau để dễ dàng bảo trì và phát triển song song:

### 3.1. Cấu trúc Java Spring Boot (Maven Layout)
Thư mục gốc tuân thủ chuẩn Maven với `pom.xml`:
```
[service-name]/
├── pom.xml                             # Cấu hình Maven Dependencies & Build Plugins
├── Dockerfile                          # Dockerfile đóng gói Multi-stage build
└── src/
    ├── main/
    │   ├── java/com/ecommerce/[service_name]/
    │   │   ├── config/                 # Spring Configurations (Security, Redis, Kafka, Swagger)
    │   │   ├── controller/             # REST API Controllers (Phân tách public/internal/secured)
    │   │   ├── service/                # Business Logic (Tách interface và class impl)
    │   │   │   └── impl/
    │   │   ├── repository/             # Spring Data Repositories (Postgres JPA / MongoDB)
    │   │   ├── entity/                 # Database Entities hoặc MongoDB Documents
    │   │   ├── dto/                    # Data Transfer Objects (Request/Response)
    │   │   │   ├── request/
    │   │   │   └── response/
    │   │   ├── exception/              # Custom Exceptions & Global Exception Handler
    │   │   ├── event/                  # Event-driven elements (Kafka Consumer / Producer)
    │   │   │   ├── consumer/
    │   │   │   └── producer/
    │   │   └── client/                 # OpenFeign Clients hoặc WebClients gọi chéo service
    │   └── resources/
    │       ├── application.yml         # Cấu hình môi trường mặc định (Local)
    │       ├── application-docker.yml  # Cấu hình môi trường Docker Compose
    │       └── templates/              # HTML Templates (nếu có, Thymeleaf)
    └── test/                           # Thư mục chứa Unit Test và Integration Test
```

### 3.2. Cấu trúc Python FastAPI (AI Service Layout)
```
ai-engine-service/
├── requirements.txt                    # Danh sách thư viện Python
├── Dockerfile                          # Dockerfile đóng gói ứng dụng Python
├── main.py                             # Khởi tạo FastAPI App & Middleware
└── app/
    ├── core/                           # Config, Database client, Security settings
    ├── api/                            # REST Endpoints
    │   ├── router.py                   # Tập hợp router chính
    │   └── endpoints/                  # Định nghĩa chi tiết (chat, pricing, forecast)
    ├── models/                         # Pydantic schemas (DTOs) & ML Model classes
    ├── services/                       # Business logic, RAG pipeline, Model Inference
    └── workers/                        # Celery workers & Cron tasks (RFM Segmentation)
```

---

## IV. QUY ƯỚC THIẾT KẾ API (REST API DESIGN)

### 3.1. Phân loại Namespace API
Bắt buộc chia Endpoint thành 3 nhóm rõ rệt để cấu hình API Gateway:
1.  **API Công khai (Public API):** Không cần đăng nhập. Prefix: `/api/v1/public/**` (Ví dụ: `/api/v1/public/products/{id}`).
2.  **API Cần xác thực (Secured API):** Cần JWT Token. Prefix: `/api/v1/**` (Ví dụ: `/api/v1/orders/checkout`).
3.  **API Nội bộ (Internal API):** Chỉ dùng để các service gọi chéo nhau, API Gateway chặn cứng từ bên ngoài. Prefix: `/api/internal/**` (Ví dụ: `/api/internal/users/{id}/profile-ai`).

### 3.2. Cấu trúc Response chuẩn (Unified Response Wrapper)
Tất cả các API REST (Spring Boot & FastAPI) đều phải trả về chung một định dạng JSON để Frontend dễ xử lý:

```json
{
  "code": "SUCCESS",            // Mã code nghiệp vụ (Ví dụ: SUCCESS, NOT_FOUND, INVALID_PARAM, PAYMENT_REQUIRED)
  "message": "Thao tác thành công",
  "data": { ... }               // Payload dữ liệu (có thể là Object hoặc Array, NULL nếu không có)
}
```

### 3.3. Class Wrapper trong Java
```java
public class ApiResponse<T> {
    private String code;
    private String message;
    private T data;

    public static <T> ApiResponse<T> success(T data) {
        ApiResponse<T> response = new ApiResponse<>();
        response.setCode("SUCCESS");
        response.setMessage("Success");
        response.setData(data);
        return response;
    }

    public static <T> ApiResponse<T> error(String code, String message) {
        ApiResponse<T> response = new ApiResponse<>();
        response.setCode(code);
        response.setMessage(message);
        response.setData(null);
        return response;
    }
}
```

---

## V. QUY ƯỚC BẢO MẬT & XÁC THỰC (SECURITY CONVENTIONS)

*   **Nguyên tắc "Gateway làm hết":** Các Microservices nghiệp vụ **KHÔNG** tự ý liên kết với Keycloak để xác thực. Việc giải mã và verify JWT Token được thực hiện duy nhất tại API Gateway.
*   **Trích xuất thông tin người dùng:** Sau khi verify token thành công, API Gateway sẽ inject các thông tin sau vào HTTP Header. Các Service nghiệp vụ chỉ cần đọc Header này:
    *   `X-User-Id`: ID định danh của User (String UUID từ Keycloak).
    *   `X-User-Email`: Email của người dùng.
    *   `X-User-Roles`: Danh sách quyền, phân tách bằng dấu phẩy (Ví dụ: `ROLE_USER,ROLE_ADMIN`).
*   **Code Helper đọc User Context (Java Spring):**
```java
public class UserContextHolder {
    public static String getUserId() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        return attributes != null ? attributes.getRequest().getHeader("X-User-Id") : null;
    }
}
```

---

## VI. QUY ƯỚC SỰ KIỆN KAFKA (EVENT-DRIVEN CONVENTIONS)

### 6.1. Cấu trúc Sự kiện chuẩn (Event Payload Schema)
Mọi Event đẩy lên Kafka phải chứa trường thông tin Metadata bao gồm `eventType` và `timestamp`:

```json
{
  "eventId": "uuid-v4-string",
  "eventType": "OrderCreatedEvent",
  "timestamp": "2026-06-09T07:00:00Z",
  "payload": {
    "orderId": 10023,
    "userId": 101,
    "totalAmount": 450000.0
  }
}
```

### 6.2. Đảm bảo tính Nhất quán & Chống mất mát dữ liệu
1.  **Outbox Pattern:** Đối với các sự kiện cốt lõi (Tạo đơn hàng, Thanh toán thành công), Service **không được phép** bắn trực tiếp lên Kafka trong Thread xử lý chính. 
    *   Bắt buộc phải lưu Event vào bảng `outbox_events` trong cùng một Database Transaction của nghiệp vụ.
    *   Một Scheduler chạy ngầm sẽ quét bảng `outbox_events` và publish lên Kafka để đảm bảo tính **At-Least-Once Delivery**.
2.  **Idempotent Consumer (Chống xử lý trùng lặp):** 
    *   Phía Consumer nhận Event bắt buộc phải kiểm tra trùng lặp thông qua Khóa duy nhất (Unique Key) hoặc bảng kiểm tra trùng lặp trước khi thực thi.
    *   Ví dụ: Notification Consumer dựa trên cặp `(orderId, eventType)` để tránh gửi 2 email cho cùng 1 đơn hàng.

---

## VII. XỬ LÝ NGOẠI LỆ TẬP TRUNG (GLOBAL EXCEPTION HANDLING)

Tất cả các lỗi xảy ra trong quá trình chạy ứng dụng đều phải được bắt (catch) và chuyển đổi thành ApiResponse chuẩn. Không được phép để lộ Raw Stack Trace của Java/Python ra Client.

### 7.1. Java Controller Advice
```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
        log.warn("Business error occurred: {}", ex.getMessage());
        return ResponseEntity
            .status(ex.getHttpStatus())
            .body(ApiResponse.error(ex.getErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneralException(Exception ex) {
        log.error("Internal server error", ex);
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.error("INTERNAL_SERVER_ERROR", "Đã có lỗi hệ thống xảy ra. Vui lòng thử lại sau."));
    }
}
```

### 7.2. Mã lỗi chuẩn (Error Code Registry)
*   `UNAUTHORIZED`: Token không hợp lệ hoặc hết hạn.
*   `FORBIDDEN`: Không có quyền truy cập endpoint.
*   `NOT_FOUND`: Không tìm thấy tài nguyên (User, Product, Order).
*   `OUT_OF_STOCK`: Hết hàng trong kho khi đặt hàng.
*   `BUDGET_EXHAUSTED`: Ngân sách khuyến mãi đã hết.
*   `FRAUD_DETECTED`: Phát hiện hành vi gian lận ưu đãi.

---

## VIII. QUY TẮC KHÔNG HARDCODE CHUẨN (ZERO HARDCODING RULES)

Để đảm bảo hệ thống có thể cấu hình linh hoạt khi chuyển đổi giữa các môi trường (`local`, `docker-compose`, `kubernetes`):

1. **Database & Middleware Credentials:** Tuyệt đối không viết trực tiếp username, password hoặc IP. Phải dùng placeholder và cấu hình fallback:
   ```yaml
   spring:
     datasource:
       url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:ecommerce_db}
       username: ${DB_USER:postgres}
       password: ${DB_PASSWORD:postgres}
     data:
       redis:
         host: ${REDIS_HOST:localhost}
         port: ${REDIS_PORT:6379}
   ```
2. **Kafka Bootstrap Servers:**
   ```yaml
   spring:
     kafka:
       bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
   ```
3. **Gọi chéo Service nghiệp vụ (Internal Service Calls):** 
   * Không dùng IP cứng. Bắt buộc dùng Feign Client gọi qua tên ứng dụng đăng ký trên Eureka:
     ```java
     @FeignClient(name = "product-service")
     public interface ProductClient {
         @GetMapping("/api/internal/products/price-info")
         ApiResponse<PriceInfoResponse> getPriceInfo(@RequestParam("ids") List<Long> productIds);
     }
     ```
4. **JWT Keys & Secrets:** Phải nạp từ biến môi trường hoặc Vault:
   ```yaml
   jwt:
     secret: ${JWT_SECRET_KEY:default-development-super-secret-key-32-chars-minimum}
   ```
5. **Cấu hình Profiles rõ ràng:**
   * `application.yml`: Chứa các giá trị mặc định trỏ về `localhost` để dev chạy trực tiếp từ IDE.
   * `application-docker.yml` / `application-prod.yml`: Ghi đè (Override) các host trỏ về tên service trong docker network (Ví dụ: `DB_HOST=postgres`, `REDIS_HOST=redis`, `KAFKA_BOOTSTRAP_SERVERS=kafka:9092`).

---

## IX. HƯỚNG DẪN BUILD & CHẠY CHUẨN MAVEN (BUILD & RUN GUIDE)

### 9.1. Lệnh build với Maven
1. **Dọn dẹp và Build đóng gói file JAR (Bỏ qua unit test):**
   ```bash
   mvn clean package -DskipTests
   ```
2. **Chạy Unit Test và xuất báo cáo coverage:**
   ```bash
   mvn clean test
   ```

### 9.2. Lệnh chạy ứng dụng Spring Boot
1. **Chạy local trên máy dev (Profile default):**
   ```bash
   java -jar target/[service-name]-0.0.1-SNAPSHOT.jar
   ```
2. **Chạy với Docker Profile (để kết nối các container khác trong mạng Docker):**
   ```bash
   java -jar -Dspring.profiles.active=docker target/[service-name]-0.0.1-SNAPSHOT.jar
   ```

### 9.3. Cấu trúc Dockerfile mẫu (Multi-Stage Build)
Mọi Java Microservice phải sử dụng chung cấu trúc Dockerfile tối ưu dung lượng sau:
```dockerfile
# Stage 1: Build ứng dụng
FROM maven:3.8.4-openjdk-17-slim AS build
WORKDIR /app
COPY pom.xml .
# Down trước dependencies để tận dụng cache Docker layer
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Runtime image siêu nhẹ
FROM openjdk:17-jdk-slim
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]
```

---

## X. QUY TẮC RÀNG BUỘC KHI AI VIẾT CODE

1.  **Không Hardcode IP/Port:** Luôn sử dụng biến môi trường hoặc dịch vụ phân giải tên (Eureka).
2.  **Bắt buộc viết Unit Test:** Khi tạo một API hoặc Service Class mới, AI luôn phải tạo kèm theo Unit Test (JUnit 5 + Mockito) bao trùm tối thiểu 80% logic nghiệp vụ.
3.  **Tối ưu hóa các kết nối mạng:** Luôn áp dụng Circuit Breaker (Resilience4j) cho các API gọi ra bên ngoài (như gọi qua Python AI hoặc cổng thanh toán) để tránh treo luồng hệ thống.
4.  **Bảo tồn Comments:** Không được tự ý xóa các comment giải thích thuật toán hoặc nghiệp vụ phức tạp có sẵn trong code gốc.

---
*Tài liệu hướng dẫn quy ước hệ thống — Dành riêng cho thiết kế & lập trình chuyên sâu.*
