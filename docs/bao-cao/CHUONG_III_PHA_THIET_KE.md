# CHƯƠNG III. PHA THIẾT KẾ

---

## 1. Thiết kế lớp thực thể

Dựa trên kết quả phân tích yêu cầu nghiệp vụ và biểu đồ lớp thực thể pha phân tích tại Chương II, pha thiết kế tiến hành cụ thể hóa cấu trúc hướng đối tượng của hệ thống sàn thương mại điện tử phân tán AuraTech nhằm sẵn sàng chuyển giao sang mã nguồn Java Spring Boot và cơ sở dữ liệu. Quá trình thiết kế lớp thực thể được thực hiện chặt chẽ qua 3 bước chuẩn hóa theo phương pháp luận PTTKHTTT:

### Bước 1: Các lớp được bổ sung thuộc tính `id`
* **Quy tắc bổ sung:** Tất cả các lớp thực thể đại diện cho các bảng dữ liệu độc lập hoặc các đối tượng thực thể nghiệp vụ đều được bổ sung thuộc tính khóa chính định danh duy nhất `id` (kiểu `Long` tự tăng IDENTITY/BIGSERIAL trong cơ sở dữ liệu quan hệ PostgreSQL, hoặc kiểu `String` đối với khóa định danh Document trong MongoDB).
* **Ngoại lệ:** Trừ các lớp sau không cần bổ sung thuộc tính `id` riêng biệt:
  * **Các lớp tác nhân kế thừa từ `Member`:** Gồm `Customer`, `Employee`, `ManagerStaff`, `SalesStaff`, `WarehouseStaff`, `Supplier`.
    * *Lý do:* Lớp cơ sở trừu tượng `Member` đã có sẵn thuộc tính khóa chính định danh `id : Long` (kết hợp với tài khoản đăng nhập duy nhất). Theo nguyên lý kế thừa hướng đối tượng và mô hình `MappedSuperclass` trong JPA, các lớp con tự động thừa hưởng thuộc tính định danh này mà không cần khai báo trùng lặp.
  * **Các lớp báo cáo thống kê kế thừa:** Gồm `CustomerStatistics`, `ProductStatistics`, `OrderStatistics`, `SupplierStatistics`.
    * *Lý do:* Các lớp này kế thừa từ các thực thể nguồn tương ứng (`Customer`, `Product`, `Order`, `Supplier`), đóng vai trò là cấu trúc dữ liệu tổng hợp phục vụ hiển thị báo cáo phân tích kinh doanh (DTO / Analytics Projection), không đại diện cho các bản ghi lưu trữ vật lý có khóa chính riêng.

---

### Bước 2: Thuộc tính của các lớp được bổ sung theo kiểu của ngôn ngữ Java

Toàn bộ các thuộc tính của 47 lớp thực thể được gán kiểu dữ liệu cụ thể trong ngôn ngữ lập trình Java, đảm bảo ánh xạ trực tiếp và chính xác 100% với các lớp Java JPA Entity và MongoDB Document trong mã nguồn Backend (`BE/`):

#### 1. Khối Tác nhân con người & Báo cáo thống kê
* **`Member` (Thành viên chung):**
  * `- id : Long` (Khóa chính tự tăng)
  * `- username : String` (Tên đăng nhập hệ thống)
  * `- password : String` (Mật khẩu mã hóa BCrypt)
  * `- fullName : String` (Họ và tên đầy đủ)
  * `- email : String` (Địa chỉ email xác thực)
  * `- phoneNumber : String` (Số điện thoại liên hệ)
  * `- avatarUrl : String` (Đường dẫn ảnh đại diện)
* **`Customer` (Khách hàng - Kế thừa `Member`):**
  * `- keycloakUserId : String` (Mã định danh bảo mật OpenID Connect trên Keycloak)
  * `- customerTier : String` (Hạng thành viên: MEMBER, SILVER, GOLD, VIP)
  * `- loyaltyPoints : Integer` (Số dư điểm thưởng tích lũy khả dụng)
  * `- segmentationLabel : String` (Nhãn phân khúc AI: Loyal, AtRisk, New, Churned)
  * `- isBlacklisted : Boolean` (Cờ chặn mua hàng phòng chống gian lận)
  * `- active : Boolean` (Trạng thái tài khoản hoạt động)
* **`CustomerStatistics` (Thống kê khách hàng - Kế thừa `Customer`):**
  * `- totalCustomers : Long` (Tổng số khách hàng đăng ký trên toàn sàn)
  * `- newCustomersCount : Long` (Số khách hàng mới gia nhập trong kỳ)
  * `- churnRiskCount : Long` (Số khách hàng có nguy cơ rời bỏ cao do mô hình AI cảnh báo)
* **`Employee` (Cán bộ nhân viên - Kế thừa `Member`):**
  * `- employeeCode : String` (Mã số nhân viên nội bộ)
  * `- role : String` (Vai trò đảm nhiệm trong hệ thống)
  * `- department : String` (Phòng ban công tác)
* **`ManagerStaff` (Nhân viên quản lý - Kế thừa `Employee`):** Kế thừa toàn bộ quyền hạn quản trị danh mục, sản phẩm, chiến dịch và thống kê.
* **`SalesStaff` (Nhân viên bán hàng / CSKH - Kế thừa `Employee`):** Kế thừa quyền hạn tiếp nhận phiên tư vấn và hỗ trợ khách hàng.
* **`WarehouseStaff` (Nhân viên kho - Kế thừa `Employee`):** Kế thừa quyền hạn kiểm kê tồn kho và tạo phiếu nhập hàng.
* **`Supplier` (Nhà cung cấp - Kế thừa `Employee` / Đối tác cung ứng):**
  * `- supplierCode : String` (Mã đối tác cung ứng thiết bị)
  * `- companyName : String` (Tên công ty / doanh nghiệp cung cấp)
  * `- taxCode : String` (Mã số thuế doanh nghiệp)
* **`SupplierStatistics` (Thống kê nhà cung cấp - Kế thừa `Supplier`):**
  * `- totalSuppliers : Long` (Tổng số đối tác cung cấp đang liên kết)
  * `- totalImportAmount : BigDecimal` (Tổng giá trị hàng hóa đã nhập kho)

#### 2. Khối Danh mục, Sản phẩm, Thuộc tính kỹ thuật & Đánh giá
* **`Category` (Danh mục sản phẩm):**
  * `- id : Long` (Khóa chính danh mục)
  * `- name : String` (Tên danh mục thiết bị công nghệ)
  * `- slug : String` (Đường dẫn SEO duy nhất)
  * `- parentId : Long` (ID danh mục cha cấp trên)
  * `- imageUrl : String` (Đường dẫn ảnh đại diện danh mục)
  * `- icon : String` (Mã biểu tượng danh mục)
  * `- sortOrder : Integer` (Thứ tự hiển thị ưu tiên)
  * `- active : Boolean` (Trạng thái kinh doanh danh mục)
* **`CategoryAttribute` (Ràng buộc thuộc tính danh mục):**
  * `- id : Long` (Khóa chính liên kết)
  * `- isVariant : Boolean` (Cờ chỉ định: True = Thuộc tính biến thể SKU; False = Thông số tĩnh)
  * `- isRequired : Boolean` (Bắt buộc phải nhập khi tạo sản phẩm)
  * `- isFilter : Boolean` (Cho phép hiển thị làm bộ lọc đa tiêu chí tại giao diện)
* **`Brand` (Thương hiệu sản xuất):**
  * `- id : Long` (Khóa chính thương hiệu)
  * `- name : String` (Tên thương hiệu: Apple, Asus, Dell, Sony, Logitech...)
  * `- slug : String` (Đường dẫn SEO thương hiệu)
  * `- logoUrl : String` (Đường dẫn logo nhãn hàng)
  * `- description : String` (Mô tả thương hiệu)
* **`Product` (Sản phẩm cha):**
  * `- id : Long` (Khóa chính sản phẩm)
  * `- name : String` (Tên dòng sản phẩm thương mại)
  * `- slug : String` (Đường dẫn SEO duy nhất của sản phẩm)
  * `- description : String` (Mô tả chi tiết sản phẩm định dạng HTML/Markdown)
  * `- attributes : String` (Chuỗi JSON tóm tắt các thuộc tính nhanh)
  * `- specsRaw : String` (Bản chụp nguyên văn thông số thô phục vụ đối soát dữ liệu)
  * `- price : BigDecimal` (Giá niêm yết bán lẻ gốc)
  * `- costPrice : BigDecimal` (Giá vốn đầu vào)
  * `- salePrice : BigDecimal` (Giá khuyến mãi đang áp dụng)
  * `- weight : BigDecimal` (Khối lượng tịnh của sản phẩm tính theo kg)
  * `- brand : String` (Tên nhãn hàng lưu vết)
  * `- imageUrl : String` (Đường dẫn ảnh đại diện chính)
  * `- length : BigDecimal` (Chiều dài đóng gói vận chuyển tính bằng cm)
  * `- width : BigDecimal` (Chiều rộng đóng gói vận chuyển tính bằng cm)
  * `- height : BigDecimal` (Chiều cao đóng gói vận chuyển tính bằng cm)
  * `- warrantyPeriod : Integer` (Thời gian bảo hành chính hãng tính theo tháng)
  * `- warrantyPolicy : String` (Chính sách điều kiện bảo hành đổi trả)
  * `- salesCount : Integer` (Số lượng sản phẩm đã bán lũy kế)
  * `- ratingAvg : BigDecimal` (Điểm đánh giá trung bình 1.0 - 5.0 sao)
  * `- active : Boolean` (Trạng thái mở bán)
* **`ProductStatistics` (Thống kê sản phẩm - Kế thừa `Product`):**
  * `- totalProducts : Long` (Tổng số dòng sản phẩm trên sàn)
  * `- topSellingCount : Long` (Số dòng sản phẩm nằm trong nhóm bán chạy)
  * `- outOfStockCount : Long` (Số dòng sản phẩm đang trong tình trạng hết hàng)
* **`ProductImage` (Hình ảnh bộ sưu tập sản phẩm):**
  * `- id : Long` (Khóa chính ảnh)
  * `- imageUrl : String` (Đường dẫn tệp ảnh lưu trữ trên MinIO / Cloud Storage)
  * `- sortOrder : Integer` (Thứ tự trình chiếu trong slide gallery)
  * `- isPrimary : Boolean` (Cờ xác định ảnh bìa chính)
* **`ProductTag` (Thẻ phân loại tìm kiếm):**
  * `- tag : String` (Từ khóa nhãn phân loại: "gaming", "ai-pc", "ultrabook")
* **`Attribute` (Định nghĩa thuộc tính kỹ thuật):**
  * `- id : Long` (Khóa chính thuộc tính)
  * `- code : String` (Mã định danh thuộc tính: "cpu", "ram", "ssd", "color")
  * `- name : String` (Tên hiển thị: "Vi xử lý", "Dung lượng RAM", "Màu sắc")
  * `- valueType : String` (Kiểu giá trị: "text", "select", "boolean")
  * `- allowedValues : String` (Danh sách các giá trị cho phép lựa chọn)
  * `- isColor : Boolean` (Xác định thuộc tính màu sắc kèm mã HEX)
* **`ProductAttributeValue` (Giá trị thuộc tính tĩnh của sản phẩm):**
  * `- id : Long` (Khóa chính bản ghi giá trị)
  * `- value : String` (Giá trị cụ thể của thuộc tính tĩnh, vd: "AMD Ryzen 9 8945HS")
* **`ProductVariant` (Biến thể cấu hình SKU):**
  * `- id : Long` (Khóa chính biến thể)
  * `- sku : String` (Mã lưu kho SKU duy nhất toàn sàn, vd: "ASUS-G16-R9-32G-1T")
  * `- variantAttr : String` (Chuỗi JSON lưu các tùy chọn biến thể: `{"color":"Đen","ram":"32GB"}`)
  * `- price : BigDecimal` (Giá niêm yết riêng của biến thể cấu hình)
  * `- costPrice : BigDecimal` (Giá vốn riêng của biến thể cấu hình)
  * `- salePrice : BigDecimal` (Giá bán ưu đãi riêng của biến thể cấu hình)
  * `- weight : BigDecimal` (Khối lượng riêng của biến thể)
  * `- imageUrl : String` (Ảnh riêng đặc thù theo màu sắc biến thể)
  * `- active : Boolean` (Trạng thái mở bán của biến thể)
* **`VariantOptionValue` (Giá trị tùy chọn của biến thể):**
  * `- id : Long` (Khóa chính liên kết tùy chọn)
  * `- value : String` (Giá trị tùy chọn được gán cho biến thể, vd: "32GB", "1TB SSD")
* **`ProductReview` (Đánh giá nhận xét sản phẩm):**
  * `- id : Long` (Khóa chính đánh giá)
  * `- rating : Integer` (Số sao chấm từ 1 đến 5 sao)
  * `- comment : String` (Nội dung bình luận nhận xét của khách)
  * `- imageUrls : String` (Danh sách link ảnh chụp thực tế đính kèm dạng JSON)
  * `- staffReplyContent : String` (Nội dung phản hồi hỗ trợ của nhân viên bán hàng)
  * `- staffReplyAt : LocalDateTime` (Thời điểm nhân viên gửi phản hồi)
  * `- staffReplierId : String` (Mã định danh nhân viên thực hiện phản hồi)
  * `- createdAt : LocalDateTime` (Thời điểm khách hàng gửi đánh giá)
* **`WishlistItem` (Sản phẩm yêu thích):**
  * `- id : Long` (Khóa chính mục yêu thích)
  * `- createdAt : LocalDateTime` (Thời điểm khách hàng lưu sản phẩm)

#### 3. Khối Đơn hàng, Chi tiết mặt hàng (OrderItem), Thanh toán & Địa chỉ
* **`Order` (Đơn hàng):**
  * `- id : Long` (Khóa chính đơn hàng)
  * `- userId : String` (Mã định danh khách hàng đặt mua)
  * `- email : String` (Email nhận thông báo đơn hàng)
  * `- status : String` (Trạng thái: PENDING, AWAITING_PAYMENT, CONFIRMED, SHIPPED, DELIVERED, CANCELLED)
  * `- totalAmount : BigDecimal` (Tổng tiền hàng nguyên giá chưa chiết khấu)
  * `- discountAmount : BigDecimal` (Tổng số tiền được chiết khấu từ voucher)
  * `- finalAmount : BigDecimal` (Tổng số tiền thực tế khách cần thanh toán)
  * `- totalWeight : BigDecimal` (Tổng khối lượng kiện hàng phục vụ tính phí ship GHN/GHTK)
  * `- couponCode : String` (Mã voucher đã được áp dụng vào đơn)
  * `- appliedCampaignId : String` (Mã chiến dịch khuyến mãi áp dụng)
  * `- pointsRedeemed : Integer` (Số điểm tích lũy khách đã tiêu dùng cho đơn hàng)
  * `- pointDiscountAmount : BigDecimal` (Số tiền giảm trừ quy đổi từ điểm thưởng)
  * `- shippingFee : BigDecimal` (Cước phí vận chuyển thực tế)
  * `- shippingDiscountAmount : BigDecimal` (Khoản trợ giá vận chuyển)
  * `- vatAmount : BigDecimal` (Tiền thuế giá trị gia tăng VAT)
  * `- trackingCode : String` (Mã vận đơn đối soát với đơn vị bưu chính GHTK/GHN)
  * `- shippingAddress : String` (Địa chỉ giao nhận hàng hoàn chỉnh)
  * `- phoneNumber : String` (Số điện thoại người nhận hàng)
  * `- note : String` (Ghi chú dặn dò của khách hàng khi giao nhận)
  * `- createdAt : LocalDateTime` (Thời điểm khởi tạo đơn hàng)
  * `- updatedAt : LocalDateTime` (Thời điểm cập nhật trạng thái gần nhất)
* **`OrderStatistics` (Thống kê đơn hàng - Kế thừa `Order`):**
  * `- totalOrders : Long` (Tổng số đơn hàng phát sinh trong kỳ báo cáo)
  * `- totalRevenue : BigDecimal` (Tổng doanh thu thuần thu được)
  * `- cancelledOrdersCount : Long` (Số lượng đơn hàng bị hủy bỏ)
* **`OrderItem` (Chi tiết mặt hàng đặt mua - Khớp `OrderItem.java`):**
  * `- id : Long` (Khóa chính dòng hàng)
  * `- productName : String` (Tên sản phẩm lưu vết tại thời điểm mua hàng)
  * `- productImage : String` (URL ảnh đại diện sản phẩm lúc mua hàng)
  * `- variantAttr : String` (Chuỗi JSON snapshot cấu hình biến thể đã chọn khi đặt hàng)
  * `- unitPrice : BigDecimal` (Đơn giá tại thời điểm chốt đơn)
  * `- quantity : Integer` (Số lượng mặt hàng khách đặt mua)
  * `- subtotal : BigDecimal` (Thành tiền của dòng mặt hàng: `unitPrice * quantity`)
* **`Payment` (Giao dịch thanh toán):**
  * `- id : Long` (Khóa chính hóa đơn thanh toán)
  * `- txnRef : String` (Mã tham chiếu giao dịch độc nhất gửi cổng thanh toán)
  * `- gatewayTxnId : String` (Mã số giao dịch do cổng thanh toán VNPay trả về)
  * `- paymentMethod : String` (Phương thức thanh toán: "VNPAY", "COD")
  * `- amount : BigDecimal` (Số tiền thanh toán thực tế)
  * `- currency : String` (Đơn vị tiền tệ: "VND")
  * `- status : String` (Trạng thái: "PENDING", "SUCCESS", "FAILED", "REFUNDED")
  * `- failureCode : String` (Mã lỗi nếu giao dịch thanh toán thất bại)
  * `- gatewayResponse : String` (Toàn bộ chuỗi phản hồi IPN từ cổng thanh toán)
  * `- paidAt : LocalDateTime` (Thời điểm giao dịch thanh toán thành công)
  * `- createdAt : LocalDateTime` (Thời điểm phát hành yêu cầu thanh toán)
  * `- updatedAt : LocalDateTime` (Thời điểm cập nhật trạng thái)
* **`Refund` (Bản ghi hoàn tiền giao dịch):**
  * `- id : Long` (Khóa chính phiếu hoàn tiền)
  * `- refundAmount : BigDecimal` (Số tiền thực tế hoàn trả vào tài khoản khách)
  * `- reason : String` (Lý do hủy đơn hoàn tiền: hủy trong 120 phút, hết hàng)
  * `- status : String` (Trạng thái hoàn tiền: "PENDING", "SUCCESS", "FAILED")
  * `- gatewayRefundId : String` (Mã hoàn tiền do ngân hàng / VNPay cung cấp)
  * `- requestedBy : String` (Người thực hiện yêu cầu: "Customer", "Admin", "System")
  * `- completedAt : LocalDateTime` (Thời điểm tiền hoàn về tài khoản thành công)
  * `- createdAt : LocalDateTime` (Thời điểm tạo phiếu yêu cầu hoàn tiền)
* **`Address` (Sổ địa chỉ nhận hàng):**
  * `- id : Long` (Khóa chính địa chỉ)
  * `- recipientName : String` (Họ và tên người nhận kiện hàng)
  * `- phoneNumber : String` (Số điện thoại nhận kiện hàng)
  * `- province : String` (Tên Tỉnh / Thành phố)
  * `- districtWard : String` (Tên Quận / Huyện / Phường / Xã)
  * `- detailAddress : String` (Địa chỉ cụ thể: số nhà, tên đường, tòa nhà)
  * `- isDefault : Boolean` (Cờ chỉ định địa chỉ giao hàng mặc định)
  * `- createdAt : LocalDateTime` (Thời điểm thêm địa chỉ)
  * `- updatedAt : LocalDateTime` (Thời điểm sửa đổi thông tin)
* **`Province` (Tỉnh / Thành phố hành chính):**
  * `- code : Integer` (Mã định danh hành chính của tỉnh/thành phố)
  * `- name : String` (Tên tỉnh/thành phố: Hà Nội, TP. Hồ Chí Minh, Đà Nẵng...)
* **`Ward` (Phường / Xã hành chính):**
  * `- code : Integer` (Mã định danh hành chính của phường/xã)
  * `- name : String` (Tên phường/xã cụ thể)
* **`LoyaltyPointTransaction` (Nhật ký giao dịch điểm thưởng):**
  * `- id : Long` (Khóa chính bản ghi giao dịch điểm)
  * `- delta : Integer` (Biến động số điểm: số dương = tích lũy; số âm = tiêu dùng)
  * `- balanceAfter : Integer` (Số dư điểm thưởng khả dụng sau biến động)
  * `- calculationMode : String` (Cơ chế tính điểm: "STANDARD_ORDER", "CAMPAIGN_BONUS")
  * `- sourceType : String` (Nguồn gốc: "ORDER_PURCHASE", "ORDER_CANCEL_REFUND")
  * `- referenceId : String` (Mã tham chiếu giao dịch gốc)
  * `- description : String` (Diễn giải chi tiết biến động điểm thưởng)
  * `- createdAt : LocalDateTime` (Thời điểm phát sinh giao dịch điểm)

#### 4. Khối Tiếp thị, Khuyến mãi & Quy trình Camunda BPMN
* **`Campaign` (Chiến dịch khuyến mãi Camunda):**
  * `- id : Long` (Khóa chính chiến dịch)
  * `- name : String` (Tên chiến dịch khuyến mãi tự động)
  * `- totalBudget : BigDecimal` (Hạn mức ngân sách tối đa phân bổ cho chiến dịch)
  * `- remainingBudget : BigDecimal` (Số dư ngân sách còn lại chưa giải ngân)
  * `- startDate : LocalDateTime` (Thời điểm bắt đầu chiến dịch)
  * `- endDate : LocalDateTime` (Thời điểm kết thúc chiến dịch)
  * `- bpmnProcessDefinitionKey : String` (Khóa định danh quy trình trên Camunda Engine)
  * `- workflowJson : String` (Cấu trúc định nghĩa quy tắc DMN/Json)
  * `- bpmnXml : String` (Mã XML của sơ đồ quy trình nghiệp vụ BPMN 2.0)
  * `- triggerType : String` (Loại sự kiện kích hoạt: "CHURN_RISK", "BIRTHDAY")
  * `- createdAt : LocalDateTime` (Thời điểm khởi tạo chiến dịch)
  * `- updatedAt : LocalDateTime` (Thời điểm hiệu chỉnh cấu hình)
* **`IssuedVoucher` (Voucher phát hành / sở hữu):**
  * `- id : Long` (Khóa chính voucher phát hành)
  * `- code : String` (Mã voucher duy nhất khách hàng dùng để nhập)
  * `- voucherType : String` (Loại ưu đãi: "PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING")
  * `- discountPercent : BigDecimal` (Tỷ lệ phần trăm giảm giá)
  * `- maxDiscountAmount : BigDecimal` (Số tiền giảm giá tối đa cho phép)
  * `- discountAmount : BigDecimal` (Số tiền giảm cố định trực tiếp)
  * `- minOrderValue : BigDecimal` (Giá trị đơn hàng tối thiểu bắt buộc để áp dụng)
  * `- maxShippingDiscount : BigDecimal` (Mức trợ giá cước vận chuyển tối đa)
  * `- restrictedCategoryIds : String` (Danh sách ID danh mục bị giới hạn áp dụng)
  * `- restrictedProductIds : String` (Danh sách ID sản phẩm bị giới hạn áp dụng)
  * `- expiresAt : LocalDateTime` (Thời điểm mã voucher hết hạn hiệu lực)
  * `- usedAt : LocalDateTime` (Thời điểm khách hàng đã sử dụng voucher)
  * `- idempotencyKey : String` (Mã Idempotency chống cấp trùng lặp mã ưu đãi)
  * `- createdAt : LocalDateTime` (Thời điểm hệ thống phát hành voucher)
* **`ExecutedAction` (Bản ghi Idempotency quy trình Camunda):**
  * `- id : Long` (Khóa chính bản ghi kiểm soát Idempotency)
  * `- idempotencyKey : String` (Khóa Idempotency độc nhất của tác vụ)
  * `- actionType : String` (Loại tác vụ: "SEND_VOUCHER_NOTIFICATION")
  * `- createdAt : LocalDateTime` (Thời điểm thực thi tác vụ thành công)

#### 5. Khối Kho hàng & Chuỗi cung ứng
* **`Inventory` (Bản ghi tồn kho biến thể SKU):**
  * `- id : Long` (Khóa chính tồn kho)
  * `- quantity : Integer` (Số lượng tồn kho khả dụng hiện tại)
  * `- updatedAt : LocalDateTime` (Thời điểm cập nhật số lượng tồn kho gần nhất)
* **`InventoryTransaction` (Nhật ký biến động kho):**
  * `- id : Long` (Khóa chính nhật ký biến động kho)
  * `- transactionType : String` (Loại biến động: "DEDUCT", "RELEASE", "RESTOCK")
  * `- quantityChanged : Integer` (Số lượng thay đổi: âm khi trừ; dương khi nhập/hoàn)
  * `- quantityBefore : Integer` (Số lượng tồn kho trước khi biến động)
  * `- quantityAfter : Integer` (Số lượng tồn kho sau khi biến động)
  * `- referenceId : String` (Mã tham chiếu: mã đơn hàng hoặc mã phiếu nhập hàng)
  * `- note : String` (Ghi chú nguyên nhân phát sinh biến động kho)
  * `- createdAt : LocalDateTime` (Thời điểm phát sinh giao dịch kho)
* **`RestockRequest` (Phiếu yêu cầu nhập hàng):**
  * `- id : Long` (Khóa chính phiếu nhập hàng)
  * `- quantity : Integer` (Số lượng thiết bị cần nhập bổ sung từ đối tác)
  * `- status : String` (Trạng thái: "PENDING", "APPROVED", "COMPLETED", "CANCELLED")
  * `- requestedBy : String` (Mã nhân viên kho lập phiếu yêu cầu)
  * `- completedAt : LocalDateTime` (Thời điểm kiểm kê và nhập kho hoàn tất)
  * `- createdAt : LocalDateTime` (Thời điểm lập phiếu yêu cầu nhập hàng)
* **`InventoryDailySnapshot` (Bản chụp tồn kho theo ngày):**
  * `- id : Long` (Khóa chính bản chụp)
  * `- stockLevel : Integer` (Mức tồn kho đóng sổ tại thời điểm chốt ngày)
  * `- snapshotDate : LocalDate` (Ngày chụp lưu trữ dữ liệu đối soát)
  * `- createdAt : LocalDateTime` (Thời điểm hệ thống chạy cron chụp tồn kho)

#### 6. Khối Tư vấn trực tuyến & Thông báo đa kênh
* **`ChatRoom` (Phòng / Phiên tư vấn trực tuyến):**
  * `- id : Long` (Khóa chính phòng chat)
  * `- customerName : String` (Tên khách hàng tham gia phiên trò chuyện)
  * `- staffName : String` (Tên nhân viên CSKH tiếp nhận phòng chat)
  * `- status : String` (Trạng thái phiên: "AI_CHAT", "WAITING", "ACTIVE", "CLOSED")
  * `- lastMessage : String` (Nội dung tóm tắt của tin nhắn mới nhất)
  * `- lastMessageAt : LocalDateTime` (Thời điểm gửi tin nhắn gần nhất)
  * `- lastMessageSenderId : String` (Mã người gửi tin nhắn sau cùng)
  * `- createdAt : LocalDateTime` (Thời điểm khởi tạo phòng tư vấn)
  * `- updatedAt : LocalDateTime` (Thời điểm có tương tác mới nhất)
* **`ChatMessage` (Tin nhắn trao đổi):**
  * `- id : Long` (Khóa chính tin nhắn)
  * `- senderId : String` (Mã định danh người gửi tin nhắn)
  * `- senderName : String` (Tên người gửi tin nhắn)
  * `- senderRole : String` (Vai trò: "CUSTOMER", "STAFF", "AI")
  * `- content : String` (Nội dung thông điệp trao đổi)
  * `- type : String` (Định dạng tin nhắn: "TEXT", "IMAGE", "FILE")
  * `- isRead : Boolean` (Trạng thái tin nhắn đã được đối phương đọc hay chưa)
  * `- createdAt : LocalDateTime` (Thời điểm gửi tin nhắn)
* **`Notification` (Bản ghi thông báo đa kênh - MongoDB Document):**
  * `- id : String` (Khóa chính MongoDB ObjectId)
  * `- eventType : String` (Loại sự kiện: "ORDER_CREATED", "PAYMENT_SUCCESS")
  * `- channels : String` (Kênh truyền thông điệp: "EMAIL", "PUSH")
  * `- recipient : String` (Địa chỉ email hoặc thiết bị nhận thông báo)
  * `- subject : String` (Tiêu đề tóm tắt của thông báo)
  * `- content : String` (Nội dung thông điệp hiển thị)
  * `- status : String` (Trạng thái gửi: "PENDING", "SENT", "FAILED")
  * `- deliveryResults : String` (Chi tiết kết quả phản hồi từ nhà cung cấp dịch vụ)
  * `- createdAt : LocalDateTime` (Thời điểm phát hành thông báo)
* **`NotificationTemplate` (Bản mẫu cấu hình thông báo - MongoDB Document):**
  * `- id : String` (Khóa chính mẫu thông báo)
  * `- code : String` (Mã mẫu định danh duy nhất)
  * `- name : String` (Tên bản mẫu thông báo)
  * `- titleTemplate : String` (Mẫu tiêu đề chứa placeholder: "Đơn hàng #{{orderId}}")
  * `- bodyTemplate : String` (Mẫu nội dung thông báo chứa biến thay thế)
  * `- channel : String` (Kênh áp dụng bản mẫu: "EMAIL", "PUSH", "SMS")
* **`FCMToken` (Token thiết bị nhận tin FCM):**
  * `- id : String` (Khóa chính bản ghi token)
  * `- token : String` (Chuỗi token đăng ký thiết bị do Firebase Cloud Messaging cấp)
  * `- platform : String` (Hệ điều hành thiết bị: "WEB", "ANDROID", "IOS")
  * `- deviceId : String` (Mã định danh phần cứng thiết bị di động)
  * `- lastUsedAt : LocalDateTime` (Thời điểm thiết bị nhận thông báo gần nhất)

#### 7. Khối Hạ tầng sự kiện phân tán & Saga Bù trừ
* **`OutboxEvent` (Sự kiện giao dịch tin cậy - Outbox Pattern):**
  * `- id : Long` (Khóa chính sự kiện Outbox)
  * `- aggregateId : String` (Mã định danh thực thể phát sinh sự kiện)
  * `- aggregateType : String` (Loại thực thể: "Order", "Payment")
  * `- eventType : String` (Tên sự kiện Kafka: "OrderCreatedEvent", "PaymentCompletedEvent")
  * `- payload : String` (Toàn văn dữ liệu sự kiện định dạng chuỗi JSON)
  * `- status : String` (Trạng thái phát đi: "PENDING", "PROCESSED", "FAILED")
  * `- retryCount : Integer` (Số lần thử đẩy lại vào Kafka khi gặp sự cố)
  * `- createdAt : LocalDateTime` (Thời điểm bản ghi Outbox được ghi đồng bộ với DB)
  * `- processedAt : LocalDateTime` (Thời điểm Debezium / Scheduler đẩy lên Kafka thành công)
* **`CompensationTask` (Tác vụ bù trừ Saga thất bại):**
  * `- id : Long` (Khóa chính tác vụ bù trừ)
  * `- taskType : String` (Loại tác vụ bù trừ: "RELEASE_VOUCHER", "REFUND_POINTS")
  * `- status : String` (Trạng thái bù trừ: "PENDING", "COMPLETED", "FAILED_PERMANENT")
  * `- attempts : Integer` (Số lần hệ thống đã thử thực thi bù trừ Saga)
  * `- lastError : String` (Thông điệp lỗi chi tiết từ lần thử gần nhất)
  * `- createdAt : LocalDateTime` (Thời điểm ghi nhận tác vụ bù trừ khi đơn bị hủy)
  * `- updatedAt : LocalDateTime` (Thời điểm cập nhật trạng thái bù trừ)
* **`UserEvent` (Nhật ký hành vi người dùng thô phục vụ AI SASRec):**
  * `- id : Long` (Khóa chính sự kiện tương tác)
  * `- sessionId : String` (Mã phiên duyệt web của người dùng)
  * `- actionType : String` (Hành vi: "VIEW_PRODUCT", "ADD_TO_CART", "PURCHASE")
  * `- weight : Double` (Trọng số thể hiện mức độ quan tâm của hành vi)
  * `- source : String` (Nguồn tương tác: "WEB_RECOMMENDATION", "DIRECT_SEARCH")
  * `- createdAt : LocalDateTime` (Thời điểm người dùng thực hiện tương tác clickstream)
* **`WebhookLog` (Nhật ký đối soát IPN Webhook cổng thanh toán):**
  * `- id : Long` (Khóa chính nhật ký Webhook)
  * `- gateway : String` (Tên cổng thanh toán gửi Webhook: "VNPAY")
  * `- rawPayload : String` (Toàn bộ chuỗi truy vấn tham số URL / Body do VNPay bắn sang)
  * `- signatureValid : Boolean` (Kết quả kiểm tra chữ ký băm mật mã HMAC-SHA512)
  * `- processed : Boolean` (Cờ chỉ định bản ghi IPN đã được xử lý cập nhật trạng thái đơn hay chưa)
  * `- createdAt : LocalDateTime` (Thời điểm máy chủ tiếp nhận yêu cầu Webhook)

---

### Bước 3: Chuyển đổi các mối quan hệ thành thuộc tính tham chiếu đối tượng và lớp kết hợp

Theo phương pháp luận thiết kế hướng đối tượng kết hợp kiến trúc Microservices và cơ sở dữ liệu quan hệ, các mối quan hệ ngữ nghĩa phân tích được chuyển đổi cụ thể thành **thuộc tính tham chiếu đối tượng (Object References)** và **các lớp kết hợp / phân rã trung gian**:

* **Quan hệ `Order` – `ProductVariant`** $\rightarrow$ Chuyển thành lớp kết hợp **`OrderItem`** chứa các thuộc tính tham chiếu đối tượng:
  * `- o : Order` (Tham chiếu đối tượng đơn hàng sở hữu dòng mặt hàng này).
  * `- pv : ProductVariant` (Tham chiếu đối tượng biến thể SKU được khách hàng đặt mua).
* **Quan hệ `Category` – `Attribute`** $\rightarrow$ Chuyển thành lớp trung gian **`CategoryAttribute`** chứa các thuộc tính tham chiếu đối tượng:
  * `- c : Category` (Tham chiếu danh mục áp dụng).
  * `- a : Attribute` (Tham chiếu thuộc tính kỹ thuật được ràng buộc).
* **Quan hệ `Product` – `Attribute`** $\rightarrow$ Chuyển thành lớp trung gian **`ProductAttributeValue`** chứa các thuộc tính tham chiếu:
  * `- p : Product` (Tham chiếu sản phẩm cha sở hữu thông số).
  * `- a : Attribute` (Tham chiếu thuộc tính định nghĩa).
* **Quan hệ `ProductVariant` – `Attribute`** $\rightarrow$ Chuyển thành lớp trung gian **`VariantOptionValue`** chứa các thuộc tính tham chiếu:
  * `- pv : ProductVariant` (Tham chiếu biến thể SKU cụ thể).
  * `- a : Attribute` (Tham chiếu thuộc tính tùy chọn).
* **Quan hệ `Campaign` – `Customer`** $\rightarrow$ Chuyển thành lớp trung gian **`IssuedVoucher`** chứa các thuộc tính tham chiếu:
  * `- camp : Campaign` (Tham chiếu chiến dịch Camunda phát hành voucher).
  * `- c : Customer` (Tham chiếu khách hàng được cấp quyền sở hữu mã ưu đãi).
  * `- o : Order` (Tham chiếu đơn hàng mà voucher đã được sử dụng khấu trừ).
* **Quan hệ `Order` – `Customer`** $\rightarrow$ Lớp `Order` chuyển thành chứa thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu khách hàng thực hiện đặt đơn hàng).
* **Quan hệ `Order` – `Payment`** $\rightarrow$ Lớp `Payment` chuyển thành chứa các thuộc tính tham chiếu:
  * `- o : Order` (Tham chiếu đơn hàng liên kết giao dịch thanh toán).
  * `- c : Customer` (Tham chiếu khách hàng thanh toán hóa đơn).
* **Quan hệ `Payment` – `Refund`** $\rightarrow$ Lớp `Refund` chuyển thành chứa thuộc tính tham chiếu:
  * `- p : Payment` (Tham chiếu hóa đơn thanh toán gốc được hoàn trả tiền).
* **Quan hệ `Payment` – `WebhookLog`** $\rightarrow$ Lớp `WebhookLog` chuyển thành chứa thuộc tính tham chiếu:
  * `- p : Payment` (Tham chiếu hóa đơn thanh toán đối soát dữ liệu IPN).
* **Quan hệ `Customer` – `Address`** $\rightarrow$ Lớp `Address` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu chủ sở hữu địa chỉ giao hàng).
  * `- pr : Province` (Tham chiếu đối tượng Tỉnh / Thành phố hành chính).
  * `- w : Ward` (Tham chiếu đối tượng Phường / Xã hành chính trực thuộc).
* **Quan hệ `Province` – `Ward`** $\rightarrow$ Lớp `Ward` chuyển thành chứa thuộc tính tham chiếu:
  * `- pr : Province` (Tham chiếu Tỉnh / Thành phố cấp trên quản lý).
* **Quan hệ `Customer` – `LoyaltyPointTransaction`** $\rightarrow$ Lớp `LoyaltyPointTransaction` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu khách hàng biến động điểm).
  * `- o : Order` (Tham chiếu đơn hàng phát sinh tích/tiêu điểm).
  * `- camp : Campaign` (Tham chiếu chiến dịch thưởng điểm nếu có).
* **Quan hệ `WarehouseStaff` – `Supplier` – `ProductVariant` qua phiếu nhập hàng** $\rightarrow$ Lớp `RestockRequest` chuyển thành chứa các thuộc tính tham chiếu:
  * `- ws : WarehouseStaff` (Tham chiếu nhân viên kho lập yêu cầu nhập hàng).
  * `- sup : Supplier` (Tham chiếu đối tác nhà cung cấp giao hàng).
  * `- pv : ProductVariant` (Tham chiếu biến thể sản phẩm cần nhập kho).
* **Quan hệ `ProductVariant` – `Inventory`** $\rightarrow$ Lớp `Inventory` chuyển thành chứa thuộc tính tham chiếu:
  * `- pv : ProductVariant` (Tham chiếu biến thể SKU tương ứng bản ghi kho).
* **Quan hệ `Inventory` – `InventoryTransaction`** $\rightarrow$ Lớp `InventoryTransaction` chuyển thành chứa các thuộc tính tham chiếu:
  * `- inv : Inventory` (Tham chiếu bản ghi kho biến động).
  * `- o : Order` (Tham chiếu đơn hàng kích hoạt trừ / giải phóng kho).
* **Quan hệ `ProductVariant` – `InventoryDailySnapshot`** $\rightarrow$ Lớp `InventoryDailySnapshot` chuyển thành chứa thuộc tính tham chiếu:
  * `- pv : ProductVariant` (Tham chiếu biến thể được chụp tồn kho).
* **Quan hệ `Customer` – `SalesStaff` qua phòng chat** $\rightarrow$ Lớp `ChatRoom` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu khách hàng yêu cầu tư vấn).
  * `- ss : SalesStaff` (Tham chiếu chuyên viên bán hàng tiếp nhận phiên hỗ trợ).
* **Quan hệ `ChatRoom` – `ChatMessage`** $\rightarrow$ Lớp `ChatMessage` chuyển thành chứa thuộc tính tham chiếu:
  * `- cr : ChatRoom` (Tham chiếu phòng chat chứa tin nhắn).
* **Quan hệ `Customer` – `Notification`** $\rightarrow$ Lớp `Notification` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu khách hàng nhận thông báo).
  * `- nt : NotificationTemplate` (Tham chiếu bản mẫu cấu hình thông báo áp dụng).
  * `- o : Order` (Tham chiếu đơn hàng liên quan đến thông báo).
* **Quan hệ `Customer` – `FCMToken`** $\rightarrow$ Lớp `FCMToken` chuyển thành chứa thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu người dùng sở hữu thiết bị).
* **Quan hệ `Customer` – `UserEvent`** $\rightarrow$ Lớp `UserEvent` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu khách hàng thực hiện hành vi clickstream).
  * `- p : Product` (Tham chiếu sản phẩm được tương tác).
  * `- cat : Category` (Tham chiếu danh mục sản phẩm).
* **Quan hệ `Customer` – `Product` qua đánh giá** $\rightarrow$ Lớp `ProductReview` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu người viết nhận xét).
  * `- p : Product` (Tham chiếu sản phẩm được đánh giá).
  * `- o : Order` (Tham chiếu đơn hàng xác thực người mua hàng thật).
* **Quan hệ `Customer` – `Product` qua danh sách yêu thích** $\rightarrow$ Lớp `WishlistItem` chuyển thành chứa các thuộc tính tham chiếu:
  * `- c : Customer` (Tham chiếu người dùng đánh dấu thích).
  * `- p : Product` (Tham chiếu sản phẩm được thêm vào danh sách yêu thích).
* **Quan hệ `Product` – `ProductImage`** $\rightarrow$ Lớp `ProductImage` chuyển thành chứa thuộc tính tham chiếu:
  * `- p : Product` (Tham chiếu sản phẩm cha sở hữu ảnh).
* **Quan hệ `Product` – `ProductTag`** $\rightarrow$ Lớp `ProductTag` chuyển thành chứa thuộc tính tham chiếu:
  * `- p : Product` (Tham chiếu sản phẩm được gắn thẻ).
* **Quan hệ `Order` – `OutboxEvent`** $\rightarrow$ Lớp `OutboxEvent` chuyển thành chứa thuộc tính tham chiếu:
  * `- o : Order` (Tham chiếu đơn hàng phát sinh sự kiện phân tán).
* **Quan hệ `Order` – `CompensationTask`** $\rightarrow$ Lớp `CompensationTask` chuyển thành chứa thuộc tính tham chiếu:
  * `- o : Order` (Tham chiếu đơn hàng cần thực thi bù trừ Saga).
* **Quan hệ `Campaign` – `ExecutedAction`** $\rightarrow$ Lớp `ExecutedAction` chuyển thành chứa thuộc tính tham chiếu:
  * `- camp : Campaign` (Tham chiếu chiến dịch thực thi tác vụ Idempotent).

---

### Hình ảnh 5. Biểu đồ lớp thực thể pha thiết kế (Design Class Diagram)

Tệp mã nguồn PlantUML: [class_thiet_ke_thuc_the.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_thuc_the.puml)  
Tệp hình ảnh biểu đồ đã biên dịch: [class_thiet_ke_thuc_the.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_thuc_the.png)

```
                                  [HÌNH ẢNH 5: BIỂU ĐỒ LỚP THỰC THỂ PHA THIẾT KẾ]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_thuc_the.png`)*

**Đặc điểm quy chuẩn hiển thị của Biểu đồ lớp thực thể pha thiết kế:**
* **Phong cách Visual Paradigm đơn sắc (Monochrome Design):** Khung hộp hình chữ nhật nền trắng viền đen sắc nét, đường nối trực giao thẳng góc vuông vắn (`linetype ortho`), bố trí liền mạch trên cùng một mặt phẳng vẽ (Flat Canvas) không chia block package bao quanh nhằm đảm bảo tính thoáng đãng và dễ theo dõi tổng thể.
* **Chuẩn mực biểu diễn hướng đối tượng chi tiết:**
  * Toàn bộ các thuộc tính đều được định kiểu dữ liệu Java chuẩn (`-id : Long`, `-name : String`, `-price : BigDecimal`, `-quantity : Integer`, `-active : Boolean`, `-createdAt : LocalDateTime`).
  * Các mối liên kết được cụ thể hóa bằng các thuộc tính tham chiếu đối tượng viết tắt chuẩn theo mẫu đồ án (`-o : Order`, `-pv : ProductVariant`, `-c : Customer`, `-ss : SalesStaff`, `-ws : WarehouseStaff`, `-sup : Supplier`).
  * Giữ vững các ký hiệu liên kết chuẩn UML: Quan hệ kế thừa (`<|--` với mũi tên tam giác rỗng hướng về lớp cha), quan hệ kết hợp tập hợp (`o--` với hình thoi rỗng ở đầu đối tượng sở hữu).

---

## 2. Xây dựng cơ sở dữ liệu

Dựa trên biểu đồ lớp thực thể pha thiết kế, quá trình xây dựng cơ sở dữ liệu vật lý cho hệ thống sàn thương mại điện tử AuraTech được tiến hành tuần tự qua 5 bước chuẩn hóa theo tài liệu phương pháp luận:

### Bước 1: Với mỗi lớp thực thể, đề xuất bảng tương ứng:
- Lớp Member → bảng tblMember
- Lớp Customer → bảng tblCustomer
- Lớp Employee → bảng tblEmployee
- Lớp ManagerStaff → bảng tblManagerStaff
- Lớp SalesStaff → bảng tblSalesStaff
- Lớp WarehouseStaff → bảng tblWarehouseStaff
- Lớp Supplier → bảng tblSupplier
- Lớp Address → bảng tblAddress
- Lớp Province → bảng tblProvince
- Lớp Ward → bảng tblWard
- Lớp Category → bảng tblCategory
- Lớp Brand → bảng tblBrand
- Lớp Product → bảng tblProduct
- Lớp ProductVariant → bảng tblProductVariant
- Lớp ProductImage → bảng tblProductImage
- Lớp ProductTag → bảng tblProductTag
- Lớp Attribute → bảng tblAttribute
- Lớp CategoryAttribute → bảng tblCategoryAttribute
- Lớp ProductAttributeValue → bảng tblProductAttributeValue
- Lớp VariantOptionValue → bảng tblVariantOptionValue
- Lớp ProductReview → bảng tblProductReview
- Lớp WishlistItem → bảng tblWishlistItem
- Lớp Order → bảng tblOrder
- Lớp OrderItem → bảng tblOrderItem
- Lớp Payment → bảng tblPayment
- Lớp Refund → bảng tblRefund
- Lớp WebhookLog → bảng tblWebhookLog
- Lớp LoyaltyPointTransaction → bảng tblLoyaltyPointTransaction
- Lớp Campaign → bảng tblCampaign
- Lớp IssuedVoucher → bảng tblIssuedVoucher
- Lớp ExecutedAction → bảng tblExecutedAction
- Lớp Inventory → bảng tblInventory
- Lớp InventoryTransaction → bảng tblInventoryTransaction
- Lớp RestockRequest → bảng tblRestockRequest
- Lớp InventoryDailySnapshot → bảng tblInventoryDailySnapshot
- Lớp ChatRoom → bảng tblChatRoom
- Lớp ChatMessage → bảng tblChatMessage
- Lớp Notification → bảng tblNotification
- Lớp NotificationTemplate → bảng tblNotificationTemplate
- Lớp FCMToken → bảng tblFCMToken
- Lớp OutboxEvent → bảng tblOutboxEvent
- Lớp CompensationTask → bảng tblCompensationTask
- Lớp UserEvent → bảng tblUserEvent
- Lớp ProductSimilarity → bảng/collection tblProductSimilarity

*(Ghi chú: Các lớp thống kê gồm CustomerStatistics, ProductStatistics, OrderStatistics, SupplierStatistics được loại bỏ theo nguyên tắc ở Bước 5)*

### Bước 2: Đưa thuộc tính không phải đối tượng của lớp thực thể thành thuộc tính của bảng tương ứng:
- tblMember có các thuộc tính: id, username, password, fullName, email, phoneNumber, avatarUrl.
- tblCustomer có các thuộc tính: id, keycloakUserId, customerTier, loyaltyPoints, segmentationLabel, isBlacklisted, active.
- tblEmployee có các thuộc tính: id, employeeCode, role, department.
- tblManagerStaff có các thuộc tính: id.
- tblSalesStaff có các thuộc tính: id.
- tblWarehouseStaff có các thuộc tính: id.
- tblSupplier có các thuộc tính: id, supplierCode, companyName, taxCode.
- tblProvince có các thuộc tính: code, name.
- tblWard có các thuộc tính: code, name.
- tblAddress có các thuộc tính: id, recipientName, phoneNumber, province, districtWard, detailAddress, isDefault.
- tblCategory có các thuộc tính: id, name, slug, parentId, imageUrl, icon, sortOrder, active.
- tblBrand có các thuộc tính: id, name, slug, logoUrl, description.
- tblProduct có các thuộc tính: id, name, slug, description, attributes, specsRaw, price, costPrice, salePrice, weight, brand, imageUrl, length, width, height, warrantyPeriod, warrantyPolicy, salesCount, ratingAvg, active.
- tblProductVariant có các thuộc tính: id, sku, variantAttr, price, costPrice, salePrice, weight, imageUrl, active.
- tblProductImage có các thuộc tính: id, imageUrl, sortOrder, isPrimary.
- tblProductTag có các thuộc tính: id, tag.
- tblAttribute có các thuộc tính: id, code, name, valueType, allowedValues, isColor.
- tblCategoryAttribute có các thuộc tính: id, isVariant, isRequired, isFilter.
- tblProductAttributeValue có các thuộc tính: id, value.
- tblVariantOptionValue có các thuộc tính: id, value.
- tblProductReview có các thuộc tính: id, rating, comment, imageUrls, staffReplyContent, staffReplyAt, staffReplierId, createdAt.
- tblWishlistItem có các thuộc tính: id, createdAt.
- tblOrder có các thuộc tính: id, userId, email, status, totalAmount, discountAmount, finalAmount, totalWeight, couponCode, appliedCampaignId, pointsRedeemed, pointDiscountAmount, shippingFee, shippingDiscountAmount, vatAmount, trackingCode, shippingAddress, phoneNumber, note, createdAt, updatedAt.
- tblOrderItem có các thuộc tính: id, productName, productImage, variantAttr, unitPrice, quantity, subtotal.
- tblPayment có các thuộc tính: id, txnRef, gatewayTxnId, paymentMethod, amount, currency, status, failureCode, gatewayResponse, paidAt, createdAt, updatedAt.
- tblRefund có các thuộc tính: id, refundAmount, reason, status, gatewayRefundId, requestedBy, completedAt, createdAt.
- tblWebhookLog có các thuộc tính: id, gateway, rawPayload, signatureValid, processed, createdAt.
- tblLoyaltyPointTransaction có các thuộc tính: id, delta, balanceAfter, calculationMode, sourceType, referenceId, description, createdAt.
- tblCampaign có các thuộc tính: id, name, totalBudget, remainingBudget, startDate, endDate, bpmnProcessDefinitionKey, workflowJson, bpmnXml, triggerType, createdAt, updatedAt.
- tblIssuedVoucher có các thuộc tính: id, code, voucherType, discountPercent, maxDiscountAmount, discountAmount, minOrderValue, maxShippingDiscount, restrictedCategoryIds, restrictedProductIds, expiresAt, usedAt, idempotencyKey, createdAt.
- tblExecutedAction có các thuộc tính: id, idempotencyKey, actionType, createdAt.
- tblInventory có các thuộc tính: id, quantity, updatedAt.
- tblInventoryTransaction có các thuộc tính: id, transactionType, quantityChanged, quantityBefore, quantityAfter, referenceId, note, createdAt.
- tblRestockRequest có các thuộc tính: id, quantity, status, requestedBy, completedAt, createdAt.
- tblInventoryDailySnapshot có các thuộc tính: id, stockLevel, snapshotDate, createdAt.
- tblChatRoom có các thuộc tính: id, customerName, staffName, status, lastMessage, lastMessageAt, lastMessageSenderId, createdAt, updatedAt.
- tblChatMessage có các thuộc tính: id, senderId, senderName, senderRole, content, type, isRead, createdAt.
- tblNotification có các thuộc tính: id, eventType, channels, recipient, subject, content, status, deliveryResults, createdAt.
- tblNotificationTemplate có các thuộc tính: id, code, name, titleTemplate, bodyTemplate, channel.
- tblFCMToken có các thuộc tính: id, token, platform, deviceId, lastUsedAt.
- tblOutboxEvent có các thuộc tính: id, aggregateId, aggregateType, eventType, payload, status, retryCount, createdAt, processedAt.
- tblCompensationTask có các thuộc tính: id, taskType, status, attempts, lastError, createdAt, updatedAt.
- tblUserEvent có các thuộc tính: id, sessionId, actionType, weight, source, createdAt.
- tblProductSimilarity có các thuộc tính: id, similarProductId, similarityScore, updatedAt.

### Bước 3: Chuyển quan hệ số lượng giữa các lớp thực thể thành quan hệ số lượng giữa các bảng:
- 1 tblMember - 1 tblCustomer.
- 1 tblMember - 1 tblEmployee.
- 1 tblEmployee - 1 tblManagerStaff.
- 1 tblEmployee - 1 tblSalesStaff.
- 1 tblEmployee - 1 tblWarehouseStaff.
- 1 tblEmployee - 1 tblSupplier.
- 1 tblProvince - n tblWard.
- 1 tblProvince - n tblAddress.
- 1 tblWard - n tblAddress.
- 1 tblCustomer - n tblAddress.
- 1 tblCategory - n tblProduct.
- 1 tblBrand - n tblProduct.
- 1 tblCategory - n tblCategoryAttribute.
- 1 tblAttribute - n tblCategoryAttribute.
- 1 tblProduct - n tblProductVariant.
- 1 tblProduct - n tblProductImage.
- 1 tblProduct - n tblProductTag.
- 1 tblProduct - n tblProductAttributeValue.
- 1 tblAttribute - n tblProductAttributeValue.
- 1 tblProductVariant - n tblVariantOptionValue.
- 1 tblAttribute - n tblVariantOptionValue.
- n tblOrder - 1 tblCustomer.
- 1 tblOrder - n tblOrderItem.
- n tblOrderItem - 1 tblProductVariant.
- 1 tblOrder - 1 tblPayment.
- n tblPayment - 1 tblCustomer.
- 1 tblPayment - n tblRefund.
- 1 tblPayment - n tblWebhookLog.
- n tblProductReview - 1 tblCustomer.
- n tblProductReview - 1 tblProduct.
- n tblProductReview - 1 tblOrder.
- n tblWishlistItem - 1 tblCustomer.
- n tblWishlistItem - 1 tblProduct.
- n tblLoyaltyPointTransaction - 1 tblCustomer.
- n tblLoyaltyPointTransaction - 1 tblOrder.
- n tblLoyaltyPointTransaction - 1 tblCampaign.
- 1 tblCampaign - n tblIssuedVoucher.
- n tblIssuedVoucher - 1 tblCustomer.
- n tblIssuedVoucher - 1 tblOrder.
- 1 tblCampaign - n tblExecutedAction.
- 1 tblProductVariant - 1 tblInventory.
- 1 tblInventory - n tblInventoryTransaction.
- n tblInventoryTransaction - 1 tblOrder.
- 1 tblProductVariant - n tblInventoryDailySnapshot.
- n tblRestockRequest - 1 tblWarehouseStaff.
- n tblRestockRequest - 1 tblSupplier.
- n tblRestockRequest - 1 tblProductVariant.
- n tblChatRoom - 1 tblCustomer.
- n tblChatRoom - 1 tblSalesStaff.
- 1 tblChatRoom - n tblChatMessage.
- 1 tblNotificationTemplate - n tblNotification.
- n tblNotification - 1 tblCustomer.
- n tblNotification - 1 tblOrder.
- n tblFCMToken - 1 tblCustomer.
- 1 tblOrder - n tblOutboxEvent.
- 1 tblOrder - n tblCompensationTask.
- n tblUserEvent - 1 tblCustomer.
- n tblUserEvent - 1 tblProduct.
- n tblUserEvent - 1 tblCategory.
- 1 tblProduct - n tblProductSimilarity.

### Bước 4: Bổ sung các thuộc tính khóa
- 1 tblMember - 1 tblCustomer → bảng tblCustomer có khóa ngoại tblMemberid (đồng thời là khóa chính PK).
- 1 tblMember - 1 tblEmployee → bảng tblEmployee có khóa ngoại tblMemberid (đồng thời là khóa chính PK).
- 1 tblEmployee - 1 tblManagerStaff → bảng tblManagerStaff có khóa ngoại tblEmployeeid (đồng thời là khóa chính PK).
- 1 tblEmployee - 1 tblSalesStaff → bảng tblSalesStaff có khóa ngoại tblEmployeeid (đồng thời là khóa chính PK).
- 1 tblEmployee - 1 tblWarehouseStaff → bảng tblWarehouseStaff có khóa ngoại tblEmployeeid (đồng thời là khóa chính PK).
- 1 tblEmployee - 1 tblSupplier → bảng tblSupplier có khóa ngoại tblEmployeeid (đồng thời là khóa chính PK).
- 1 tblProvince - n tblWard → bảng tblWard có khóa ngoại tblProvincecode.
- 1 tblProvince - n tblAddress → bảng tblAddress có khóa ngoại tblProvincecode.
- 1 tblWard - n tblAddress → bảng tblAddress có khóa ngoại tblWardcode.
- 1 tblCustomer - n tblAddress → bảng tblAddress có khóa ngoại tblCustomerid.
- 1 tblCategory - n tblProduct → bảng tblProduct có khóa ngoại tblCategoryid.
- 1 tblBrand - n tblProduct → bảng tblProduct có khóa ngoại tblBrandid.
- 1 tblCategory - n tblCategoryAttribute → bảng tblCategoryAttribute có khóa ngoại tblCategoryid.
- 1 tblAttribute - n tblCategoryAttribute → bảng tblCategoryAttribute có khóa ngoại tblAttributeid.
- 1 tblProduct - n tblProductVariant → bảng tblProductVariant có khóa ngoại tblProductid.
- 1 tblProduct - n tblProductImage → bảng tblProductImage có khóa ngoại tblProductid.
- 1 tblProduct - n tblProductTag → bảng tblProductTag có khóa ngoại tblProductid.
- 1 tblProduct - n tblProductAttributeValue → bảng tblProductAttributeValue có khóa ngoại tblProductid.
- 1 tblAttribute - n tblProductAttributeValue → bảng tblProductAttributeValue có khóa ngoại tblAttributeid.
- 1 tblProductVariant - n tblVariantOptionValue → bảng tblVariantOptionValue có khóa ngoại tblProductVariantid.
- 1 tblAttribute - n tblVariantOptionValue → bảng tblVariantOptionValue có khóa ngoại tblAttributeid.
- n tblOrder - 1 tblCustomer → bảng tblOrder có khóa ngoại tblCustomerid.
- 1 tblOrder - n tblOrderItem → bảng tblOrderItem có khóa ngoại tblOrderid.
- n tblOrderItem - 1 tblProductVariant → bảng tblOrderItem có khóa ngoại tblProductVariantid.
- 1 tblOrder - 1 tblPayment → bảng tblPayment có khóa ngoại tblOrderid.
- n tblPayment - 1 tblCustomer → bảng tblPayment có khóa ngoại tblCustomerid.
- 1 tblPayment - n tblRefund → bảng tblRefund có khóa ngoại tblPaymentid.
- 1 tblPayment - n tblWebhookLog → bảng tblWebhookLog có khóa ngoại tblPaymentid.
- n tblProductReview - 1 tblCustomer → bảng tblProductReview có khóa ngoại tblCustomerid.
- n tblProductReview - 1 tblProduct → bảng tblProductReview có khóa ngoại tblProductid.
- n tblProductReview - 1 tblOrder → bảng tblProductReview có khóa ngoại tblOrderid.
- n tblWishlistItem - 1 tblCustomer → bảng tblWishlistItem có khóa ngoại tblCustomerid.
- n tblWishlistItem - 1 tblProduct → bảng tblWishlistItem có khóa ngoại tblProductid.
- n tblLoyaltyPointTransaction - 1 tblCustomer → bảng tblLoyaltyPointTransaction có khóa ngoại tblCustomerid.
- n tblLoyaltyPointTransaction - 1 tblOrder → bảng tblLoyaltyPointTransaction có khóa ngoại tblOrderid.
- n tblLoyaltyPointTransaction - 1 tblCampaign → bảng tblLoyaltyPointTransaction có khóa ngoại tblCampaignid.
- 1 tblCampaign - n tblIssuedVoucher → bảng tblIssuedVoucher có khóa ngoại tblCampaignid.
- n tblIssuedVoucher - 1 tblCustomer → bảng tblIssuedVoucher có khóa ngoại tblCustomerid.
- n tblIssuedVoucher - 1 tblOrder → bảng tblIssuedVoucher có khóa ngoại tblOrderid.
- 1 tblCampaign - n tblExecutedAction → bảng tblExecutedAction có khóa ngoại tblCampaignid.
- 1 tblProductVariant - 1 tblInventory → bảng tblInventory có khóa ngoại tblProductVariantid.
- 1 tblInventory - n tblInventoryTransaction → bảng tblInventoryTransaction có khóa ngoại tblInventoryid.
- n tblInventoryTransaction - 1 tblOrder → bảng tblInventoryTransaction có khóa ngoại tblOrderid.
- 1 tblProductVariant - n tblInventoryDailySnapshot → bảng tblInventoryDailySnapshot có khóa ngoại tblProductVariantid.
- n tblRestockRequest - 1 tblWarehouseStaff → bảng tblRestockRequest có khóa ngoại tblWarehouseStaffid.
- n tblRestockRequest - 1 tblSupplier → bảng tblRestockRequest có khóa ngoại tblSupplierid.
- n tblRestockRequest - 1 tblProductVariant → bảng tblRestockRequest có khóa ngoại tblProductVariantid.
- n tblChatRoom - 1 tblCustomer → bảng tblChatRoom có khóa ngoại tblCustomerid.
- n tblChatRoom - 1 tblSalesStaff → bảng tblChatRoom có khóa ngoại tblSalesStaffid.
- 1 tblChatRoom - n tblChatMessage → bảng tblChatMessage có khóa ngoại tblChatRoomid.
- 1 tblNotificationTemplate - n tblNotification → bảng tblNotification có khóa ngoại tblNotificationTemplateid.
- n tblNotification - 1 tblCustomer → bảng tblNotification có khóa ngoại tblCustomerid.
- n tblNotification - 1 tblOrder → bảng tblNotification có khóa ngoại tblOrderid.
- n tblFCMToken - 1 tblCustomer → bảng tblFCMToken có khóa ngoại tblCustomerid.
- 1 tblOrder - n tblOutboxEvent → bảng tblOutboxEvent có khóa ngoại tblOrderid.
- 1 tblOrder - n tblCompensationTask → bảng tblCompensationTask có khóa ngoại tblOrderid.
- n tblUserEvent - 1 tblCustomer → bảng tblUserEvent có khóa ngoại tblCustomerid.
- n tblUserEvent - 1 tblProduct → bảng tblUserEvent có khóa ngoại tblProductid.
- n tblUserEvent - 1 tblCategory → bảng tblUserEvent có khóa ngoại tblCategoryid.
- 1 tblProduct - n tblProductSimilarity → bảng tblProductSimilarity có khóa ngoại tblProductid.

### Bước 5: Các thuộc tính dẫn xuất:
- **Loại bỏ các bảng thống kê:** Toàn bộ các thuộc tính của các lớp thống kê (`CustomerStatistics`, `ProductStatistics`, `OrderStatistics`, `SupplierStatistics`) được loại bỏ và không tạo bảng vật lý riêng trong cơ sở dữ liệu. Các chỉ số thống kê này được tính toán động (dynamic query) hoặc tổng hợp định kỳ qua pipeline phân tích (Analytics Projection), không lưu trữ trùng lặp nhằm tránh nguy cơ sai lệch dữ liệu.
- **Xử lý thuộc tính dẫn xuất tính toán:**
  - Thuộc tính `subtotal` trong bảng `tblOrderItem`: Dẫn xuất từ `unitPrice * quantity`. Trường này được lưu trực tiếp vào bản ghi tại thời điểm chốt đơn nhằm phục vụ tính bất biến của hóa đơn (Immutable Audit Trail), tránh tình trạng biến động giá trong tương lai làm thay đổi lịch sử đơn hàng.
  - Thuộc tính `finalAmount` trong bảng `tblOrder`: Dẫn xuất từ phép tính `totalAmount - discountAmount - pointDiscountAmount + shippingFee - shippingDiscountAmount + vatAmount`. Được lưu trực tiếp vào bảng `tblOrder` làm căn cứ pháp lý đối soát thanh toán với cổng VNPay và hạch toán kế toán.
  - Thuộc tính `balanceAfter` trong bảng `tblLoyaltyPointTransaction`: Dẫn xuất từ số dư điểm tích lũy của khách hàng cộng/trừ với số điểm biến động `delta`, được lưu vết để kiểm toán lịch sử ví điểm.

---

### Hình ảnh 6. Biểu đồ thiết kế CSDL (Physical Database Diagram - ERD)

Tệp mã nguồn PlantUML: [erd_thiet_ke_csdl.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/erd_thiet_ke_csdl.puml)  
Tệp hình ảnh biểu đồ đã biên dịch: [erd_thiet_ke_csdl.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/erd_thiet_ke_csdl.png)

```
                                  [HÌNH ẢNH 6: BIỂU ĐỒ THIẾT KẾ CƠ SỞ DỮ LIỆU]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `erd_thiet_ke_csdl.png`)*

**Đặc điểm quy chuẩn thiết kế CSDL:**
* **Tuân thủ triệt để mô hình quan hệ chuẩn hóa 3NF:** Mỗi bảng tương ứng với một thực thể nghiệp vụ rõ ràng, có khóa chính `<<PK>>` tự tăng hoặc mã định danh duy nhất.
* **Thể hiện đầy đủ các trường khóa ngoại `<<FK>>`:** Quy ước định danh thống nhất `tbl<TênThựcThể>id` hoặc `tbl<TênThựcThể>code`, kết nối với bảng cha qua các liên kết quan hệ 1-1, 1-n chặt chẽ.
* **Kiểu dữ liệu vật lý quy chuẩn RDBMS:** `integer(10)`, `varchar(255)`, `float(10)`, `date`, `boolean`, `text`.

---

## 3. Thiết kế chi tiết cho modul

Khác với các ứng dụng nguyên khối truyền thống, hệ thống sàn thương mại điện tử AuraTech được xây dựng trên nền tảng **Kiến trúc dịch vụ phân tán (Spring Boot Microservices Architecture)** kết hợp với giao diện Web hiện đại (React / Next.js). Do đó, cấu trúc thiết kế chi tiết của các module tuân thủ chặt chẽ mô hình phân tầng chuẩn doanh nghiệp:
* **Tầng Giao diện (Presentation / UI Layer):** Các Component Web viết bằng React / Next.js, tương tác với Backend qua các cuộc gọi phi đồng bộ HTTP RESTful API (JSON Payload) hoặc WebSocket STOMP.
* **Tầng Điều khiển (REST Controller Layer):** Các lớp `@RestController` của Spring Boot tiếp nhận yêu cầu, phân quyền bảo mật qua Spring Security (`@PreAuthorize`), xác thực dữ liệu đầu vào (`@Valid`) và điều phối xử lý.
* **Tầng Nghiệp vụ (Service Layer):** Các Interface dịch vụ nghiệp vụ và lớp hiện thực (`@Service`) chịu trách nhiệm thực thi toàn bộ logic nghiệp vụ, quản lý giao dịch `@Transactional`, xử lý phân tán, điều phối bộ nhớ đệm Cache và giao tiếp giữa các dịch vụ.
* **Tầng Truy cập dữ liệu (Repository Layer):** Các Interface kế thừa `JpaRepository` của Spring Data JPA hoặc `MongoRepository` của Spring Data MongoDB, cung cấp các phương thức truy vấn tối ưu và ánh xạ tự động với cơ sở dữ liệu quan hệ PostgreSQL hoặc cơ sở dữ liệu tài liệu MongoDB.
* **Tầng Đối tượng truyền tải (DTO Layer) & Thực thể (Entity Layer):** Tách bạch giữa DTO trao đổi dữ liệu với bên ngoài và Entity ánh xạ trực tiếp với bảng vật lý.

---

### 3.1 Thiết kế tĩnh

#### a) Thiết kế tĩnh modul Quản lý sản phẩm (Sửa thông tin sản phẩm)

* **Tầng giao diện (Web Client - Admin Portal):** Gồm các Component giao diện quản trị React / Next.js:
  * `AdminDashboardView`: Trang chủ bảng điều khiển quản trị của nhân viên quản lý.
  * `AdminProductListView`: Bảng danh sách sản phẩm, tích hợp công cụ tìm kiếm từ khóa, bộ lọc phân loại danh mục và phân trang dữ liệu.
  * `AdminProductDetailView`: Biểu mẫu hiển thị chi tiết thông số sản phẩm, cho phép chỉnh sửa giá bán, giá khuyến mãi, mô tả, hình ảnh và trạng thái kinh doanh.
* **Tầng điều khiển (REST Controller Layer):**
  * `AdminProductController`: Tiếp nhận các thao tác quản trị yêu cầu quyền hạn `ROLE_ADMIN` hoặc `ROLE_STAFF`:
    * `PUT /api/v1/admin/products/{id}`: Cập nhật thông tin chi tiết sản phẩm.
    * `POST /api/v1/admin/products`: Thêm mới sản phẩm.
    * `DELETE /api/v1/admin/products/{id}`: Xóa hoặc chuyển trạng thái ngừng bán.
    * `POST /api/v1/admin/products/images/upload`: Tải lên hình ảnh sản phẩm vào MinIO Cloud Storage.
  * `ProductController`: Cung cấp các API truy vấn công khai:
    * `GET /api/v1/public/products`: Lấy danh sách sản phẩm có phân trang (`Slice<ProductDto>`).
    * `GET /api/v1/public/products/{id}`: Lấy chi tiết thông tin sản phẩm theo mã ID.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `ProductService` và lớp hiện thực `ProductServiceImpl`: Chứa toàn bộ logic kiểm tra tính hợp lệ của dữ liệu, chuẩn hóa giá vốn/giá bán (`normalizeProductPricing`), kiểm tra trùng lặp đường dẫn SEO (`slug`), điều phối xóa bộ nhớ đệm Redis (`products_list`, `products_slug`) và kích hoạt dịch vụ tìm kiếm đồng bộ dữ liệu sang Elasticsearch (`searchService.indexProduct`).
* **Tầng truy cập dữ liệu (Repository Layer - Spring Data JPA):**
  * `ProductRepository`: Kế thừa `JpaRepository<Product, Long>`, thực thi các phương thức truy vấn CSDL: `findById(Long id)`, `save(Product product)`, `findBySlug(String slug)`, `findByNameContainingOrDescriptionContaining(...)`.
  * `ProductVariantRepository`: Kế thừa `JpaRepository<ProductVariant, Long>`, thực thi lưu vết và cập nhật các biến thể cấu hình SKU.
* **Tầng Thực thể & DTO:**
  * DTO: `ProductDto`, `ProductVariantDto`, `ApiResponse<T>`.
  * Entity: `Product`, `ProductVariant`, `Category`, `Brand`.

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;">
    <span>🏪 <b>AuraTech Management Portal (Next.js Admin)</b></span>
    <span>👤 Quản lý: <b>Nguyễn Đình Thuân</b> | <a href="#">[Đăng xuất]</a></span>
  </div>
  <div style="text-align: center; padding: 25px 0;">
    <h2 style="margin: 0 0 10px 0;">Bảng Điều Khiển Quản Trị</h2>
    <p style="color: #666; margin-bottom: 15px;">Xin chào <b>Nguyễn Đình Thuân (Quản trị viên)</b><br/>Hệ thống sẵn sàng đồng bộ dữ liệu sản phẩm với PostgreSQL và Elasticsearch.</p>
    <button style="background-color: #0d6efd; color: white; border: none; padding: 8px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">📦 Quản lý danh mục & sản phẩm</button>
  </div>
</div>

<p align="center"><b>Hình ảnh 7. Giao diện AdminDashboardView (Trang chủ quản trị)</b></p>

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;">
    <span><a href="#">⬅ Quay lại</a></span>
    <span><b>Danh sách sản phẩm (Admin Product List)</b></span>
    <span>👤 Quản lý: <b>Nguyễn Đình Thuân</b> | <a href="#">[Đăng xuất]</a></span>
  </div>
  <div style="display: flex; gap: 10px; margin-bottom: 15px;">
    <input type="text" value="laptop" style="flex: 1; padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Nhập tên sản phẩm hoặc mã SKU..."/>
    <button style="background-color: #0d6efd; color: white; border: none; padding: 6px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;">🔍 Tìm kiếm (REST API)</button>
  </div>
  <div>
    <p style="font-weight: bold; margin-bottom: 8px;">Danh sách sản phẩm (Kết quả truy vấn Spring Data JPA):</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px; text-align: center;">
      <tr style="background-color: #f2f2f2;">
        <th>STT</th>
        <th>Mã SP</th>
        <th>Tên sản phẩm</th>
        <th>Danh mục</th>
        <th>Thông số kỹ thuật</th>
        <th>Giá niêm yết</th>
        <th>Trạng thái</th>
        <th>Hành động</th>
      </tr>
      <tr>
        <td>1</td>
        <td>10</td>
        <td>Asus ROG Strix G16</td>
        <td>Laptop Gaming</td>
        <td>Core i7-13650HX, RTX 4060, màn hình 16 inch 165Hz</td>
        <td>32.990.000₫</td>
        <td>Đang bán</td>
        <td><a href="#">✏ Sửa sản phẩm</a></td>
      </tr>
      <tr>
        <td>2</td>
        <td>12</td>
        <td>Lenovo Legion 5 Pro</td>
        <td>Laptop Gaming</td>
        <td>Ryzen 7 7745HX, RTX 4070, WQXGA 240Hz</td>
        <td>38.500.000₫</td>
        <td>Đang bán</td>
        <td><a href="#">✏ Sửa sản phẩm</a></td>
      </tr>
    </table>
  </div>
</div>

<p align="center"><b>Hình ảnh 8. Giao diện AdminProductListView (Danh sách sản phẩm)</b></p>

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;">
    <span><a href="#">⬅ Quay lại danh sách</a></span>
    <span><b>Biểu mẫu chỉnh sửa thông tin sản phẩm (ID: 10)</b></span>
    <span>👤 Quản lý: <b>Nguyễn Đình Thuân</b> | <a href="#">[Đăng xuất]</a></span>
  </div>
  <table style="width: 100%; font-size: 13px;" cellpadding="6">
    <tr>
      <td style="width: 20%; font-weight: bold;">Mã sản phẩm (ID):</td>
      <td style="width: 30%;"><input type="text" value="10" readonly style="width: 90%; padding: 4px; background-color: #eee; border: 1px solid #ccc;"/></td>
      <td style="width: 20%; font-weight: bold;">Trạng thái kinh doanh:</td>
      <td style="width: 30%;">
        <select style="width: 90%; padding: 4px; border: 1px solid #ccc;">
          <option selected>Hoạt động (Active = true)</option>
          <option>Tạm ẩn (Active = false)</option>
        </select>
      </td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Tên sản phẩm:</td>
      <td><input type="text" value="Asus ROG Strix G16" style="width: 90%; padding: 4px; border: 1px solid #ccc;"/></td>
      <td style="font-weight: bold;">Đường dẫn SEO (Slug):</td>
      <td><input type="text" value="asus-rog-strix-g16-2024" style="width: 90%; padding: 4px; border: 1px solid #ccc;"/></td>
    </tr>
    <tr>
      <td style="font-weight: bold;">Giá niêm yết (VNĐ):</td>
      <td><input type="text" value="32,990,000" style="width: 90%; padding: 4px; border: 1px solid #ccc;"/></td>
      <td style="font-weight: bold;">Giá khuyến mãi (VNĐ):</td>
      <td><input type="text" value="31,500,000" style="width: 90%; padding: 4px; border: 1px solid #ccc;"/></td>
    </tr>
    <tr>
      <td style="font-weight: bold; vertical-align: top;">Mô tả sản phẩm:</td>
      <td colspan="3"><textarea rows="2" style="width: 96%; padding: 4px; border: 1px solid #ccc;">Core i7-13650HX, RTX 4060 8GB, 16 inch 165Hz ROG Nebula chuẩn màu 100% sRGB.</textarea></td>
    </tr>
    <tr>
      <td colspan="4" style="padding-top: 10px;">
        <button style="background-color: #0d6efd; color: white; border: none; padding: 6px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">💾 Lưu thay đổi (Gửi PUT Request)</button>
      </td>
    </tr>
  </table>
</div>

<p align="center"><b>Hình ảnh 9. Giao diện AdminProductDetailView (Biểu mẫu cập nhật sản phẩm)</b></p>

##### Hình ảnh 10. Biểu đồ lớp thiết kế module sửa sản phẩm (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [class_thiet_ke_sua_san_pham.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_sua_san_pham.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_sua_san_pham.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_sua_san_pham.png)

```
                            [HÌNH ẢNH 10: BIỂU ĐỒ LỚP THIẾT KẾ MODULE SỬA SẢN PHẨM]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_sua_san_pham.png`)*

---

#### b) Thiết kế tĩnh modul Tìm kiếm sản phẩm đa phương thức

* **Tầng giao diện (Web Client - Customer Portal):** Gồm các Component React / Next.js:
  * `ProductSearchView`: Thanh tìm kiếm thông minh tích hợp ô nhập văn bản toàn văn, bộ lọc thương hiệu, mức giá và công cụ tải ảnh.
  * `ImageSearchModalView`: Hộp thoại tải ảnh từ thiết bị, cho phép xem trước và tích hợp công cụ cắt ảnh tương tác (Interactive Image Cropper) để khoanh vùng sản phẩm cần tìm.
  * `SearchResultListView`: Bảng hiển thị danh sách sản phẩm tìm kiếm với độ tương quan ngữ nghĩa hoặc điểm tương đồng thị giác (`% Visual Match`).
* **Tầng điều khiển (REST Controller Layer):**
  * `ProductController`:
    * `GET /api/v1/public/products/search`: Nhận từ khóa tìm kiếm văn bản (`keyword`), lọc thương hiệu (`brand`), dải giá (`minPrice`, `maxPrice`) và phân trang (`Pageable`).
    * `POST /api/v1/public/products/search/image`: Tiếp nhận tệp ảnh tải lên `MultipartFile` và tham số số lượng kết quả `topK`.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `SearchService` và lớp hiện thực `SearchServiceImpl`:
    * Xử lý tìm kiếm văn bản: Sinh truy vấn kết hợp (Hybrid Search) phối hợp điểm BM25 văn bản toàn văn và điểm vector ngữ nghĩa từ mô hình `multilingual-e5-base`, hợp nhất xếp hạng bằng thuật toán Reciprocal Rank Fusion (RRF).
    * Xử lý tìm kiếm hình ảnh: Đọc byte ảnh từ `MultipartFile`, gọi `ClipEmbeddingClient` để trích xuất vector đặc trưng 512 chiều (mô hình `OpenAI CLIP ViT-B/32`), sau đó thực thi truy vấn kNN Cosine similarity trên cụm Elasticsearch.
* **Tầng truy cập dữ liệu (Repository Layer - Spring Data JPA & Elasticsearch):**
  * `ProductRepository`: Kế thừa `JpaRepository<Product, Long>`, truy vấn thông tin chi tiết và giá bán các sản phẩm khớp từ PostgreSQL thông qua `findByIdIn(List<Long> ids)`.
  * `ElasticsearchClient`: Thực thi truy vấn kNN vector và BM25 trên chỉ mục `products`.
* **Tầng Thực thể & DTO:**
  * DTO: `ProductDto`, `SearchResultDto`, `ImageSearchRequest`, `ApiResponse<T>`.
  * Entity & Document: `Product`, `ProductDocument` (chứa trường `imageVector: dense_vector[512]`).

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;">
    <span>🏪 <b>AuraTech Store - Tìm kiếm đa phương thức</b></span>
    <span>🔍 <b>Hybrid AI Search Engine</b></span>
  </div>
  <div style="display: flex; gap: 10px; margin-bottom: 12px;">
    <input type="text" value="laptop gaming mỏng nhẹ đồ họa" style="flex: 1; padding: 7px 12px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Nhập từ khóa tìm kiếm ngữ nghĩa..."/>
    <button style="background-color: #6c757d; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer;">📷 Tìm bằng hình ảnh</button>
    <button style="background-color: #0d6efd; color: white; border: none; padding: 7px 18px; border-radius: 4px; font-weight: bold; cursor: pointer;">🔍 Tìm kiếm</button>
  </div>
  <div style="border: 1px dashed #0d6efd; padding: 12px; background-color: #f0f7ff; border-radius: 4px; text-align: center; margin-bottom: 12px;">
    <p style="margin: 0 0 8px 0; font-size: 13px;">🖼 Đã chọn ảnh: <b>anh_laptop_gaming.jpg</b> | Vùng cắt: <b>[x:45, y:20, w:380, h:240]</b></p>
    <button style="background-color: #198754; color: white; border: none; padding: 5px 15px; border-radius: 4px; font-weight: bold; font-size: 12px; cursor: pointer;">✨ Trích xuất vector đặc trưng CLIP & Tìm kiếm</button>
  </div>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px; text-align: center;">
    <tr style="background-color: #f2f2f2;">
      <th>TT</th>
      <th>Ảnh SP</th>
      <th>Tên sản phẩm</th>
      <th>Thông số cấu hình</th>
      <th>Giá bán</th>
      <th>Độ tương đồng thị giác</th>
      <th>Hành động</th>
    </tr>
    <tr>
      <td>1</td>
      <td>[Ảnh]</td>
      <td>Asus ROG Strix G16 (2024)</td>
      <td>Core i7-13650HX, 16GB, RTX 4060</td>
      <td>28.990.000₫</td>
      <td><span style="color: green; font-weight: bold;">95.8% Visual Match</span></td>
      <td><a href="#">Xem chi tiết</a></td>
    </tr>
    <tr>
      <td>2</td>
      <td>[Ảnh]</td>
      <td>Lenovo Legion Slim 5</td>
      <td>Ryzen 7 7840HS, 16GB, RTX 4060</td>
      <td>29.490.000₫</td>
      <td><span style="color: green; font-weight: bold;">91.4% Visual Match</span></td>
      <td><a href="#">Xem chi tiết</a></td>
    </tr>
  </table>
</div>

<p align="center"><b>Hình ảnh 11. Giao diện ProductSearchView & ImageSearchModalView (Tìm kiếm đa phương thức)</b></p>

##### Hình ảnh 12. Biểu đồ lớp thiết kế module tìm kiếm sản phẩm đa phương thức

Tệp mã nguồn PlantUML: [class_thiet_ke_tim_kiem.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_tim_kiem.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_tim_kiem.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_tim_kiem.png)

```
                        [HÌNH ẢNH 12: BIỂU ĐỒ LỚP THIẾT KẾ MODULE TÌM KIẾM ĐA PHƯƠNG THỨC]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_tim_kiem.png`)*

---

#### c) Thiết kế tĩnh modul Gợi ý sản phẩm cá nhân hóa thời gian thực

* **Tầng giao diện (Web Client - Customer Portal):**
  * `CustomerHomeView`: Hiển thị khối "Gợi ý dành riêng cho bạn" (Personalized Recommendations) và "Sản phẩm xu hướng" (Trending Products) dựa trên thói quen duyệt web của người dùng.
  * `CartPageView`: Hiển thị bảng "Phụ kiện gợi ý mua kèm ưu đãi" (Cross-sell Accessories) ngay dưới danh sách giỏ hàng, cho phép chọn mua combo giảm giá tức thì.
* **Tầng điều khiển (REST Controller Layer):**
  * `RecommendationController`:
    * `GET /api/v1/public/recommendations/personal`: Trả về danh sách gợi ý cá nhân hóa theo `userId` hoặc `sessionId`, hỗ trợ các chế độ `source = "for_you"`, `"trending"`, `"recent"`.
    * `GET /api/v1/recommendations/cross-sell`: Tiếp nhận danh sách mã sản phẩm trong giỏ hàng (`item_ids`) để tính toán phụ kiện mua kèm tối ưu.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `RecommendationService` và lớp hiện thực `RecommendationServiceImpl`:
    * Thu thập chuỗi hành vi clickstream của người dùng và lưu trữ vào Redis List (`sess:{sid}:seq`).
    * Gọi sang mô hình học sâu tuần tự `SasrecInferenceClient` (kiến trúc Transformer Self-Attention) để tính toán phân phối xác suất và suy luận các sản phẩm tiếp theo người dùng quan tâm nhất.
    * Áp dụng cơ chế dự phòng (Fallback Cold Start) bằng danh sách sản phẩm bán chạy nhất hệ thống khi người dùng mới chưa có lịch sử duyệt hàng.
    * Kích hoạt Rule Engine bán chéo (`CrossSellRuleEngine`) để đề xuất các phụ kiện tương thích (chuột, bàn phím, tai nghe, balo) với mức giá combo chiết khấu ưu đãi.
* **Tầng truy cập dữ liệu & Cache:**
  * `ProductRepository`: Kế thừa `JpaRepository<Product, Long>`, truy vấn thông tin chi tiết và sản phẩm bán chạy nhất sàn.
  * `RedisTemplate`: Thao tác với cấu trúc Redis List để duy trì chuỗi 10 tương tác gần nhất của phiên làm việc.
* **Tầng Thực thể & DTO:**
  * DTO: `ProductRecommendationDto`, `CrossSellItemDto`, `UserEventDto`, `ApiResponse<T>`.
  * Entity: `UserEvent`, `Product`.

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px;">
    <span>🎯 <b>Gợi ý dành riêng cho bạn (Mô hình AI SASRec Sequential Recommendation)</b></span>
    <span style="color: #666; font-size: 12px;">Dựa trên lịch sử xem Asus ROG Strix G16</span>
  </div>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px; text-align: center; margin-bottom: 15px;">
    <tr style="background-color: #f2f2f2;">
      <th>TT</th>
      <th>Ảnh</th>
      <th>Tên sản phẩm gợi ý</th>
      <th>Phân loại</th>
      <th>Giá niêm yết</th>
      <th>Độ phù hợp AI</th>
      <th>Thao tác</th>
    </tr>
    <tr>
      <td>1</td>
      <td>[Ảnh]</td>
      <td>Tai nghe Gaming HyperX Cloud III</td>
      <td>Âm thanh Gaming</td>
      <td>2.190.000₫</td>
      <td><span style="color: green; font-weight: bold;">98.4% Match</span></td>
      <td><button style="background-color: #0d6efd; color: white; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer;">Thêm vào giỏ</button></td>
    </tr>
    <tr>
      <td>2</td>
      <td>[Ảnh]</td>
      <td>Bàn di chuột SteelSeries QcK Prism</td>
      <td>Phụ kiện Gear</td>
      <td>890.000₫</td>
      <td><span style="color: green; font-weight: bold;">95.1% Match</span></td>
      <td><button style="background-color: #0d6efd; color: white; border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer;">Thêm vào giỏ</button></td>
    </tr>
  </table>
  <div style="background-color: #e8f4fd; padding: 10px; border-radius: 4px;">
    <b>🎁 Phụ kiện gợi ý mua kèm ưu đãi (Cross-sell Combo tại giỏ hàng):</b>
    <p style="margin: 5px 0; font-size: 13px;">Mua kèm Chuột Logitech G Pro X Superlight cùng Laptop ROG Strix G16: <span style="text-decoration: line-through; color: #888;">2.490.000₫</span> ➔ <b style="color: #d63384;">1.990.000₫</b> (Tiết kiệm 500.000₫)</p>
  </div>
</div>

<p align="center"><b>Hình ảnh 13. Giao diện Gợi ý cá nhân hóa & Bán chéo combo ưu đãi</b></p>

##### Hình ảnh 14. Biểu đồ lớp thiết kế module gợi ý sản phẩm cá nhân hóa (AI SASRec & Cross-sell)

Tệp mã nguồn PlantUML: [class_thiet_ke_goi_y.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_goi_y.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_goi_y.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_goi_y.png)

```
                        [HÌNH ẢNH 14: BIỂU ĐỒ LỚP THIẾT KẾ MODULE GỢI Ý CÁ NHÂN HÓA]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_goi_y.png`)*

---

#### d) Thiết kế tĩnh modul Đặt hàng và thanh toán trực tuyến

* **Tầng giao diện (Web Client - Customer Portal):**
  * `CustomerHomeView`: Trang chủ người dùng duyệt khám phá danh mục và banner ưu đãi.
  * `CustomerAddressSelectView`: Giao diện tra cứu và lựa chọn sổ địa chỉ giao nhận của khách hàng.
  * `ProductCatalogView`: Giao diện hiển thị danh sách sản phẩm, chọn cấu hình SKU và đưa vào giỏ hàng (`Cart`).
  * `CheckoutOrderView`: Giao diện thanh toán chốt đơn hàng, hiển thị tóm tắt chi phí, mã voucher và lựa chọn hình thức thanh toán.
* **Tầng điều khiển (REST Controller Layer):**
  * `OrderController`: Đảm nhiệm các RESTful API:
    * `POST /api/v1/orders/checkout/preview`: Tính thử chi phí đơn hàng, áp dụng voucher từ `promotion-service` và cước vận chuyển trước khi đặt thật.
    * `POST /api/v1/orders/checkout`: Tạo đơn hàng chính thức với cơ chế khóa lũy yếu `Idempotency-Key` phòng chống đặt trùng lặp đơn.
    * `GET /api/v1/orders/{id}`: Tra cứu thông tin chi tiết đơn hàng theo mã ID.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `OrderService` và lớp hiện thực `OrderServiceImpl`:
    * Kiểm soát tương tranh và khóa lũy yếu qua Redis (`SETNX checkout:lock:<userId>:<idempotencyKey>`).
    * Trừ tồn kho nguyên tử tốc độ cao bằng Redis Lua Script (`stockDecrementScript`).
    * Khởi tạo Entity `Order` và danh sách snapshot bất biến `OrderItem`.
    * Lưu vết sự kiện phân tán vào bảng `OutboxEvent` (mẫu Transactional Outbox Pattern) để đồng bộ trạng thái qua Kafka.
    * Xóa giỏ hàng của khách hàng sau khi đặt hàng thành công (`cartService.clearCart`).
* **Tầng truy cập dữ liệu (Repository Layer - Spring Data JPA):**
  * `OrderRepository`: Kế thừa `JpaRepository<Order, Long>`, lưu trữ thông tin đơn hàng vào bảng `tblOrder`.
  * `OrderItemRepository`: Kế thừa `JpaRepository<OrderItem, Long>`, lưu chi tiết từng mặt hàng vào bảng `tblOrderItem`.
  * `OutboxEventRepository`: Kế thừa `JpaRepository<OutboxEvent, Long>`, lưu sự kiện vào bảng `tblOutboxEvent`.
* **Tầng Thực thể & DTO:**
  * DTO: `CheckoutRequest`, `CheckoutItemRequest`, `CheckoutPreviewRequest`, `CheckoutPreviewResponse`, `OrderResponse`, `ApiResponse<T>`.
  * Entity: `Order`, `OrderItem`, `Payment`, `Customer`, `Address`, `OutboxEvent`.

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 15px;">
    <span><a href="#">⬅ Quay lại giỏ hàng</a></span>
    <span><b>Thanh toán đơn hàng (Checkout Preview)</b></span>
    <span>👤 Khách hàng: <b>Nguyễn Đình Thuân</b> | <a href="#">[Đăng xuất]</a></span>
  </div>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px; text-align: center;">
    <tr style="background-color: #f2f2f2;">
      <th>STT</th>
      <th>Tên sản phẩm</th>
      <th>Cấu hình</th>
      <th>Đơn giá</th>
      <th>Số lượng</th>
      <th>Thành tiền</th>
    </tr>
    <tr>
      <td>1</td>
      <td>Asus ROG Strix G16</td>
      <td>i7-13650HX / 16GB / 512GB / RTX 4060</td>
      <td>31.500.000₫</td>
      <td>1</td>
      <td>31.500.000₫</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Bàn phím cơ ROG Falchion</td>
      <td>Wireless 65% RGB Switch Red</td>
      <td>2.490.000₫</td>
      <td>1</td>
      <td>2.490.000₫</td>
    </tr>
  </table>
  <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px;">
    <div>
      <span>Phương thức thanh toán: <b>Cổng VNPay (Thẻ ATM/QR/Nội địa)</b></span><br/>
      <span style="color: green;">Mã giảm giá áp dụng: <b>AURAGAMING (-500.000₫)</b></span>
    </div>
    <div style="text-align: right; font-size: 14px;">
      <span>Tổng tiền hàng: <b>33.990.000₫</b></span><br/>
      <span>Voucher giảm giá: <b>-500.000₫</b></span><br/>
      <span style="color: #d63384; font-size: 18px;">Tổng thanh toán: <b>33.490.000₫</b></span><br/>
      <button style="background-color: #0d6efd; color: white; border: none; padding: 8px 24px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 8px;">✅ Xác nhận đặt hàng (POST /checkout)</button>
    </div>
  </div>
</div>

<p align="center"><b>Hình ảnh 15. Giao diện CheckoutOrderView (Xác nhận đặt hàng & thanh toán)</b></p>

##### Hình ảnh 16. Biểu đồ lớp thiết kế module đặt hàng (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [class_thiet_ke_dat_hang.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_dat_hang.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_dat_hang.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_dat_hang.png)

```
                            [HÌNH ẢNH 16: BIỂU ĐỒ LỚP THIẾT KẾ MODULE ĐẶT HÀNG]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_dat_hang.png`)*

---

#### e) Thiết kế tĩnh modul Hủy đơn hàng và hoàn tiền tự động

* **Tầng giao diện (Web Client - Customer Portal & Admin):**
  * `CustomerOrderListView`: Giao diện danh sách đơn hàng của khách hàng ("Đơn hàng của tôi"), hiển thị bộ đếm lùi thời hạn tự hủy 120 phút và nút "Hủy đơn" cho các đơn hàng đủ điều kiện (`PENDING`, `CONFIRMED`).
  * `CancelOrderModalView`: Cửa sổ pop-up modal hiển thị bảng đối soát tiền thanh toán qua VNPay, số voucher và điểm thưởng sẽ được hoàn trả, danh sách lý do hủy và nút xác nhận.
* **Tầng điều khiển (REST Controller Layer):**
  * `OrderController` (`order-service`):
    * `POST /api/v1/orders/{id}/cancel`: Tiếp nhận yêu cầu hủy đơn từ khách hàng hoặc nhân viên.
  * `PaymentController` (`payment-service`):
    * `POST /api/v1/payments/refund`: Tiếp nhận yêu cầu hoàn tiền và thực thi đối soát với cổng VNPay.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `OrderService` và lớp hiện thực `OrderServiceImpl`:
    * Khóa ghi bi quan `orderRepository.findByIdForUpdate(id)` (câu lệnh SQL `SELECT ... FOR UPDATE`) nhằm ngăn ngừa xung đột trạng thái với tiến trình bàn giao vận chuyển (`shipOrder`).
    * Kiểm tra điều kiện thời hạn hủy (trong vòng 120 phút kể từ lúc đặt hàng và chưa bàn giao shipper).
    * Cập nhật trạng thái đơn hàng sang `CANCELLED`.
    * Ghi nhận sự kiện phân tán `OrderCancelledEvent` vào bảng `OutboxEvent` (mẫu Transactional Outbox Pattern).
    * Tiến trình CDC/Kafka kích hoạt luồng bù trừ phân tán (Choreography Saga): hoàn trả tồn kho trên Redis (`INCRBY`), hoàn trả voucher sang `promotion-service`, hoàn trả điểm tích lũy sang `user-service`.
  * Giao diện `PaymentService` và lớp hiện thực `PaymentServiceImpl`:
    * Kiểm tra đơn hàng có thanh toán trực tuyến qua VNPay hay không.
    * Gọi phương thức `vnPayService.callRefundApi(...)` gửi yêu cầu đối soát hoàn tiền sang Cổng thanh toán VNPay Sandbox với mã giao dịch gốc `vnp_TxnRef`.
    * Tiếp nhận phản hồi thành công (`vnp_ResponseCode = 00`), tạo bản ghi `Refund` (trạng thái `SUCCESS`), cập nhật `Payment` sang `REFUNDED`.
* **Tầng truy cập dữ liệu (Repository Layer - Spring Data JPA):**
  * `OrderRepository`: `findByIdForUpdate(Long id)`, `save(Order order)`.
  * `PaymentRepository`: `findByOrderId(Long orderId)`.
  * `RefundRepository`: `save(Refund refund)`.
  * `OutboxEventRepository`: `save(OutboxEvent event)`.
* **Tầng Thực thể & DTO:**
  * DTO: `CancelOrderRequest`, `RefundRequest`, `OrderResponse`, `PaymentResponse`, `ApiResponse<T>`.
  * Entity: `Order`, `Payment`, `Refund`, `OutboxEvent`.

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px;">
    <span>📋 <b>Xác nhận Hủy đơn hàng và Hoàn tiền tự động (#ORD-8821)</b></span>
    <span style="color: green; font-weight: bold;">Thời hạn tự hủy: Còn 112 phút</span>
  </div>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px; margin-bottom: 12px;">
    <tr>
      <td style="width: 30%; font-weight: bold; background-color: #f9f9f9;">Số tiền đã thanh toán (VNPay):</td>
      <td><b>34.078.000₫</b> (Giao dịch: VNPAY-TRANS-20261011-8821)</td>
    </tr>
    <tr>
      <td style="font-weight: bold; background-color: #f9f9f9;">Mã Voucher hoàn trả:</td>
      <td>01 mã <code>AURATECH500K</code> (Phục hồi lượt dùng & gia hạn thêm 07 ngày)</td>
    </tr>
    <tr>
      <td style="font-weight: bold; background-color: #f9f9f9;">Điểm thưởng hoàn trả:</td>
      <td>100 điểm thưởng thành viên (Cộng hoàn vào ví điểm)</td>
    </tr>
  </table>
  <p style="font-size: 13px; font-weight: bold; margin: 0 0 5px 0;">Vui lòng chọn lý do hủy đơn:</p>
  <div style="font-size: 13px; margin-bottom: 12px;">
    <label><input type="radio" name="reason" checked/> Tôi muốn thay đổi cấu hình hoặc chọn sản phẩm khác</label><br/>
    <label><input type="radio" name="reason"/> Thời gian xử lý đơn hàng lâu hơn dự kiến</label><br/>
    <label><input type="radio" name="reason"/> Tôi tìm thấy mức giá tốt hơn ở nơi khác</label>
  </div>
  <button style="background-color: #dc3545; color: white; border: none; padding: 6px 18px; border-radius: 4px; font-weight: bold; cursor: pointer;">🛑 Xác nhận Hủy đơn & Kích hoạt Hoàn tiền VNPay</button>
</div>

<p align="center"><b>Hình ảnh 17. Giao diện CancelOrderModalView (Xác nhận hủy đơn hàng & đối soát hoàn tiền)</b></p>

##### Hình ảnh 18. Biểu đồ lớp thiết kế module hủy đơn hàng và hoàn tiền (Saga Compensation & VNPay Refund)

Tệp mã nguồn PlantUML: [class_thiet_ke_huy_don.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_huy_don.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_huy_don.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_huy_don.png)

```
                    [HÌNH ẢNH 18: BIỂU ĐỒ LỚP THIẾT KẾ MODULE HỦY ĐƠN HÀNG VÀ HOÀN TIỀN]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_huy_don.png`)*

---

#### f) Thiết kế tĩnh modul Thiết lập chiến dịch khuyến mãi tự động

* **Tầng giao diện (Web Client - Admin Portal):**
  * `AdminCampaignListView`: Danh sách các chiến dịch khuyến mãi tự động, tổng ngân sách, số tiền đã giải ngân và trạng thái hoạt động.
  * `BpmnModelerCanvasView`: Trình thiết kế trực quan đồ thị quy trình tiếp thị tự động tích hợp thư viện Camunda BPMN Modeler (kéo thả Start Event, Service Task, DMN Rule, End Event).
* **Tầng điều khiển (REST Controller Layer):**
  * `CampaignController` (`promotion-service`):
    * `POST /api/v1/admin/campaigns/validate`: Tiếp nhận `WorkflowGraphDto` JSON và kiểm tra tính hợp lệ cú pháp sơ đồ.
    * `POST /api/v1/admin/campaigns`: Tiếp nhận `CampaignDto` để biên dịch sang BPMN 2.0 XML và triển khai lên Camunda Engine.
    * `GET /api/v1/admin/campaigns/{id}`: Tra cứu chi tiết chiến dịch.
    * `PUT /api/v1/admin/campaigns/{id}`: Hiệu chỉnh chiến dịch và nâng phiên bản quy trình (Version Migration).
    * `GET /api/v1/admin/campaigns/dashboard`: Thống kê tổng quan tỷ lệ chuyển đổi voucher.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `CampaignService` và lớp hiện thực `CampaignServiceImpl`:
    * Xác thực cấu trúc đồ thị workflow qua `workflowValidator` (kiểm tra nút mồ côi, chu trình lặp vô hạn, định dạng DMN).
    * Biên dịch đồ thị JSON sang tệp chuẩn BPMN 2.0 XML qua `bpmnCompiler`.
    * Điều phối `camundaWorkflowService` đẩy định nghĩa quy trình lên Camunda Workflow Engine (`repositoryService.createDeployment()`).
    * Lưu thông tin cấu hình chiến dịch, định mức ngân sách vào CSDL PostgreSQL `promotion_db`.
* **Tầng truy cập dữ liệu (Repository Layer - Spring Data JPA):**
  * `CampaignRepository`: Kế thừa `JpaRepository<Campaign, Long>`.
  * `IssuedVoucherRepository`: Quản lý các voucher được phát hành tự động từ quy trình.
  * `ExecutedActionRepository`: Lưu vết lịch sử thực thi các tác vụ khuyến mãi.
* **Tầng Thực thể & DTO:**
  * DTO: `WorkflowGraphDto`, `ValidationResultDto`, `CampaignDto`, `ApiResponse<T>`.
  * Entity: `Campaign`, `IssuedVoucher`, `ExecutedAction`.

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px;">
    <span>⚡ <b>Thiết kế chiến dịch khuyến mãi tự động (Camunda BPMN 2.0 Modeler)</b></span>
    <span>👤 Quản trị viên: <b>Nguyễn Đình Thuân</b></span>
  </div>
  <div style="border: 1px dashed #666; padding: 15px; text-align: center; background-color: #fdfdfd; margin-bottom: 12px; border-radius: 4px;">
    <code>[StartEvent: Lắng nghe CUSTOMER_CHURN_RISK] ➔ [DMN Rule Task: risk_score >= 0.7] ➔ [Service Task: Phát Voucher cá nhân] ➔ [EndEvent]</code>
  </div>
  <table style="width: 100%; font-size: 13px;" cellpadding="5">
    <tr>
      <td style="width: 25%; font-weight: bold;">Tên chiến dịch:</td>
      <td style="width: 35%;"><input type="text" value="Giữ chân khách hàng tiềm năng Q4" style="width: 90%; padding: 4px; border: 1px solid #ccc;"/></td>
      <td style="width: 20%; font-weight: bold;">Hạn mức ngân sách:</td>
      <td style="width: 20%;"><input type="text" value="100,000,000₫" style="width: 90%; padding: 4px; border: 1px solid #ccc;"/></td>
    </tr>
    <tr>
      <td colspan="4" style="padding-top: 10px;">
        <button style="background-color: #198754; color: white; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">✔ Kiểm tra cú pháp BPMN (POST /validate)</button>
        <button style="background-color: #0d6efd; color: white; border: none; padding: 6px 18px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: 10px;">🚀 Triển khai lên Camunda Engine</button>
      </td>
    </tr>
  </table>
</div>

<p align="center"><b>Hình ảnh 19. Giao diện BpmnModelerCanvasView (Thiết kế chiến dịch khuyến mãi tự động)</b></p>

##### Hình ảnh 20. Biểu đồ lớp thiết kế module chiến dịch khuyến mãi (Camunda BPMN Architecture)

Tệp mã nguồn PlantUML: [class_thiet_ke_khuyen_mai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_khuyen_mai.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_khuyen_mai.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_khuyen_mai.png)

```
                    [HÌNH ẢNH 20: BIỂU ĐỒ LỚP THIẾT KẾ MODULE CHIẾN DỊCH KHUYẾN MÃI]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_khuyen_mai.png`)*

---

#### g) Thiết kế tĩnh modul Tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

* **Tầng giao diện (Web Client - Customer Widget & Admin Portal):**
  * `ChatbotWidgetView`: Cửa sổ khung chat nổi ở góc dưới màn hình của khách hàng, tích hợp trình nhập tin nhắn, tải ảnh thiết bị cần tư vấn và nút "Gặp nhân viên tư vấn" (Escalation).
  * `StaffLiveChatView`: Bảng điều khiển dành cho nhân viên bán hàng / CSKH, hiển thị hàng đợi các phiên chat đang chờ tiếp nhận (`WAITING_FOR_STAFF`) và giao diện trò chuyện thời gian thực qua WebSocket.
* **Tầng điều khiển (REST & WebSocket Controller Layer):**
  * `CustomerChatController`:
    * `POST /api/v1/public/chat/rooms`: Khởi tạo hoặc tìm phòng chat đang hoạt động (`getOrCreateRoom`).
    * `GET /api/v1/public/chat/rooms/{roomId}/messages`: Lấy lịch sử hội thoại có phân trang.
    * `PUT /api/v1/public/chat/rooms/{roomId}/handover`: Chuyển quyền hội thoại từ Trợ lý AI sang hàng đợi nhân viên hỗ trợ.
    * `PUT /api/v1/public/chat/rooms/{roomId}/close`: Đóng phiên chat.
  * `ChatWebSocketController` (STOMP Protocol):
    * `@MessageMapping("/chat.sendMessage")`: Tiếp nhận tin nhắn real-time từ client và phát sóng tới subscriber qua `/topic/rooms/{roomId}`.
    * `@MessageMapping("/chat.typing")`: Phát thông báo người dùng đang gõ phím.
  * `StaffChatController`:
    * `GET /api/v1/staff/chat/rooms/pending`: Danh sách các phòng chat chờ tiếp nhận.
    * `PUT /api/v1/staff/chat/rooms/{roomId}/accept`: Nhân viên nhận xử lý phòng chat.
* **Tầng dịch vụ nghiệp vụ (Service Layer):**
  * Giao diện `ChatRoomService`: Quản lý vòng đời phòng chat (`AI_CHAT` -> `WAITING_FOR_STAFF` -> `STAFF_CHATTING` -> `CLOSED`).
  * Giao diện `ChatMessageService`: Lưu trữ tin nhắn, phân loại dạng tin nhắn (`TEXT`, `IMAGE`, `PRODUCT_CARD`), phát sóng qua `SimpMessagingTemplate`.
  * `AiRagCounselingService`:
    * Nhúng câu hỏi của người dùng và truy xuất tri thức từ kho tài liệu vector (thông số kỹ thuật, bảo hành, chính sách đổi trả).
    * Gửi ngữ cảnh (Context) kèm lịch sử trò chuyện đến mô hình ngôn ngữ lớn (LLM) để sinh phản hồi tự động chuẩn xác và khách quan.
* **Tầng truy cập dữ liệu (Repository Layer - Spring Data MongoDB):**
  * `ChatRoomRepository`: Kế thừa `MongoRepository<ChatRoom, String>`, lưu trữ metadata phòng chat trong MongoDB.
  * `ChatMessageRepository`: Kế thừa `MongoRepository<ChatMessage, String>`, lưu trữ toàn bộ các tin nhắn phi cấu trúc trong MongoDB với tốc độ đọc ghi cao.
* **Tầng Thực thể & DTO:**
  * DTO: `ChatRoomResponse`, `ChatMessageResponse`, `ChatMessageRequest`, `ApiResponse<T>`.
  * Entity (MongoDB `@Document`): `ChatRoom`, `ChatMessage`.

<div style="border: 1px solid #ccc; padding: 15px; margin: 15px 0; background-color: #fafafa; border-radius: 4px;">
  <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px;">
    <span>🤖 <b>Trợ lý ảo AI AuraTech (RAG Knowledge Engine)</b></span>
    <button style="background-color: #ffc107; color: black; border: none; padding: 3px 10px; border-radius: 3px; font-weight: bold; font-size: 11px; cursor: pointer;">👤 Gặp nhân viên tư vấn</button>
  </div>
  <div style="background-color: #fff; border: 1px solid #eee; padding: 10px; border-radius: 4px; height: 110px; overflow-y: auto; font-size: 13px; margin-bottom: 10px;">
    <p style="margin: 0 0 8px 0;"><b>Khách hàng:</b> Laptop Asus ROG Strix G16 pin dùng được bao lâu?</p>
    <p style="margin: 0; color: #0d6efd;"><b>Trợ lý AI:</b> Dạ chào bạn! ROG Strix G16 trang bị pin 90Wh 4-cell Li-ion. Khi làm việc văn phòng, xem phim ở chế độ Eco Mode máy đạt khoảng 6 - 8 tiếng. Khi chơi game nặng bạn nên cắm sạc để đạt hiệu năng tối đa 140W TGP từ RTX 4060 nhé!</p>
  </div>
  <div style="display: flex; gap: 8px;">
    <input type="text" placeholder="Nhập câu hỏi tư vấn sản phẩm, chính sách..." style="flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;"/>
    <button style="background-color: #0d6efd; color: white; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold;">Gửi (WS)</button>
  </div>
</div>

<p align="center"><b>Hình ảnh 21. Giao diện ChatbotWidgetView (Trợ lý ảo AI tư vấn thông minh)</b></p>

##### Hình ảnh 22. Biểu đồ lớp thiết kế module tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

Tệp mã nguồn PlantUML: [class_thiet_ke_tro_ly_ai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_tro_ly_ai.puml)  
Tệp hình ảnh biểu đồ: [class_thiet_ke_tro_ly_ai.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_tro_ly_ai.png)

```
                    [HÌNH ẢNH 22: BIỂU ĐỒ LỚP THIẾT KẾ MODULE TRỢ LÝ ẢO AI & LIVE CHAT]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `class_thiet_ke_tro_ly_ai.png`)*


---

### 3.2 Thiết kế hoạt động

#### a) Thiết kế động modul Quản lý sản phẩm (Sửa thông tin sản phẩm)

##### Hình ảnh 23. Biểu đồ hoạt động module sửa sản phẩm (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [activity_thiet_ke_sua_san_pham.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_sua_san_pham.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_sua_san_pham.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_sua_san_pham.png)

```
                        [HÌNH ẢNH 23: BIỂU ĐỒ HOẠT ĐỘNG MODULE SỬA SẢN PHẨM]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_sua_san_pham.png`)*

##### Kịch bản v3.0 module sửa thông tin sản phẩm (Chuẩn hóa quy trình Spring Boot Microservices):
1. Tại giao diện bảng điều khiển quản trị (`AdminDashboardView`), nhân viên quản lý chọn chức năng "Quản lý sản phẩm".
2. Ứng dụng client React / Next.js điều hướng sang giao diện danh sách sản phẩm `AdminProductListView`.
3. Giao diện `AdminProductListView` hiển thị thanh công cụ tìm kiếm và bộ lọc danh mục.
4. Nhân viên quản lý nhập từ khóa tìm kiếm (ví dụ: *"laptop"*) và click nút "Tìm kiếm".
5. Trình duyệt client gửi yêu cầu `HTTP GET /api/v1/public/products?name=laptop&page=0&size=10`.
6. Lớp `@RestController` `ProductController` tiếp nhận yêu cầu qua hàm `getAllProducts(...)`.
7. `ProductController` gọi phương thức `productService.getAllProducts(active, pageable)`.
8. Lớp `@Service` `ProductServiceImpl` gọi `productRepository.findByNameContainingOrDescriptionContaining(...)`.
9. Lớp `ProductRepository` (Spring Data JPA) sinh câu lệnh SQL `SELECT * FROM tblProduct WHERE name ILIKE '%laptop%'...` và gửi xuống CSDL PostgreSQL `product_db`.
10. CSDL PostgreSQL thực thi truy vấn và trả về tập dữ liệu các bản ghi sản phẩm phù hợp.
11. Spring Data JPA ánh xạ tập kết quả sang danh sách các Entity `Product`.
12. `ProductServiceImpl` thực thi hàm `convertToDtoList(...)` để chuyển đổi Entity sang `ProductDto`.
13. `ProductServiceImpl` trả về đối tượng `Slice<ProductDto>` cho `ProductController`.
14. `ProductController` đóng gói kết quả vào `ApiResponse.success(...)` và phản hồi về client với mã `HTTP 200 OK`.
15. Giao diện `AdminProductListView` render kết quả ra bảng danh sách sản phẩm.
16. Nhân viên quản lý click chọn nút "Sửa sản phẩm" trên dòng sản phẩm có mã ID = 10 (*"Asus ROG Strix G16"*).
17. Trình duyệt client gửi yêu cầu `HTTP GET /api/v1/public/products/10`.
18. `ProductController` tiếp nhận và gọi `productService.getProductById(10)`.
19. `ProductServiceImpl` kiểm tra bộ đệm Cache Redis qua annotation `@Cacheable(value = "products", key = "#id")`: Nếu có cache hit thì trả về ngay; nếu cache miss thì gọi `productRepository.findById(10)`.
20. `ProductRepository` thực thi truy vấn `SELECT * FROM tblProduct WHERE id = 10`.
21. CSDL PostgreSQL trả về bản ghi chi tiết sản phẩm và các biến thể SKU liên kết.
22. `ProductServiceImpl` chuyển đổi Entity sang `ProductDto` đầy đủ thuộc tính và lưu vào cache Redis.
23. `ProductController` phản hồi `ApiResponse<ProductDto>` về cho client với mã `HTTP 200 OK`.
24. Giao diện `AdminProductDetailView` hiển thị form chi tiết sản phẩm và các trường cho phép chỉnh sửa.
25. Nhân viên quản lý thay đổi các thông số (cập nhật giá khuyến mãi thành 31.500.000₫, sửa đổi mô tả chi tiết).
26. Nhân viên quản lý nhấn nút "Lưu thay đổi".
27. Giao diện `AdminProductDetailView` đóng gói dữ liệu form thành đối tượng `ProductDto` (định dạng JSON).
28. Trình duyệt client gửi yêu cầu `HTTP PUT /api/v1/admin/products/10` kèm mã định danh xác thực JWT trong Header `Authorization`.
29. Bộ lọc bảo mật Spring Security kiểm tra tính hợp lệ của token và phân quyền qua annotation `@PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")`.
30. Lớp `@RestController` `AdminProductController` tiếp nhận yêu cầu qua hàm `updateProduct(10, productDto)`.
31. `AdminProductController` gọi phương thức `productService.updateProduct(10, productDto)`.
32. `ProductServiceImpl` bắt đầu giao dịch `@Transactional`, gọi `productRepository.findById(10)` để nạp Entity hiện tại từ CSDL.
33. `ProductServiceImpl` kiểm tra tính hợp lệ nghiệp vụ: kiểm tra tính duy nhất của slug sản phẩm mới qua `productRepository.findBySlug(...)`.
34. `ProductServiceImpl` cập nhật các trường thông tin mới vào đối tượng Entity `Product` (tên, giá bán, giá khuyến mãi, mô tả, khối lượng, thương hiệu).
35. `ProductServiceImpl` gọi `productRepository.save(product)`.
36. Spring Data JPA thực thi câu lệnh SQL `UPDATE tblProduct SET price = ..., sale_price = ..., description = ... WHERE id = 10` xuống CSDL PostgreSQL.
37. CSDL PostgreSQL ghi dữ liệu thành công và commit giao dịch.
38. `ProductServiceImpl` kích hoạt cơ chế làm sạch bộ nhớ đệm Cache: xóa khóa `products_slug` và xóa toàn bộ cache `products_list` trên Redis.
39. `ProductServiceImpl` gọi `searchService.indexProduct(10)` để cập nhật dữ liệu tài liệu tìm kiếm tương ứng trong cụm Elasticsearch Cluster.
40. `ProductServiceImpl` chuyển đổi Entity đã cập nhật sang `ProductDto` và trả về cho `AdminProductController`.
41. `AdminProductController` đóng gói kết quả vào `ApiResponse.success(productDto)` và phản hồi về client với mã `HTTP 200 OK`.
42. Giao diện `AdminProductDetailView` nhận phản hồi thành công, hiển thị thông báo Toast "Cập nhật sản phẩm thành công" và điều hướng trở lại trang danh sách sản phẩm.

##### Hình ảnh 24. Biểu đồ tuần tự module sửa sản phẩm (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [sequence_thiet_ke_sua_san_pham.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_sua_san_pham.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_sua_san_pham.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_sua_san_pham.png)

```
                        [HÌNH ẢNH 24: BIỂU ĐỒ TUẦN TỰ MODULE SỬA SẢN PHẨM]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_sua_san_pham.png`)*

---

#### b) Thiết kế động modul Tìm kiếm sản phẩm đa phương thức

##### Hình ảnh 25. Biểu đồ hoạt động module tìm kiếm đa phương thức

Tệp mã nguồn PlantUML: [activity_thiet_ke_tim_kiem.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_tim_kiem.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_tim_kiem.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_tim_kiem.png)

```
                    [HÌNH ẢNH 25: BIỂU ĐỒ HOẠT ĐỘNG MODULE TÌM KIẾM ĐA PHƯƠNG THỨC]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_tim_kiem.png`)*

##### Kịch bản v3.0 module tìm kiếm sản phẩm đa phương thức:
1. Người dùng truy cập website AuraTech và nhấn vào thanh tìm kiếm tại giao diện `ProductSearchView`.
2. **Luồng tìm kiếm văn bản ngữ nghĩa:**
   * Người dùng nhập câu truy vấn tự nhiên: *"laptop gaming đồ họa mỏng nhẹ dưới 30 triệu"*.
   * Người dùng nhấn Enter hoặc click nút "Tìm kiếm".
   * Trình duyệt client gửi yêu cầu `HTTP GET /api/v1/public/products/search?q=laptop+gaming&maxPrice=30000000`.
   * Lớp `@RestController` `ProductController` tiếp nhận yêu cầu qua phương thức `searchProducts(...)`.
   * `ProductController` chuyển tiếp tham số sang `searchService.searchProducts(query, brand, minPrice, maxPrice, pageable)`.
   * Lớp `SearchServiceImpl` khởi tạo cấu trúc truy vấn kết hợp Hybrid Search:
     * Truy vấn toàn văn BM25 trên các trường `name`, `description`, `specsRaw`.
     * Truy vấn Dense Vector thông qua mô hình nhúng `multilingual-e5-base` để so khớp ngữ nghĩa.
   * `SearchServiceImpl` gửi yêu cầu truy vấn đến cụm máy chủ Elasticsearch.
   * Elasticsearch thực thi tính toán và xếp hạng tài liệu theo thuật toán Reciprocal Rank Fusion (RRF).
   * Elasticsearch trả về danh sách các `ProductDocument` kèm điểm số tương quan.
   * `SearchServiceImpl` trích xuất danh sách mã ID sản phẩm và gọi `productRepository.findByIdIn(ids)`.
   * Spring Data JPA thực thi câu lệnh SQL `SELECT * FROM tblProduct WHERE id IN (...)` xuống CSDL PostgreSQL.
   * CSDL PostgreSQL trả về danh sách Entity `Product`.
   * `SearchServiceImpl` chuyển đổi sang `ProductDto`, gán điểm số khớp và phản hồi về client với mã `HTTP 200 OK`.
3. **Luồng tìm kiếm bằng hình ảnh thiết bị (Visual CLIP Search):**
   * Người dùng nhấn vào biểu tượng máy ảnh trên thanh tìm kiếm để mở modal `ImageSearchModalView`.
   * Người dùng chọn tệp ảnh thiết bị từ máy tính (`anh_laptop.jpg`).
   * Giao diện hiển thị xem trước ảnh và công cụ cắt ảnh tương tác (Interactive Image Cropper).
   * Người dùng điều chỉnh khung chọn để cô lập vùng thân máy thiết bị và nhấn "Xác nhận tìm kiếm hình ảnh".
   * Client đóng gói vùng ảnh đã cắt vào `MultipartFile` và gửi `HTTP POST /api/v1/public/products/search/image?topK=10`.
   * `ProductController` tiếp nhận tệp ảnh qua hàm `searchByImage(MultipartFile image, int topK)`.
   * `SearchServiceImpl` đọc dữ liệu byte ảnh và gọi `clipEmbeddingClient.extractImageVector(imageBytes)`.
   * Dịch vụ AI CLIP Service chạy mô hình `OpenAI CLIP-ViT-B/32` để trích xuất vector đặc trưng thị giác 512 chiều (`float[] imageVector`).
   * `SearchServiceImpl` tạo truy vấn kNN Cosine Similarity: tìm các vector ảnh trong chỉ mục Elasticsearch có khoảng cách gần nhất với vector truy vấn.
   * Elasticsearch thực thi kNN search và trả về top 10 sản phẩm có độ tương đồng hình ảnh cao nhất.
   * `SearchServiceImpl` gọi `productRepository.findByIdIn(topIds)` để nạp thông số và giá bán từ PostgreSQL.
   * `SearchServiceImpl` chuẩn hóa điểm Cosine sang tỉ lệ phần trăm tương đồng thị giác (`% Visual Match`).
   * `ProductController` đóng gói kết quả vào `ApiResponse.success(productList)` và trả về cho client với mã `HTTP 200 OK`.
   * Giao diện `ProductSearchView` hiển thị bảng danh sách sản phẩm tương đồng về kiểu dáng và thiết kế.

##### Hình ảnh 26. Biểu đồ tuần tự module tìm kiếm sản phẩm đa phương thức

Tệp mã nguồn PlantUML: [sequence_thiet_ke_tim_kiem.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_tim_kiem.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_tim_kiem.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_tim_kiem.png)

```
                    [HÌNH ẢNH 26: BIỂU ĐỒ TUẦN TỰ MODULE TÌM KIẾM ĐA PHƯƠNG THỨC]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_tim_kiem.png`)*

---

#### c) Thiết kế động modul Gợi ý sản phẩm cá nhân hóa thời gian thực

##### Hình ảnh 27. Biểu đồ hoạt động module gợi ý sản phẩm cá nhân hóa (AI SASRec & Cross-sell)

Tệp mã nguồn PlantUML: [activity_thiet_ke_goi_y.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_goi_y.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_goi_y.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_goi_y.png)

```
                    [HÌNH ẢNH 27: BIỂU ĐỒ HOẠT ĐỘNG MODULE GỢI Ý CÁ NHÂN HÓA]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_goi_y.png`)*

##### Kịch bản v3.0 module gợi ý sản phẩm cá nhân hóa thời gian thực:
1. Người dùng truy cập trang web AuraTech, thực hiện xem chi tiết các sản phẩm công nghệ (ví dụ: xem Laptop Asus ROG Strix G16, xem Chuột không dây Logitech G Pro X).
2. Trình duyệt client tự động phát sự kiện tương tác `VIEW_PRODUCT` kèm `productId`, `userId` hoặc `sessionId` lên Kafka topic `user-clickstream-events`.
3. Dịch vụ gợi ý `recs-service` tiêu thụ sự kiện từ Kafka và lưu chuỗi mã sản phẩm vừa tương tác vào Redis List theo khóa `sess:{sid}:seq` với cửa sổ trượt tối đa 10 mục (`LTRIM sess:{sid}:seq 0 9`).
4. Người dùng quay trở lại Trang chủ `CustomerHomeView`.
5. Trang chủ tự động gửi yêu cầu `HTTP GET /api/v1/public/recommendations/personal?source=for_you&top_k=6` kèm Header `X-User-Id` hoặc `X-Session-Id`.
6. Lớp `@RestController` `RecommendationController` tiếp nhận yêu cầu qua hàm `getPersonalRecommendations(...)`.
7. `RecommendationController` gọi `recommendationService.getPersonalRecommendations(userId, sessionId, source, topK)`.
8. Lớp `RecommendationServiceImpl` đọc chuỗi tương tác từ Redis thông qua lệnh `LRANGE sess:{sid}:seq 0 9`.
9. Nếu chuỗi tương tác rỗng (trường hợp khách truy cập mới - Cold Start):
   * `RecommendationServiceImpl` kích hoạt cơ chế dự phòng: gọi `productRepository.findTopSellingProducts(6)` để lấy 6 sản phẩm bán chạy nhất hệ thống.
10. Nếu chuỗi tương tác có dữ liệu (Warm User):
    * `RecommendationServiceImpl` gọi sang dịch vụ AI inference `sasrecInferenceClient.predictNextItems(itemSequence, 6)`.
    * Mô hình học sâu Transformer SASRec tính toán ma trận Attention trên chuỗi tương tác thời gian và suy luận phân phối xác suất các sản phẩm người dùng có khả năng quan tâm tiếp theo cao nhất.
    * Mô hình trả về danh sách 6 mã sản phẩm kèm điểm dự đoán (`PredictedItemScore`).
11. `RecommendationServiceImpl` gọi `productRepository.findByIdIn(ids)` để lấy thông tin chi tiết tên, ảnh, giá từ PostgreSQL.
12. `RecommendationServiceImpl` ánh xạ kết quả sang danh sách `ProductRecommendationDto` và trả về cho client với mã `HTTP 200 OK`.
13. Giao diện `CustomerHomeView` hiển thị khối carousel "Gợi ý dành riêng cho bạn" với độ phù hợp AI cao.
14. Người dùng thêm sản phẩm vào giỏ hàng và mở trang `CartPageView`.
15. Giao diện Giỏ hàng gửi yêu cầu `HTTP GET /api/v1/recommendations/cross-sell?item_ids=10` (với ID = 10 là Laptop Asus ROG Strix G16).
16. `RecommendationController` tiếp nhận và gọi `recommendationService.getCrossSellRecommendations([10])`.
17. `RecommendationServiceImpl` kích hoạt `CrossSellRuleEngine` để tìm các phụ kiện tương thích (tai nghe, chuột gaming, balo) có liên kết bán chéo với mã sản phẩm 10.
18. Hệ thống tính toán mức chiết khấu combo ưu đãi (giảm 20% phụ kiện khi mua kèm máy chính).
19. `RecommendationController` phản hồi danh sách `CrossSellItemDto` về cho client với mã `HTTP 200 OK`.
20. Giao diện Giỏ hàng hiển thị bảng "Phụ kiện gợi ý mua kèm ưu đãi".
21. Người dùng nhấn nút "Mua kèm ngay" tại phụ kiện Chuột Logitech.
22. Hệ thống thêm phụ kiện vào giỏ hàng với giá combo đã chiết khấu và tự động tính lại tổng tiền thanh toán.

##### Hình ảnh 28. Biểu đồ tuần tự module gợi ý sản phẩm cá nhân hóa thời gian thực

Tệp mã nguồn PlantUML: [sequence_thiet_ke_goi_y.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_goi_y.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_goi_y.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_goi_y.png)

```
                    [HÌNH ẢNH 28: BIỂU ĐỒ TUẦN TỰ MODULE GỢI Ý CÁ NHÂN HÓA]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_goi_y.png`)*

---

#### d) Thiết kế động modul Đặt hàng và thanh toán trực tuyến

##### Hình ảnh 29. Biểu đồ hoạt động module đặt hàng (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [activity_thiet_ke_dat_hang.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_dat_hang.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_dat_hang.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_dat_hang.png)

```
                           [HÌNH ẢNH 29: BIỂU ĐỒ HOẠT ĐỘNG MODULE ĐẶT HÀNG]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_dat_hang.png`)*

##### Kịch bản v3.0 module đặt hàng trực tuyến (Chuẩn hóa quy trình Spring Boot Microservices):
1. Khách hàng đăng nhập thành công vào website mua sắm AuraTech, lựa chọn các sản phẩm và biến thể cấu hình SKU mong muốn đưa vào giỏ hàng.
2. Khách hàng nhấn nút "Thanh toán" để mở giao diện `CheckoutOrderView`.
3. Trình duyệt client gửi yêu cầu tính thử `HTTP POST /api/v1/orders/checkout/preview` kèm payload `CheckoutPreviewRequest` (danh sách SKU, số lượng, địa chỉ nhận hàng, mã voucher).
4. Lớp `@RestController` `OrderController` tiếp nhận yêu cầu qua hàm `previewCheckout(...)`.
5. `OrderController` giải mã thông tin khách hàng từ JWT qua `userResolver.resolveUserId(userId)`.
6. `OrderController` gọi phương thức `orderService.previewCheckout(userId, request)`.
7. Lớp `@Service` `OrderServiceImpl` tính toán tổng tiền hàng nguyên giá.
8. `OrderServiceImpl` gọi sang `promotion-service` để kiểm tra điều kiện và tính toán số tiền giảm giá từ voucher (`discountAmount`).
9. `OrderServiceImpl` tính toán cước phí vận chuyển thực tế từ đơn vị vận chuyển (`shippingFee`).
10. `OrderServiceImpl` đóng gói kết quả vào đối tượng `CheckoutPreviewResponse` gồm tổng tiền hàng, số tiền giảm, phí ship và tổng tiền thanh toán cuối cùng.
11. `OrderController` phản hồi `ApiResponse.success(previewResponse)` về cho client với mã `HTTP 200 OK`.
12. Giao diện `CheckoutOrderView` hiển thị bảng tóm tắt đơn hàng để khách hàng kiểm tra trước khi chốt đơn.
13. Khách hàng lựa chọn phương thức thanh toán (Cổng VNPay) và nhấn nút "Xác nhận đặt hàng".
14. Giao diện `CheckoutOrderView` tự động sinh mã khóa lũy yếu duy nhất `Idempotency-Key` (chuỗi UUID) và đóng gói đối tượng `CheckoutRequest`.
15. Trình duyệt client gửi yêu cầu tạo đơn `HTTP POST /api/v1/orders/checkout` kèm Header `Idempotency-Key` và token xác thực JWT.
16. Lớp `OrderController` tiếp nhận yêu cầu qua phương thức `checkout(...)`.
17. `OrderController` gọi phương thức `orderService.createOrder(userId, checkoutRequest, idempotencyKey, email)`.
18. `OrderServiceImpl` thực hiện kiểm tra tính lũy yếu: gửi lệnh `SETNX checkout:lock:<userId>:<idempotencyKey>` lên Redis Cluster với thời gian sống TTL = 15 phút. Nếu khóa đã tồn tại, hệ thống từ chối nhằm ngăn chặn tạo trùng đơn hàng khi người dùng bấm click đúp.
19. `OrderServiceImpl` thực thi trừ tồn kho nguyên tử (Atomic Inventory Decrement) trên Redis Cluster bằng kịch bản Lua Script (`stockDecrementScript`) nhằm đảm bảo tính toàn vẹn tồn kho tuyệt đối dưới tải cao.
20. `OrderServiceImpl` khởi tạo đối tượng Entity `Order` với trạng thái ban đầu `PENDING`, tổng tiền hàng `totalAmount`, chiết khấu `discountAmount`, cước vận chuyển `shippingFee`, số tiền phải trả `finalAmount`, thông tin giao hàng `shippingAddress` và số điện thoại `phoneNumber`.
21. `OrderServiceImpl` gọi `orderRepository.save(order)`.
22. Lớp `OrderRepository` (Spring Data JPA) thực thi câu lệnh SQL `INSERT INTO tblOrder (...) VALUES (...)` xuống CSDL PostgreSQL `order_db`.
23. CSDL PostgreSQL sinh khóa chính `id` tự tăng và trả về bản ghi `savedOrder`.
24. `OrderServiceImpl` lặp qua từng mặt hàng trong đơn, khởi tạo danh sách Entity `OrderItem`: sao lưu nguyên vẹn toàn bộ bản chụp (snapshot) gồm `productName`, `productImage`, `variantAttr`, đơn giá chốt tại thời điểm mua `unitPrice`, số lượng `quantity` và thành tiền `subtotal`.
25. Gán thuộc tính khóa ngoại `tblOrderid` của từng `OrderItem` liên kết với `savedOrder.getId()`.
26. `OrderServiceImpl` gọi `orderItemRepository.saveAll(orderItems)`.
27. Lớp `OrderItemRepository` thực thi câu lệnh SQL `INSERT INTO tblOrderItem (...) VALUES (...)` hàng loạt (Batch Insert) xuống CSDL PostgreSQL.
28. `OrderServiceImpl` khởi tạo đối tượng Entity `OutboxEvent` (loại sự kiện `OrderCreatedEvent`, tải trọng JSON chứa đầy đủ thông tin đơn hàng và khách hàng).
29. `OrderServiceImpl` gọi `outboxEventRepository.save(outboxEvent)` lưu vào bảng `tblOutboxEvent` cùng một Transaction ACID duy nhất với đơn hàng (mô hình Transactional Outbox Pattern).
30. Giao dịch cơ sở dữ liệu hoàn tất commit. Công cụ Debezium CDC sẽ tự động đọc thay đổi từ Write-Ahead Log (WAL) và phát tán sự kiện lên Kafka topic `order-created-events`.
31. `OrderServiceImpl` gọi `cartService.clearCart(userId)` để làm sạch các sản phẩm đã đặt mua khỏi giỏ hàng Redis của người dùng.
32. `OrderServiceImpl` chuyển đổi `savedOrder` và danh sách `orderItems` sang đối tượng `OrderResponse`.
33. `OrderController` đóng gói kết quả vào `ApiResponse.success(orderResponse)` và trả về cho client với mã `HTTP 200 OK`.
34. Giao diện `CheckoutOrderView` nhận phản hồi thành công, hiển thị màn hình thông báo "Đặt hàng thành công", cung cấp mã đơn hàng và điều hướng khách hàng sang cổng thanh toán VNPay.

##### Hình ảnh 30. Biểu đồ tuần tự module đặt hàng pha thiết kế (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [sequence_thiet_ke_dat_hang.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_dat_hang.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_dat_hang.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_dat_hang.png)

```
                    [HÌNH ẢNH 30: BIỂU ĐỒ TUẦN TỰ MODULE ĐẶT HÀNG PHA THIẾT KẾ]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_dat_hang.png`)*

---

#### e) Thiết kế động modul Hủy đơn hàng và hoàn tiền tự động

##### Hình ảnh 31. Biểu đồ hoạt động module hủy đơn hàng và hoàn tiền (Saga Compensation & VNPay Refund)

Tệp mã nguồn PlantUML: [activity_thiet_ke_huy_don.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_huy_don.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_huy_don.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_huy_don.png)

```
                [HÌNH ẢNH 31: BIỂU ĐỒ HOẠT ĐỘNG MODULE HỦY ĐƠN HÀNG VÀ HOÀN TIỀN]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_huy_don.png`)*

##### Kịch bản v3.0 module hủy đơn hàng và hoàn tiền tự động:
1. Sau khi đăng nhập, tại menu tài khoản cá nhân, khách hàng mở giao diện "Đơn hàng của tôi" (`CustomerOrderListView`).
2. Giao diện hiển thị danh sách các đơn hàng gần nhất cùng trạng thái thanh toán và bộ đếm lùi thời gian tự hủy (120 phút).
3. Khách hàng tìm đến đơn hàng mã `#ORD-8821` (trạng thái `CONFIRMED`, thanh toán qua Cổng VNPay số tiền 34.078.000₫) và click nút "Hủy đơn".
4. Hệ thống kiểm tra điều kiện hủy: Trạng thái đơn là `CONFIRMED` và thời gian kể từ lúc đặt hàng $< 120$ phút (chưa chuyển sang `SHIPPING`). Thỏa mãn điều kiện cho phép hủy đơn.
5. Giao diện mở cửa sổ pop-up modal `CancelOrderModalView` hiển thị bảng đối soát tiền hoàn VNPay, phục hồi voucher `AURATECH500K` và 100 điểm thưởng tích lũy.
6. Khách hàng tích chọn lý do hủy: *"Tôi muốn thay đổi cấu hình hoặc chọn sản phẩm khác"* và nhấn nút "Xác nhận Hủy đơn".
7. Trình duyệt client gửi yêu cầu `HTTP POST /api/v1/orders/8821/cancel` kèm token xác thực JWT.
8. Lớp `@RestController` `OrderController` tiếp nhận yêu cầu qua phương thức `cancelOrder(...)`.
9. `OrderController` trích xuất `userId`, `userEmail` và gọi `orderService.cancelOrder(8821, userId, userEmail, rolesHeader)`.
10. Lớp `@Service` `OrderServiceImpl` bắt đầu giao dịch `@Transactional`, thực hiện khóa dòng bản ghi bi quan bằng phương thức `orderRepository.findByIdForUpdate(8821)`.
11. Lớp `OrderRepository` (Spring Data JPA) sinh câu lệnh SQL `SELECT * FROM tblOrder WHERE id = 8821 FOR UPDATE` xuống CSDL PostgreSQL `order_db` nhằm ngăn ngừa tuyệt đối xung đột tranh chấp với tiến trình bàn giao vận chuyển (`shipOrder`) hoặc Webhook thanh toán.
12. `OrderServiceImpl` xác nhận lại trạng thái đơn hàng hợp lệ và cập nhật trạng thái đơn sang `CANCELLED`.
13. `OrderServiceImpl` gọi `orderRepository.save(order)`.
14. Spring Data JPA sinh câu lệnh SQL `UPDATE tblOrder SET status = 'CANCELLED' WHERE id = 8821`.
15. `OrderServiceImpl` khởi tạo đối tượng Entity `OutboxEvent` (loại sự kiện `OrderCancelledEvent`, tải trọng JSON chứa mã đơn 8821, danh sách SKU và số lượng sản phẩm cần hoàn kho, mã voucher, số điểm hoàn).
16. `OrderServiceImpl` gọi `outboxEventRepository.save(outboxEvent)` lưu vào bảng `tblOutboxEvent` trong cùng giao dịch ACID cục bộ (mô hình Transactional Outbox Pattern).
17. Giao dịch commit thành công, khóa bi quan được giải phóng. `OrderController` phản hồi mã `HTTP 200 OK` về cho client.
18. Tiến trình Debezium CDC phát hiện bản ghi outbox mới và đẩy thông điệp `OrderCancelledEvent` lên Kafka topic `order-events`.
19. **Quy trình bù trừ phân tán bất đồng bộ (Choreography Saga):**
    * Dịch vụ `inventory-service` tiêu thụ sự kiện từ Kafka, thực hiện hoàn trả số lượng tồn kho nguyên tử trên bộ nhớ đệm Redis thông qua lệnh `INCRBY`, đồng thời cập nhật tăng số lượng tồn khả dụng trong bảng `tblInventory` CSDL `inventory_db`.
    * Dịch vụ `promotion-service` tiêu thụ sự kiện, phục hồi trạng thái hiệu lực của voucher `AURATECH500K` và gia hạn thêm 07 ngày.
    * Dịch vụ `user-service` tiêu thụ sự kiện, cộng hoàn trả 100 điểm thưởng tích lũy vào ví điểm của khách hàng.
    * Dịch vụ `payment-service` tiêu thụ sự kiện, kiểm tra bản ghi `Payment` của đơn hàng 8821 có phương thức `VNPAY` và trạng thái `PAID`.
20. `PaymentServiceImpl` gọi `vnPayService.callRefundApi(...)` gửi yêu cầu hoàn tiền sang Cổng thanh toán VNPay Sandbox với mã giao dịch gốc `vnp_TxnRef = VNPAY-TRANS-20261011-8821` và số tiền hoàn 34.078.000₫.
21. Cổng thanh toán VNPay tiếp nhận, đối soát và phản hồi mã trạng thái hoàn tiền thành công (`vnp_ResponseCode = 00`).
22. `PaymentServiceImpl` tạo bản ghi Entity `Refund` với trạng thái `SUCCESS` và cập nhật bản ghi `Payment` sang trạng thái `REFUNDED`.
23. Dịch vụ `notification-service` tạo email biên lai hoàn tiền điện tử và gửi đến hộp thư của khách hàng.
24. Giao diện `CustomerOrderListView` nhận tín hiệu thành công, hiển thị thông báo Toast "Hủy đơn hàng và hoàn tiền thành công" và cập nhật trạng thái đơn hàng sang `CANCELLED`.

##### Hình ảnh 32. Biểu đồ tuần tự module hủy đơn hàng và hoàn tiền (Saga Compensation & VNPay Refund)

Tệp mã nguồn PlantUML: [sequence_thiet_ke_huy_don.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_huy_don.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_huy_don.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_huy_don.png)

```
                [HÌNH ẢNH 32: BIỂU ĐỒ TUẦN TỰ MODULE HỦY ĐƠN HÀNG VÀ HOÀN TIỀN]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_huy_don.png`)*

---

#### f) Thiết kế động modul Thiết lập chiến dịch khuyến mãi tự động

##### Hình ảnh 33. Biểu đồ hoạt động module chiến dịch khuyến mãi (Camunda BPMN Architecture)

Tệp mã nguồn PlantUML: [activity_thiet_ke_khuyen_mai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_khuyen_mai.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_khuyen_mai.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_khuyen_mai.png)

```
                [HÌNH ẢNH 33: BIỂU ĐỒ HOẠT ĐỘNG MODULE CHIẾN DỊCH KHUYẾN MÃI]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_khuyen_mai.png`)*

##### Kịch bản v3.0 module thiết lập chiến dịch khuyến mãi tự động:
1. Nhân viên quản lý đăng nhập cổng quản trị AuraTech và chọn mục "Quản lý chiến dịch khuyến mãi".
2. Nhân viên click nút "Tạo mới chiến dịch" trên giao diện `AdminCampaignListView`.
3. Hệ thống mở giao diện trình thiết kế trực quan Camunda BPMN Modeler (`BpmnModelerCanvasView`).
4. Nhân viên quản lý nhập tên chiến dịch: *"Giữ chân khách hàng tiềm năng Quý 4"* và đặt hạn mức ngân sách 100.000.000₫.
5. Nhân viên kéo thả khối `Start Event` từ thanh công cụ vào canvas, thiết lập thuộc tính lắng nghe sự kiện Kafka `CUSTOMER_CHURN_RISK`.
6. Nhân viên kéo thả khối `Business Rule Task` (quy tắc DMN) và nối luồng: thiết lập điều kiện điểm rủi ro rời bỏ `risk_score >= 0.70` và ngân sách chiến dịch còn lại $> 0$.
7. Nhân viên kéo thả khối `Service Task` nối tiếp: "Tạo mã Voucher cá nhân hóa" (giảm 10% tối đa 500.000₫, hiệu lực 7 ngày).
8. Nhân viên kéo thả khối `Service Task` tiếp theo: "Gửi thông báo Push Notification FCM và Email tiếp thị".
9. Nhân viên kéo thả khối `End Event` và nối mũi tên hoàn tất chu trình.
10. Nhân viên click nút "Kiểm tra cú pháp BPMN".
11. Giao diện đóng gói đồ thị thành đối tượng `WorkflowGraphDto` JSON và gửi `HTTP POST /api/v1/admin/campaigns/validate`.
12. Lớp `@RestController` `CampaignController` tiếp nhận và gọi `campaignService.validateWorkflow(graph)`.
13. `CampaignServiceImpl` thực thi `workflowValidator`: kiểm tra tính liên tục của đồ thị, đảm bảo không có nút cô lập và cú pháp điều kiện DMN chuẩn xác.
14. `CampaignController` phản hồi `ApiResponse.success(validationResult)` với trạng thái `valid = true`.
15. Giao diện hiển thị thông báo "Sơ đồ quy trình đạt chuẩn hợp lệ".
16. Nhân viên quản lý nhấn nút "Triển khai chiến dịch".
17. Giao diện đóng gói thông tin chiến dịch và đồ thị quy trình vào `CampaignDto` JSON.
18. Trình duyệt client gửi yêu cầu `HTTP POST /api/v1/admin/campaigns` kèm token xác thực quản trị viên `ROLE_ADMIN`.
19. `CampaignController` tiếp nhận qua hàm `createCampaign(campaignDto)`.
20. `CampaignServiceImpl` gọi `bpmnCompiler` để biên dịch đồ thị `WorkflowGraphDto` sang tệp tài liệu chuẩn `BPMN 2.0 XML`.
21. `CampaignServiceImpl` gọi `camundaWorkflowService.deployBpmnXml(processKey, bpmnXml)`.
22. Động cơ Camunda Workflow Engine tiếp nhận, nạp định nghĩa tiến trình (`repositoryService.createDeployment()`), khởi tạo mã phiên bản và kích hoạt các cổng đăng ký lắng nghe sự kiện (Event Subscriptions).
23. `CampaignServiceImpl` khởi tạo đối tượng Entity `Campaign` với tên, tổng ngân sách, định nghĩa XML và trạng thái `active = true`.
24. `CampaignServiceImpl` gọi `campaignRepository.save(campaign)`.
25. Spring Data JPA thực thi câu lệnh SQL `INSERT INTO tblCampaign (...) VALUES (...)` xuống CSDL PostgreSQL `promotion_db`.
26. CSDL PostgreSQL lưu trữ thành công và trả về bản ghi `savedCampaign`.
27. `CampaignController` phản hồi kết quả `ApiResponse.success(savedCampaignDto)` với mã `HTTP 201 Created`.
28. Giao diện hiển thị thông báo "Triển khai chiến dịch khuyến mãi tự động thành công" và điều hướng trở lại danh sách chiến dịch với trạng thái "Đang chạy".

##### Hình ảnh 34. Biểu đồ tuần tự module thiết lập chiến dịch khuyến mãi tự động

Tệp mã nguồn PlantUML: [sequence_thiet_ke_khuyen_mai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_khuyen_mai.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_khuyen_mai.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_khuyen_mai.png)

```
                [HÌNH ẢNH 34: BIỂU ĐỒ TUẦN TỰ MODULE CHIẾN DỊCH KHUYẾN MÃI]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_khuyen_mai.png`)*

---

#### g) Thiết kế động modul Tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

##### Hình ảnh 35. Biểu đồ hoạt động module tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

Tệp mã nguồn PlantUML: [activity_thiet_ke_tro_ly_ai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_tro_ly_ai.puml)  
Tệp hình ảnh biểu đồ: [activity_thiet_ke_tro_ly_ai.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/activity_thiet_ke_tro_ly_ai.png)

```
            [HÌNH ẢNH 35: BIỂU ĐỒ HOẠT ĐỘNG MODULE TRỢ LÝ ẢO AI VÀ HỖ TRỢ KHÁCH HÀNG]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `activity_thiet_ke_tro_ly_ai.png`)*

##### Kịch bản v3.0 module tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng:
1. Khách hàng truy cập website AuraTech và click vào biểu tượng khung chat nổi ở góc phải màn hình (`ChatbotWidgetView`).
2. Client gửi yêu cầu khởi tạo phòng chat `HTTP POST /api/v1/public/chat/rooms` kèm Header `X-User-Id` (hoặc `X-Guest-Id` cho khách vãng lai).
3. Lớp `@RestController` `CustomerChatController` tiếp nhận yêu cầu qua hàm `getOrCreateRoom(...)`.
4. `CustomerChatController` gọi phương thức `chatRoomService.getOrCreateRoom(userId, name, email, avatar)`.
5. `ChatRoomServiceImpl` truy vấn CSDL MongoDB: nếu khách hàng đã có phòng chat mở thì tái sử dụng; nếu chưa thì tạo mới đối tượng Entity `ChatRoom` với trạng thái ban đầu `AI_CHAT`.
6. `ChatRoomRepository` (Spring Data MongoDB) thực thi lưu bản ghi phòng chat vào collection `chat_rooms`.
7. `CustomerChatController` phản hồi `ApiResponse<ChatRoomResponse>` chứa `roomId` về cho client với mã `HTTP 200 OK`.
8. Client React / Next.js thiết lập kết nối WebSocket STOMP tới đường dẫn `/ws/chat` và thực hiện subscribe lắng nghe kênh thông điệp cá nhân `/topic/rooms/{roomId}`.
9. Khách hàng nhập câu hỏi tư vấn: *"Laptop ROG Strix G16 pin dùng được bao lâu?"* và bấm gửi.
10. Trình duyệt client gửi STOMP frame tới đích đến `@MessageMapping("/chat.sendMessage")` với tải trọng chứa `roomId`, `content`, `type = TEXT`.
11. Lớp `ChatWebSocketController` tiếp nhận tin nhắn và gọi `chatMessageService.saveAndBroadcastMessage(...)`.
12. `ChatMessageServiceImpl` khởi tạo Entity `ChatMessage` (người gửi: `CUSTOMER`), gọi `chatMessageRepository.save(msg)` lưu vào MongoDB collection `chat_messages`.
13. `ChatMessageServiceImpl` sử dụng `SimpMessagingTemplate` phát sóng tin nhắn đến kênh `/topic/rooms/{roomId}` để hiển thị tức thời lên giao diện của khách hàng.
14. Nhận thấy phòng chat đang ở trạng thái `AI_CHAT`, `ChatMessageServiceImpl` kích hoạt phương thức `aiRagCounselingService.generateResponse(question, history)`.
15. `AiRagCounselingService` thực hiện quy trình RAG (Retrieval-Augmented Generation):
    * Chuyển đổi câu hỏi của người dùng thành vector ngữ nghĩa thông qua mô hình Embedding.
    * Thực thi tìm kiếm tương đồng trên cơ sở dữ liệu tri thức vector (Vector DB) để trích xuất các tài liệu liên quan về thông số kỹ thuật pin 90Wh, thời lượng sử dụng và chế độ sạc nhanh của Asus ROG Strix G16.
    * Ghép tài liệu trích xuất (Context) và lịch sử trò chuyện vào prompt chỉ dẫn.
    * Gửi prompt sang mô hình ngôn ngữ lớn (LLM) để sinh câu trả lời tự nhiên, chính xác và đầy đủ.
16. `AiRagCounselingService` nhận kết quả văn bản trả về từ LLM.
17. `ChatMessageServiceImpl` khởi tạo Entity `ChatMessage` (người gửi: `AI_ASSISTANT`, nội dung tư vấn chi tiết về pin 90Wh), lưu vào MongoDB.
18. `SimpMessagingTemplate` phát sóng tin nhắn của Trợ lý AI tới kênh `/topic/rooms/{roomId}`.
19. Giao diện `ChatbotWidgetView` nhận tin nhắn qua WebSocket và hiển thị câu trả lời thông minh của Trợ lý AI cho khách hàng xem.
20. Sau khi đọc câu trả lời, khách hàng muốn thương lượng giá hoặc hỏi thêm chính sách trả góp chuyên biệt nên nhấn nút "Gặp nhân viên tư vấn".
21. Trình duyệt client gửi yêu cầu chuyển giao `HTTP PUT /api/v1/public/chat/rooms/{roomId}/handover`.
22. `CustomerChatController` tiếp nhận và gọi `chatRoomService.handoverRoom(roomId)`.
23. `ChatRoomServiceImpl` cập nhật trạng thái phòng chat trong MongoDB từ `AI_CHAT` sang `WAITING_FOR_STAFF`.
24. `ChatRoomServiceImpl` phát thông điệp thông báo tới kênh quản trị `/topic/staff/pending-rooms` để các nhân viên bán hàng / CSKH đang trực ca tiếp nhận.
25. Tại giao diện `StaffLiveChatView`, bảng danh sách phòng chờ tiếp nhận xuất hiện phiên chat mới của khách hàng.
26. Nhân viên CSKH nhấn nút "Tiếp nhận phòng chat".
27. Trình duyệt nhân viên gửi yêu cầu `HTTP PUT /api/v1/staff/chat/rooms/{roomId}/accept`.
28. `StaffChatController` tiếp nhận, gán `staffId` của nhân viên vào `ChatRoom` và chuyển trạng thái sang `STAFF_CHATTING`.
29. CSDL MongoDB cập nhật trạng thái phòng chat.
30. Kể từ thời điểm này, toàn bộ tin nhắn trao đổi giữa khách hàng và nhân viên CSKH được truyền phát hai chiều tức thời (Real-time Full-duplex) thông qua giao thức WebSocket STOMP.
31. Nhân viên CSKH tư vấn hoàn tất, hỗ trợ khách hàng giải đáp thắc mắc và gửi kèm đường dẫn đặt hàng trực tiếp.
32. Khách hàng nhấn nút đóng chat, hệ thống gửi `HTTP PUT /api/v1/public/chat/rooms/{roomId}/close` để chuyển trạng thái phòng sang `CLOSED` và hoàn tất phiên hỗ trợ.

##### Hình ảnh 36. Biểu đồ tuần tự module tư vấn qua trợ lý ảo AI và hỗ trợ khách hàng

Tệp mã nguồn PlantUML: [sequence_thiet_ke_tro_ly_ai.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_tro_ly_ai.puml)  
Tệp hình ảnh biểu đồ: [sequence_thiet_ke_tro_ly_ai.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/sequence_thiet_ke_tro_ly_ai.png)

```
            [HÌNH ẢNH 36: BIỂU ĐỒ TUẦN TỰ MODULE TRỢ LÝ ẢO AI VÀ HỖ TRỢ KHÁCH HÀNG]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `sequence_thiet_ke_tro_ly_ai.png`)*


### 3.3 Thiết kế triển khai

#### a) Sơ đồ package diagram

Cấu trúc phân bổ các package của hệ thống AuraTech tuân thủ kiến trúc phân tầng chuẩn mực của Java Spring Boot:
* **Gói Giao diện (`Frontend Layer - React / Next.js`):**
  * `Admin Portal`: Chứa các Component giao diện quản trị (`AdminDashboardView`, `AdminProductListView`, `AdminProductDetailView`, `BpmnModelerCanvasView`, `StaffLiveChatView`...).
  * `Customer Web`: Chứa các Component giao diện mua sắm khách hàng (`CustomerHomeView`, `ProductSearchView`, `ProductCatalogView`, `CheckoutOrderView`, `CustomerOrderListView`, `ChatbotWidgetView`...).
* **Gói Điều khiển (`Controller Layer - Spring REST & STOMP`):**
  * `com.ecommerce.productservice.controller`: Chứa `AdminProductController`, `ProductController`, `CategoryController`...
  * `com.ecommerce.orderservice.controller`: Chứa `OrderController`, `CartController`...
  * `com.ecommerce.paymentservice.controller`: Chứa `PaymentController`, `WebhookController`...
  * `com.ecommerce.promotionservice.controller`: Chứa `CampaignController`, `VoucherController`...
  * `com.ecommerce.chatservice.controller`: Chứa `CustomerChatController`, `ChatWebSocketController`, `StaffChatController`...
* **Gói Đối tượng truyền tải (`DTO Layer`):**
  * `com.ecommerce.*.dto`: Chứa `ProductDto`, `CheckoutRequest`, `OrderResponse`, `CampaignDto`, `ChatMessageResponse`, `ApiResponse<T>`...
* **Gói Dịch vụ nghiệp vụ (`Service Layer`):**
  * `com.ecommerce.productservice.service` & `service.impl`: Chứa `ProductService`, `ProductServiceImpl`, `SearchService`...
  * `com.ecommerce.orderservice.service` & `service.impl`: Chứa `OrderService`, `OrderServiceImpl`...
  * `com.ecommerce.paymentservice.service` & `service.impl`: Chứa `PaymentService`, `PaymentServiceImpl`, `VnPayService`...
  * `com.ecommerce.promotionservice.service` & `service.impl`: Chứa `CampaignService`, `CampaignServiceImpl`, `CamundaWorkflowService`...
  * `com.ecommerce.chatservice.service` & `service.impl`: Chứa `ChatRoomService`, `ChatMessageService`, `AiRagCounselingService`...
* **Gói Truy cập dữ liệu (`Repository Layer - Spring Data JPA & MongoDB`):**
  * `com.ecommerce.productservice.repository`: Chứa `ProductRepository`, `ProductVariantRepository`...
  * `com.ecommerce.orderservice.repository`: Chứa `OrderRepository`, `OrderItemRepository`, `OutboxEventRepository`...
  * `com.ecommerce.paymentservice.repository`: Chứa `PaymentRepository`, `RefundRepository`...
  * `com.ecommerce.promotionservice.repository`: Chứa `CampaignRepository`, `IssuedVoucherRepository`...
  * `com.ecommerce.chatservice.repository`: Chứa `ChatRoomRepository`, `ChatMessageRepository`...
* **Gói Thực thể (`Entity / Domain Model Layer`):**
  * `com.ecommerce.productservice.entity`: Chứa `Product`, `ProductVariant`, `Category`, `Brand`...
  * `com.ecommerce.orderservice.entity`: Chứa `Order`, `OrderItem`, `Payment`...
  * `com.ecommerce.chatservice.entity`: Chứa `ChatRoom`, `ChatMessage`...

##### Hình ảnh 37. Sơ đồ package diagram (Spring Boot Architecture)

Tệp mã nguồn PlantUML: [package_diagram.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/package_diagram.puml)  
Tệp hình ảnh biểu đồ: [package_diagram.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/package_diagram.png)

```
                            [HÌNH ẢNH 37: SƠ ĐỒ PACKAGE DIAGRAM]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `package_diagram.png`)*

---

#### b) Sơ đồ deployment diagram

Biểu đồ triển khai mô tả cấu trúc phân bổ phần mềm trên nền tảng phần cứng và hạ tầng mạng phân tán:
* **Client Node:** Trình duyệt Web phía người dùng (HTML5, CSS3, JavaScript, React/Next.js, Tailwind CSS), giao tiếp với máy chủ thông qua giao thức bảo mật HTTP/HTTPS (REST API JSON, WebSocket STOMP).
* **Web / App Server Node:** Máy chủ ứng dụng chạy các Microservice Java Spring Boot độc lập trên nền tảng Spring Boot Embedded Tomcat (Java 17/21, Spring MVC, Spring Data JPA / HikariCP Connection Pool), tích hợp API Gateway (Spring Cloud Gateway), Eureka Service Discovery và Keycloak Identity Provider (OAuth2 / OIDC).
* **AI Service Node:** Cụm máy chủ chuyên dụng chạy các dịch vụ trí tuệ nhân tạo Python FastAPI (`search-service`, `recs-service`, `chatbot-service`) thực thi mô hình CLIP ViT-B/32, multilingual-e5-base, Transformer SASRec và mô hình ngôn ngữ lớn LLM.
* **DB Server Node:** Hệ thống lưu trữ dữ liệu đa mô hình (Polyglot Persistence):
  * **PostgreSQL 16 (Cổng 5432):** Quản lý dữ liệu quan hệ giao dịch ACID tuyệt đối (`user_db`, `product_db`, `order_db`, `payment_db`, `inventory_db`, `promotion_db`).
  * **MongoDB 7.0 (Cổng 27017):** Quản lý dữ liệu phi cấu trúc tốc độ cao (`chat_db`, `notification_db`).
  * **Redis 7.2 (Cổng 6379):** Lưu trữ bộ nhớ đệm Cache, quản lý giỏ hàng, khóa phân tán (Distributed Lock), trừ tồn kho nguyên tử và lưu chuỗi hành vi tương tác người dùng.
  * **Elasticsearch 8.13 (Cổng 9200):** Chỉ mục hóa tìm kiếm toàn văn BM25 và lưu trữ vector đặc trưng kNN Cosine similarity.
  * **Apache Kafka & Zookeeper (Cổng 9092):** Nền tảng luồng sự kiện phân tán xử lý hàng đợi tin nhắn giữa các microservice theo kiến trúc EDA (Event-Driven Architecture).

##### Hình ảnh 38. Sơ đồ deployment diagram

Tệp mã nguồn PlantUML: [deployment_diagram.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/deployment_diagram.puml)  
Tệp hình ảnh biểu đồ: [deployment_diagram.png](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/deployment_diagram.png)

```
                            [HÌNH ẢNH 38: SƠ ĐỒ DEPLOYMENT DIAGRAM]
```
*(Chi tiết biểu đồ xem tại tệp hình ảnh đính kèm: `deployment_diagram.png`)*

