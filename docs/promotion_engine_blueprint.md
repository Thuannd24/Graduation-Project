# 🚀 MASTER BLUEPRINT & CHECKLIST: HỆ THỐNG PROMOTION ENGINE & WORKFLOW BUILDER THẾ HỆ MỚI

Tài liệu này cung cấp **danh sách đầy đủ (Base Checklist)** gồm các Triggers, Conditions, Actions tiêu chuẩn và nâng cao, cùng kiến trúc thiết kế backend/database để bạn có thể tự do xây dựng lại hệ thống Promotion Engine với giao diện Frontend (FE) và cấu trúc Backend mới theo từng phần.

---

## 1. Đặc tả Chi tiết các Khối Nghiệp vụ trong Chiến dịch (Engine Nodes Spec)

Dưới đây là đặc tả chi tiết của từng khối chức năng cốt lõi (Core Nodes) thuộc nhóm ưu tiên triển khai, bao gồm cách thức lập trình (Code), quy tắc kiểm tra (Validation) đối với nhân viên vận hành, và luồng dữ liệu (Đầu vào/Đầu ra) của từng khối:

### 1.1. Nhóm TRIGGER — SỰ KIỆN KÍCH HOẠT (Events)
Đây là các điểm bắt đầu của quy trình chiến dịch.

#### A. Trigger Khách Đơn Hàng Thành Công (`Trigger_Event_OrderSuccess`)
*   **Cách thức Code:** Viết một Kafka Consumer trong `promotion-service` để lắng nghe topic `order-completed-events` từ `order-service`. Khi có tin nhắn đến, trích xuất dữ liệu và gọi API khởi tạo tiến trình (`runtimeService.startProcessInstanceByKey()`) của Camunda Engine.
*   **Validate đối với nhân viên (FE properties):**
    *   `minOrderValue` (Số nguyên dương $\ge 0$, đơn vị VNĐ): Bắt buộc nhập. Ràng buộc trường này không được để trống hoặc là số âm trên giao diện properties.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Dữ liệu gửi từ Kafka khi thanh toán thành công (gồm `userId`, `orderId`, `totalAmount`, `shippingAddress`).
    *   *Đầu ra (Output):* Khởi tạo các biến môi trường tương ứng trong tiến trình Camunda (`userId`, `orderId`, `totalAmount`, `shippingAddress`).

#### B. Trigger Khách Đăng Ký Mới (`Trigger_Event_NewUser`)
*   **Cách thức Code:** Viết Kafka Consumer lắng nghe topic `user-created-events` từ Keycloak hoặc `user-service`. Kích hoạt ngay lập tức tiến trình chào mừng của Camunda.
*   **Validate đối với nhân viên (FE properties):** Mặc định không cần tham số đầu vào.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Dữ liệu tài khoản mới được tạo từ Kafka (gồm `userId`, `email`, `phone`).
    *   *Đầu ra (Output):* Đăng ký các biến `userId`, `email`, `phone` vào môi trường chạy Camunda.

#### C. Trigger Đánh Giá Sản Phẩm (`Trigger_Event_ReviewProduct`)
*   **Cách thức Code:** Lắng nghe sự kiện `product-reviewed-events` từ Kafka khi người dùng viết đánh giá sản phẩm thành công trên hệ thống.
*   **Validate đối với nhân viên (FE properties):**
    *   `minRating` (Số nguyên từ 1 đến 5): Bắt buộc nhập. Mặc định là 5 (sao).
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Payload sự kiện đánh giá (gồm `userId`, `productId`, `rating`, `reviewId`).
    *   *Đầu ra (Output):* Gán các biến `userId`, `productId`, `rating` vào Camunda context.

#### D. Trigger Lập Lịch Định Kỳ (`Trigger_Timer_Schedule`)
*   **Cách thức Code:** Tích hợp trực tiếp tính năng Timer Start Event của Camunda Engine. Khi deploy file BPMN XML, Camunda tự động tạo lịch chạy ngầm bằng Quartz Scheduler tích hợp sẵn.
*   **Validate đối với nhân viên (FE properties):**
    *   `cronExpression` (Chuỗi ký tự): Bắt buộc nhập nếu chạy định kỳ. Phải kiểm tra định dạng Quartz Cron hợp lệ (Ví dụ: `0 0 12 * * ?` chạy 12h trưa hàng ngày).
    *   `startDate` (Datetime ISO-8601): Bắt buộc nếu chọn chạy một lần tại một thời điểm cụ thể.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Biểu thức lập lịch cấu hình trực tiếp trên BPMN XML.
    *   *Đầu ra (Output):* Kích hoạt chạy tiến trình tự động theo lịch (không mang theo biến runtime của user, thường kết hợp với Service Task tự quét DB).

---

### 1.2. Nhóm CONDITION — KIỂM TRA ĐIỀU KIỆN (Gateways)
Đóng vai trò phân nhánh luồng dựa trên logic dữ liệu.

#### A. Kiểm tra Hạng Thành Viên (`Condition_MemberRank`)
*   **Cách thức Code:** Viết một delegate hoặc cấu hình Exclusive Gateway trong Camunda. Hệ thống sẽ thực hiện gọi một REST API hoặc gRPC Client nội bộ sang `user-service` để lấy thông tin hạng thành viên.
*   **Validate đối với nhân viên (FE properties):**
    *   `allowedRanks` (Dropdown check list): Chọn một hoặc nhiều hạng thẻ (`MEMBER`, `SILVER`, `GOLD`, `VIP`). Bắt buộc chọn ít nhất một hạng thẻ.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Lấy biến `userId` từ context, gọi API `GET http://user-service/api/internal/users/{userId}`.
    *   *Đầu ra (Output):* Trả về hạng thẻ thực tế của khách hàng để làm dữ liệu so sánh trong biểu thức điều kiện (rẽ nhánh true/false).

#### B. Kiểm tra Tổng Chi Tiêu Tháng (`Condition_TotalSpending`)
*   **Cách thức Code:** Viết Delegate gọi API tổng chi tiêu từ `order-service` (theo hướng dẫn ở Mục 5.2).
*   **Validate đối với nhân viên (FE properties):**
    *   `minSpendingAmount` (Số nguyên dương $\ge 0$): Bắt buộc nhập mức chi tiêu tối thiểu.
    *   `daysLookback` (Số nguyên dương, mặc định là 30 ngày): Số ngày cộng dồn đơn hàng trong quá khứ.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Lấy biến `userId` từ context, gọi API `GET http://order-service/api/internal/orders/total-spending?userId={userId}&days={daysLookback}`.
    *   *Đầu ra (Output):* Nhận về số tiền thực tế (BigDecimal), gán vào biến context `totalSpending` để kiểm tra điều kiện rẽ nhánh.

#### C. Kiểm tra Khu Vực Địa Lý (`Condition_Location`)
*   **Cách thức Code:** Kiểm tra khớp chuỗi địa chỉ giao hàng nhận được từ sự kiện kích hoạt đơn hàng.
*   **Validate đối với nhân viên (FE properties):**
    *   `targetProvinces` (Text area hoặc Dropdown list): Các tỉnh thành được áp dụng khuyến mãi, viết hoa cách nhau bằng dấu phẩy (Ví dụ: `HN, HCM, DN`). Không được để trống.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Biến `shippingAddress` đã được lưu trong context từ trigger đầu vào.
    *   *Đầu ra (Output):* Parse địa chỉ nhận diện tỉnh/thành, kiểm tra sự tồn tại trong mảng `targetProvinces` để trả về cờ rẽ nhánh.

#### D. Kiểm tra Ngành Hàng / Sản Phẩm (`Condition_ContainsCategory` / `Condition_ContainsProduct`)
*   **Cách thức Code:** Duyệt danh sách các sản phẩm đang có trong giỏ hàng/đơn hàng. Nếu lọc theo ngành hàng, cần gọi REST API sang `product-service` để truy vấn danh mục tương ứng của sản phẩm đó.
*   **Validate đối với nhân viên (FE properties):**
    *   `targetIds` (Danh sách chuỗi/ID): ID sản phẩm hoặc ID danh mục tương ứng. Bắt buộc nhập tối thiểu một ID.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Mảng danh sách sản phẩm trong đơn hàng. Gọi API `GET http://product-service/api/products/{id}` đối với lọc danh mục.
    *   *Đầu ra (Output):* Trả về kết quả true/false nếu đơn hàng chứa sản phẩm/danh mục hợp lệ.

#### E. Chốt Chặn Bảo Mật Chống Gian Lận (`Condition_AntiFraudScore`)
*   **Cách thức Code:** Viết class `FraudCheckDelegate` kiểm tra lịch sử IP và Device ID để tính toán mức độ gian lận.
*   **Validate đối với nhân viên (FE properties):**
    *   `maxRiskScore` (Số từ 1 đến 100, mặc định là 70): Điểm rủi ro tối đa cho phép.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* `ipAddress`, `deviceId` nhận từ checkout client.
    *   *Đầu ra (Output):* Hệ thống tính điểm và trả về. Nếu vượt qua `maxRiskScore`, luồng tự động rẽ sang nhánh hủy bỏ.

---

### 1.3. Nhóm ACTION — HÀNH ĐỘNG THỰC THI (Actions)
Các tác vụ hành động tặng ưu đãi trực tiếp cho khách hàng.

#### A. Tặng Voucher Theo % Chiết Khấu (`Action_IssueVoucher_Percent`)
*   **Cách thức Code:** Gọi API cấp phát mã của hệ thống Voucher thông qua `IssueVoucherPercentDelegate`.
*   **Validate đối với nhân viên (FE properties):**
    *   `discountPercent` (Số từ 1 đến 100): Tỷ lệ giảm giá, bắt buộc nhập.
    *   `maxDiscountAmount` (Số tiền VNĐ $\ge 0$): Số tiền giảm tối đa, bắt buộc nhập.
    *   `expireDays` (Số nguyên dương $> 0$): Số ngày voucher có giá trị sử dụng, bắt buộc nhập.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Biến `userId`, tham số cấu hình (`discountPercent`, `maxDiscountAmount`, `expireDays`).
    *   *Đầu ra (Output):* Tạo bản ghi mới vào cơ sở dữ liệu Voucher. Lưu mã voucher mới sinh vào biến môi trường Camunda `voucherCode` để các bước tiếp theo (như gửi email/SMS) sử dụng.

#### B. Tặng Voucher Giảm Tiền Cố Định (`Action_IssueVoucher_Fixed`)
*   **Cách thức Code:** Gọi API cấp phát mã thông qua `IssueVoucherFixedDelegate`.
*   **Validate đối với nhân viên (FE properties):**
    *   `discountAmount` (Số tiền VNĐ $> 0$): Số tiền giảm giá trực tiếp, bắt buộc nhập.
    *   `minOrderValue` (Số tiền VNĐ $\ge 0$): Giá trị đơn hàng tối thiểu để được áp voucher, bắt buộc nhập.
    *   `expireDays` (Số nguyên dương $> 0$): Số ngày sử dụng, bắt buộc nhập.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Biến `userId`, tham số cấu hình.
    *   *Đầu ra (Output):* Ghi nhận voucher mới vào database và lưu biến `voucherCode` vào Camunda context.

#### C. Tặng Voucher Miễn Phí Vận Chuyển (`Action_IssueVoucher_Freeship`)
*   **Cách thức Code:** Gọi API cấp phát mã qua `IssueVoucherFreeshippingDelegate`.
*   **Validate đối với nhân viên (FE properties):**
    *   `maxShippingDiscount` (Số tiền VNĐ $> 0$): Số tiền hỗ trợ phí vận chuyển tối đa, bắt buộc nhập.
    *   `expireDays` (Số nguyên dương $> 0$): Số ngày sử dụng, bắt buộc nhập.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Biến `userId`, tham số cấu hình.
    *   *Đầu ra (Output):* Ghi nhận voucher vận chuyển mới vào database và lưu biến `voucherCode` vào Camunda context.

#### D. Gửi Thông Báo Kênh Email / SMS / App Push / Zalo (`Action_Send_Email`, `Action_Send_SMS`,...)
*   **Cách thức Code:** Gửi tin nhắn qua `SendNotificationDelegate`. Delegate sẽ đóng gói dữ liệu và gọi API hoặc gửi message Kafka sang `notification-service`.
*   **Validate đối với nhân viên (FE properties):**
    *   `templateId` (Chuỗi): ID mẫu tin nhắn đã thiết kế sẵn.
    *   `rawContent` (Văn bản): Bắt buộc nhập nếu không sử dụng mẫu thiết kế sẵn.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* Lấy `userId`, `email`, `phone` hoặc `voucherCode` từ Camunda context kết hợp với nội dung cấu hình để truyền sang `notification-service`.
    *   *Đầu ra (Output):* Gửi thành công tin nhắn đến thiết bị người dùng. Lưu biến `notificationSent = true` vào Camunda.

#### E. Tặng/Trừ Điểm Thưởng Tích Lũy (`Action_Loyalty_Point`)
*   **Cách thức Code:** Viết class `LoyaltyPointDelegate` để gọi REST API sang `user-service`.
*   **Validate đối với nhân viên (FE properties):**
    *   `pointAmount` (Số nguyên khác 0): Số điểm cần thay đổi. Nhập số dương để cộng, số âm để trừ. Bắt buộc nhập.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* `userId`, `pointAmount` gửi qua REST PUT sang `user-service/api/internal/users/{userId}/points`.
    *   *Đầu ra (Output):* Cập nhật điểm của user trong database của `user-service`. Trả về biến `newPointBalance` lưu trong Camunda.

#### F. Nâng Hạng Thành Viên Tự Động (`Action_Upgrade_MemberRank`)
*   **Cách thức Code:** Viết class `UpgradeMemberRankDelegate` để gọi REST API sang `user-service` (theo chi tiết ở Mục 5.1).
*   **Validate đối với nhân viên (FE properties):**
    *   `targetTier` (Dropdown select): Chọn hạng đích (`SILVER`, `GOLD`, `VIP`). Bắt buộc chọn.
*   **Luồng dữ liệu (Input/Output Source):**
    *   *Đầu vào (Input):* `userId`, `targetTier` gửi qua REST PUT sang `user-service/api/internal/users/{userId}/tier`.
    *   *Đầu ra (Output):* Cập nhật hạng thành viên của khách hàng trực tiếp tại database của `user-service`.

---

## 2. Kế hoạch triển khai Từng bước (Step-by-step Implementation Plan)

Bạn có thể chia nhỏ việc phát triển và triển khai hệ thống này thành **4 giai đoạn chính**:

### 🛠️ Giai đoạn 1: Thiết kế Giao diện kéo thả Frontend (React Flow / Rete.js)
- [ ] Khởi tạo dự án React/Vue và tích hợp thư viện vẽ đồ thị (Khuyên dùng **React Flow**).
- [ ] Thiết lập bảng danh sách Nodes mẫu (Trigger, Condition, Action, End) ở thanh Palette bên trái với màu sắc và icon đặc trưng.
- [ ] Lập trình logic drag-and-drop từ Palette vào khu vực Canvas vẽ đồ thị.
- [ ] Xây dựng bảng chỉnh sửa thông số Node bên tay phải (Properties Panel) hiển thị động dựa trên `node.type` được chọn.
- [ ] Viết hàm validate đồ thị cục bộ (Local UI Validation): kiểm tra các khối mồ côi và bắt buộc nhập đầy đủ thông tin trước khi gửi lên Backend.

### ⚙️ Giai đoạn 2: Xây dựng Bộ lõi Backend (Promotion Orchestration Engine)
- [ ] Xây dựng Database Schema theo thiết kế ở Phần 2.
- [ ] Triển khai REST API `/api/v1/admin/campaigns` để lưu trữ và quản lý thông tin chiến dịch cùng chuỗi JSON đồ thị.
- [ ] Phát triển bộ dịch đồ thị tự động: Dịch từ đồ thị JSON sang mã XML BPMN 2.0 (sử dụng thư viện Java `camunda-bpmn-model` hoặc sinh XML thô).
- [ ] Viết thuật toán phát hiện chu trình (DFS Cycle Detection) ở backend để chặn lưu các sơ đồ bị lặp vô hạn.
- [ ] Tích hợp Zeebe gRPC Client (hoặc Camunda REST API) để tự động deploy file BPMN XML lên Engine ngay khi nhân viên bấm lưu và kích hoạt.

### ⚡ Giai đoạn 3: Viết mã nguồn cho các Java Delegates / Service Tasks trong Camunda
- [ ] **Anti-Fraud Delegate:** Lập trình kiểm tra trùng lặp thông tin thanh toán, giới hạn IP/Thiết bị trước khi đi sâu vào luồng.
- [ ] **AI Scoring Bridge:** Viết HTTP client gọi dịch vụ AI dự đoán điểm nhạy cảm giá của khách hàng.
- [ ] **Cost Price Guard:** Triển khai logic tính toán giá trị đơn hàng sau chiết khấu và đối chiếu với tổng giá vốn từ Product Service để đảm bảo biên lợi nhuận $\ge 10\%$.
- [ ] **Budget Management:** Sử dụng Redis distributed lock (`Redisson`) hoặc Redis `DECRBY` để trừ ngân sách chiến dịch real-time an toàn, tránh lỗi tranh chấp tài nguyên (race condition).
- [ ] **Notification Dispatcher:** Tích hợp gọi sang Notification Service qua Feign Client hoặc gRPC để gửi tin nhắn đến các kênh Email, SMS, Zalo OA hoặc App Push.

### 🧪 Giai đoạn 4: Viết Integration Tests & Kiểm thử E2E
- [ ] Viết Test Case giả lập sự kiện `OrderSuccess` đẩy vào Kafka xem hệ thống Camunda có tự động kích hoạt luồng tương ứng hay không.
- [ ] Viết Mock Server cho AI Service để test cơ chế Timeout Fallback (nếu AI phản hồi chậm > 500ms thì tự động gán điểm mặc định).
- [ ] Giả lập lỗi cạn kiệt ngân sách (Budget Exhaustion) để kiểm tra xem hệ thống có tự động rẽ sang nhánh bypass (không áp giảm giá) hay không.
- [ ] Kiểm thử hiệu năng (Stress Test) luồng check coupon/áp khuyến mãi khi lượng đơn đặt hàng tăng đột biến (sử dụng Apache JMeter hoặc Locust).

---

## 5. Hướng dẫn Triển khai Chi tiết: Nâng hạng Thành viên & Tổng chi tiêu (Ghi chú lập trình)

### 5.1. Triển khai Tính năng Nâng hạng (`Action_Upgrade_MemberRank`)

#### Bước A: Viết Java Delegate trong `promotion-service`
Tạo class `UpgradeMemberRankDelegate.java` tại package `com.ecommerce.promotionservice.delegate` để gọi sang `user-service`:
```java
package com.ecommerce.promotionservice.delegate;

import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import java.util.Map;

@Component("upgradeMemberRankDelegate")
@Slf4j
public class UpgradeMemberRankDelegate implements JavaDelegate {

    private final RestTemplate restTemplate;

    public UpgradeMemberRankDelegate(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        String userId = getStr(execution, "userId");
        String targetTier = getStr(execution, "targetTier");

        if (userId.isBlank() || targetTier.isBlank()) {
            log.warn("[UpgradeRank] Thiếu userId hoặc targetTier. Bỏ qua.");
            return;
        }

        log.info("[UpgradeRank] Đang nâng hạng thành viên cho user {} -> {}", userId, targetTier);
        String url = "http://user-service/api/internal/users/" + userId + "/tier";
        Map<String, String> request = Map.of("tier", targetTier);

        try {
            restTemplate.put(url, request);
            log.info("[UpgradeRank] Thành công: user {} -> {}", userId, targetTier);
        } catch (Exception ex) {
            log.error("[UpgradeRank] Lỗi khi gọi user-service cho user " + userId, ex);
            throw ex;
        }
    }

    private String getStr(DelegateExecution e, String key) {
        Object v = e.getVariable(key); 
        return v != null ? v.toString() : "";
    }
}
```

#### Bước B: Khai báo ánh xạ Node tại `BpmnCompilerService.java`
Thêm mapping vào `DELEGATE_MAP`:
```java
Map.entry("Action_Upgrade_MemberRank", "${upgradeMemberRankDelegate}")
```

#### Bước C: Cập nhật Frontend UI
Thêm Node `Action_Upgrade_MemberRank` vào Palette, hiển thị thuộc tính `targetTier` dưới dạng Dropdown Select: `MEMBER`, `SILVER`, `GOLD`, `VIP`.

---

### 5.2. Triển khai Lấy dữ liệu Tổng chi tiêu (`Condition_TotalSpending`)

#### Bước A: Viết JPA Query trong `OrderRepository` (`order-service`)
Cộng dồn doanh thu thực tế (đã trừ giảm giá) từ các đơn hàng thành công trong chu kỳ:
```java
@Query("SELECT COALESCE(SUM(o.finalAmount), 0) FROM Order o " +
       "WHERE o.userId = :userId " +
       "AND o.status IN ('DELIVERED', 'SHIPPED', 'COMPLETED') " +
       "AND o.createdAt >= :since")
java.math.BigDecimal sumFinalAmountByUserIdAndSince(
        @Param("userId") String userId, 
        @Param("since") java.time.LocalDateTime since);
```

#### Bước B: Viết REST Endpoint trong `InternalOrderController` (`order-service`)
Expose endpoint cho `promotion-service` gọi lấy tổng tiền:
```java
@GetMapping("/total-spending")
public ApiResponse<java.math.BigDecimal> getTotalSpending(
        @RequestParam("userId") String userId,
        @RequestParam(value = "days", defaultValue = "365") int days) {
    
    log.info("Get total spending for userId: {} in last {} days", userId, days);
    java.time.LocalDateTime since = java.time.LocalDateTime.now().minusDays(days);
    java.math.BigDecimal total = orderRepository.sumFinalAmountByUserIdAndSince(userId, since);
    return ApiResponse.success(total);
}
```

#### Bước C: Triển khai kiểm tra điều kiện rẽ nhánh trong Camunda
Trong quá trình xử lý điều kiện `Condition_TotalSpending` trước các gateway rẽ nhánh, backend `promotion-service` sẽ:
1. Gọi API `GET http://order-service/api/internal/orders/total-spending?userId={userId}&days=365`.
2. Lấy số tiền trả về làm biến số phục vụ biểu thức điều kiện (ví dụ so sánh: `${totalSpending >= 10000000}`).

---

### 5.3. Triển khai Cấu hình Hẹn giờ & Trì hoãn (`Timer Events`)

Sử dụng tính năng Timer có sẵn của Camunda để lập lịch hoặc tạm dừng quy trình mà không cần lập trình Cron Job độc lập trong Java.

#### A. Timer Start Event (Lập lịch chạy chiến dịch tự động)
Quy trình tự động khởi chạy vào mốc thời gian cụ thể hoặc lặp lại định kỳ (ví dụ quét sinh nhật, gửi tin nhắn chăm sóc vào 12:00 trưa hàng ngày).

*   **Bản dịch XML BPMN 2.0:**
    ```xml
    <bpmn:startEvent id="StartEvent_BirthdayScan" name="Quét sinh nhật hàng ngày">
      <bpmn:timerEventDefinition id="TimerEventDefinition_Start">
        <!-- Chạy vào 00:00 hàng ngày (Cú pháp Quartz Cron) -->
        <bpmn:timeCycle xsi:type="bpmn:tFormalExpression">0 0 0 * * ?</bpmn:timeCycle>
      </bpmn:timerEventDefinition>
    </bpmn:startEvent>
    ```

#### B. Intermediate Timer Catch Event (Trì hoãn giữa luồng tiến trình)
Sử dụng khi tiến trình đang chạy và bạn muốn tạm ngưng luồng để chờ một khoảng thời gian (ví dụ: Chờ khách thanh toán đơn hàng, trì hoãn giãn cách các tin nhắn marketing gửi đi).

*   **Bản dịch XML BPMN 2.0 (Sử dụng chuẩn thời lượng ISO-8601 Duration):**
    *   `PT2H` $\rightarrow$ Chờ 2 giờ
    *   `PT30M` $\rightarrow$ Chờ 30 phút
    *   `P1D` $\rightarrow$ Chờ 1 ngày
    ```xml
    <bpmn:intermediateCatchEvent id="Timer_PaymentWait" name="Chờ thanh toán 2 tiếng">
      <bpmn:incoming>Flow_Incoming</bpmn:incoming>
      <bpmn:outgoing>Flow_Outgoing</bpmn:outgoing>
      <bpmn:timerEventDefinition id="TimerEventDefinition_Delay">
        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT2H</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
    ```

#### C. Các kịch bản ứng dụng cụ thể:
1.  **Checkout Follow-up (Bám đuổi thanh toán):**
    *   *Luồng:* Khách đặt hàng $\rightarrow$ Kích hoạt quy trình $\rightarrow$ Đi vào Timer trì hoãn `PT2H` $\rightarrow$ Hết 2 giờ, Camunda thức dậy chạy kiểm tra DB trạng thái đơn hàng $\rightarrow$ Nếu vẫn chưa thanh toán thì thực hiện gửi tin nhắn/Zalo bám đuổi nhắc thanh toán.
2.  **Giãn cách nội dung (Spam Protection):**
    *   *Luồng:* Khách đăng ký tài khoản $\rightarrow$ Gửi email chào mừng ngay $\rightarrow$ Đi vào Timer trì hoãn `P1D` (1 ngày) $\rightarrow$ Gửi tin nhắn tặng voucher giảm giá (Tránh việc gửi dồn dập tin nhắn gây phiền hà).
3.  **Nhắc nhở Voucher sắp hết hạn (Voucher Warning):**
    *   *Luồng:* Tặng voucher hạn 7 ngày $\rightarrow$ Rẽ luồng đi vào Timer trì hoãn `PT5D` (5 ngày) $\rightarrow$ Hết 5 ngày, kiểm tra nếu voucher chưa được dùng thì gửi SMS cảnh báo: *"Chỉ còn 2 ngày nữa là voucher của bạn hết hạn!"*.


