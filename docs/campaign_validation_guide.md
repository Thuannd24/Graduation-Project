# 📑 HƯỚNG DẪN CẤU HÌNH & VALIDATION CHIẾN DỊCH KHUYẾN MÃI DỰA TRÊN WORKFLOW BUILDER

Tài liệu này cung cấp hướng dẫn chi tiết dành cho nhân viên vận hành (Staff) và đội ngũ phát triển về các thiết lập bắt buộc, quy tắc kiểm tra tính hợp lệ (Validation) của sơ đồ chiến dịch tiếp thị tự động hóa (Camunda BPMN 2.0), cũng như các đề xuất bổ sung để tối ưu hóa hệ thống, ngăn chặn các lỗi vận hành ngoài ý muốn.

---

## 1. Thiết lập Cấu hình Bắt buộc của Chiến dịch (Metadata)
Khi tạo mới một chiến dịch tiếp thị động, nhân viên vận hành bắt buộc phải khai báo các trường thông tin tổng quan sau trên giao diện cấu hình:

| Tên trường cấu hình | Kiểu dữ liệu | Quy tắc validate bắt buộc | Mô tả chi tiết |
| :--- | :--- | :--- | :--- |
| **Tên chiến dịch** (*Campaign Name*) | Chuỗi ký tự (String) | Không để trống. Tối thiểu 5 ký tự, tối đa 100 ký tự. | Tên gợi nhớ hiển thị trên Admin Portal (Ví dụ: *Chiến dịch Chào Hè 2026*). |
| **BPMN Process Key** | Chuỗi ký tự (String) | Không để trống. Chỉ chứa chữ thường, số, dấu gạch dưới `_`. Không chứa dấu tiếng Việt hoặc ký tự đặc biệt. | Mã định danh duy nhất của quy trình trong Camunda Engine (Ví dụ: `holiday_sales_2026`). |
| **Ngân sách chiến dịch** (*Total Budget*) | Số thực (Double) | Là số dương lớn hơn `0`. Phải nhập dạng số nguyên/số thực (Ví dụ: `50000000` cho 50 triệu VNĐ). | Ngân sách giới hạn tối đa cho toàn chiến dịch. Hệ thống sẽ tự động dừng áp voucher khi cạn ngân sách. |
| **Thời gian bắt đầu** (*Start Date*) | Ngày-Giờ (Datetime) | Định dạng ISO-8601. Phải lớn hơn hoặc bằng thời gian hiện tại. | Thời điểm chiến dịch chính thức có hiệu lực và kích hoạt các cổng trigger. |
| **Thời gian kết thúc** (*End Date*) | Ngày-Giờ (Datetime) | Định dạng ISO-8601. Phải sau Thời gian bắt đầu ít nhất `1 giờ`. | Thời điểm kết thúc chiến dịch, tự động hủy bỏ các tiến trình đang chờ. |

### 1.2. Quy tắc Đặt tên & Chống Trùng lặp Định danh (Unique Keys)
*   **Tên chiến dịch (Campaign Name):** Đặt tên có ý nghĩa phân biệt rõ ràng (Ví dụ: `Khuyến mãi Ngày Vàng Tháng 6`, `Chào Mừng Thành Viên Mới 2026`). Tránh đặt tên chung chung như `Chiến dịch 1`, `Khuyến mãi`.
*   **Mã định danh BPMN Process Key:**
    *   Phải là duy nhất toàn hệ thống (Ví dụ: `gold_day_june_2026`).
    *   *Cơ chế chống trùng lặp (Duplicate Check):* Khi nhân viên bấm "Lưu" hoặc "Deploy", backend `promotion-service` sẽ thực hiện truy vấn cơ sở dữ liệu (`campaigns` table) đồng thời gọi API của Camunda Engine (`repositoryService.createProcessDefinitionQuery().processDefinitionKey(bpmnKey)`) để kiểm tra xem mã key này đã tồn tại hay chưa. Nếu đã có chiến dịch khác dùng key này, backend sẽ báo lỗi `400 Bad Request` với thông điệp: *"Mã quy trình (BPMN Key) đã tồn tại trong hệ thống. Vui lòng đặt mã khác."*

### 1.3. Cơ chế Quản lý & Vận hành Chiến dịch (Lifecycle Management)
Sau khi tạo và lưu chiến dịch thành công, nhân viên vận hành quản lý thông qua các tính năng sau:

#### A. Trạng thái Bật / Tắt Chiến dịch (Activation Toggle)
*   **Trạng thái Tắt (Inactive / Pause):**
    *   Khi nhân viên bấm Tắt (Bypass / Deactivate):
        *   **Với các tiến trình mới:** Hệ thống sẽ chặn toàn bộ các cổng Trigger không cho khởi tạo thêm bất kỳ quy trình Camunda nào mới cho chiến dịch này.
        *   **Với các tiến trình đang chạy dở dang:** Hệ thống hỗ trợ 2 tùy chọn xử lý:
            *   *Suspend (Tạm dừng):* Đóng băng các instance đang chạy ở điểm đợi (Ví dụ: đang chờ Timer 2 tiếng), khi bật lại chiến dịch sẽ chạy tiếp.
            *   *Terminate (Hủy bỏ):* Gọi API của Camunda để xóa bỏ hoàn toàn tất cả các instance đang chạy dở dang của Process Key này.
*   **Trạng thái Bật (Active):**
    *   Kích hoạt lại các Listener Kafka để sẵn sàng nhận sự kiện và khởi chạy quy trình.

#### B. Xem Thống kê & Giám sát Chiến dịch (Campaign Statistics & Dashboard)
Mỗi chiến dịch sẽ có màn hình hiển thị số liệu thời gian thực (Real-time Monitoring) được cập nhật từ database và Redis:
1.  **Thống kê Ngân sách (Budget Tracking):**
    *   Tổng ngân sách ban đầu vs. Ngân sách còn lại thực tế.
    *   Tốc độ tiêu hao ngân sách theo ngày để cảnh báo cạn ngân sách sớm.
2.  **Chỉ số đo lường hiệu quả (Conversion Metrics):**
    *   *Số lượng Voucher đã phát (Vouchers Issued):* Tổng số mã voucher được sinh từ các Action Node của chiến dịch.
    *   *Số lượng Voucher đã sử dụng (Vouchers Redeemed):* Số voucher thực tế khách hàng đã dùng khi checkout thành công.
    *   *Tỷ lệ chuyển đổi (Conversion Rate):* $\frac{\text{Voucher đã dùng}}{\text{Voucher đã phát}} \times 100\%$.
3.  **Bản đồ nhiệt tiến trình (Process Heatmap):**
    *   Hiển thị trực quan sơ đồ luồng chiến dịch kèm theo số lượng người dùng đang dừng chân ở mỗi Node (Ví dụ: Có bao nhiêu khách đang kẹt ở khối kiểm tra chống gian lận, bao nhiêu người đã nhận được voucher).

---

## 2. Chi tiết Cấu hình & Quy tắc Validate Từng Node Thành Phần

Dưới đây là bảng đặc tả chi tiết của các khối thành phần (Core Nodes) được sử dụng để thiết lập chiến dịch:

### 2.1. Nhóm TRIGGER — SỰ KIỆN KÍCH HOẠT (Events)
Đây là các điểm bắt đầu của quy trình chiến dịch. Mỗi sơ đồ bắt buộc phải có ít nhất một Trigger để khởi động tiến trình.

| Loại Node | Icon | Tham số cấu hình cần thiết | Quy tắc kiểm tra (Validation Rules) |
| :--- | :---: | :--- | :--- |
| **Khách đăng ký mới**<br>`Trigger_Event_NewUser` | 👤 | Không có. | Luôn luôn hợp lệ theo mặc định. Kích hoạt tự động khi Keycloak/User-service báo có tài khoản mới. |
| **Đơn hàng thành công**<br>`Trigger_Event_OrderSuccess` | 🛒 | `minOrderValue` (Number)* | Bắt buộc nhập. Phải là số nguyên dương $\ge 0$ (VNĐ). Chỉ kích hoạt khi đơn hàng được thanh toán thành công và đạt mức tối thiểu này. |
| **Đánh giá sản phẩm**<br>`Trigger_Event_ReviewProduct` | ⭐ | `minRating` (Number)* | Bắt buộc nhập. Giá trị nguyên từ 1 đến 5. Chỉ kích hoạt khi khách gửi đánh giá đạt tối thiểu số sao này. |
| **Lịch trình định kỳ / Hẹn giờ**<br>`Trigger_Timer_Schedule` | 📅 | `cronExpression` (String)* <br>**HOẶC**<br>`startDate` (Datetime) | Phải nhập ít nhất một trong hai thông số. Cron Expression phải tuân thủ chuẩn Quartz Cron (Ví dụ: `0 0 12 * * ?` chạy 12h trưa mỗi ngày). |

### 2.2. Nhóm CONDITION — KIỂM TRA ĐIỀU KIỆN (Gateways)
Phục vụ phân nhánh luồng. Điều kiện so sánh được cấu hình trên các đường nối đi ra (Edges) từ các khối này.

> [!IMPORTANT]
> **Quy tắc phân nhánh bắt buộc**: Nếu một Condition Node có từ **2 nhánh đi ra trở lên**, bắt buộc phải chỉ định **1 nhánh làm nhánh Mặc định (ELSE)** để tránh tình trạng tắc nghẽn luồng (Deadlock) khi không có điều kiện nào thỏa mãn.

| Loại Node | Icon | Tham số cấu hình cần thiết | Quy tắc kiểm tra (Validation Rules) |
| :--- | :---: | :--- | :--- |
| **Hạng thành viên**<br>`Condition_MemberRank` | 💎 | `allowedRanks` (Dropdown List)* | Bắt buộc chọn ít nhất một hạng thẻ hợp lệ: `MEMBER`, `SILVER`, `GOLD`, `VIP`. |
| **Tổng chi tiêu tháng**<br>`Condition_TotalSpending` | 💰 | - `minSpendingAmount` (Number)*<br>- `daysLookback` (Number) | - `minSpendingAmount`: Số tiền tích lũy bắt buộc $\ge 0$ VNĐ.<br>- `daysLookback`: Số ngày xem xét trong quá khứ (mặc định 30 ngày). |
| **Khu vực địa lý**<br>`Condition_Location` | 📍 | `targetProvinces` (String)* | Bắt buộc nhập. Danh sách mã tỉnh/thành viết hoa cách nhau bằng dấu phẩy (Ví dụ: `HN, HCM, DN`). |
| **Ngành hàng / Sản phẩm**<br>`Condition_ContainsCategory` / `Condition_ContainsProduct` | 📦 | `targetIds` (List String)* | Bắt buộc nhập ít nhất 1 mã ID sản phẩm hoặc ID danh mục cần lọc trong đơn hàng. |
| **Bảo mật chống gian lận**<br>`Condition_AntiFraudScore` | 🛡️ | `maxRiskScore` (Number)* | Số nguyên từ 1 đến 100. Đơn hàng có điểm rủi ro lớn hơn mức này sẽ bị chặn. |

### 2.3. Nhóm ACTION — TẶNG VOUCHER & HÀNH ĐỘNG (Actions)
Các hành động cấp phát ưu đãi, gửi thông báo hoặc cập nhật thông tin người dùng.

| Loại Node | Icon | Tham số cấu hình cần thiết | Quy tắc kiểm tra (Validation Rules) |
| :--- | :---: | :--- | :--- |
| **Giảm giá theo %**<br>`Action_IssueVoucher_Percent` | `%` | - `discountPercent` (Number)*<br>- `maxDiscountAmount` (Number)*<br>- `expireDays` (Number)* | - `discountPercent`: Số nguyên từ `1` đến `100`.<br>- `maxDiscountAmount`: Số tiền trần $\ge 0$ VNĐ.<br>- `expireDays`: Số ngày hết hạn $> 0$ ngày. |
| **Giảm tiền cố định**<br>`Action_IssueVoucher_Fixed` | `₫` | - `discountAmount` (Number)*<br>- `minOrderValue` (Number)*<br>- `expireDays` (Number)* | - `discountAmount`: Số tiền giảm giá phải $> 0$ VNĐ.<br>- `minOrderValue`: Giá trị đơn hàng tối thiểu $\ge 0$ VNĐ.<br>- `expireDays`: Số ngày hết hạn $> 0$ ngày. |
| **Tặng Freeship**<br>`Action_IssueVoucher_Freeship` | 🚚 | - `maxShippingDiscount` (Number)*<br>- `expireDays` (Number)* | - `maxShippingDiscount`: Mức hỗ trợ ship tối đa $> 0$ VNĐ.<br>- `expireDays`: Số ngày hết hạn $> 0$ ngày. |
| **Gửi Thông Báo**<br>`Action_Send_Email` / `SMS`... | ✉️ 💬 | `templateId` (String) <br>**HOẶC**<br>`rawContent` (String)* | Bắt buộc phải nhập một trong hai: ID mẫu tin nhắn có sẵn hoặc nội dung văn bản thô. |
| **Cộng/Trừ điểm thưởng**<br>`Action_Loyalty_Point` | ⭐ | `pointAmount` (Number)* | Bắt buộc nhập số nguyên khác `0`. Nhập số dương để cộng điểm, số âm để trừ điểm. |
| **Nâng hạng hội viên**<br>`Action_Upgrade_MemberRank` | 💎 | `targetTier` (Dropdown select)* | Bắt buộc chọn hạng đích muốn thay đổi cho khách hàng: `SILVER`, `GOLD`, `VIP`. |

---

## 3. Quy tắc Validation Logic & Cấu trúc Sơ đồ (Graph Rules)

Trước khi hệ thống dịch sơ đồ kéo thả sang mã BPMN 2.0 XML để deploy lên Camunda Engine, hai bộ kiểm tra (Local và Backend) sẽ quét toàn bộ đồ thị để đảm bảo các ràng buộc kỹ thuật sau:

### 3.1. Các kiểm tra cấu trúc cơ bản (Local UI Validation)
1. **Không có khối mồ côi (Orphan Nodes)**:
   - Mọi khối trung gian (Condition, Action) bắt buộc phải có tối thiểu **1 đường nối đi vào** (incoming edge) và **1 đường nối đi ra** (outgoing edge).
   - Nút bắt đầu (Start Event) bắt buộc phải có ít nhất **1 đường nối đi ra**.
   - Nút kết thúc (End Event) bắt buộc phải có ít nhất **1 đường nối đi vào**.
2. **Cấu hình đầy đủ**:
   - Trạng thái từng khối trên Canvas hiển thị badge xanh lá `✓` (hợp lệ) hoặc đỏ `!` (chưa đầy đủ). Khách hàng không thể deploy nếu tồn tại bất kỳ badge `!` nào.

### 3.2. Các kiểm tra logic nghiệp vụ nâng cao (Backend Validation)
Khi gọi API `/api/v1/admin/campaigns/validate`, Backend thực hiện các kiểm tra sâu:
1. **Chống vòng lặp vô hạn (Cycle Detection)**:
   - Sử dụng thuật toán duyệt đồ thị **DFS** (Depth-First Search) để phát hiện chu trình. Luồng chiến dịch tiếp thị bắt buộc phải đi theo đồ thị có hướng không chu trình (DAG) để tránh treo tiến trình của khách hàng trong vòng lặp vô hạn.
2. **Kiểm tra rẽ nhánh (Exclusive Gateway Split)**:
   - Cổng điều kiện (Condition) rẽ nhiều nhánh phải chứa chính xác **1 nhánh Mặc định (isDefault = true)**.
   - Các nhánh điều kiện không được trùng lặp logic dẫn đến xung đột (Ví dụ: Nhánh 1: *Tổng chi tiêu > 5tr*, Nhánh 2: *Tổng chi tiêu > 10tr*, nếu không có thứ tự ưu tiên rõ ràng sẽ gây lỗi).
3. **Chốt chặn Giá vốn & Biên Lợi Nhuận (Cost Price Guard)**:
   - Hệ thống so sánh mức giảm giá của các Action Voucher phần trăm/cố định với giá vốn sản phẩm ($P_{cost}$) lưu ở Database. Đảm bảo:
     $$\text{Giá trị thanh toán sau giảm} \ge P_{cost} \times (1 + \text{Biên tối thiểu } 10\%)$$
   - Nếu vi phạm, backend sẽ tự động áp mức chiết khấu trần an toàn thay vì cho phép bán lỗ.

---

## 4. Các Đề xuất Cải tiến Validation Bổ sung (Additional Validators)

Để nâng cấp hệ thống Campaign Builder lên mức chuyên nghiệp và an toàn hơn, chúng tôi đề xuất bổ sung các bộ kiểm tra sau trên cả Frontend và Backend:

### 4.1. Validate Cú pháp Cron định kỳ tự động (Cron Expression Validator)
*   **Vấn đề**: Nhân viên vận hành dễ nhập sai định dạng biểu thức Cron (Ví dụ viết thiếu trường hoặc sai định dạng ngày tháng), khiến Camunda Engine không thể lập lịch hoặc bị treo.
*   **Cách Validate**: Sử dụng thư viện `cron-parser` trên Frontend hoặc `CronExpression.isValidExpression()` của Spring Framework ở Backend để kiểm tra trước khi lưu.
    ```typescript
    // Ví dụ mẫu kiểm tra nhanh biểu thức Cron ở FE
    import cronParser from 'cron-parser';
    
    export const isValidCron = (expression: string): boolean => {
      try {
        cronParser.parseExpression(expression);
        return true;
      } catch (err) {
        return false;
      }
    };
    ```

### 4.2. Khống chế Giới hạn Giảm giá Tối đa (Voucher Safe Guards)
*   **Vấn đề**: Tránh lỗi nhập nhầm của nhân viên (Ví dụ: Đáng lẽ giảm 10% nhưng nhập nhầm thành 100%, hoặc giảm 20.000đ nhưng nhập nhầm thành 20.000.000đ).
*   **Cách Validate**:
    - Đối với phần trăm: Khống chế tối đa `maxPercent = 50%` đối với nhân viên thường. Chỉ tài khoản Admin tối cao mới được thiết lập mức giảm $> 50\%$.
    - Đối với số tiền cố định: Giới hạn mức giảm tối đa của một voucher phát ra không được vượt quá `2,000,000đ` (hoặc cấu hình tùy chỉnh theo chính sách tài chính của doanh nghiệp).

### 4.3. Kiểm tra Placeholder biến động trong nội dung thông báo
*   **Vấn đề**: Nhân viên sử dụng các biến động để cá nhân hóa tin nhắn (Ví dụ: `Chào {customerName}, mã giảm giá của bạn là {voucherCode}`). Nếu họ viết sai chính tả placeholder như `{vouchercode}` hoặc `{customer_name}`, khách hàng sẽ nhận được tin nhắn lỗi hiển thị thô.
*   **Cách Validate**: 
    - Định nghĩa danh sách placeholder được phép sử dụng: `['{customerName}', '{voucherCode}', '{discountValue}', '{expireDate}']`.
    - Viết biểu thức Regex để kiểm tra và đối chiếu các thẻ `{...}` có trong trường `rawContent` xem có nằm trong danh sách được phép hay không.
    ```javascript
    const allowedPlaceholders = ['{customerName}', '{voucherCode}', '{discountValue}', '{expireDate}'];
    const matches = rawContent.match(/\{[^}]+\}/g) || [];
    const invalidPlaceholders = matches.filter(p => !allowedPlaceholders.includes(p));
    if (invalidPlaceholders.length > 0) {
      // Báo lỗi placeholder không được hỗ trợ
    }
    ```

### 4.4. Hướng dẫn sử dụng & Kiểm tra tính logic của Timer Events (Khối Hẹn giờ / Trì hoãn)
Khối hẹn giờ (Timer Event) là công cụ cực kỳ mạnh mẽ để tạm ngưng quy trình đang chạy, chờ đợi một khoảng thời gian nhất định (Delay) hoặc đến một mốc thời gian cụ thể trước khi thực hiện bước hành động tiếp theo.

#### A. Các trường hợp sử dụng cụ thể trong Promotion:
- **Trường hợp 1: Chờ hoàn tất thanh toán (Checkout Follow-up)**
  - *Kịch bản:* Khách hàng bấm Checkout tạo đơn hàng nhưng chưa thanh toán. Sơ đồ sẽ đi tới khối Timer thiết lập chờ **2 giờ** (`PT2H`). 
  - *Logic rẽ nhánh:* Hết 2 giờ, Camunda tự động thức dậy, chạy Condition để kiểm tra trạng thái đơn hàng:
    - Nếu đã thanh toán $\rightarrow$ Kết thúc quy trình.
    - Nếu chưa thanh toán $\rightarrow$ Kích hoạt Action `Gửi SMS nhắc nhở bám đuổi`.
- **Trường hợp 2: Gửi voucher nhắc nhở trước khi hết hạn (Voucher Expiration Warning)**
  - *Kịch bản:* Hệ thống tặng khách hàng một voucher có thời hạn sử dụng là 7 ngày.
  - *Logic luồng:* Thay vì chờ hết 7 ngày mới hủy, ta cấu hình một nhánh song song có khối Timer chờ **5 ngày** (`PT5D`). Hết 5 ngày, nếu voucher trong DB vẫn ở trạng thái `UNUSED`, hệ thống sẽ gửi một Email/App Push thông báo: *"Chỉ còn 2 ngày nữa là voucher của bạn hết hạn, hãy sử dụng ngay!"*.
- **Trường hợp 3: Trì hoãn giãn cách tin nhắn (Cooldowm / Spam Prevention)**
  - *Kịch bản:* Khi có sự kiện Khách hàng đăng ký mới, hệ thống gửi ngay email chào mừng. Tuy nhiên, để tránh làm phiền khách hàng, ta muốn gửi tiếp mã giảm giá sau đó 1 ngày.
  - *Logic luồng:* Đặt khối Timer cấu hình **1 ngày** (`P1D`) ở giữa Email chào mừng và SMS tặng mã voucher.

#### B. Quy tắc Validation đối với Timer:
*   **Khoảng thời gian (Duration):** Phải cấu hình định dạng ISO-8601 hợp lệ (ví dụ: `PT5M` - 5 phút, `PT2H` - 2 giờ, `P1D` - 1 ngày). Khống chế giới hạn thời gian chờ tối thiểu là `5 phút` và tối đa là `30 ngày` để tránh treo tiến trình vĩnh viễn hoặc rác tài nguyên Camunda Database.
*   **Logic kết nối:** Timer Catch Event bắt buộc phải là nút trung gian nằm giữa một luồng đang chạy. Nó không thể đóng vai trò là nút kết thúc quy trình (`End_Event`).

---

## 5. Quy trình Cài đặt & Tạo mới Chiến dịch dành cho Nhân viên Vận hành

Để đưa một chiến dịch khuyến mãi tự động vào hoạt động trên thực tế, nhân viên tạo chiến dịch thực hiện theo đúng 5 bước chuẩn hóa sau:

### 🚀 Bước 1: Khai báo thông tin Tổng quan (Metadata Setup)
1. Tại khu vực cấu hình đầu tiên (thường ở góc trái/phía trên giao diện), nhập các thông số:
   - **Tên chiến dịch**: Đặt tên có ý nghĩa phân biệt (Ví dụ: `Khuyến mãi Ngày Vàng Tháng 6`).
   - **Mã BPMN Key**: Đặt tên phân biệt, không trùng các chiến dịch cũ (Ví dụ: `gold_day_june_2026`).
   - **Ngân sách**: Đặt ngân sách tổng của chiến dịch (Ví dụ: `20000000` - 20 triệu VNĐ).
   - **Thời gian áp dụng**: Chọn ngày bắt đầu và kết thúc chiến dịch.

### 🎨 Bước 2: Thiết lập Điểm khởi đầu (Triggers)
1. Kéo một trong các khối **TRIGGER** từ thanh công cụ bên trái thả vào Canvas (Ví dụ: khối `Đơn hàng thành công`).
2. Nhấp chọn khối vừa thả để mở bảng cấu hình bên phải:
   - Đặt lại tên khối cho dễ đọc (Ví dụ: *Khách thanh toán đơn hàng thành công*).
   - Nhập **Giá trị đơn hàng tối thiểu** (Ví dụ: `500000` VNĐ).

### 🔍 Bước 3: Thiết lập Các chốt điều kiện (Conditions)
1. Kéo khối **CONDITION** mong muốn vào Canvas (Ví dụ: khối `Khu vực địa lý`).
2. Nối cổng ra của Trigger sang khối Condition này.
3. Kéo thả các khối hành động Action tiếp theo và nối từ khối Condition sang chúng.
4. Chọn từng đường nối (Edge) hoặc cấu hình trực tiếp để phân loại:
   - **Nhánh 1**: Đi tới hành động giảm giá lớn nếu khu vực ở `HN, HCM`.
   - **Nhánh 2**: Nhấp chọn checkbox **Đặt làm nhánh Mặc Định (ELSE)** để đi tới hành động giảm giá thường cho toàn bộ các tỉnh thành khác.

### 💰 Bước 4: Thiết lập Hành động Ưu đãi & Thông báo (Actions)
1. Chọn các khối **ACTION** tương ứng (Ví dụ: khối `Giảm giá theo %` và `Gửi SMS`).
2. Nhập các thông số chi tiết của voucher:
   - Phần trăm giảm: `15%`.
   - Giảm tối đa: `50000đ`.
   - Số ngày hết hạn: `3` ngày.
3. Nhập mẫu thông báo gửi khách hàng:
   - ID Mẫu SMS: `SMS_PROMO_TEMPLATE` hoặc nhập nội dung thô: `Chuc mung ban da nhan duoc ma voucher {voucherCode} giam 15% cho don hang tiep theo!`.

### 🛡️ Bước 5: Kiểm tra lỗi và Kích hoạt (Validation & Deploy)
1. Nhấn nút **"Validate Sơ đồ"** trên thanh công cụ:
   - Nếu giao diện báo lỗi (màu đỏ): Nhấp vào chi tiết lỗi để di chuyển đến khối bị thiếu cấu hình hoặc bị cô lập và sửa lại.
   - Nếu giao diện báo thành công (màu xanh): Sơ đồ đã sẵn sàng.
2. Nhấn nút **"Duyệt & Chạy chiến dịch (Deploy)"**:
   - Hệ thống sẽ tự động biên dịch sơ đồ sang chuẩn BPMN 2.0 XML và tải lên máy chủ Camunda Engine.
   - Trạng thái chiến dịch chuyển sang `ACTIVE` và chính thức đi vào hoạt động thực tế.
