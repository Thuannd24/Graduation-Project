# TÀI LIỆU THIẾT KẾ: PROMOTION & CAMPAIGN SERVICE (CAMUNDA 7 EMBEDDED)
## (Dịch vụ Khuyến mãi & Điều phối Chiến dịch)

> **Port:** `8087` | **DB:** `ecommerce_promotion_db` (PostgreSQL) + Redis | **Camunda Version:** Camunda 7.20.0 (Embedded) | **Version:** 1.0.0

---

## I. TỔNG QUAN VÀ NHIỆM VỤ

### 1.1. Mô tả nghiệp vụ

| Nhóm chức năng | Chi tiết |
|---|---|
| **Quản lý Chiến dịch (Campaign)** | Tạo mới, cấu hình ngân sách, thời hạn áp dụng, trạng thái chiến dịch |
| **Nhúng Camunda 7 Engine** | Chạy embedded Camunda Engine trong service để tự quản lý vòng đời luồng, bảng quyết định DMN và REST API `/engine-rest` |
| **Xử lý Java Delegates** | Chạy in-memory các Service Tasks thông qua các class implement `JavaDelegate` của Camunda 7 |
| **AI Price Sensitivity Scoring** | Tích hợp Client gọi Python AI Service để lấy điểm nhạy cảm giá ($p\_score$) của khách hàng |
| **Validate Chốt chặn (Guards)** | Triển khai các chốt chặn: Giá vốn (Cost Price Guard), trần giảm giá tối đa (Max Discount Cap) |
| **Quản lý ngân sách thời gian thực** | Dùng Redis Atomic Counter để trừ ngân sách chiến dịch song song |

### 1.2. Vị trí trong kiến trúc và Luồng đi

```
                    [Khách checkout đơn hàng]
                                │
                                ▼
                       [Order Service :8082]
                                │
                      (POST /engine-rest/...)
                                │
                                ▼
         ┌─────────────────────────────────────────────┐
         │         Promotion Service (:8087)           │
         │  ┌───────────────────────────────────────┐  │
         │  │       Embedded Camunda 7 Engine       │  │
         │  └──────┬────────────┬────────────┬──────┘  │
         │         │            │            │         │
         │         ▼            ▼            ▼         │
         │  [FraudDelegate] [AIDelegate] [GuardDelegate]
         └─────────┬────────────┬────────────┬─────────┘
                   │            │            │
                   ▼            ▼            ▼
             [PostgreSQL]    [Redis]   [Python AI Service]
```

---

## II. THIẾT KẾ ĐIỀU PHỐI VỚI CAMUNDA 7 (JAVA DELEGATES)

Trong kiến trúc Camunda 7 Embedded, các Service Task trong sơ đồ BPMN sẽ liên kết trực tiếp với các Spring Bean thông qua thuộc tính `camunda:delegateExpression="${beanName}"`. 

Mỗi khi luồng đi qua Service Task, Camunda Engine sẽ gọi method `execute(DelegateExecution execution)` trong bộ nhớ (In-Memory execution), giúp tối ưu tốc độ xử lý (< 5ms).

```
[BPMN Service Task] ──► camunda:delegateExpression="${fraudCheckDelegate}"
                              │
                              ▼
                [FraudCheckDelegate.java] ➔ execute()
```

### 2.1. Chi tiết 4 Java Delegates cốt lõi:

#### 1. `FraudCheckDelegate` (Spring Bean: `fraudCheckDelegate`)
*   **Nhiệm vụ:** Validate chống gian lận đa tài khoản/thiết bị/IP.
*   **Logic thực thi:**
    *   Lấy các biến từ Execution: `userId`, `deviceId`, `ipAddress`, `recipientPhone`.
    *   Tăng counter trên Redis với TTL 1 giờ để kiểm tra giới hạn tần suất (Velocity Checking).
    *   Truy vấn PostgreSQL bảng `user_devices` để kiểm tra số lượng tài khoản đăng nhập trên cùng thiết bị.
    *   Nếu phát hiện gian lận, set biến process `isFraud = true`.

#### 2. `GetAIScoreDelegate` (Spring Bean: `getAIScoreDelegate`)
*   **Nhiệm vụ:** Lấy độ nhạy cảm giá cá nhân hóa (Personalized Price Sensitivity Score) từ Python AI Service.
*   **Logic thực thi:**
    *   Nếu `isFraud == true` ➔ Bỏ qua (Bypass), không cần gọi AI.
    *   Nếu an toàn:
        1. Gọi REST API nội bộ của Identity & User Service: `GET /api/internal/users/{userId}/profile-ai` để lấy thông tin `customerTier` (GOLD/VIP/...) và `segmentationLabel` (Nguy cơ rời bỏ/VIP Champions/...).
        2. Dùng `WebClient` gọi API REST của Python AI Service: `POST /api/ai/pricing/predict` với request payload chứa các trường: `userId`, `productId`, `customerTier`, `segmentationLabel`, `cartTotal`.
        3. Nhận về $p\_score$ (Ví dụ: `0.78`) đại diện cho mức độ nhạy cảm giá và set biến process `priceSensitivity = "HIGH"` (hoặc `MEDIUM`/`LOW`).

#### 3. `CostPriceGuardDelegate` (Spring Bean: `costPriceGuardDelegate`)
*   **Nhiệm vụ:** Thực thi chốt chặn biên lợi nhuận và áp trần giảm giá.
*   **Logic thực thi:**
    *   Đọc các biến: `orderValue` (giá trị đơn), `costPrice` (giá vốn sản phẩm), `suggestedPercent` (mức giảm đề xuất từ DMN).
    *   Áp dụng công thức biên sàn tối thiểu 10%:
        $$\text{Giá trị sau giảm tối thiểu} = P_{cost} \times 1.10$$
    *   Nếu đề xuất vượt quá biên sàn ➔ Ghi đè (Override) mức giảm giá.
    *   Áp dụng trần giảm tối đa: 30% giá trị đơn hàng và không quá 500,000 VNĐ.
    *   Ghi các biến kết quả: `finalDiscountPercent`, `finalDiscountAmount` vào execution.

#### 4. `BudgetDeductDelegate` (Spring Bean: `budgetDeductDelegate`)
*   **Nhiệm vụ:** Khấu trừ ngân sách chiến dịch thời gian thực.
*   **Logic thực thi:**
    *   Sử dụng Redis `DECRBY campaign:budget:{campaignId} {finalDiscountAmount}`.
    *   Nếu ngân sách trả về $\le 0$:
        *   Cập nhật trạng thái chiến dịch trong DB PostgreSQL thành `EXHAUSTED`.
        *   Tắt cờ kích hoạt trên Redis để các đơn hàng sau đi vào nhánh bypass (giảm 0%).

---

## III. CÔNG NGHỆ SỬ DỤNG

| Thành phần | Công nghệ | Lý do lựa chọn |
|---|---|---|
| **Framework** | Spring Boot 3.2.x | Tương thích Java 17+, hiệu năng cao |
| **Camunda 7 Engine** | `camunda-bpm-spring-boot-starter-webapp` | Nhúng trực tiếp Engine và Cockpit UI để Admin theo dõi luồng |
| **Database** | PostgreSQL | Hỗ trợ transaction ACID, lưu cấu hình và log |
| **Cache & Counter** | Redis (Lettuce Client) | Bộ đếm atomic tốc độ cao để quản lý ngân sách và giới hạn IP |

---

## IV. THIẾT KẾ DATABASE

### 4.1. Schema `ecommerce_promotion_db`

Ngoài các bảng mặc định của Camunda 7 (tiền tố `ACT_*`), database của service cần thiết kế các bảng phục vụ business khuyến mãi:

#### Bảng `campaigns` (Cấu hình chiến dịch)
```sql
CREATE TABLE campaigns (
    id                            VARCHAR(50)     PRIMARY KEY,
    name                          VARCHAR(255)    NOT NULL,
    total_budget                  DECIMAL(15,2)   NOT NULL,
    remaining_budget              DECIMAL(15,2)   NOT NULL,
    status                        VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT, ACTIVE, EXHAUSTED, PAUSED',
    start_date                    TIMESTAMP       NOT NULL,
    end_date                      TIMESTAMP       NOT NULL,
    bpmn_process_definition_key   VARCHAR(100)    COMMENT 'ID definition của luồng trên Camunda',
    created_by                    VARCHAR(50)     NOT NULL,
    approved_by                   VARCHAR(50),
    created_at                    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_campaign_status ON campaigns(status);
```

#### Bảng `fraud_logs` (Ghi nhận tài khoản lạm dụng/gian lận)
```sql
CREATE TABLE fraud_logs (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL,
    order_id        BIGINT,
    ip_address      VARCHAR(45)     NOT NULL,
    device_id       VARCHAR(100)    NOT NULL,
    reason          VARCHAR(255)    NOT NULL COMMENT 'Lý do: DEVICE_LIMIT_EXCEEDED, VELOCITY_LIMIT',
    detected_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_fraud_user ON fraud_logs(user_id);
CREATE INDEX idx_fraud_device ON fraud_logs(device_id);
```

### 4.2. Redis Key Design cho Tốc Độ Cao

| Key Pattern | Type | TTL | Mô tả |
|---|---|---|---|
| `campaign:budget:{campaignId}` | String | Theo thời gian kết thúc chiến dịch | Đếm ngân sách còn lại thời gian thực |
| `velocity:user:{userId}:{campaignId}` | String (Counter) | 24 giờ | Đếm số lần đặt đơn áp mã của User |
| `velocity:device:{deviceId}:{campaignId}` | String (Counter) | 24 giờ | Đếm số lần đặt đơn của 1 Device |
| `velocity:ip:{ipAddress}` | String (Counter) | 1 giờ | Giới hạn 1 đơn/giờ trên 1 địa chỉ IP |

---

## V. ĐẶC TẢ API

### 5.1. Camunda 7 Engine REST Endpoints (Mặc định)
Kích hoạt endpoint mặc định của Camunda bằng cách cấu hình trong `application.yml`:
*   `GET /engine-rest/process-definition` -> Lấy danh sách luồng đã deploy.
*   `POST /engine-rest/process-definition/key/{key}/start` -> Khởi chạy luồng khuyến mãi động khi khách nhấn Checkout.

### 5.2. Custom Business Endpoints (Cần Token Quản Trị)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/campaigns` | Tạo mới chiến dịch dạng DRAFT |
| POST | `/api/campaigns/{id}/approve` | Phê duyệt và deploy file BPMN lên Camunda |
| GET | `/api/campaigns/{id}/simulate` | Giả lập chạy thử chiến dịch để đo biên lợi nhuận |

#### `POST /api/campaigns`
*   **Request Body:**
```json
{
  "id": "black_friday_2026",
  "name": "Chiến dịch Black Friday 2026",
  "totalBudget": 100000000.00,
  "startDate": "2026-11-27T00:00:00",
  "endDate": "2026-11-30T23:59:59"
}
```
*   **Response 201 Created:**
```json
{
  "id": "black_friday_2026",
  "status": "DRAFT",
  "message": "Chiến dịch nháp được tạo thành công. Vui lòng thiết kế và phê duyệt để chạy."
}
```

---

## VI. CẤU HÌNH DOCKER COMPOSE

```yaml
promotion-service:
  image: ecommerce/promotion-service-c7:latest
  ports:
    - "8087:8087"
  environment:
    SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ecommerce_promotion_db
    SPRING_DATASOURCE_USERNAME: postgres
    SPRING_DATASOURCE_PASSWORD: password
    SPRING_DATA_REDIS_HOST: redis
    CAMUNDA_BPM_DATABASE_SCHEMA-UPDATE: "true"
    PYTHON_AI_SERVICE_URL: http://ai-pricing-service:5000
  depends_on:
    - postgres
    - redis
  networks:
    - ecommerce-network

---

## VII. YÊU CẦU THAY ĐỔI TẠI CÁC SERVICE KHÁC (INTEGRATION REQUIREMENTS)

Để tích hợp thành công hệ thống điều phối khuyến mãi qua Camunda 7, các microservices khác trong hệ thống cần triển khai các bổ sung về Database Schema và API như sau:

### 7.1. Identity & User Service (Port 8085)

*   **Thay đổi Database Schema (`user_db`):**
    *   **Thêm cột vào bảng `users`:**
        ```sql
        ALTER TABLE users ADD COLUMN customer_tier VARCHAR(20) DEFAULT 'MEMBER' COMMENT 'VIP, GOLD, SILVER, MEMBER';
        ALTER TABLE users ADD COLUMN is_blacklisted BOOLEAN DEFAULT FALSE COMMENT 'Đánh dấu tài khoản bị chặn khuyến mãi';
        ```
    *   **Tạo bảng mới `user_devices` (để theo dõi Device Fingerprint phục vụ chống Fraud):**
        ```sql
        CREATE TABLE user_devices (
            id          BIGSERIAL       PRIMARY KEY,
            user_id     BIGINT          NOT NULL COMMENT 'FK -> users.id',
            device_id   VARCHAR(100)    NOT NULL COMMENT 'Vân tay thiết bị (Fingerprint ID)',
            ip_address  VARCHAR(45)     NOT NULL COMMENT 'Địa chỉ IP đăng nhập gần nhất',
            last_used   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_user_device (user_id, device_id)
        );
        CREATE INDEX idx_device_id ON user_devices(device_id);
        ```
*   **Yêu cầu API:**
    *   API lấy thông tin profile `GET /api/users/{id}` phải trả về kèm thông tin `customer_tier` và `is_blacklisted`.

---

### 7.2. Product & Catalog Service (Port 8089)

*   **Thay đổi Database Schema (`product_db`):**
    *   **Thêm cột vào bảng `products` & `product_variants`:**
        ```sql
        ALTER TABLE products ADD COLUMN cost_price DECIMAL(15,2) NOT NULL DEFAULT 0.0 COMMENT 'Giá vốn nhập hàng';
        ALTER TABLE product_variants ADD COLUMN cost_price DECIMAL(15,2) COMMENT 'Giá vốn riêng của biến thể (nếu có)';
        ```
*   **Yêu cầu API nội bộ (Chỉ mở trong mạng nội bộ):**
    *   Cung cấp API REST `POST /api/internal/products/price-info` để Promotion Service gọi lấy thông tin giá gốc và giá vốn.
    *   **Request Payload:**
        ```json
        {
          "items": [
            { "productId": 101, "variantId": 201 },
            { "productId": 102, "variantId": 0 }
          ]
        }
        ```
    *   **Response Payload:**
        ```json
        {
          "items": [
            { "productId": 101, "variantId": 201, "sellingPrice": 2500000.0, "costPrice": 1800000.0 },
            { "productId": 102, "variantId": 0, "sellingPrice": 500000.0, "costPrice": 350000.0 }
          ]
        }
        ```

---

### 7.3. Cart & Order Service (Port 8082)

*   **Thay đổi Database Schema (`order_db`):**
    *   **Thêm các cột theo dõi vào bảng `orders`:**
        ```sql
        ALTER TABLE orders ADD COLUMN applied_campaign_id VARCHAR(50) COMMENT 'ID chiến dịch Camunda áp dụng';
        ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(15,2) DEFAULT 0.0 COMMENT 'Số tiền giảm giá thực tế';
        ```
*   **Tích hợp cuộc gọi đến Camunda 7 REST Engine (khi khách nhấn Checkout):**
    *   Trước khi lưu đơn hàng chính thức vào database, `Order Service` thực hiện gọi REST API đồng bộ sang `Promotion Service` để bắt đầu tiến trình tính giá khuyến mãi:
        *   **Method:** `POST`
        *   **URL:** `http://promotion-service:8087/engine-rest/process-definition/key/personalized_promotion_workflow/start`
        *   **Request Body:**
            ```json
            {
              "variables": {
                "userId": { "value": 123, "type": "Long" },
                "deviceId": { "value": "dev_abc123456", "type": "String" },
                "ipAddress": { "value": "192.168.1.5", "type": "String" },
                "orderValue": { "value": 3000000.0, "type": "Double" },
                "costPrice": { "value": 2150000.0, "type": "Double" }
              },
              "withVariablesInReturn": true
            }
            ```
        *   **Response 200 OK (Camunda 7 trả về kèm các biến kết quả):**
            ```json
            {
              "id": "inst_987654321",
              "definitionId": "personalized_promotion_workflow:1:12345",
              "variables": {
                "finalDiscountAmount": { "value": 300000.0, "type": "Double" },
                "finalDiscountPercent": { "value": 10.0, "type": "Double" },
                "campaignId": { "value": "holiday_sales_2026", "type": "String" }
              }
            }
            ```
    *   `Order Service` đọc giá trị `finalDiscountAmount` và `campaignId` từ response, thực hiện trừ trực tiếp vào hóa đơn: `final_amount = total_amount - discount_amount` và lưu đơn hàng xuống DB.
