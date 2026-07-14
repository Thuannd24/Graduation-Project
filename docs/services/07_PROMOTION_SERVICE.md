# TÀI LIỆU THIẾT KẾ: PROMOTION & CAMPAIGN SERVICE (LOW-CODE CAMPAIGN BUILDER + CAMUNDA 7 EMBEDDED)
## (Dịch vụ Khuyến mãi & Điều phối Chiến dịch)

> **Port:** `8087` | **DB:** `ecommerce_promotion_db` (MariaDB, JDBC `jdbc:mariadb://...:3308/...`) + Redis | **Camunda Version:** Camunda 7 (Embedded Engine, `history-level: full`) | **Version:** theo code hiện tại (không còn module chống gian lận / AI Pricing)

---

## I. TỔNG QUAN VÀ NHIỆM VỤ

### 1.1. Mô tả nghiệp vụ

| Nhóm chức năng | Chi tiết |
|---|---|
| **Campaign Builder (Low-code)** | Admin/Staff thiết kế luồng khuyến mãi trên FE dưới dạng đồ thị (`nodes` + `edges`), backend validate rồi biên dịch (compile) sang BPMN 2.0 XML và deploy lên Camunda Engine |
| **Nhúng Camunda 7 Engine** | `RuntimeService`, `RepositoryService`, `HistoryService` chạy embedded trong service để deploy process definition, start process instance, đọc lịch sử/biến quá trình |
| **Xử lý Java Delegates** | 6 `JavaDelegate` thật xử lý các Service Task: phát voucher (percent/fixed/freeship), nâng hạng thành viên, tặng điểm loyalty, gửi email |
| **Kích hoạt Campaign (Trigger)** | Theo **sự kiện nghiệp vụ** nhận qua Kafka (đăng ký mới, đơn hàng thành công, đánh giá sản phẩm) hoặc theo **lịch trình định kỳ** (Camunda `timerEventDefinition` sinh từ `cronExpression`/`startDate`+`endDate`) |
| **Quản lý ngân sách chiến dịch** | Trừ/hoàn ngân sách (`remainingBudget`) trực tiếp trên bảng `campaigns` (MariaDB) bằng pessimistic lock, không dùng Redis atomic counter cho ngân sách |
| **Quản lý Voucher** | Phát hành, tra cứu, áp dụng (reserve khi checkout), redeem/hoàn khi thanh toán thành công/thất bại, tự động hết hạn (scheduled job) |

> Các mô-đun **KHÔNG tồn tại** trong code hiện tại (đã bị loại bỏ hoàn toàn khỏi hệ thống, không đưa vào tài liệu này): chống gian lận đa tài khoản/thiết bị/IP (`FraudCheckDelegate`, bảng `fraud_logs`, `user_devices`, `is_blacklisted`), AI Price Sensitivity Scoring (`GetAIScoreDelegate`, Python AI Service), chốt chặn giá vốn/trần giảm giá theo biên lợi nhuận (`CostPriceGuardDelegate`, `cost_price`), khấu trừ ngân sách qua Redis (`BudgetDeductDelegate`).

### 1.2. Vị trí trong kiến trúc và Luồng đi

**Luồng thiết kế & deploy chiến dịch (Admin):**

```
   [Admin/Staff – Campaign Builder UI trên FE]
                    │  (kéo-thả node, nối edge)
                    ▼
   POST /api/v1/admin/campaigns/validate  ──► WorkflowValidatorService
                    │ (hợp lệ)
                    ▼
   POST /api/v1/admin/campaigns  (workflowJson)
                    │
                    ▼
         WorkflowValidatorService.validate()  ──(lỗi)──► 400 + danh sách lỗi theo node
                    │ (hợp lệ)
                    ▼
         BpmnCompilerService.compile()  →  BPMN 2.0 XML
                    │
                    ▼
      RepositoryService.createDeployment()  →  Camunda Engine (embedded)
                    │
                    ▼
      Lưu Campaign (MariaDB): workflowJson, bpmnXml, bpmnProcessDefinitionKey, triggerType
```

**Luồng kích hoạt chiến dịch theo sự kiện (runtime):**

```
[user-service/order-service/payment-service] ──Kafka──► [PromotionKafkaConsumer]
   topics: user-created-events, payment-events, order-events, product-reviewed-events
                    │
                    ▼
      CampaignTriggerService.triggerByEventType(triggerType, eventVariables)
                    │  (lọc theo triggerType + startDate/endDate + active
                    │   + trigger filter: minOrderValue / minRating
                    │   + Redis lock chống trigger trùng lặp theo businessKey)
                    ▼
      CampaignVariableEnricher.enrich()  ──► gọi UserClient/OrderClient/ProductClient
                    │  bổ sung: memberRank, totalSpending, shippingAddress→targetProvince,
                    │           orderProductIds/orderCategoryIds, containsProduct/containsCategory
                    ▼
      RuntimeService.startProcessInstanceById(...)  (Camunda Engine chạy BPMN)
                    │
        ┌───────────┼───────────────┬─────────────────┬───────────────────┐
        ▼           ▼               ▼                 ▼                   ▼
  IssueVoucher*  UpgradeMemberRank  LoyaltyPoint    SendEmail          (Condition = Gateway,
  Delegate       Delegate           Delegate        Delegate            không gọi service ngoài)
        │           │               │                 │
        ▼           ▼               ▼                 ▼
  IssuedVoucher   user-service    user-service    notification-service
  (MariaDB) +     PUT .../tier    PUT .../points   POST /internal/notifications/send
  campaigns.
  remainingBudget
```

**Luồng redeem voucher khi checkout (Order Service gọi sang):**

```
[Order/Checkout] ──POST /api/internal/vouchers/apply──► InternalVoucherController
                              │
                              ▼
                  VoucherRedemptionServiceImpl.apply()
                  (kiểm tra sở hữu, hết hạn, trạng thái, ràng buộc category/product,
                   tính discount, set status = RESERVED, gắn usedOrderId)
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼ thanh toán thành công                       ▼ hủy/thanh toán thất bại
POST /api/internal/vouchers/redeem                POST /api/internal/vouchers/release
(status: RESERVED → USED)                         (status: RESERVED → UNUSED, gỡ usedOrderId)
```

---

## II. CAMPAIGN BUILDER: WORKFLOW GRAPH → BPMN → CAMUNDA

Đây là kiến trúc lõi thay thế hoàn toàn phần "Camunda 7 + Java Delegate cố định" trong các bản thiết kế cũ. Không có DMN, không có Cost Price Guard, không có Fraud Check.

### 2.1. Mô hình dữ liệu Workflow (`WorkflowGraphDto`)

```json
{
  "meta": { "totalBudget": 50000000.0 },
  "nodes": [
    { "id": "n1", "type": "Trigger_Event_OrderSuccess", "name": "Đơn hàng thành công",
      "x": 100, "y": 80, "properties": { "minOrderValue": 200000 } },
    { "id": "n2", "type": "Condition_MemberRank", "name": "Hạng thành viên",
      "x": 320, "y": 80, "properties": { "allowedRanks": ["GOLD", "VIP"] } },
    { "id": "n3", "type": "Action_IssueVoucher_Percent", "name": "Tặng voucher %",
      "x": 540, "y": 40, "properties": { "discountPercent": 10, "maxDiscountAmount": 50000, "expireDays": 7 } },
    { "id": "n4", "type": "End_Event", "name": "Kết thúc", "x": 760, "y": 80, "properties": {} }
  ],
  "edges": [
    { "id": "e1", "from": "n1", "to": "n2", "properties": {} },
    { "id": "e2", "from": "n2", "to": "n3", "isDefault": false,
      "condition": "${memberRank == 'GOLD' || memberRank == 'VIP'}",
      "properties": { "operator": "IN", "value": ["GOLD", "VIP"] } },
    { "id": "e3", "from": "n2", "to": "n4", "isDefault": true, "properties": {} },
    { "id": "e4", "from": "n3", "to": "n4", "properties": {} }
  ]
}
```

`Campaign.workflowJson` lưu nguyên JSON này; `Campaign.bpmnXml` lưu BPMN 2.0 XML biên dịch từ graph; `Campaign.triggerType` được `WorkflowTriggerResolver` trích ra từ node Trigger duy nhất để tối ưu truy vấn khi trigger theo event.

### 2.2. Danh sách Node Type (nguồn xác thực: `WorkflowValidatorService`, `BpmnCompilerService`, FE `constants.js`)

**Trigger (Start Event, in-degree = 0, out-degree = 1, tối đa 1 node/workflow):**

| Node Type | Ánh xạ BPMN | Properties bắt buộc | Nguồn kích hoạt |
|---|---|---|---|
| `Trigger_Event_NewUser` | `bpmn:startEvent` | (không có) | Kafka topic `user-created-events` (event `UserRegisteredEvent`) |
| `Trigger_Event_OrderSuccess` | `bpmn:startEvent` | `minOrderValue` (Number) | Kafka topic `payment-events` (`PaymentSuccessEvent`) hoặc `order-events` (`OrderConfirmedEvent`) |
| `Trigger_Event_ReviewProduct` | `bpmn:startEvent` | `minRating` (1–5) | Kafka topic `product-reviewed-events` (`ProductReviewedEvent`) |
| `Trigger_Timer_Schedule` | `bpmn:startEvent` + `timerEventDefinition` | `cronExpression` **hoặc** cặp `startDate`+`endDate` | Camunda tự kích hoạt theo `timeCycle`/`timeDate` — **không** có poller tuỳ biến ở tầng ứng dụng |

**Condition (Exclusive Gateway, in-degree ≥ 1, out-degree ≥ 2, đúng 1 nhánh `isDefault = true`):**

| Node Type | Properties node | Properties trên mỗi edge (nhánh) |
|---|---|---|
| `Condition_MemberRank` | `allowedRanks` (string/array) | `operator` ∈ {IN, NOT_IN}, `value` ⊆ {MEMBER, SILVER, GOLD, VIP} |
| `Condition_TotalSpending` | `minSpendingAmount`, `daysLookback` (Number) | `operator` ∈ {GREATER_THAN, LESS_THAN, EQUAL}, `value` (Number), `timeRange` ∈ {CURRENT_MONTH, LAST_30_DAYS} |
| `Condition_Location` | `targetProvinces` (array) | `operator` ∈ {EQUAL, NOT_EQUAL}, `value` (array không rỗng) |
| `Condition_ContainsCategory` | `targetIds` (array) | `operator` ∈ {EQUAL, NOT_EQUAL}, `value` (array không rỗng) |
| `Condition_ContainsProduct` | `targetIds` (array) | `operator` ∈ {EQUAL, NOT_EQUAL}, `value` (array không rỗng) |

**Action (Service Task, in-degree ≥ 1, out-degree = 1):**

| Node Type | Bean Delegate | Properties bắt buộc |
|---|---|---|
| `Action_IssueVoucher_Percent` | `issueVoucherPercentDelegate` | `discountPercent` (1–100), `maxDiscountAmount` (> 0), `expireDays` (số nguyên > 0) |
| `Action_IssueVoucher_Fixed` | `issueVoucherFixedDelegate` | `discountAmount` (> 0), `minOrderValue` (Number), `expireDays` (số nguyên > 0) |
| `Action_IssueVoucher_Freeship` | `issueVoucherFreeshippingDelegate` | `maxShippingDiscount` (> 0), `expireDays` (số nguyên > 0) |
| `Action_Upgrade_MemberRank` | `upgradeMemberRankDelegate` | `targetTier` ∈ {SILVER, GOLD, VIP} |
| `Action_Loyalty_Point` | `loyaltyPointDelegate` | `calculationMode` ∈ {FIXED, ORDER_SPEND}; nếu `FIXED` → `pointAmount` ≠ 0; nếu `ORDER_SPEND` → yêu cầu Trigger là `Trigger_Event_OrderSuccess` |
| `Action_Send_Email` | `sendEmailDelegate` | `templateId` **hoặc** `rawContent` (không được cùng trống); nếu dùng template `promotion_voucher_template` thì workflow phải có ít nhất 1 node Tặng Voucher |

**End:** `End_Event` — in-degree ≥ 1, out-degree = 0.

> Đã loại bỏ hoàn toàn `Condition_AntiFraudScore` khỏi `ALL_KNOWN_TYPES`. Một workflow chứa node này sẽ bị `WorkflowValidatorService` báo lỗi `invalid_connectivity` ("type không hợp lệ").

### 2.3. Validate (`WorkflowValidatorService`) — các nhóm quy tắc

1. **Cấu trúc toàn cục:** node type phải thuộc danh sách đã biết; đúng 1 Trigger; ít nhất 1 End Event; nếu có node Tặng Voucher thì `meta.totalBudget` > 0 và nên ≥ tổng `maxDiscountAmount`/`discountAmount`/`maxShippingDiscount` cộng dồn của các node voucher (ước lượng tối thiểu).
2. **Per-node:** kiểm tra in/out-degree theo loại node + tham số bắt buộc/đúng kiểu dữ liệu theo bảng ở 2.2 (loại lỗi: `missing_parameter`, `wrong_data_type`, `invalid_data`, `invalid_connectivity`).
3. **Per-branch (Condition):** mỗi nhánh không phải default phải có `condition` (JUEL) không rỗng, đúng `operator` cho phép, `value` không phải mảng chỉ chứa chuỗi rỗng; đúng **1** nhánh `isDefault = true` (không được 0 hoặc >1); phát hiện 2 nhánh cấu hình **trùng điều kiện** (cùng type + operator + value) → không bao giờ chạy được nhánh sau.
4. **Node cô lập (orphan):** node không phải Trigger/End mà in-degree = 0 và out-degree = 0.
5. **Vòng lặp vô hạn (cycle):** DFS phát hiện chu trình; chu trình chỉ hợp lệ nếu trên đường đi có ít nhất 1 node `Timer` hoặc `Action_Send_*` (có tính "ngắt quãng"), nếu không sẽ báo lỗi.
6. **Reachability:** mọi node có out-degree = 0 phải là `End_Event`.

Kết quả trả về `ValidationResultDto { valid, errors: [{ nodeId, errorType, field, message }], summary }`.

### 2.4. Compile (`BpmnCompilerService`)

Ánh xạ: `Trigger_*` → `bpmn:startEvent` (kèm `timerEventDefinition` nếu là Timer); `Condition_*` → `bpmn:exclusiveGateway` (có `default="..."` là id của nhánh else); `Action_*` → `bpmn:serviceTask` với `camunda:delegateExpression` tra từ `DELEGATE_MAP` + `camunda:asyncBefore="true"` + toàn bộ `properties` của node được ghi vào `camunda:inputParameter` (kèm `actionType`); `End_Event` → `bpmn:endEvent`; mỗi `WorkflowEdgeDto` → `bpmn:sequenceFlow` (có `conditionExpression` nếu không phải default). Service cũng sinh `BPMNDiagram` (toạ độ shape/waypoint) để khớp layout hiển thị trên FE.

`CampaignServiceImpl` **luôn** validate + compile lại từ `workflowJson` phía server khi tạo/cập nhật chiến dịch — không chấp nhận `bpmnXml` gửi trực tiếp từ client (chặn bypass business rule qua gọi API thẳng).

### 2.5. Java Delegates thật (6 delegate, đăng ký bằng `@Component("beanName")`)

| # | Class | Bean | Nhiệm vụ | Ghi chú |
|---|---|---|---|---|
| 1 | `IssueVoucherPercentDelegate` | `issueVoucherPercentDelegate` | Phát voucher giảm % (có trần `maxDiscountAmount`) | Gọi `VoucherIssuanceService.issuePercent`, set `voucherCode`, `voucherId`, `voucherExpiresAt`, `voucherIssued` |
| 2 | `IssueVoucherFixedDelegate` | `issueVoucherFixedDelegate` | Phát voucher giảm tiền cố định (yêu cầu `minOrderValue`) | Gọi `VoucherIssuanceService.issueFixed` |
| 3 | `IssueVoucherFreeshippingDelegate` | `issueVoucherFreeshippingDelegate` | Phát voucher miễn phí vận chuyển (trần `maxShippingDiscount`) | Gọi `VoucherIssuanceService.issueFreeship` |
| 4 | `UpgradeMemberRankDelegate` | `upgradeMemberRankDelegate` | Nâng hạng thành viên | Gọi `UserClient.updateTier(userId, {tier})`; set `rankUpgraded`, `previousMemberRank`, `memberRank` |
| 5 | `LoyaltyPointDelegate` | `loyaltyPointDelegate` | Tặng điểm loyalty (FIXED hoặc theo % chi tiêu đơn hàng) | Gọi `UserClient.updatePoints(userId, {calculationMode, pointAmount, sourceType=CAMPAIGN, campaignId, orderId, orderAmount})` |
| 6 | `SendEmailDelegate` | `sendEmailDelegate` | Gửi email khuyến mãi (kênh duy nhất được hỗ trợ — SMS/Zalo/Push đã bị loại bỏ vì FE chưa từng cho tạo các node đó) | Gọi `NotificationClient.sendNotification`; toàn bộ biến process (trừ vài key hệ thống) được truyền làm `templateVariables` |

Việc xác định `userId`/`campaignId` trong mỗi delegate do `CampaignUserContextResolver` đảm nhiệm (đọc `userDbId`/`userId` trong execution, tự tra Keycloak UUID → DB id qua `UserClient.getProfileByKeycloakId` nếu cần); mọi tham số động (`discountPercent`, `expireDays`, `targetTier`,...) đọc qua `DelegateVariableHelper` từ `camunda:inputParameter` đã ghi ở bước compile.

Voucher do các delegate phát ra sẽ được gắn kèm `restrictedCategoryIds`/`restrictedProductIds` nếu workflow của campaign có node `Condition_ContainsCategory`/`Condition_ContainsProduct` (`CampaignTriggerService` đọc `targetIds` của các node này và đưa vào biến `voucherRestrictedCategoryIds`/`voucherRestrictedProductIds` trước khi start process) — nhờ đó voucher "tặng vì mua danh mục X" chỉ redeem được trên đơn có chứa danh mục/sản phẩm đó.

---

## III. CÔNG NGHỆ SỬ DỤNG

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| **Framework** | Spring Boot (Java) | REST + Spring Security Resource Server (JWT/Keycloak) |
| **Camunda 7 Engine** | Embedded (`RuntimeService`/`RepositoryService`/`HistoryService`), `history-level: full`, `schema-update: false` | Không dùng DMN; không bật webapp/Cockpit trong cấu hình hiện tại |
| **Database** | **MariaDB** (`org.mariadb.jdbc.Driver`, dialect `MariaDBDialect`) qua JDBC `jdbc:mariadb://<host>:3308/ecommerce_promotion_db` | KHÔNG phải PostgreSQL |
| **Cache/Lock** | Redis (`StringRedisTemplate`) | Dùng làm **distributed lock** (chống trigger trùng / chống 2 instance cùng chạy scheduler dọn voucher hết hạn), **không** dùng làm atomic counter ngân sách |
| **Message Broker** | Kafka (`spring-kafka`, `ack-mode: manual_immediate`, `enable-auto-commit: false`) | Consumer nhận event từ user/order/payment/review |
| **Service discovery** | Eureka Client | |
| **Giao tiếp nội bộ** | OpenFeign (`UserClient`, `OrderClient`, `ProductClient`, `NotificationClient`) qua header API key (`FeignInternalApiConfig`) | |

---

## IV. THIẾT KẾ DATABASE

### 4.1. Schema `ecommerce_promotion_db` (MariaDB)

Ngoài các bảng mặc định của Camunda 7 (tiền tố `ACT_*`, ví dụ `ACT_RE_PROCDEF`, `ACT_RU_EXECUTION`, `ACT_HI_PROCINST`, `ACT_HI_VARINST`,...), service tự quản lý 2 bảng business chính:

#### Bảng `campaigns`
```sql
CREATE TABLE campaigns (
    id                            BIGINT          AUTO_INCREMENT PRIMARY KEY,
    name                          VARCHAR(150)    NOT NULL,
    total_budget                  DECIMAL(19,2)   NOT NULL,
    remaining_budget              DECIMAL(19,2)   NOT NULL,
    start_date                    DATETIME        NOT NULL,
    end_date                      DATETIME        NOT NULL,
    bpmn_process_definition_key   VARCHAR(100)    NOT NULL,
    workflow_json                 TEXT            COMMENT 'Graph JSON (nodes+edges+meta) từ Campaign Builder',
    bpmn_xml                      TEXT            COMMENT 'BPMN 2.0 XML do server tự compile, không nhận trực tiếp từ client',
    trigger_type                  VARCHAR(80)     COMMENT 'Trigger_Event_NewUser | Trigger_Event_OrderSuccess | Trigger_Event_ReviewProduct | Trigger_Timer_Schedule',
    active                        BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at                    DATETIME,
    updated_at                    DATETIME
);
```
(Không có cột `status`/`approved_by`/`created_by` — trạng thái vận hành được suy ra từ `active` + `remainingBudget` + khoảng `startDate`/`endDate`.)

#### Bảng `issued_vouchers`
```sql
CREATE TABLE issued_vouchers (
    id                       BIGINT          AUTO_INCREMENT PRIMARY KEY,
    code                     VARCHAR(32)     NOT NULL UNIQUE,
    user_id                  BIGINT          NOT NULL,
    campaign_id              BIGINT,
    voucher_type             VARCHAR(20)     NOT NULL COMMENT 'PERCENT | FIXED | FREESHIP',
    status                   VARCHAR(20)     NOT NULL DEFAULT 'UNUSED' COMMENT 'UNUSED | RESERVED | USED | EXPIRED | CANCELLED',
    discount_percent         DECIMAL(19,2),
    max_discount_amount      DECIMAL(19,2),
    discount_amount          DECIMAL(19,2),
    min_order_value          DECIMAL(19,2),
    max_shipping_discount    DECIMAL(19,2),
    restricted_category_ids  VARCHAR(500)    COMMENT 'CSV category IDs — chỉ redeem được trên đơn chứa danh mục này (nếu có)',
    restricted_product_ids   VARCHAR(500)    COMMENT 'CSV product IDs — tương tự cho sản phẩm',
    expires_at               DATETIME        NOT NULL,
    used_at                  DATETIME,
    used_order_id            BIGINT,
    created_at               DATETIME
);
CREATE UNIQUE INDEX idx_voucher_code ON issued_vouchers(code);
CREATE INDEX idx_voucher_user ON issued_vouchers(user_id);
```

**Không có bảng `fraud_logs`, `user_devices`.** Ngân sách chiến dịch được trừ/hoàn trực tiếp trên `campaigns.remaining_budget` bằng pessimistic write lock (`SELECT ... FOR UPDATE` qua `CampaignRepository.findByIdForUpdate`) trong `CampaignBudgetServiceImpl`, không dùng `DECRBY` trên Redis.

### 4.2. Sử dụng Redis (chỉ 2 mục đích, không liên quan ngân sách/fraud)

| Key Pattern | Mục đích |
|---|---|
| `campaign-trigger:lock:{campaignId}:{triggerType}:{eventUniqueId}` | Lock 30s chống 2 event trùng lặp (Kafka at-least-once) cùng start process cho 1 campaign/1 đối tượng nghiệp vụ (đơn hàng/review/user) → tránh phát trùng voucher/điểm |
| `scheduler:lock:expireStaleVouchers` | Lock 5 phút để chỉ 1 instance của service chạy job hết hạn voucher theo lịch |

---

## V. ĐẶC TẢ API

Tất cả response bọc trong `ApiResponse<T> { code, message, data }`.

### 5.1. `CampaignController` (không có `@RequestMapping` lớp — path khai báo trực tiếp trên method)

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/v1/admin/campaigns/validate` | ADMIN, STAFF | Validate `WorkflowGraphDto`, trả `ValidationResultDto` |
| POST | `/api/v1/admin/campaigns` | ADMIN, STAFF | Tạo + validate + compile + deploy chiến dịch từ `workflowJson` |
| GET | `/api/v1/admin/campaigns/{id}` | ADMIN, STAFF | Xem chi tiết 1 chiến dịch |
| PUT | `/api/v1/admin/campaigns/{id}` | ADMIN, STAFF | Cập nhật metadata; nếu `workflowJson` đổi → validate + compile + deploy revision mới |
| GET | `/api/v1/admin/campaigns/dashboard` | ADMIN, STAFF | Thống kê tổng hợp toàn hệ thống (`PromotionDashboardDto`) |
| GET | `/api/v1/admin/campaigns/{id}/stats` | ADMIN, STAFF | Thống kê runtime 1 chiến dịch (`CampaignStatsDto`) |
| GET | `/api/v1/admin/campaigns/{id}/vouchers` | ADMIN, STAFF | Danh sách voucher đã phát của 1 chiến dịch |
| GET | `/api/v1/admin/campaigns` | ADMIN, STAFF | Toàn bộ chiến dịch (phục vụ modal "Load campaign") |
| GET | `/api/v1/public/campaigns/active` | Public | Danh sách chiến dịch đang hoạt động — chỉ trả `id/name/startDate/endDate/active`, không lộ budget/BPMN |
| DELETE | `/api/v1/admin/campaigns/{id}` | ADMIN | Xoá chiến dịch |
| PUT | `/api/v1/admin/campaigns/{id}/toggle-active?active=true|false` | ADMIN, STAFF | Bật/tắt chiến dịch, đồng bộ suspend/activate process definition trên Camunda |
| POST | `/api/v1/admin/campaigns/evaluate?processKey=...` | ADMIN, STAFF | Trigger thủ công 1 process theo `processKey` với `variables` tuỳ ý (mục đích test) |

#### `POST /api/v1/admin/campaigns` — Request/Response mẫu
```json
// Request
{
  "name": "Sinh nhật khách VIP tháng 12",
  "totalBudget": 20000000.0,
  "startDate": "2026-12-01T00:00:00",
  "endDate": "2026-12-31T23:59:59",
  "workflowJson": "{\"meta\":{\"totalBudget\":20000000.0},\"nodes\":[...],\"edges\":[...]}"
}
```
```json
// Response 201 Created
{
  "code": "SUCCESS",
  "message": "Thành công",
  "data": {
    "id": 15,
    "name": "Sinh nhật khách VIP tháng 12",
    "totalBudget": 20000000.0,
    "remainingBudget": 20000000.0,
    "startDate": "2026-12-01T00:00:00",
    "endDate": "2026-12-31T23:59:59",
    "bpmnProcessDefinitionKey": "sinh_nhat_khach_vip_thang_12",
    "active": true,
    "workflowJson": "...",
    "bpmnXml": "<?xml version=\"1.0\"...?>..."
  }
}
```

#### `POST /api/v1/admin/campaigns/validate` — Response khi thất bại
```json
{
  "code": "VALIDATION_FAILED",
  "message": "❌ Workflow KHÔNG hợp lệ. Phát hiện 2 lỗi cần sửa trước khi deploy.",
  "data": {
    "valid": false,
    "errors": [
      { "nodeId": "n3", "errorType": "missing_parameter", "field": "maxDiscountAmount",
        "message": "Node \"Tặng voucher %\": trường \"maxDiscountAmount\" là bắt buộc (Number > 0)." },
      { "nodeId": "n2", "errorType": "missing_parameter", "field": "isDefault",
        "message": "Node Condition \"Hạng thành viên\": BẮT BUỘC phải có đúng 1 nhánh ra được đánh dấu \"isDefault = true\"..." }
    ],
    "summary": "❌ Workflow KHÔNG hợp lệ. Phát hiện 2 lỗi cần sửa trước khi deploy."
  }
}
```

### 5.2. `VoucherController` — base path `/api/v1/promotions/vouchers` (dành cho user cuối, JWT bắt buộc — resource server xác thực)

| Method | Endpoint | Header | Mô tả |
|---|---|---|---|
| GET | `/me` | `X-User-Id` | Danh sách voucher của user hiện tại (`UserVoucherDto`, có `usable`) |
| POST | `/preview` | `X-User-Id` | Kiểm tra mã voucher (không ghi DB) — dùng cho nút "Kiểm tra mã" trước khi checkout |

#### `POST /api/v1/promotions/vouchers/preview`
```json
// Request
{ "code": "VPC-123456X", "orderTotal": 500000, "shippingFee": 30000, "productIds": [101, 102] }
```
```json
// Response
{
  "code": "SUCCESS", "message": "Thành công",
  "data": {
    "applied": true, "message": "Áp dụng voucher thành công.",
    "voucherCode": "VPC-123456X", "voucherType": "PERCENT",
    "discountAmount": 50000, "productDiscountAmount": 50000, "shippingDiscountAmount": 0,
    "finalAmount": 450000, "campaignId": 15, "expiresAt": "2026-12-10T00:00:00"
  }
}
```

### 5.3. `InternalVoucherController` — base path `/api/internal/vouchers` (nội bộ, không auth JWT — permitAll theo `SecurityConfig`, gọi bởi Order Service)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/{code}` | Lấy chi tiết voucher theo mã (dùng để hiển thị/debug) |
| POST | `/validate` | Alias của `preview` — không ghi DB |
| POST | `/apply` | Checkout: validate + **reserve** voucher (status → `RESERVED`, gắn `usedOrderId`) |
| POST | `/redeem` | Thanh toán thành công: `RESERVED` → `USED` (theo `orderId`) |
| POST | `/release` | Hủy đơn/thanh toán thất bại: `RESERVED` → `UNUSED`, gỡ `usedOrderId` (hoàn lại slot để user dùng lại) |

> Ghi chú quan trọng: khi voucher chuyển sang `EXPIRED` hoặc bị `release`, `VoucherMaintenanceServiceImpl`/`CampaignBudgetServiceImpl` sẽ **hoàn ngân sách** (`releaseReservedBudget`) tương ứng về lại `campaigns.remaining_budget` (không vượt `total_budget`).

---

## VI. CẤU HÌNH THỰC TẾ (`application.yml`)

```yaml
server:
  port: 8087

spring:
  application:
    name: promotion-service
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
  datasource:
    url: "jdbc:mariadb://${DB_HOST:localhost}:${DB_PORT:3308}/${DB_NAME:ecommerce_promotion_db}?createDatabaseIfNotExist=true&..."
    driver-class-name: org.mariadb.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: update
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MariaDBDialect
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:29092}
    listener:
      ack-mode: manual_immediate
    consumer:
      group-id: promotion-service-group
      enable-auto-commit: false
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${KEYCLOAK_ISSUER_URI:http://localhost:8083/realms/ecommerce-realm}

camunda:
  bpm:
    database:
      schema-update: false
    history-level: full

eureka:
  client:
    serviceUrl:
      defaultZone: http://${EUREKA_HOST:localhost}:8761/eureka/

app:
  internal:
    api-key: ${INTERNAL_API_KEY:dev-internal-api-key}
```

Không có biến `PYTHON_AI_SERVICE_URL`; không có cấu hình `ecommerce/promotion-service-c7` với PostgreSQL trong docker-compose thực tế — DB thật là MariaDB port `3308`.

---

## VII. YÊU CẦU TÍCH HỢP VỚI CÁC SERVICE KHÁC (INTEGRATION REQUIREMENTS)

Đây là các API/Feign client **thật đang được gọi** trong code (`UserClient`, `OrderClient`, `ProductClient`, `NotificationClient`), không còn phần chống fraud (`user_devices`, `is_blacklisted`) hay giá vốn (`cost_price`, price-info) vì các luồng đó đã bị xoá khỏi Promotion Service.

### 7.1. Identity & User Service

Promotion Service gọi các API internal sau (qua Feign, `FeignInternalApiConfig` gắn API key header):

| Method | Endpoint | Mục đích | Dữ liệu cần trả về |
|---|---|---|---|
| GET | `/api/internal/users/{userId}/profile-ai` | `CampaignVariableEnricher` lấy `customerTier` → map thành biến process `memberRank` (dùng cho `Condition_MemberRank`) | `{ "data": { "customerTier": "GOLD", ... } }` |
| GET | `/api/internal/users/keycloak/{keycloakUserId}` | Tra DB user id từ Keycloak UUID (dùng ở nhiều nơi: resolve voucher owner, resolve delegate context) | `{ "data": { "id": 123, "email": "...", "phoneNumber": "..." } }` |
| PUT | `/api/internal/users/{userId}/tier` | `UpgradeMemberRankDelegate` cập nhật hạng | Body `{ "tier": "GOLD" }` |
| PUT | `/api/internal/users/{userId}/points` | `LoyaltyPointDelegate` cộng điểm loyalty | Body `{ calculationMode, pointAmount, sourceType, campaignId?, orderId?, orderAmount? }`, trả `{ "data": { "newPointBalance", "pointsApplied", "calculationDetail" } }` |

Không yêu cầu cột `is_blacklisted`/bảng `user_devices` trên `user_db` — module chống gian lận đã bị loại bỏ.

### 7.2. Cart & Order Service

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/internal/orders/total-spending?userId={keycloakUserId}&days={n}` | `CampaignVariableEnricher` lấy tổng chi tiêu gần đây → biến `totalSpending` (dùng cho `Condition_TotalSpending`) |
| GET | `/api/internal/orders/{orderId}/summary` | Lấy `shippingAddress`, `totalAmount`/`finalAmount`, `productIds`, `phoneNumber` của đơn để enrich biến process (`targetProvince`, `orderProductIds`, `containsProduct`,...) |

Order Service (phía checkout) là **caller**, gọi ngược vào Promotion Service qua `InternalVoucherController` (`/api/internal/vouchers/apply|redeem|release`) — không phải Promotion Service gọi Camunda `engine-rest` như tài liệu cũ.

### 7.3. Product & Catalog Service

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/api/internal/products/bulk?ids=...` | Lấy `categoryId` của các sản phẩm trong đơn để: (1) enrich biến `orderCategoryIds`/`containsCategory` cho `Condition_ContainsCategory`; (2) kiểm tra ràng buộc category khi redeem voucher (`VoucherRedemptionServiceImpl.resolveCategoryIds`) |

Không có yêu cầu cột `cost_price` trên `products`/`product_variants`, không có API `POST /api/internal/products/price-info` — Promotion Service hiện không tính biên lợi nhuận/giá vốn.

### 7.4. Notification Service

| Method | Endpoint | Mục đích |
|---|---|---|
| POST | `/api/internal/notifications/send` | `SendEmailDelegate` gửi email khuyến mãi (template hoặc nội dung raw), kèm toàn bộ biến process hiện có làm `templateVariables` |
