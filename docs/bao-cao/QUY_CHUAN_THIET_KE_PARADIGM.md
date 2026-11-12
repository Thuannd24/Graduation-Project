# QUY CHUẨN (RULES) & KỸ NĂNG VẼ (SKILLS) SƠ ĐỒ TRÊN VISUAL PARADIGM
> **Áp dụng:** Đồ án Tốt nghiệp Hệ thống Thương mại Điện tử Phân tán AuraTech (10 Phân hệ Microservices & AI)  
> **Thư mục lưu:** `docs/bao-cao/` | **Đồng bộ:** [Mục lục Báo cáo](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/MUC_LUC_BAO_CAO.md)  
> **Cấu trúc:** Lược bỏ toàn bộ các bước phân tích trung gian bị gạch bỏ, tập trung chuyên sâu vào **Kịch bản Use Case** và toàn bộ **Pha Thiết Kế Kiến Trúc Hiện Đại**.

---

## MỤC LỤC
1. [Quy chuẩn Biểu đồ Use Case (Tổng quan & Phân rã 10 Phân hệ)](#1-quy-chuẩn-biểu-đồ-use-case)
2. [Quy chuẩn Viết Kịch bản Use Case (Kèm Mockup UI Bảng)](#2-quy-chuẩn-viết-kịch-bản-use-case)
3. [Thiết kế Lớp Thực thể (Design Entity Class Diagram)](#3-thiết-kế-lớp-thực-thể)
4. [Thiết kế Cơ sở Dữ liệu Phân tán & Vật lý (Physical ERD)](#4-thiết-kế-cơ-sở-dữ-liệu-vật-lý)
5. [Thiết kế Tĩnh Chi tiết Module (Design Class Diagram - Clean/Layered Architecture)](#5-thiết-kế-tĩnh-chi-tiết-module)
6. [Thiết kế Hoạt động (Activity Diagram & Quy trình BPMN Camunda)](#6-thiết-kế-hoạt-động)
7. [Thiết kế Tuần tự Chi tiết (Design Sequence Diagram - Saga, Kafka, Lock 2 lớp)](#7-thiết-kế-tuần-tự-chi-tiết)
8. [Thiết kế Triển khai & Gói (Package Diagram & Deployment Diagram Docker Containers)](#8-thiết-kế-triển-khai--gói)
9. [Quy chuẩn Biểu diễn PlantUML / VPasCode (ERD, Lớp Thực thể & Lớp Chi tiết Module)](#9-quy-chuẩn-biểu-diễn-plantuml--vpascode-erd-lớp-thực-thể--lớp-chi-tiết-module)

---

## 1. QUY CHUẨN BIỂU ĐỒ USE CASE

### 📌 Rules (Quy chuẩn bắt buộc):
1. **Phân cấp Actor (Kế thừa đa tầng):**
   * Tác nhân con người: `Member` (Tài khoản gốc) $\longrightarrow$ Kế thừa xuống:
     * `Customer` (Khách hàng).
     * `Staff` (Nhân viên vận hành `ROLE_STAFF`).
     * `Admin` (Quản trị viên `ROLE_ADMIN` - kế thừa quyền của Staff).
   * Tác nhân độc lập: `Guest` (Khách vãng lai chưa có tài khoản).
   * Tác nhân hệ thống nền: `System Scheduler` (Bộ lập lịch), `AI Worker` (Dịch vụ trí tuệ nhân tạo).
   * Tác nhân bên ngoài: `VNPay Gateway`, `Google OIDC`, `Firebase FCM`, `GHTK Logistics`.
2. **System Boundary:**
   * Sử dụng khung chữ nhật lớn bao quanh các Use Case có nhãn tên: `AuraTech E-Commerce Distributed Platform`.
3. **Quan hệ phụ thuộc giữa các Use Case:**
   * Dùng `<<include>>` (mũi tên nét đứt) cho các hành vi bắt buộc:
     * `Đặt hàng trực tuyến` include `Chọn địa chỉ giao hàng`, `Áp dụng voucher`, `Xác thực tồn kho`.
     * `Tư vấn qua Chatbot` include `Truy xuất ngữ cảnh RAG`.
     * `Thiết kế chiến dịch Camunda` include `Kiểm tra cú pháp BPMN`.
   * Dùng `<<extend>>` cho các chức năng tùy biến:
     * `Chuyển giao gặp nhân viên tư vấn` extend từ `Trò chuyện với Chatbot`.
     * `Gửi yêu cầu Thu cũ đổi mới` extend từ `Xem chi tiết sản phẩm`.

### 🛠 Skills trên Visual Paradigm:
* Tạo **Use Case Diagram**.
* Kéo **Actor**, chọn biểu tượng **Generalization** (mũi tên rỗng) để nối kế thừa.
* Vẽ quan hệ `<<include>>` / `<<extend>>`: Kéo mũi tên kết nối giữa 2 Use Case $\rightarrow$ VP tự động gợi ý pop-up chọn kiểu quan hệ chuẩn UML.

---

## 2. QUY CHUẨN VIẾT KỊCH BẢN USE CASE (KÈM MOCKUP BẢNG UI)

### 📌 Rules (Cấu trúc mẫu bảng PTIT):
Kịch bản cho mỗi use case cốt lõi phải trình bày đầy đủ bảng 6 phần:
* `Use Case Name`, `Actor`, `Pre-conditions`, `Post-conditions`.
* `Main Flow (Kịch bản chính)`: Mô tả từng bước tương tác 2 chiều giữa Người dùng và Hệ thống.
* **Bắt buộc có Mockup Giao diện dạng Bảng** tại các bước tra cứu/chọn lựa/xác nhận.
* `Exceptions (Ngoại lệ)`: Đánh số tương ứng với bước xảy ra sự cố (hết hàng, lỗi cổng thanh toán, token hết hạn).

### 📋 Mẫu kịch bản áp dụng thực tế: Use Case "Đặt hàng trực tuyến & Thanh toán VNPay"

| Mục | Nội dung chi tiết |
|---|---|
| **Use case** | Place Order & Checkout |
| **Actor** | Customer |
| **Tiền điều kiện** | Khách hàng đã đăng nhập tài khoản hợp lệ, giỏ hàng có ít nhất 1 sản phẩm còn tồn kho |
| **Hậu điều kiện** | Đơn hàng được tạo ở trạng thái `PAID` (sau khi thanh toán VNPay thành công), tồn kho bị trừ, voucher được ghi nhận sử dụng |
| **Kịch bản chính** | **1.** Tại trang Giỏ hàng, khách hàng tích chọn các sản phẩm cần mua và nhấn nút "Tiến hành Đặt hàng".<br>**2.** Hệ thống chuyển sang giao diện "Xem trước và Xác nhận Đơn hàng" (`CheckoutPage`):<br><br>\| Tên sản phẩm \| Biến thể \| Đơn giá \| SL \| Thành tiền \|<br>\| Laptop Gaming Asus ROG Strix G16 \| i7-13650HX / 16GB / 512GB \| 29.990.000đ \| 1 \| 29.990.000đ \|<br>\| Chuột không dây Logitech G Pro X \| Màu Trắng / Wireless \| 2.490.000đ \| 1 \| 2.490.000đ \|<br><br>\| Tạm tính: 32.480.000đ \| VAT (10%): 3.248.000đ \| Phí vận chuyển: 50.000đ \|<br>\| Voucher giảm giá: -500.000đ \| Điểm thưởng dùng: 100 điểm (-100.000đ) \|<br>\| **TỔNG THANH TOÁN: 35.178.000đ** \|<br><br>**3.** Khách hàng chọn Sổ địa chỉ nhận hàng và chọn Phương thức thanh toán: "Cổng thanh toán VNPay".<br>**4.** Khách hàng nhấn nút "Xác nhận Thanh toán".<br>**5.** Hệ thống gửi yêu cầu kèm `Idempotency-Key` sang `order-service` để khởi tạo đơn hàng.<br>**6.** Hệ thống thực hiện kiểm tra và giữ tồn kho nguyên tử trên Redis.<br>**7.** Đơn hàng được lưu vào CSDL với trạng thái `PENDING`.<br>**8.** Hệ thống chuyển hướng khách hàng sang Cổng thanh toán VNPay Sandbox.<br>**9.** Khách hàng quét mã VNPAY-QR hoặc nhập thông tin thẻ ngân hàng và nhấn xác nhận thanh toán.<br>**10.** Cổng VNPay gửi kết quả về Webhook IPN của `payment-service` và chuyển hướng trình duyệt về trang kết quả.<br>**11.** Hệ thống cập nhật đơn hàng thành `PAID`, trừ kho vật lý, gửi email xác nhận và hiển thị thông báo "Đặt hàng thành công". |
| **Ngoại lệ** | **6.1.** Tồn kho khả dụng không đủ $\rightarrow$ Hệ thống thông báo: "Sản phẩm vừa hết hàng trong đợt mở bán, vui lòng chọn lại".<br>**9.1.** Khách hàng hủy giao dịch tại cổng VNPay $\rightarrow$ Hệ thống chuyển trạng thái đơn sang `PAYMENT_FAILED`, hoàn lại tồn kho giữ chỗ trên Redis. |

### 📋 Mẫu kịch bản áp dụng thực tế: Use Case "Cập nhật thông tin sản phẩm (Update Product)"

| Mục | Nội dung chi tiết |
|---|---|
| **Use case** | Update Product (Cập nhật thông tin sản phẩm) |
| **Actor** | Staff / Admin |
| **Tiền điều kiện** | Nhân viên/Quản trị viên đã đăng nhập tài khoản có quyền `ROLE_STAFF` hoặc `ROLE_ADMIN` trên hệ thống quản trị |
| **Hậu điều kiện** | Thông tin sản phẩm, thuộc tính động, hình ảnh và biến thể được cập nhật vào cơ sở dữ liệu `product_db`, đồng bộ sang Elasticsearch |
| **Kịch bản chính** | **1.** Nhân viên truy cập phân hệ Quản lý sản phẩm (`ProductsTab`), hệ thống hiển thị thanh công cụ tìm kiếm và danh sách sản phẩm:<br><br>\| Mã SP \| Tên sản phẩm \| Danh mục \| Thương hiệu \| Giá niêm yết \| Trạng thái \| Thao tác \|<br>\| 101 \| Laptop Asus Zenbook 14 \| Laptop \| ASUS \| 24.990.000đ \| Đang bán \| [Sửa] [Ẩn] \|<br>\| 102 \| Điện thoại Galaxy S24 \| Điện thoại \| Samsung \| 18.990.000đ \| Đang bán \| [Sửa] [Ẩn] \|<br><br>**2.** Nhân viên nhập từ khóa tìm kiếm (vd: *"Zenbook"*) hoặc lọc theo danh mục *"Laptop"*, hệ thống lọc danh sách kết quả phù hợp.<br>**3.** Nhân viên nhấn nút **[Sửa]** tại hàng sản phẩm mã `101`.<br>**4.** Hệ thống gọi API `GET /api/v1/public/products/101` và mở hộp thoại chỉnh sửa (`EditProductModal`):<br><br>\| Tên trường nhập liệu \| Giá trị hiện tại / Giá trị chỉnh sửa \| Thành phần giao diện \|<br>\| Tên sản phẩm \| Laptop ASUS Zenbook 14 OLED UX3405 \| Input text \|<br>\| Đường dẫn định danh (Slug) \| laptop-asus-zenbook-14-oled-ux3405 \| Input text \|<br>\| Danh mục & Thương hiệu \| Laptop - ASUS \| Select dropdown \|<br>\| Giá bán niêm yết / Khuyến mãi \| 24.990.000đ / 22.990.000đ \| Input number \|<br>\| Thông số kỹ thuật động \| CPU: Ultra 7 155H, RAM: 32GB, SSD: 1TB \| Dynamic attribute form \|<br>\| Biến thể (Variants) \| Xanh lam (16GB/512GB), Bạc (32GB/1TB) \| Variant table \|<br>\| Hình ảnh sản phẩm \| 3 ảnh URL MinIO \| Image uploader \|<br>\| Thời hạn bảo hành \| 24 tháng (Chính hãng Asus VN) \| Input text \|<br><br>**5.** Nhân viên thực hiện sửa các thông số cần thiết (vd: cập nhật giá khuyến mãi xuống `21.990.000đ`, thêm ảnh mới).<br>**6.** Nhân viên nhấn nút **"Lưu thay đổi" (Save Update)**.<br>**7.** Giao diện Frontend (`EditProductModal`) đóng gói dữ liệu thành `ProductDto` và gọi `productApi.updateProduct(101, productDto)`.<br>**8.** Hệ thống Backend (`AdminProductController`) tiếp nhận request `PUT /api/v1/admin/products/101`, xác thực quyền `ROLE_STAFF`/`ROLE_ADMIN` qua JWT.<br>**9.** `ProductServiceImpl` kiểm tra tính hợp lệ của Slug, cập nhật thông tin thực thể `Product`, xóa và ghi lại thuộc tính động (`ProductAttributeValue`), cập nhật biến thể (`ProductVariant`) và hình ảnh (`ProductImage`).<br>**10.** Hệ thống commit Transaction, bắn sự kiện đồng bộ dữ liệu sang Elasticsearch và trả về `ApiResponse.success(productDto)`.<br>**11.** Giao diện Frontend đóng modal và hiển thị Toast thông báo: *"Cập nhật thông tin sản phẩm thành công!"*. |
| **Ngoại lệ** | **2.1.** Không tìm thấy sản phẩm nào khớp với từ khóa $\rightarrow$ Hệ thống hiển thị: *"Không có sản phẩm nào phù hợp với bộ lọc"*, cho phép đặt lại bộ lọc.<br>**5.1.** Nhân viên để trống các trường bắt buộc (Tên, Giá, Danh mục) $\rightarrow$ Giao diện validate báo đỏ tại ô nhập liệu và chặn gửi request.<br>**8.1.** Slug sản phẩm mới bị trùng lặp với sản phẩm khác $\rightarrow$ Backend ném ngoại lệ `IllegalArgumentException("Slug sản phẩm đã tồn tại")`, Frontend hiển thị thông báo lỗi tương ứng. |

---

## 3. THIẾT KẾ LỚP THỰC THỂ (DESIGN ENTITY CLASS DIAGRAM)

### 📌 Rules (Quy chuẩn thiết kế thực thể Java Spring Boot JPA & MongoDB):
1. **Khóa chính định danh:**
   * Sử dụng `id: Long` hoặc `id: UUID` (chuẩn phân tán cho Order, User).
2. **Chuẩn hóa kiểu dữ liệu thuộc tính (Java Type):**
   * Số tiền tệ: Dùng `BigDecimal` để đảm bảo độ chính xác tài chính (không dùng `float`/`double`).
   * Thời gian: `LocalDateTime` hoặc `Instant`.
   * Trạng thái danh mục/đơn hàng: Dùng `Enum` (`OrderStatus`, `PaymentStatus`, `InventoryTxType`).
   * Cấu hình phức tạp: Dùng `String` (ánh xạ JSON/JSONB trong CSDL).
3. **Chuyển đổi quan hệ thành tham chiếu đối tượng:**
   * Quan hệ $1 - N$: Lớp $N$ chứa thuộc tính `@ManyToOne` trỏ về lớp $1$ (vd: `OrderItem` có `- order: Order`).
   * Không lưu bảng riêng cho các đối tượng thống kê; các giá trị thống kê được tính toán qua Query / Aggregation Pipeline.

### 🛠 Skills trên Visual Paradigm:
* Tạo **Class Diagram**, đặt tên `Design_Entity_Class_Diagram`.
* Dùng công cụ **Aggregation / Association** để nối các thực thể:
  * `Order` $\diamond--$ `OrderItem` (Composition: OrderItem không thể tồn tại độc lập nếu thiếu Order).
  * `Product` $\diamond--$ `ProductVariant` (Composition).
  * `Category` $\longleftarrow$ `Product` (Association).

---

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU VẬT LÝ (PHYSICAL ERD)

### 📌 Rules (Quy chuẩn mô hình Database-per-Service):
Trong kiến trúc Microservices của AuraTech, **không gom tất cả vào 1 CSDL duy nhất** mà chia thành các schema độc lập:

1. **CSDL Quan hệ PostgreSQL / MariaDB:**
   * `user_db`: `tbl_user`, `tbl_address`.
   * `product_db`: `tbl_category`, `tbl_brand`, `tbl_attribute`, `tbl_product`, `tbl_product_variant`, `tbl_review`.
   * `order_db`: `tbl_order`, `tbl_order_item`, `tbl_outbox_event`, `tbl_compensation_task`.
   * `inventory_db`: `tbl_inventory`, `tbl_inventory_transaction`, `tbl_restock_request`.
   * `payment_db`: `tbl_payment`, `tbl_refund`, `tbl_webhook_log`, `tbl_outbox_event`.
   * `promotion_db`: `tbl_campaign`, `tbl_voucher`, `tbl_user_voucher`, `tbl_loyalty_transaction`.
2. **CSDL Tài liệu MongoDB (Schema-less):**
   * `notification_db`: `notifications`, `notification_templates`, `fcm_tokens`.
3. **Quy chuẩn khóa:**
   * Mọi bảng RDBMS có khóa chính `id [PK]`.
   * Khóa ngoại `[FK]` nối giữa các bảng trong cùng 1 service.
   * **Lưu ý hội đồng:** Giữa 2 bảng thuộc 2 Microservices khác nhau (vd: `order_db.tbl_order` và `user_db.tbl_user`) **tuyệt đối không vẽ đường FK vật lý** (Foreign Key Constraint), mà chỉ lưu trữ thuộc tính `user_id: UUID` dạng Logical Reference.

### 🛠 Skills trên Visual Paradigm:
* Tạo **Entity Relationship Diagram (ERD)** chế độ **Physical**.
* Dùng công cụ **One-to-Many Relationship** để nối các bảng trong cùng phân hệ.
* Đặt tên cột theo chuẩn `snake_case`, đánh dấu rõ ràng `PK` và `FK`.

---

## 5. THIẾT KẾ TĨNH CHI TIẾT MODULE (DESIGN CLASS DIAGRAM)

### 📌 Rules (Mô hình Phân tầng Hiện đại: ReactJS Frontend + Spring Boot 3.x Microservices):
Khác với mô hình MVC truyền thống (JSP - Servlet - DAO), hệ thống AuraTech áp dụng mô hình phân tầng hướng dịch vụ phân tán hiện đại, tách biệt hoàn toàn giữa Frontend (SPA ReactJS) và Backend (Spring Boot 3.x REST Microservices).

Biểu đồ lớp thiết kế chi tiết (Design Class Diagram) cho từng module **bắt buộc phải mô hình hóa đầy đủ 5 tầng công nghệ** bố trí từ trên xuống dưới trên cùng một bản vẽ:

```
┌────────────────────────────────────────────────────────────────────────┐
│  TẦNG 1: PRESENTATION TIER (FRONTEND REACTJS & AXIOS CLIENT)           │
│  - React Component: Quản lý Form State, Image File, Dynamic Inputs     │
│  - API Client: Đóng gói HTTP REST Call (Axios Promise<ApiResponse<T>>) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST Call (JSON Payload)
┌───────────────────────────────────▼────────────────────────────────────┐
│  TẦNG 2: CONTROLLER TIER (@RestController - SPRING BOOT)               │
│  - Tiếp nhận HTTP Request, giải mã Token JWT, kiểm tra @PreAuthorize   │
│  - Validate @Valid DTO, ủy quyền xử lý nghiệp vụ cho Service           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Dependency Injection (@Autowired)
┌───────────────────────────────────▼────────────────────────────────────┐
│  TẦNG 3: BUSINESS SERVICE TIER (@Service & Service Interface)          │
│  - Interface định nghĩa hợp đồng nghiệp vụ                             │
│  - ServiceImpl triển khai: xử lý Transaction, kiểm tra Slug, bóc tách  │
│    thuộc tính động, biến thể, hình ảnh và chuyển đổi DTO <-> Entity    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Gọi truy vấn
┌───────────────────────────────────▼────────────────────────────────────┐
│  TẦNG 4: DATA ACCESS / REPOSITORY TIER (SPRING DATA JPA)               │
│  - Kế thừa JpaRepository<Entity, ID>                                   │
│  - Chứa các phương thức truy vấn CSDL: findById, findBySlug, deleteBy...│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Quản lý & thao tác dữ liệu
┌───────────────────────────────────▼────────────────────────────────────┐
│  TẦNG 5: DOMAIN ENTITY TIER (@Entity - TOÀN BỘ CÁC THỰC THỂ LIÊN QUAN) │
│  - BẮT BUỘC chứa ĐẦY ĐỦ TẤT CẢ các thực thể liên quan trong phân hệ     │
│  - Khóa chính, thuộc tính Java chuẩn (BigDecimal, String, Boolean, Long)│
│  - Quan hệ thực thể: Composition (*--), Association (--), Multiplicity │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 🚨 QUY CHUẨN BẮT BUỘC VỀ ĐƯỜNG NỐI & QUAN HỆ GIỮA CÁC LỚP (RELATIONSHIP RULES):

Nhằm đáp ứng 100% chuẩn bảo vệ Đồ án Tốt nghiệp chuyên ngành CNTT (chuẩn Hình 19 PTIT & giáo trình UML Quốc tế), toàn bộ sơ đồ lớp thiết kế chi tiết phải tuân thủ nghiêm ngặt 3 quy tắc cốt lõi sau:

#### 1. Quy tắc 1: TUYỆT ĐỐI KHÔNG DÙNG MŨI TÊN CÓ HƯỚNG (`-->` hoặc `..>`) trong toàn bộ Sơ đồ Lớp Thiết kế:
* **Giao tiếp giữa các màn hình (View $\leftrightarrow$ View):**
  * Sử dụng nét liền thuần túy (`--` Association): `MainStaffView -right- ManageProductView`, `ManageProductView -right- AddProductView`.
  * **CẤM:** Không được dùng mũi tên có hướng `MainStaffView -right-> ManageProductView` hay `ManageProductView -right-> AddProductView`.
* **Giao tiếp giữa Giao diện và Điều khiển (View $\leftrightarrow$ Controller):**
  * `AddProductView -down- AdminProductController` (nét liền thuần túy `--`, không có đầu mũi tên `>`).
* **Giao tiếp giữa Controller $\leftrightarrow$ Service $\leftrightarrow$ Repository:**
  * Toàn bộ sử dụng nét liền thuần túy (`--`), không dùng mũi tên chỉ hướng.
* **Cơ sở lý luận bảo vệ trước Hội đồng:** Sơ đồ Lớp (Class Diagram) là sơ đồ **cấu trúc tĩnh (Structural Diagram)** biểu diễn sự liên kết tĩnh (Classifier Association) giữa các lớp. Các mũi tên có hướng biểu diễn thông điệp/dòng điều khiển động (Navigability / Control Flow) chỉ thuộc về Sơ đồ Tuần tự (Sequence Diagram), Sơ đồ Giao tiếp (Communication Diagram) hoặc Sơ đồ Luồng màn hình (Screen Flow Diagram).

#### 2. Quy tắc 2: Giao tiếp giữa các tầng CHỈ DÙNG LIÊN KẾT NÉT LIỀN THUẦN TÚY (`--`), TUYỆT ĐỐI KHÔNG DÙNG THU NẠP (`--o`) HAY HỢP THÀNH (`--*`):
* **Tuyệt đối không dùng quan hệ Aggregation (`--o`) giữa các tầng kiến trúc:**
  * ❌ **SAI QUY CHUẨN:** `ProductServiceImpl -right-o AdminProductController` (dùng hình thoi rỗng aggregation nối giữa Service và Controller là sai bản chất OOP).
  * ❌ **SAI QUY CHUẨN:** `ProductServiceImpl o-down- ProductRepository` (dùng aggregation nối giữa Service và Repository là sai bản chất OOP).
  * ✅ **CHUẨN XÁC 100%:**
    * `AdminProductController -left- ProductServiceImpl` (nét liền `--`)
    * `ProductServiceImpl -down- CategoryRepository` (nét liền `--`)
    * `ProductServiceImpl -down- ProductRepository` (nét liền `--`)
    * `ProductServiceImpl -down- AttributeRepository` (nét liền `--`)
* **Cơ sở lý luận bảo vệ trước Hội đồng:** Quan hệ Thu nạp (Aggregation `--o`) và Hợp thành (Composition `--*`) là quan hệ "Toàn thể - Bộ phận" (Whole-Part / Has-A) biểu thị quyền sở hữu cấu trúc dữ liệu và ràng buộc vòng đời đối tượng. Các tầng Controller, Service, Repository là các **thành phần xử lý (Processing Components / Stateless Spring Beans)** được liên kết qua cơ chế Dependency Injection (Inversion of Control), không sở hữu cấu trúc dữ liệu vòng đời của nhau. Do đó, quan hệ giữa các tầng kiến trúc bắt buộc chỉ là quan hệ liên kết đơn giản (Simple Association `--`).

#### 3. Quy tắc 3: Quan hệ Thu nạp (`o--`), Hợp thành (`*--`), Kế thừa (`<|--`) CHỈ ĐƯỢC DÙNG CHO TẦNG THỰC THỂ (Domain Entities):
* Các quan hệ ngữ nghĩa cấu trúc dữ liệu hướng đối tượng chỉ được phép áp dụng tại **Tầng 5 (Domain Entity Tier)** để mô hình hóa cấu trúc dữ liệu của CSDL quan hệ:
  * **Hợp thành (Composition `*--` hình thoi đặc):** Dùng khi thực thể con phụ thuộc vòng đời hoàn toàn vào thực thể cha (nếu xóa cha thì con bị xóa theo dạng `CascadeType.ALL` / `orphanRemoval = true`):
    * `Product *-- ProductVariant` (Biến thể không thể tồn tại độc lập nếu thiếu Sản phẩm cha).
    * `Product *-- ProductImage` (Hình ảnh gắn liền với Sản phẩm).
    * `Product *-- ProductTag` (Tag phân loại sản phẩm).
    * `Product *-- ProductAttributeValue` (Giá trị thuộc tính động của Sản phẩm).
    * `ProductVariant *-- VariantOptionValue` (Giá trị tùy chọn của Biến thể SKU).
  * **Thu nạp (Aggregation `o--` hình thoi rỗng):** Dùng khi quan hệ gom nhóm lỏng lẻo, thực thể thành phần vẫn có thể tồn tại độc lập nếu thực thể gom nhóm bị xóa:
    * `Category o-- Product` (Danh mục chứa nhiều Sản phẩm, xóa Danh mục không xóa mất Sản phẩm vật lý).
    * `Brand o-- Product` (Thương hiệu chứa nhiều Sản phẩm).
    * `Attribute o-- ProductAttributeValue` (Định nghĩa thuộc tính dùng chung cho nhiều giá trị sản phẩm).
    * `Attribute o-- VariantOptionValue` (Thuộc tính biến thể dùng chung).
  * **Kế thừa (Generalization `<|--` tam giác rỗng):** Dùng cho mô hình hóa thừa kế người dùng:
    * `Member <|-- Staff` (Nhân viên quản trị hệ thống kế thừa thuộc tính tài khoản cơ sở từ Thành viên `Member`, đồng thời bổ sung thuộc tính phân quyền `role` và các thao tác nghiệp vụ).
    * `Staff` liên kết với các màn hình View: `MainStaffView`, `ManageProductView`, `AddProductView`.

* **Lưu ý chuẩn hóa thuộc tính Service tiêm phụ thuộc (@Autowired / @RequiredArgsConstructor):**
  * Trong Spring Boot, các Controller (như `AdminProductController`) khai báo các bean service thông qua constructor injection (ví dụ `productService`, `storageService`).
  * Trong sơ đồ lớp phân tầng (Clean/Layered Architecture), liên kết giữa Controller và Service được biểu diễn qua **đường liên kết tĩnh (Association `--`)**.
  * Đối với các dịch vụ phụ trợ hạ tầng (như `StorageService` của MinIO): Nếu không mô hình hóa class `StorageService` trong use case chính, không nên để kiểu dữ liệu này thành một thuộc tính lơ lửng trong Controller; hoặc nếu có API upload ảnh thì chỉ biểu diễn phương thức `+ uploadProductImage(...)` mà không gán `uploadImage` nhầm vào `ProductServiceImpl`.

---

#### Thiết kế chi tiết cho Module Sửa thông tin sản phẩm (`Update Product`):
*(Đồng bộ 100% với mã nguồn `BE/product-service` và `FE/src/features/admin`)*

1. **Tầng 1 - Presentation (ReactJS Frontend):**
   * **Component:** `EditProductModal` (hoặc `ProductsTab`)
     * `- formData: Object`, `- variants: Array`, `- categories: CategoryDto[]`, `- brands: BrandDto[]`, `- attributes: Attribute[]`, `- imageFiles: File[]`
     * `+ handleInputChange(e: Event): void`
     * `+ handleUploadImages(files: FileList): void`
     * `+ handleUpdateProduct(e: FormEvent): void`
   * **API Client:** `ProductApiClient`
     * `+ getProductById(id: Long): Promise<ApiResponse<ProductDto>>`
     * `+ updateProduct(id: Long, productDto: ProductDto): Promise<ApiResponse<ProductDto>>`
     * `+ uploadProductImage(file: File, folder: String): Promise<ApiResponse<Map>>`

2. **Tầng 2 - REST Controller:**
   * **Controller:** `AdminProductController` (`@RestController`, `@RequestMapping("/api/v1/admin")`)
     * `- productService: ProductService`
     * `- storageService: StorageService`
     * `+ updateProduct(@PathVariable id: Long, @Valid @RequestBody productDto: ProductDto): ApiResponse<ProductDto>` *(Bảo mật: `@PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")`)*
     * `+ uploadProductImage(file: MultipartFile, folder: String): ApiResponse<Map<String, String>>`

3. **Tầng 3 - Business Service:**
   * **Interface:** `ProductService`
     * `+ updateProduct(id: Long, productDto: ProductDto): ProductDto`
     * `+ getProductById(id: Long): ProductDto`
   * **Class triển khai:** `ProductServiceImpl` (implements `ProductService`)
     * `- productRepository: ProductRepository`
     * `- productVariantRepository: ProductVariantRepository`
     * `- categoryRepository: CategoryRepository`
     * `- brandRepository: BrandRepository`
     * `- productAttributeValueRepository: ProductAttributeValueRepository`
     * `- variantOptionValueRepository: VariantOptionValueRepository`
     * `- productImageRepository: ProductImageRepository`
     * `- productTagRepository: ProductTagRepository`
     * `+ updateProduct(id: Long, productDto: ProductDto): ProductDto`
     * `- saveSpecifications(productId: Long, attrs: Map, attrMap: Map): void`
     * `- saveVariants(product: Product, variantDtos: List): void`
     * `- convertToDto(product: Product): ProductDto`

4. **Tầng 4 - Data Access / Repository (Spring Data JPA):**
   * `ProductRepository`: `+ findById(id: Long): Optional<Product>`, `+ findBySlug(slug: String): Optional<Product>`, `+ save(product: Product): Product`
   * `ProductVariantRepository`: `+ findByProductId(productId: Long): List<ProductVariant>`, `+ deleteByProductId(id: Long): void`
   * `ProductAttributeValueRepository`: `+ deleteByProductId(id: Long): void`, `+ saveAll(values: List): List`
   * `VariantOptionValueRepository`: `+ deleteByVariantIdIn(ids: List<Long>): void`
   * `ProductImageRepository`: `+ deleteByProductId(id: Long): void`, `+ saveAll(images: List): List`
   * `ProductTagRepository`: `+ deleteByProductId(id: Long): void`
   * `CategoryRepository`: `+ findById(id: Long): Optional<Category>`
   * `BrandRepository`: `+ findById(id: Long): Optional<Brand>`

5. **Tầng 5 - Domain Entity Tier (Toàn bộ thực thể liên quan trong phân hệ):**
   * `Product`: `- id: Long <<PK>>`, `- name: String`, `- slug: String`, `- description: String`, `- price: BigDecimal`, `- costPrice: BigDecimal`, `- salePrice: BigDecimal`, `- weight: BigDecimal`, `- imageUrl: String`, `- active: Boolean`, `- c: Category`, `- b: Brand`
   * `ProductVariant`: `- id: Long <<PK>>`, `- sku: String`, `- price: BigDecimal`, `- costPrice: BigDecimal`, `- salePrice: BigDecimal`, `- active: Boolean`, `- p: Product`
   * `Category`: `- id: Long <<PK>>`, `- name: String`, `- slug: String`, `- active: Boolean`
   * `Brand`: `- id: Long <<PK>>`, `- name: String`, `- slug: String`, `- active: Boolean`
   * `Attribute`: `- id: Long <<PK>>`, `- code: String`, `- name: String`, `- valueType: String`
   * `ProductAttributeValue`: `- id: Long <<PK>>`, `- value: String`, `- p: Product`, `- a: Attribute`
   * `VariantOptionValue`: `- id: Long <<PK>>`, `- value: String`, `- pv: ProductVariant`, `- a: Attribute`
   * `ProductImage`: `- id: Long <<PK>>`, `- imageUrl: String`, `- isPrimary: Boolean`, `- p: Product`
   * `ProductTag`: `- tag: String`, `- p: Product`
   * **Các lớp DTO liên quan:** `ProductDto`, `ProductVariantDto`, `ApiResponse<T>`.

### 🛠 Skills trên Visual Paradigm & Kỹ thuật PlantUML:
* Tạo **Class Diagram**, đặt tên theo module (ví dụ: `Class_Thiet_Ke_Chi_Tiet_Tao_Moi_San_Pham`, `Class_Thiet_Ke_Chi_Tiet_Sua_San_Pham`).
* **Kỹ năng cấu hình Style chuẩn Visual Paradigm (Khắc phục lỗi đường mờ & lỗi font):**
  * Trong PlantUML / VPasCode, theme `vp.puml` sử dụng cấu trúc `<style>` mới. Nếu chỉ dùng `skinparam ArrowThickness` cũ, bộ render sẽ bỏ qua khiến đường nối bị mờ (hairline).
  * **Bắt buộc khai báo khối `<style>` ghi đè:**
    ```plantuml
    !include https://static.visual-paradigm.com/web/resources/plantuml-stdlib/themes/vp.puml

    <style>
    classDiagram {
      LineColor #000000
      LineThickness 2.0
      arrow {
        LineColor #000000
        LineThickness 2.0
        FontColor #000000
        FontSize 9.5
        FontStyle bold
      }
      class {
        LineColor #000000
        LineThickness 1.5
        BackgroundColor #7ACFF5
        FontColor #000000
        FontStyle bold
      }
      interface {
        LineColor #000000
        LineThickness 1.5
        BackgroundColor #7ACFF5
        FontColor #000000
        FontStyle bold
      }
    }
    </style>
    ```
  * **Tuyệt đối KHÔNG ghi số bội số `"1"`, `"0..*"` dạng text trên mũi tên:** Bộ sinh SVG của VPasCode sẽ bị lỗi phóng to font thành 80pt đè kín diagram. Chuẩn UML Hình 19 của PTIT dùng đường nối trơn không ghi nhãn số (`Category o-- Product`, `Product *-- ProductVariant`).
  * **Xóa bỏ các tag `<<PK>>`:** Khóa chính chuẩn UML viết dạng `- id : Long`.

* **Kỹ năng viết cú pháp Quan hệ PlantUML chuẩn xác (Strict Relationship Syntax):**
  * **Nối Actor với View:** `Employee -right- MainStaffView` (nét liền thuần túy `--`).
  * **Chuyển tiếp giữa các View:** `MainStaffView -right- ManageProductView`, `ManageProductView -right- AddProductView` (dùng `-right-`, **tuyệt đối không dùng `-right->`**).
  * **Giao tiếp View xuống Controller:** `AddProductView -down- AdminProductController` (dùng `-down-`, **tuyệt đối không dùng `-down->`**).
  * **Giao tiếp Controller với Service:** `ProductServiceImpl -right- AdminProductController` (dùng nét liền thuần túy, **tuyệt đối không dùng `-right-o` hay `o--`**).
  * **Giao tiếp Service xuống Repositories:** `ProductServiceImpl -down- CategoryRepository`, `ProductServiceImpl -down- ProductRepository`, `ProductServiceImpl -down- AttributeRepository` (dùng `-down-`, **tuyệt đối không dùng `o-down-`**).
  * **Giao tiếp Repository xuống Entity:** `ProductRepository -down- Product` (dùng `-down-`, **không dùng mũi tên**).
  * **Mô hình hóa quan hệ thực thể (Tầng 5 Entity):**
    * *Hợp thành (Composition `*--`):* `Product *-right- ProductImage`, `Product *-down- ProductVariant`, `Product *-right- ProductAttributeValue`, `ProductVariant *-right- VariantOptionValue`.
    * *Thu nạp (Aggregation `o--`):* `Category o-down- Product`, `Brand o-down- Product`.
    * *Liên kết thuộc tính:* `Attribute -down- ProductAttributeValue`, `Attribute -down- VariantOptionValue`.

* **Kỹ năng dồn sơ đồ lớp vừa vặn 1 trang A4 duy nhất (A4 Single-Page Fitting Skill):**
  1. **Khống chế tối đa 4 tầng dọc:**
     * **Tầng 1 (Đỉnh):** Views (`MainStaffView` $\rightarrow$ `ManageProductView` $\rightarrow$ `AddProductView`) và Actor (`Employee` $\rightarrow$ `Member`).
     * **Tầng 2:** `AdminProductController` và `ProductServiceImpl` (đặt ngang hàng hoặc Controller trên Service).
     * **Tầng 3:** Tầng Repository (Data Access) cốt lõi của Use Case.
     * **Tầng 4 (Đáy):** Tầng Entity chứa thực thể dữ liệu.
  2. **Gom cột để tránh dãn ngang:** Không dàn 5-6 Repository/Entity thành 1 hàng ngang (sẽ phình ra > 2000px). Thay vào đó, chia thành 3 cột cân đối:
     * *Cột 1 (Trái):* `Category` & `Brand` (cùng Repository tương ứng).
     * *Cột 2 (Giữa):* `Product`, `ProductVariant`, `ProductImage`, `ProductTag`.
     * *Cột 3 (Phải):* `Attribute`, `ProductAttributeValue`, `VariantOptionValue`.
  3. **Quy tắc tinh lọc thuộc tính theo Use Case:**
     * Chỉ đưa vào các thuộc tính/phương thức **trực tiếp tham gia vào Use Case**. Lược bỏ các trường metadata phụ của CSDL (như `specsRaw`, `createdAt`, `updatedAt`, `salesCount`, `ratingAvg`...) để chiều cao mỗi class chỉ từ 4 - 8 dòng, giúp toàn bộ sơ đồ cao dưới 900px, in ra 1 trang A4 rõ nét từng chữ mà không bị thu nhỏ.
  4. **Cài đặt thông số PlantUML tối ưu A4:** `nodesep 18-20`, `ranksep 22-24`, `defaultFontSize 9.5`, `ClassAttributeFontSize 8.5`.

---

## 6. THIẾT KẾ HOẠT ĐỘNG (ACTIVITY DIAGRAM)

### 📌 Rules (Phân vùng trách nhiệm Swimlanes):
Activity Diagram cho các quy trình nghiệp vụ trong kiến trúc ReactJS + Spring Boot Microservices **bắt buộc phải chia 4 làn Swimlanes** tương ứng với các tầng công nghệ:
1. **Làn 1 (Frontend UI):** `Client / Presentation` (Giao diện ReactJS Component - vd: `EditProductModal`, `CheckoutPage`).
2. **Làn 2 (API Gateway & Controller):** `API Gateway & REST Controller` (Xác thực JWT, phân quyền `@PreAuthorize`, validate DTO).
3. **Làn 3 (Business Service):** `Business Service Layer` (Xử lý logic, kiểm tra trùng lặp, Transaction).
4. **Làn 4 (Data Access & Persistence):** `Spring Data JPA Repository & Database` (Thực thi truy vấn SQL trên MariaDB / Redis).

#### Ví dụ Phân làn chi tiết cho Module Sửa thông tin sản phẩm (`Update Product`):
* **Làn 1 (`EditProductModal`):**
  * `[Initial Node ●]` $\rightarrow$ `Nhân viên nhấn nút Sửa sản phẩm` $\rightarrow$ `Gửi yêu cầu lấy chi tiết` $\rightarrow$ (nhận dữ liệu) $\rightarrow$ `Hiển thị dữ liệu lên Form` $\rightarrow$ `Nhân viên chỉnh sửa thông số, biến thể, ảnh` $\rightarrow$ `Nhấn Lưu thay đổi` $\rightarrow$ `Validate dữ liệu client-side` $\rightarrow$ `Gửi HTTP PUT Request`.
* **Làn 2 (`AdminProductController`):**
  * `Tiếp nhận PUT /api/v1/admin/products/{id}` $\rightarrow$ `Kiểm tra JWT Bearer Token (ROLE_STAFF/ADMIN)` $\rightarrow$ `Validate @Valid ProductDto` $\rightarrow$ `Chuyển tiếp DTO sang Service`.
* **Làn 3 (`ProductServiceImpl`):**
  * `Tìm kiếm sản phẩm theo ID` $\rightarrow$ `Kiểm tra trùng lặp Slug mới` $\rightarrow$ `[Decision ◇: Trùng Slug?]`:
    * *[Có]* $\rightarrow$ `Ném ngoại lệ IllegalArgumentException` $\rightarrow$ `Trả HTTP 400 Bad Request`.
    * *[Không]* $\rightarrow$ `Cập nhật thông tin Product` $\rightarrow$ `Xóa & ghi mới Dynamic Specs` $\rightarrow$ `Đồng bộ danh sách Variants` $\rightarrow$ `Cập nhật bộ ảnh Images` $\rightarrow$ `Chuyển đổi Entity sang ProductDto`.
* **Làn 4 (`ProductRepository & DB`):**
  * `findById(id)` $\rightarrow$ `findBySlug(slug)` $\rightarrow$ `save(product)` $\rightarrow$ `Commit DB Transaction` $\rightarrow$ `Bắn Event đồng bộ Elasticsearch`.
* Kết thúc: Làn 1 nhận `HTTP 200 OK` $\rightarrow$ `Hiển thị Toast: Cập nhật thành công` $\rightarrow$ `Đóng Modal` $\rightarrow$ `[Activity Final Node ◉]`.

### 🛠 Skills trên Visual Paradigm:
* Tạo **Activity Diagram**, đặt tên `Activity_Sua_Thong_Tin_San_Pham`.
* Kéo **Vertical Swimlane**, tạo 4 làn tương ứng.
* Bắt đầu bằng 1 **Initial Node** (`●`), các **Action Node** bo góc, điểm rẽ nhánh điều kiện **Decision Node** (`◇`), và kết thúc bằng **Activity Final Node** (`◉`).

---

## 7. THIẾT KẾ TUẦN TỰ & BIỂU ĐỒ GIAO TIẾP CHI TIẾT (SEQUENCE & COMMUNICATION DIAGRAM)

### 📌 Rules chung cho Sequence Diagram:
1. **Thứ tự Lifeline từ trái qua phải (Mô hình 5 tầng):**
   $$\text{Staff / Admin} \longrightarrow \text{React Component} \longrightarrow \text{Axios API Client} \longrightarrow \text{REST Controller} \longrightarrow \text{Business Service} \longrightarrow \text{Spring Data JPA Repository} \longrightarrow \text{Database}$$
2. **Quy ước thông điệp (Messages):**
   * Mũi tên liền (Sync Call): Gọi hàm JavaScript, HTTP REST Call hoặc hàm Java (`updateProduct()`, `findById()`).
   * Mũi tên đứt (Return): Dữ liệu trả về (`ProductDto`, `ApiResponse<ProductDto>`, `200 OK`).
3. **Kịch bản chi tiết pha thiết kế (Kịch bản v3.0 - Đánh số thứ tự 1-1 với sơ đồ tuần tự):**
   * Tương tự kịch bản 40 bước chuẩn PTIT trong tài liệu mẫu, mỗi tương tác trong sơ đồ tuần tự phải được đánh số tương ứng trong bản mô tả kịch bản thiết kế.

---

### 📋 Thiết kế động chi tiết Module Sửa thông tin sản phẩm (`Update Product`):

#### 1. Kịch bản chi tiết v3.0 pha thiết kế (Module Sửa thông tin sản phẩm):
1. Nhân viên nhấn nút **[Sửa]** tại danh sách sản phẩm trên giao diện `ProductsTab`.
2. `ProductsTab` gọi component `EditProductModal(productId)`.
3. `EditProductModal` gọi `ProductApiClient.getProductById(id)` để lấy dữ liệu hiện tại.
4. `ProductApiClient` gửi request `GET /api/v1/public/products/{id}` tới `AdminProductController`.
5. `AdminProductController` gọi `ProductService.getProductById(id)`.
6. `ProductServiceImpl` gọi `ProductRepository.findById(id)`.
7. `ProductRepository` truy vấn CSDL và trả về thực thể `Product`.
8. `ProductServiceImpl` chuyển đổi `Product` thành `ProductDto` và trả về `AdminProductController`.
9. `AdminProductController` trả về `ApiResponse.success(productDto)`.
10. `ProductApiClient` trả dữ liệu DTO về `EditProductModal` để bind dữ liệu lên các trường nhập liệu.
11. `EditProductModal` hiển thị thông tin sản phẩm (Tên, Giá, Mô tả, Specs động, Biến thể, Ảnh) cho nhân viên.
12. Nhân viên chỉnh sửa các thông tin cần thay đổi trên form và nhấn nút **"Lưu thay đổi" (Save Update)**.
13. `EditProductModal` validate form phía client, đóng gói dữ liệu thành `ProductDto` và gọi `ProductApiClient.updateProduct(id, productDto)`.
14. `ProductApiClient` gửi request `PUT /api/v1/admin/products/{id}` (Header: `Authorization: Bearer JWT`) tới `AdminProductController`.
15. `AdminProductController` xác thực quyền qua Keycloak JWT (`@PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")`), kiểm tra `@Valid` và gọi `ProductService.updateProduct(id, productDto)`.
16. `ProductServiceImpl` gọi `ProductRepository.findById(id)` để tải thực thể hiện tại từ CSDL.
17. `ProductServiceImpl` gọi `ProductRepository.findBySlug(slug)` để kiểm tra trùng lặp slug với sản phẩm khác.
18. `ProductServiceImpl` cập nhật các trường thông tin cơ bản của `Product` (tên, giá, mô tả, brand, category).
19. `ProductServiceImpl` gọi `ProductAttributeValueRepository.deleteByProductId(id)` và lưu danh sách thông số kỹ thuật động mới.
20. `ProductServiceImpl` gọi `ProductVariantRepository` và `VariantOptionValueRepository` để đồng bộ danh sách biến thể SKU.
21. `ProductServiceImpl` gọi `ProductImageRepository.deleteByProductId(id)` và lưu danh sách ảnh mới.
22. `ProductServiceImpl` gọi `ProductRepository.save(product)` để cập nhật thực thể vào CSDL.
23. `ProductRepository` commit CSDL và trả về thực thể `Product` hoàn chỉnh.
24. `ProductServiceImpl` chuyển đổi thực thể sang `ProductDto` và trả về cho `AdminProductController`.
25. `AdminProductController` trả về `ApiResponse.success(productDto)` với mã trạng thái `200 OK`.
26. `ProductApiClient` nhận kết quả, `EditProductModal` đóng modal và hiển thị Toast thông báo: *"Cập nhật thông tin sản phẩm thành công!"*.

---

#### 2. Biểu đồ Tuần tự pha thiết kế (Design Sequence Diagram - Module Sửa sản phẩm):
* **Các Lifelines (từ trái qua phải):**
  $$\text{Staff/Admin} \longrightarrow \text{EditProductModal} \longrightarrow \text{ProductApiClient} \longrightarrow \text{AdminProductController} \longrightarrow \text{ProductServiceImpl} \longrightarrow \text{ProductRepository} \longrightarrow \text{Product (Entity) / DB}$$
* **Các thông điệp đánh số:**
  * Giai đoạn 1 (Lấy dữ liệu hiển thị form): `1: click edit`, `2: open modal`, `3: getProductById(id)`, `4: GET /products/{id}`, `5: getProductById(id)`, `6: findById(id)`, `7: return Product`, `8: return ProductDto`, `9: return 200 OK`, `10: resolve`, `11: display form`.
  * Giai đoạn 2 (Gửi và lưu cập nhật): `12: submit form`, `13: updateProduct(id, dto)`, `14: PUT /admin/products/{id}`, `15: updateProduct(id, dto)`, `16: findById(id)`, `17: findBySlug(slug)`, `18: setAttributes()`, `19: updateSpecs()`, `20: updateVariants()`, `21: updateImages()`, `22: save(product)`, `23: return Product`, `24: return ProductDto`, `25: return 200 OK`, `26: show success toast`.

---

#### 3. Biểu đồ Giao tiếp module sửa sản phẩm (Communication Diagram):
*(Tương ứng với Hình ảnh 8 trong tài liệu chuẩn PTIT, nhưng áp dụng cho kiến trúc hướng đối tượng của Spring Boot & React)*

* **Các Nút đối tượng (Nodes):**
  * `Staff/Admin` (Actor).
  * `EditProductModal` (Boundary / Presentation Node).
  * `ProductApiClient` (Client / Communication Node).
  * `AdminProductController` (Control / REST Node).
  * `ProductServiceImpl` (Business Logic Node).
  * `ProductRepository` (Data Access Node).
  * `Product` (Entity Node).
* **Các đường liên kết (Links) và luồng thông điệp đánh số thứ tự:**
  * Giữa `Staff/Admin` $\leftrightarrow$ `EditProductModal`: `1: click edit`, `11: display form`, `12: submit form`, `26: show success toast`.
  * Giữa `EditProductModal` $\leftrightarrow$ `ProductApiClient`: `2: open modal`, `3: getProductById(id)`, `10: resolve(dto)`, `13: updateProduct(id, dto)`.
  * Giữa `ProductApiClient` $\leftrightarrow$ `AdminProductController`: `4: GET /products/{id}`, `9: 200 OK(dto)`, `14: PUT /admin/products/{id}`, `25: 200 OK(dto)`.
  * Giữa `AdminProductController` $\leftrightarrow$ `ProductServiceImpl`: `5: getProductById(id)`, `8: return dto`, `15: updateProduct(id, dto)`, `24: return dto`.
  * Giữa `ProductServiceImpl` $\leftrightarrow$ `ProductRepository`: `6: findById(id)`, `7: return product`, `16: findById(id)`, `17: findBySlug(slug)`, `22: save(product)`, `23: return updatedProduct`.
  * Giữa `ProductServiceImpl` $\leftrightarrow$ `Product`: `18: updateBasicInfo()`, `19: updateSpecs()`, `20: updateVariants()`, `21: updateImages()`.

### 🛠 Skills chuyển đổi tự động trên Visual Paradigm:
* Sau khi vẽ xong **Sequence Diagram (Sơ đồ tuần tự)** trên Visual Paradigm:
  1. Click chuột phải vào khoảng trống trên diagram $\rightarrow$ chọn **Utilities / Convert Diagram**.
  2. Chọn **Convert to Communication Diagram**.
  3. Visual Paradigm sẽ **tự động sinh ra Biểu đồ Giao tiếp hoàn chỉnh** với đầy đủ các đối tượng, đường link và thông điệp đánh số thứ tự $1 \dots 26$ mà bạn không cần phải tốn công vẽ lại thủ công!

---

## 8. THIẾT KẾ TRIỂN KHAI & GÓI (PACKAGE & DEPLOYMENT DIAGRAM)

### 8.1. Package Diagram
Mỗi Microservice backend được tổ chức theo chuẩn Maven đa module:
* `com.auratech.<service>.controller` (REST Endpoints)
* `com.auratech.<service>.service` & `.impl` (Business Logic)
* `com.auratech.<service>.repository` (Data Access)
* `com.auratech.<service>.entity` (Data Models)
* `com.auratech.<service>.dto` & `.event` (Data Transfer Objects & Kafka Events)
* `com.auratech.<service>.config` (Bảo mật Keycloak, Redis, Kafka Config)

### 8.2. Deployment Diagram (Kiến trúc Docker Containers)
* **Client Device Node:** Web Browser (Google Chrome / Edge) chạy ứng dụng SPA ReactJS (Vite, port 5173).
* **API Gateway Node:** Spring Cloud Gateway (Docker Container, port 8080) kết nối với Discovery Server (Netflix Eureka, port 8761) và Keycloak SSO (port 8443 / 8081).
* **Microservices Application Nodes:** Các Docker container độc lập chạy trên mạng nội bộ Docker Network (`backend-net`):
  * `user-service (8085)`, `product-service (8089)`, `order-service (8082)`, `inventory-service (8093)`, `payment-service (8084)`, `promotion-service (8087)`, `notification-service (8086)`.
* **AI Engine Nodes:** Python FastAPI Containers:
  * `search-service (8001)`, `chatbot-service (8002)`, `recs-service (8003)`, `forecast-service (8004)`.
* **Infrastructure Nodes:**
  * Kafka Cluster (Port 9092, Zookeeper 2181).
  * Redis Server (Port 6379).
  * PostgreSQL / MariaDB (Port 5432 / 3306).
  * Elasticsearch (Port 9200) & MinIO Object Storage (Port 9000).
* **Đường truyền mạng (Communication Paths):**
  * Client $\leftrightarrow$ Gateway: `HTTPS / TLS (Port 443/8080)`.
  * Gateway $\leftrightarrow$ Services: `HTTP/REST nội bộ`.
  * Services $\leftrightarrow$ Kafka: `PLAINTEXT TCP (Port 9092)`.
  * Services $\leftrightarrow$ DB: `JDBC TCP/IP (PostgreSQL/MariaDB)`.

---

## 9. QUY CHUẨN BIỂU DIỄN PLANTUML / VPASCODE (ERD, LỚP THỰC THỂ & LỚP CHI TIẾT MODULE)

Áp dụng thống nhất cho toàn bộ tệp `.puml` trong `docs/bao-cao/puml/` khi render qua VPasCode / PlantUML, đảm bảo hình xuất ra chuẩn giao diện Visual Paradigm, khớp mã nguồn `BE/` / `FE/` và vừa khung in khổ A4.

### 9.1. Quy chuẩn vẽ Physical ERD (`erd_thiet_ke_csdl.puml`)
1. **Giao diện & Bố cục Visual Paradigm Template:**
   * Nền bảng màu cam `#F5B67A`, bo góc `roundcorner 10`, viền đen `#000000` (`LineThickness 1.2`), đường nối vuông góc `linetype ortho`, nền trang `#FFFFFF`.
   * Dùng cỡ chữ **số nguyên** (`defaultFontSize 8`, `FontSize 8`), tuyệt đối **không dùng số thập phân** (vd `8.5`, `9.5`) hoặc stereotype `<<PK>>`/`<<FK>>` để tránh lỗi phóng chữ `80pt` trên trình render SVG của VPasCode.
   * Đặt `nodesep >= 34`, `ranksep >= 26` để nét đứt không bị dính nhìn giống nét liền; không ghi text label trên đường nối để tránh rối; gắn footer `right footer Powered By Visual Paradigm Community Edition`.
   * Neo cố định **6 cột A4 Landscape** bằng các liên kết ẩn `-[hidden]right-` ở hàng đầu (`Member`, `Campaign`, `Order`, `Brand`, `Product`, `ProductReview`) và hàng giữa (`Province`, `Payment`, `OrderItem`, `ProductVariant`, `Inventory`).
2. **Quy chuẩn Icon (OpenIconic) & Định dạng cột:**
   * **Khóa chính (PK):** `<color:#B8860B><&key></color> <b>tenCot</b> : <b>kieuDuLieu</b> <color:#900000><b>[U]</b></color>` (không dùng dấu `*` của PlantUML để tránh vẽ chấm tròn đen cạnh chìa khóa).
   * **Khóa chính kiêm Khóa ngoại (PK+FK):** `<color:#2E7D32><&key></color> <b><i>TenBangid</i></b> : <b><i>kieuDuLieu</i></b>` (áp dụng cho bảng con kế thừa `Staff.Memberid`, `Customer.Memberid`, bảng trung gian `BrandCategory(Brandid, Categoryid)`, và khóa kép `ProductTag(Productid, tag)`). Với bảng chỉ có khóa kép, đặt `--` ở dòng cuối trước `}` để tránh PlantUML tự cắt vạch ngang giữa hai khóa.
   * **Cột thông thường:** `<color:#1D4E89><&spreadsheet></color> tenCot : kieuDuLieu`.
   * **Khóa ngoại (FK):** `<color:#2E7D32><&key></color> <i>TenBangid</i> : <i>kieuDuLieu</i>` (toàn bộ khóa ngoại đều dùng **chìa khóa màu xanh lá**).
3. **Quy chuẩn Khóa ngoại, Bản số & Đối chiếu BE:**
   * Tên FK viết theo quy chuẩn Visual Paradigm `<Entity><pk>` (`Customerid`, `ProductVariantid`, `Provincecode`, `Wardcode`, `Orderid`, `Categoryid`, `Brandid`, `Attributeid`, `Paymentid`, `Campaignid`).
   * **Đường nối Crow's Foot:**
     * *Identifying (FK nằm trong PK):* nét liền `--` (`Member ||-right-o| Staff`, `Brand ||-down-o{ BrandCategory`, `Product ||-down-o{ ProductTag`).
     * *Non-Identifying (FK thường):* nét đứt `..` (`Customer ||.down.o{ Address`, `Order ||.down.o{ Payment`).
     * *Bắt buộc cú pháp PlantUML IE:* Đầu `0..1` bên trái viết `|o`, đầu `0..1` bên phải phải viết ngược lại là `o|` (không viết `-|o` ở bên phải).
   * **Tính nhất quán:** Mọi bảng có đường nối quan hệ phải có đúng cột FK tương ứng và ngược lại. Đối chiếu từng entity trong `BE/` (tách `BrandCategory` cho quan hệ N–N `Brand`–`Category`; dùng `Productid` + `ProductVariantid` cho `OrderItem`, `Inventory`, `InventoryTransaction`, `RestockRequest`; giữ `Address` nối `Province`/`Ward`; không vẽ vòng tự liên kết trên `Category`; bỏ bảng log/outbox/chat/thông báo kỹ thuật khỏi ERD nghiệp vụ lõi).

### 9.2. Quy chuẩn vẽ Sơ đồ Lớp Thực thể (`class_thiet_ke_thuc_the.puml`)
1. **Phạm vi & Cấu trúc:**
   * Nền lớp màu xanh `#7ACFF5`, góc vuông `roundcorner 0`, viền `#000000`, `linetype ortho`, `hide class circle`.
   * Bao gồm đầy đủ các lớp thực thể nghiệp vụ lõi (kèm kế thừa `Member <|-- Staff`, `Member <|-- Customer`) và 3 lớp thống kê (`CustomerStatistics`, `OrderStatistics`, `ProductStatistics`); không tách bảng trung gian `BrandCategory` (`Brand "0..*" -- "0..*" Category`).
2. **Quy chuẩn Thuộc tính & Đối chiếu BE:**
   * Kiểm tra đầy đủ toàn bộ thuộc tính nghiệp vụ từ từng class JPA `@Entity` trong `BE/` (`attributes`, `specsRaw`, `length`, `width`, `height`, `warrantyPeriod`, `warrantyPolicy`, `salesCount`, `ratingAvg`, `workflowJson`, `bpmnXml`, `triggerType`, `costPrice`, `imageUrl`, `isFilter`, `allowedValues`, `isColor`...).
   * **Không đưa các trường timestamp kỹ thuật chung (`createdAt`, `updatedAt`, `completedAt`) vào lớp thực thể** để giữ sơ đồ tinh gọn (chỉ giữ các mốc thời gian nghiệp vụ như `startDate`, `endDate`, `expiresAt`, `usedAt`, `paidAt`, `staffReplyAt`).
   * Sửa các lệch cấu trúc so với BE: `ProductTag` không có `id` giả (`productId`, `tag`); `InventoryTransaction` dùng `productId`, `variantId` (thay cho `inventoryId`); gán đúng bản số `0..1` cho các quan hệ có FK nullable/`0L` và `Order "1" o-- "0..*" Payment`.
3. **Quy chuẩn Bố cục vừa khung tờ giấy A4:**
   * Neo 6 cột thẳng hàng ngang và điều chỉnh `nodesep 16`, `ranksep 18`.
   * Tránh tràn ngang bên trái: xếp `CustomerStatistics` thẳng cột dưới `Customer` (trên `Address`) và xếp `Address` $\rightarrow$ `Province` $\rightarrow$ `Ward` theo chiều dọc.
   * Tránh kéo dài chiều dọc ở góc dưới phải: chuyển `RestockRequest` và `InventoryTransaction` sang trái (nằm ngang dưới `OrderItem`, bên trái `Inventory`) thay vì xếp chồng dọc dưới `Inventory`.

### 9.3. Quy chuẩn vẽ Sơ đồ Lớp Thiết kế Chi tiết Module (`class_thiet_ke_<use_case>.puml`)
1. **Bố cục 4 tầng chuẩn hóa:**
   * **Tầng 1 (Actor & Boundary Views):** `Member`, `Staff`, các `*View` ReactJS (`MainStaffView`, `ManageProductView`, `AddProductView`...).
   * **Tầng 2 (Control & Service):** `*Controller` và `*ServiceImpl` đặt ngang hàng gọn gàng để tiết kiệm chiều cao.
   * **Tầng 3 (Repository):** Các `interface *Repository` (`hide interface circle`) tương ứng với thực thể sử dụng trong use case.
   * **Tầng 4 (Entity):** Đầy đủ các lớp thực thể tham gia use case.
2. **Đồng bộ Thuộc tính & Bảo toàn Phạm vi Lớp:**
   * Toàn bộ thuộc tính của mỗi lớp Entity ở Tầng 4 **bắt buộc phải khớp 100%** với định nghĩa của lớp đó trong [class_thiet_ke_thuc_the.puml](file:///d:/Downloads/Graduation-Project/Graduation-Project/docs/bao-cao/puml/class_thiet_ke_thuc_the.puml) (không lược bớt thuộc tính nghiệp vụ, không thêm `createdAt`/`updatedAt`/`completedAt`).
   * Bổ sung đầy đủ các trường nhập liệu Form State ở `*View`, phụ thuộc Service (`storageService`, `searchService`...) ở Controller/Service, và chỉ ghi đúng tên phương thức Repository thực sự tồn tại trong `BE/`.
   * **Quy tắc phạm vi lớp:** Không tự ý phát sinh thêm lớp mới ngoài cấu trúc lớp đã chốt của biểu đồ Use Case khi chưa báo cáo và thống nhất trước.
   * Tuân thủ 100% Quy tắc nối tầng ở Mục 5: View $\leftrightarrow$ Controller $\leftrightarrow$ Service $\leftrightarrow$ Repository $\leftrightarrow$ Entity chỉ dùng nét liền thuần túy `--`; chỉ Tầng Thực thể mới dùng `*--`, `o--`, `<|--`.
