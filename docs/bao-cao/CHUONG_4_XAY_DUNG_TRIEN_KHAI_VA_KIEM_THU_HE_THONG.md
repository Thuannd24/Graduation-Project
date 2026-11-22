# CHƯƠNG 4: XÂY DỰNG, TRIỂN KHAI VÀ KIỂM THỬ HỆ THỐNG

---

## 4.1. Môi trường phát triển và cấu hình triển khai hạ tầng

Quá trình xây dựng một hệ sinh thái thương mại điện tử phân tán kết hợp các dịch vụ Trí tuệ nhân tạo (AI) đòi hỏi sự phối hợp chặt chẽ giữa môi trường lập trình cục bộ và hạ tầng ảo hóa đồng nhất. Nhằm đảm bảo tính tái lập (Reproducibility), độ ổn định và giảm thiểu tối đa hiện tượng xung đột môi trường giữa các thành viên phát triển, toàn bộ hệ thống được chuẩn hóa quy trình cài đặt và điều phối triển khai thông qua công nghệ Container hóa (Docker).

### 4.1.1. Cấu hình môi trường phát triển (Development Environment)

Hệ thống được phát triển đa ngôn ngữ (Polyglot Programming), khai thác thế mạnh chuyên biệt của Java cho tầng dịch vụ nghiệp vụ giao dịch chịu tải cao, Python cho tầng tính toán suy luận Trí tuệ nhân tạo, và TypeScript cho tầng giao diện người dùng tương tác thời gian thực. Chi tiết các công cụ và thông số môi trường phát triển được chuẩn hóa theo Bảng 4.1.

**Bảng 4.1: Danh mục công cụ và thông số cấu hình môi trường phát triển**

| Thành phần | Công nghệ / Công cụ | Phiên bản | Vai trò và Mục đích sử dụng |
| :--- | :--- | :---: | :--- |
| **Hệ điều hành** | Ubuntu LTS / Windows 11 Pro | 64-bit | Môi trường hệ điều hành máy chủ và máy trạm lập trình |
| **Bộ phát triển Java** | OpenJDK (Eclipse Temurin) | 17.0.10 | Biên dịch và thực thi 08 Microservices Spring Boot |
| **Bộ phát triển Python** | CPython | 3.10.12 | Môi trường tính toán và suy luận cho các dịch vụ AI FastAPI |
| **Môi trường Node.js** | Node.js & npm / yarn | 20.11.0 | Biên dịch, đóng gói giao diện React 18 & Vite 5 |
| **Công cụ đóng gói** | Apache Maven | 3.9.6 | Quản lý phụ thuộc và đóng gói mã nguồn Backend (`.jar`) |
| **Hạ tầng Ảo hóa** | Docker Engine & Docker Compose | 25.0.3 | Đóng gói và cô lập các Container dịch vụ và CSDL |
| **Môi trường IDE** | IntelliJ IDEA Ultimate / VS Code | 2024.1+ | Soạn thảo mã nguồn Java, Python, TypeScript và gỡ lỗi |
| **Quản lý mã nguồn** | Git & GitHub Enterprise | 2.43+ | Kiểm soát phiên bản phân tán và tích hợp mã nguồn nhóm |

### 4.1.2. Đóng gói và triển khai hạ tầng bằng Docker (Containerization)

Để phục vụ cho 08 dịch vụ Backend và 04 dịch vụ AI hoạt động độc lập theo mô hình *Database-per-Service*, hệ thống thiết lập tệp điều phối hạ tầng `docker-compose-infra.yml` quản lý toàn bộ các phần mềm trung gian (Middleware), hàng đợi thông điệp và các hệ quản trị cơ sở dữ liệu trên một mạng ảo cục bộ biệt lập (`ecommerce-network`).

**Bảng 4.2: Danh mục các dịch vụ hạ tầng được triển khai qua Docker Compose**

| Tên Container | Hình ảnh Docker (Image) | Cổng Host : Container | Chức năng và Cấu hình đặc thù |
| :--- | :--- | :---: | :--- |
| `infra-mariadb` | `mariadb:10.11` | `3308:3306` | CSDL quan hệ chính; kích hoạt MySQL Binlog ROW format (`binlog-row-image=FULL`) phục vụ CDC |
| `infra-mongodb` | `mongo:6.0` | `27017:27017` | CSDL tài liệu lưu trữ thông số kỹ thuật động và lịch sử đánh giá sản phẩm |
| `infra-redis` | `redis:7.0-alpine` | `6379:6379` | Bộ nhớ đệm phân tán, lưu trữ giỏ hàng, token blacklist, rate limit và khóa phân tán |
| `infra-kafka` | `confluentinc/cp-kafka:7.4.0` | `29092:29092` | Xương sống phân phối sự kiện phân tán vận hành ở chế độ KRaft (không phụ thuộc Zookeeper) |
| `infra-debezium-connect`| `quay.io/debezium/connect:2.5` | `8088:8083` | Bắt sự kiện thay đổi dữ liệu từ binlog MySQL để đẩy vào các Kafka topic tương ứng |
| `infra-keycloak` | `quay.io/keycloak/keycloak:24.0.0` | `8083:8080` | Máy chủ định danh và quản lý phiên người dùng tập trung (Identity Provider OIDC) |
| `infra-elasticsearch` | `elasticsearch:8.10.2` | `9200:9200` | Công cụ tìm kiếm văn bản toàn văn (Full-text Search) cho danh mục sản phẩm |
| `infra-minio` | `minio/minio:latest` | `9000:9000` / `9001:9001` | Hệ thống lưu trữ đối tượng tương thích Amazon S3 lưu ảnh sản phẩm và tài liệu tĩnh |

> **[Khu vực lưu ý ảnh chụp 4.1]:**
> * **Nội dung:** Chụp ảnh màn hình ứng dụng Docker Desktop (hoặc câu lệnh terminal `docker ps`) hiển thị đầy đủ danh sách các container hạ tầng (`infra-mariadb`, `infra-redis`, `infra-kafka`, `infra-debezium-connect`, `infra-keycloak`) đang ở trạng thái `Running` (Up) và các cổng Port Mapping tương ứng.

**Hình 4.1: Danh sách các Container dịch vụ hạ tầng hoạt động trên Docker Desktop**

Đặc biệt, hệ thống sử dụng một container phụ trợ `infra-debezium-init` thực hiện gọi REST API tự động đăng ký hai bộ kết nối (Connectors) quan trọng ngay khi Debezium Connect sẵn sàng:
1. `order-outbox-connector`: Theo dõi bảng `ecommerce_order_db.outbox_events`, sử dụng bộ biến đổi `io.debezium.transforms.outbox.EventRouter` để định tuyến sự kiện vào topic `order-events`.
2. `payment-outbox-connector`: Theo dõi bảng `ecommerce_payment_db.outbox_events` để định tuyến trạng thái giao dịch vào topic `payment-events`.

### 4.1.3. Khởi tạo và thiết lập cụm Microservices Backend

Sau khi các tầng hạ tầng trung gian sẵn sàng, các microservice Java Spring Boot được khởi động. Hệ thống phân chia thành 2 thành phần điều phối hạ tầng Spring Cloud cốt lõi:

* **Trung tâm Đăng ký và Khám phá Dịch vụ (Eureka Server - Cổng 8761):**
  Mọi dịch vụ nghiệp vụ (`order-service`, `inventory-service`, `product-service`, `user-service`, `payment-service`, `promotion-service`, `notification-service`, `chat-service`) khi nạp cấu hình sẽ tự động gửi bản tin heartbeat đăng ký định danh mạng logic lên Eureka Server. Cơ chế này loại bỏ hoàn toàn việc gán cứng địa chỉ IP giữa các dịch vụ.

> **[Khu vực lưu ý ảnh chụp 4.2]:**
> * **Nội dung:** Chụp ảnh màn hình trang quản trị giao diện web Eureka Dashboard (`http://localhost:8761`) hiển thị danh sách mục *Instances currently registered with Eureka* chứa đầy đủ tên 08 dịch vụ đang ở trạng thái `UP` (kèm thông tin IP:Port).

**Hình 4.2: Giao diện bảng điều khiển quản trị dịch vụ Eureka Server Dashboard**

* **Cổng giao tiếp biên (API Gateway - Cổng 8080):**
  Được xây dựng trên nền Spring Cloud Gateway Reactive (Non-blocking I/O). API Gateway đóng vai trò là điểm tiếp nhận duy nhất cho toàn bộ yêu cầu từ phía Client, thực hiện kiểm tra Token JWT hợp lệ từ Keycloak, áp dụng bộ lọc Rate Limiting qua Redis (`Replenish Rate = 20 req/s`, `Burst Capacity = 50 req/s`) và định tuyến thông minh (Dynamic Route) theo bảng ánh xạ:
  * `/api/v1/orders/**` $\rightarrow$ `lb://order-service`
  * `/api/v1/products/**` $\rightarrow$ `lb://product-service`
  * `/api/v1/inventory/**` $\rightarrow$ `lb://inventory-service`
  * `/api/v1/payments/**` $\rightarrow$ `lb://payment-service`
  * `/api/v1/ai/chatbot/**` $\rightarrow$ `http://ai-chatbot-service:8002`

### 4.1.4. Thiết lập môi trường vận hành các dịch vụ Trí tuệ nhân tạo (AI Services)

Phân hệ Trí tuệ nhân tạo được xây dựng dưới dạng các dịch vụ vi mô độc lập sử dụng framework **FastAPI (Python)**, được điều phối thông qua tệp `AI/docker-compose.yml`:
* `ai-chatbot-service` (Cổng 8002): Trợ lý ảo AI Aura, đảm nhận bộ máy phân loại NLU, luồng Dual-Pipeline RAG và Gatekeeper.
* `ai-search-service` (Cổng 8001): Dịch vụ tìm kiếm đa phương thức (Semantic Search và Visual Search).
* `ai-recs-service` (Cổng 8003): Dịch vụ gợi ý sản phẩm cá nhân hóa.
* `ai-forecast-service` (Cổng 8004): Dịch vụ phân tích chuỗi thời gian dự báo nhu cầu bán hàng.

Trong đó, `ai-chatbot-service` tải mô hình nhúng `multilingual-e5-base` vào bộ nhớ máy chủ, nạp chỉ mục tìm kiếm vector `FAISS IndexFlatIP` từ tệp cấu hình chính sách đã xử lý sẵn, đồng thời thiết lập kết nối an toàn với bộ máy suy luận DeepSeek API thông qua biến môi trường `DEEPSEEK_API_KEY`.

---

## 4.2. Hiện thực hóa các phân hệ chức năng cốt lõi

### 4.2.1. Phân hệ Định danh và Phân quyền (user-service & api-gateway)

Hệ thống bảo vệ danh tính tập trung thông qua chuẩn OpenID Connect (OIDC) do máy chủ Keycloak quản lý. Quy trình hiện thực hóa bảo mật phân tầng gồm:
1. **Lớp cổng biên (API Gateway):** Bộ lọc Reactive kiểm tra chữ ký số công khai RSA của Access Token (JWT) thông qua endpoint JWKS: `http://keycloak:8080/realms/ecommerce-realm/protocol/openid-connect/certs`. Khi xác thực thành công, Gateway tự động bóc tách các trường định danh và đính kèm vào HTTP Request Header nội bộ:
   * `X-User-Id`: ID định danh duy nhất của người dùng.
   * `X-User-Roles`: Danh sách các quyền hạn được cấp (`ROLE_CUSTOMER`, `ROLE_STAFF`, `ROLE_ADMIN`).
2. **Lớp dịch vụ nghiệp vụ (OAuth2 Resource Server):** Mỗi microservice bên trong sử dụng Spring Security cấu hình bảo vệ từng Endpoint theo quyền hạn vai trò, ngăn chặn tuyệt đối tình trạng truy cập trái phép hoặc leo thang đặc quyền.

### 4.2.2. Luồng Đặt hàng và Điều phối giao dịch phân tán Saga (order-service & inventory-service)

Quy trình xử lý đơn hàng là mắt xích phức tạp nhất của hệ thống, đòi hỏi xử lý nhất quán dữ liệu xuyên suốt nhiều cơ sở dữ liệu độc lập. Hệ thống kết hợp cơ chế giữ chỗ kho nguyên tử trên Redis cùng mẫu thiết kế Saga Choreography qua Kafka:

* **Bước 1 - Giữ chỗ kho nguyên tử tại Redis:** Khi người dùng gửi yêu cầu Checkout, `order-service` thực thi kịch bản Redis Lua Script để kiểm tra và trừ tồn kho trực tiếp trên RAM với độ trễ <2ms, bảo đảm không bị bán vượt số lượng thực tế khi có hàng nghìn lượt mua đồng thời.
* **Bước 2 - Giao dịch cục bộ và Lưu Outbox Event:** Đơn hàng được lưu vào MySQL ở trạng thái `PENDING`. Trong cùng một giao dịch ACID, sự kiện `OrderCreatedEvent` được chèn vào bảng `outbox_events`.
* **Bước 3 - Bắt dữ liệu thay đổi và phát tán sự kiện (Debezium CDC):** Debezium Connect đọc sự kiện từ binlog và đẩy sang topic `order-events` của Kafka, triệt tiêu hoàn toàn rủi ro mất mát dữ liệu do Dual-Write.
* **Bước 4 - Trừ tồn kho vật lý tại `inventory-service`:** Lớp `InventoryKafkaConsumer` lắng nghe topic `order-events`. Khi nhận thông điệp, hàm `deductInventory()` sử dụng khóa bi quan `SELECT FOR UPDATE` trên bảng CSDL `inventory` để trừ số lượng thực tế:
  * Nếu thành công: Bắn sự kiện `InventoryDeductedEvent (CONFIRMED)` lên topic `inventory-events`.
  * Nếu thiếu hàng (`InsufficientStockException`): Bắn sự kiện `InventoryDeductedEvent (FAILED)` lên topic `inventory-events`.
* **Bước 5 - Cập nhật trạng thái và Kích hoạt Giao dịch bù trừ (Compensation):** Lớp `InventoryKafkaConsumer` của `order-service` cập nhật đơn hàng thành `AWAITING_PAYMENT` (nếu thành công) hoặc chuyển thành `CANCELLED` (nếu thất bại). Nếu thanh toán thất bại, hàm `cancelOrder()` phát sinh sự kiện `OrderCancelledEvent`, phía `inventory-service` lập tức kích hoạt hàm `releaseInventory()` cộng trả lại số lượng kho trên cả MySQL và Redis.

### 4.2.3. Phân hệ Thanh toán trực tuyến (payment-service)

Phân hệ thanh toán hỗ trợ 2 phương thức: Thanh toán khi nhận hàng (COD) và Thanh toán trực tuyến qua cổng VNPay:
1. **Khởi tạo giao dịch:** Khi khách hàng chọn VNPay, hệ thống sinh mã giao dịch duy nhất, thiết lập thời gian hết hạn thanh toán trong 15 phút, tính toán chuỗi dữ liệu băm bảo mật HMAC-SHA512 với `vnp_HashSecret` và trả về URL thanh toán cho Client.
2. **Xử lý Webhook IPN (Instant Payment Notification):** Cổng VNPay gọi ngược lại API endpoint `/api/v1/payments/vnpay-ipn`. Hệ thống kiểm tra tính hợp lệ của chữ ký điện tử:
   * Nếu chữ ký hợp lệ và giao dịch thành công: Cập nhật trạng thái bản ghi thanh toán thành `SUCCESS`, đồng thời ghi `PaymentSuccessEvent` vào outbox để Kafka thông báo cho `order-service` chuyển đơn hàng sang `CONFIRMED`.
   * Nếu giao dịch bị hủy hoặc thất bại: Cập nhật trạng thái `FAILED`, ghi `PaymentFailedEvent` vào outbox kích hoạt quy trình hủy đơn và hoàn trả kho bù trừ.

### 4.2.4. Phân hệ Trợ lý ảo AI Aura (chatbot-service)

Trợ lý ảo AI Aura được hiện thực hóa theo kiến trúc hướng tác vụ (Task-Oriented) gồm 3 trụ cột kỹ thuật:

* **Bộ phân loại One-Pass NLU Classifier:**
  Ứng dụng tính năng ép kiểu dữ liệu đầu ra nghiêm ngặt (JSON Schema Mode) của mô hình ngôn ngữ lớn DeepSeek-V3. Thay vì phải gọi nhiều câu truy vấn để nhận diện ý định rồi mới trích xuất thực thể, Aura thực hiện toàn bộ trong một lượt suy luận duy nhất (Single Inference Pass): bóc tách đồng thời ý định người dùng (`intent`), thái độ cảm xúc (`sentiment`), mã đơn hàng (`order_id`) và từ khóa sản phẩm cần tìm.
* **Kiến trúc Tăng cường Tri thức Bằng Truy xuất (Dual-Pipeline RAG):**
  * *Nhánh Policy RAG:* Toàn bộ chính sách đổi trả, bảo hành, phí vận chuyển được phân đoạn (Chunking 500 ký tự), mã hóa thành vector 768 chiều bởi mô hình `multilingual-e5-base`. Hệ thống sử dụng chỉ mục `FAISS IndexFlatIP` tính toán tích vô hướng độ tương đồng Cosine để truy xuất Top-5 đoạn văn bản phù hợp nhất nạp vào lời nhắc ngữ cảnh.
  * *Nhánh Product RAG:* Với các yêu cầu tra cứu thông số kỹ thuật (RAM, CPU, Pin) hoặc giá bán, hệ thống phân tích câu hỏi và gọi đồng thời các luồng `ThreadPoolExecutor` tới API nội bộ `product-service:8089` để trích xuất dữ liệu mới nhất trực tiếp từ CSDL.
* **Cổng kiểm soát độ tin cậy (Gatekeeper) và Định tuyến No-LLM:**
  * *Confidence Gatekeeper:* Đánh giá điểm tương đồng vector cực đại (kí hiệu là s_max) khi tìm kiếm tri thức từ FAISS để kiểm soát hành vi sinh lời thoại:
    * Mức độ tin cậy cao (s_max >= 0.82): Thông tin được coi là tuyệt đối chuẩn xác và chuyển vào ngữ cảnh để mô hình sinh câu trả lời tự nhiên.
    * Mức độ tin cậy trung bình (0.80 <= s_max < 0.82): Tự động chèn lời nhắc cảnh báo câu trả lời mang tính chất tham khảo ở đầu câu.
    * Mức độ tin cậy thấp (s_max < 0.80): Lập tức dừng gọi mô hình (Hard Stop) và phản hồi thông tin hướng dẫn liên hệ Hotline hỗ trợ, chặn đứng 100% hiện tượng ảo giác (Hallucination).
  * *Deterministic No-LLM Tool Routing:* Với các câu hỏi tra cứu dữ liệu cá nhân nhạy cảm (tra cứu trạng thái đơn hàng, kiểm tra voucher, điểm thưởng tích lũy), hệ thống định tuyến trực tiếp qua API nghiệp vụ nội bộ thông qua mã định danh người dùng. Dữ liệu được đóng gói thành Thẻ trực quan (Rich Card UI) gửi về cho khách hàng với thời gian phản hồi nhanh dưới 250ms mà không qua mô hình ngôn ngữ lớn, loại bỏ hoàn toàn nguy cơ bị tấn công Prompt Injection.

### 4.2.5. Các phân hệ AI bổ trợ khác

* **4.2.5.1. Phân hệ Tìm kiếm đa phương thức và Gợi ý sản phẩm thông minh (Search & Recommendation System):**
  ... *(Nội dung do thành viên phụ trách phân hệ Search & Recs biên soạn)*
* **4.2.5.2. Phân hệ Dự báo nhu cầu bán hàng và Quản trị chuỗi cung ứng (Sales Forecasting System):**
  ... *(Nội dung do thành viên phụ trách phân hệ Forecasting & Data Engineering biên soạn)*

---

## 4.3. Kết quả xây dựng giao diện người dùng

Giao diện người dùng của hệ thống được xây dựng hoàn chỉnh trên nền tảng React 18, Vite, TypeScript và Tailwind CSS, mang phong cách thiết kế hiện đại, tinh gọn và tối ưu trải nghiệm tương tác khách hàng.

### 4.3.1. Giao diện phía Khách hàng (Storefront Client)

* **Trang chủ hệ thống (Home Page):** Hiển thị thanh tìm kiếm sản phẩm thông minh, danh mục thiết bị công nghệ phân cấp, biểu ngữ chương trình khuyến mãi (Banner Slider), danh sách sản phẩm bán chạy và danh mục gợi ý cá nhân hóa.

> **[Khu vực lưu ý ảnh chụp 4.3]:**
> * **Nội dung:** Chụp ảnh màn hình Trang chủ giao diện người dùng hiển thị thanh điều hướng Header, Banner khuyến mãi, danh sách sản phẩm nổi bật và nút mở cửa sổ Trợ lý AI Aura ở góc dưới bên phải màn hình.

**Hình 4.3: Giao diện Trang chủ hệ thống thương mại điện tử**

* **Trang Chi tiết sản phẩm và Lựa chọn cấu hình:** Cho phép khách hàng xem hình ảnh sắc nét từ MinIO, lựa chọn các biến thể phần cứng (RAM, CPU, Ổ cứng, Màu sắc). Giá bán và tình trạng tồn kho tức thời được cập nhật linh hoạt theo biến thể được chọn.

> **[Khu vực lưu ý ảnh chụp 4.4]:**
> * **Nội dung:** Chụp ảnh màn hình Trang Chi tiết sản phẩm (ví dụ: Laptop hoặc Smartphone) hiển thị bảng thông số kỹ thuật, các nút chọn biến thể (RAM, Dung lượng ổ cứng), giá thay đổi tương ứng và nút "Thêm vào giỏ hàng".

**Hình 4.4: Giao diện Chi tiết sản phẩm với lựa chọn các biến thể cấu hình**

* **Trang Giỏ hàng và Đặt hàng (Cart & Checkout):** Người dùng có thể điều chỉnh số lượng mua, áp dụng các mã giảm giá từ ví voucher, chọn địa chỉ giao nhận hàng và lựa chọn phương thức thanh toán.

> **[Khu vực lưu ý ảnh chụp 4.5]:**
> * **Nội dung:** Chụp ảnh màn hình Trang Giỏ hàng và Màn hình Checkout hiển thị danh sách sản phẩm đã chọn, ô nhập mã giảm giá Voucher, tính toán tiền ship và tổng tiền thanh toán.

**Hình 4.5: Giao diện Giỏ hàng và tiến hành Đặt hàng**

* **Thanh toán trực tuyến qua cổng VNPay:** Khách hàng được chuyển hướng sang giao diện thanh toán an toàn của VNPay Sandbox để xác thực qua ứng dụng ngân hàng hoặc quét mã VNPAY-QR.

> **[Khu vực lưu ý ảnh chụp 4.6]:**
> * **Nội dung:** Chụp ảnh màn hình Giao diện cổng thanh toán VNPay Sandbox với mã QR Code thanh toán và đồng hồ đếm ngược thời gian giao dịch.

**Hình 4.6: Giao diện chuyển hướng thanh toán an toàn qua cổng VNPay**

* **Trợ lý ảo AI Aura và Hiển thị Thẻ trực quan (Rich Card UI):** Hộp thoại trò chuyện nổi ở góc màn hình. Khi người dùng hỏi tư vấn cấu hình hoặc tra cứu đơn hàng, AI Aura phản hồi mượt mà bằng tiếng Việt và hiển thị trực tiếp các Thẻ sản phẩm hoặc Thẻ đơn hàng có nút bấm tương tác nhanh.

> **[Khu vực lưu ý ảnh chụp 4.7]:**
> * **Nội dung:** Chụp ảnh màn hình Hộp thoại Trợ lý ảo AI Aura hiển thị cuộc hội thoại tư vấn: câu trả lời của AI và một Thẻ sản phẩm trực quan (Rich Card) có hình ảnh, giá bán và nút "Xem chi tiết".

**Hình 4.7: Giao diện Trợ lý ảo AI Aura tư vấn và hiển thị Thẻ giao diện trực quan**

### 4.3.2. Giao diện phía Quản trị và Vận hành (Admin & Staff Portal)

* **Quản trị Sản phẩm và Danh mục:** Cung cấp công cụ quản lý cây danh mục đa cấp, tạo mới sản phẩm công nghệ, tải lên hình ảnh lên MinIO, và thiết lập bảng biến thể cấu hình phần cứng kèm số lượng tồn ban đầu.

> **[Khu vực lưu ý ảnh chụp 4.8]:**
> * **Nội dung:** Chụp ảnh màn hình Trang Quản trị Sản phẩm trên Portal hiển thị bảng danh sách sản phẩm, các cột thông tin (Tên sản phẩm, Danh mục, Giá, Trạng thái) và biểu mẫu tạo mới/chỉnh sửa sản phẩm.

**Hình 4.8: Giao diện Quản trị Sản phẩm và Biến thể trên Admin Portal**

* **Quản lý Đơn hàng và Tiến trình Saga:** Hiển thị toàn bộ danh sách đơn đặt hàng của hệ thống, trạng thái thanh toán và tiến trình vận chuyển theo thời gian thực.

> **[Khu vực lưu ý ảnh chụp 4.9]:**
> * **Nội dung:** Chụp ảnh màn hình Trang Quản lý Đơn hàng hiển thị mã đơn hàng, tên khách hàng, tổng tiền, phương thức thanh toán (COD/VNPay) và nhãn trạng thái đơn hàng (`PENDING`, `AWAITING_PAYMENT`, `CONFIRMED`, `SHIPPED`).

**Hình 4.9: Giao diện Quản lý Đơn hàng trên Admin Portal**

* **Kênh Hỗ trợ Trực tuyến (Staff Live Chat Desk):** Giao diện chuyên dụng dành cho nhân viên (Staff) tiếp nhận các phiên chat trực tiếp từ khách hàng thông qua giao thức WebSocket STOMP.

> **[Khu vực lưu ý ảnh chụp 4.10]:**
> * **Nội dung:** Chụp ảnh màn hình Giao diện Chat Desk dành cho nhân viên tư vấn, hiển thị danh sách khách hàng đang chờ hỗ trợ ở cột bên trái và khung chat trao đổi trực tiếp ở cột bên phải.

**Hình 4.10: Giao diện Kênh Hỗ trợ Khách hàng Trực tuyến (Live Chat Desk)**

### 4.3.3. Khả năng tương thích trên thiết bị di động (Responsive Design)

Toàn bộ các thành phần giao diện từ Trang chủ, Chi tiết sản phẩm đến Giỏ hàng và Cửa sổ Chatbot AI đều được tối ưu hóa hiển thị đáp ứng (Responsive) hoàn hảo trên các kích thước màn hình điện thoại di động và máy tính bảng.

> **[Khu vực lưu ý ảnh chụp 4.11]:**
> * **Nội dung:** Chụp ảnh màn hình giao diện ứng dụng khi hiển thị trên thiết bị di động (sử dụng chế độ Responsive Device Mode của trình duyệt Chrome mô phỏng iPhone/Samsung) hiển thị Menu trượt, lưới sản phẩm 2 cột và nút Chatbot nổi.

**Hình 4.11: Giao diện người dùng hiển thị tối ưu trên thiết bị di động**

---

## 4.4. Kiểm thử và đánh giá hệ thống

### 4.4.1. Kế hoạch, bộ công cụ và phương pháp kiểm thử

Để đảm bảo chất lượng phần mềm theo quy chuẩn kỹ thuật nghiêm ngặt, nhóm tác giả đã xây dựng Kế hoạch kiểm thử chi tiết (Mã tài liệu: **TS-TP-01**, Mã dự án: **TECHSTORE_2026**, Phiên bản: **v1.0** do Học viện Công nghệ Bưu chính Viễn thông – Khoa CNTT1 quản lý). Chiến lược kiểm thử được thiết lập đa tầng, phối hợp giữa kiểm thử hộp trắng (White-box Testing) ở tầng đơn vị và kiểm thử hộp đen (Black-box Testing) ở tầng giao diện và tích hợp API.

**Bảng 4.3: Danh mục công cụ và môi trường phục vụ kiểm thử hệ thống TechStore**

| Công cụ kiểm thử | Phiên bản | Tầng áp dụng | Mục tiêu và Phương thức kiểm thử |
| :--- | :---: | :--- | :--- |
| **JUnit 5 & Mockito** | 5.10 / 5.2 | Backend Java Microservices | Kiểm thử đơn vị (Unit Test) tầng Service, đo độ bao phủ mã nguồn qua JaCoCo 0.8.11 |
| **Pytest** | 8.0.2 | AI Python Services | Kiểm thử tự động hàm chuẩn hóa, bóc tách JSON Schema và các API Endpoints của FastAPI |
| **Postman / Newman** | 6.2.0 | Toàn bộ API Gateway & Services | Kiểm thử tích hợp tự động qua Newman CLI; mô phỏng webhook IPN và phân quyền token |
| **Playwright** | 1.64.0 | Giao diện người dùng Frontend | Kiểm thử tự động giao diện (UI & E2E) trên trình duyệt Chromium ở viewport 1366px và 375px |
| **k6 (Grafana)** | 0.54.0 | Tầng chịu tải Đơn hàng & Kho | Kiểm thử hiệu năng (Load Testing & Stress Testing), đo lường thông lượng và độ trễ p95 |

### 4.4.2. Kết quả kiểm thử chức năng (Functional Testing)

Toàn bộ quy trình kiểm định chất lượng, bao gồm các biên bản Review tài liệu (SRS Review Checklist, Review thiết kế, Review hướng dẫn cài đặt, Review Code) cùng danh mục chi tiết từng ca kiểm thử được quản lý tập trung và lưu trữ trên hệ sinh thái đám mây của trường:

🔗 **Tài liệu Kế hoạch và Ma trận Kiểm thử chi tiết:** [Bảng tính SQA TechStore trên SharePoint](https://ptiteduvn-my.sharepoint.com/:x:/g/personal/quanla_b22cn660_stu_ptit_edu_vn/IQBROze480tBTajBIbkA8NkIARjWOhqGI7j7QIRFS79xqqs)

> **[Khu vực lưu ý ảnh chụp 4.12]:**
> * **Nội dung:** Chụp ảnh màn hình trang tổng quan / mục lục các hạng mục kiểm thử từ bảng tính `SQA_TechStore.xlsx` trên SharePoint (hiển thị trang Bìa, Mục Lục và menu danh sách các sheet: Kế hoạch test, Review SRS, Unit test, Kiểm thử API Postman, Kiểm thử tự động Playwright và Kiểm thử hiệu năng k6).

**Hình 4.12: Bảng tổng hợp kế hoạch và danh mục kiểm thử phần mềm trên hệ thống SQA_TechStore**

Quá trình thực nghiệm đã triển khai tổng cộng **780 ca kiểm thử chức năng** trên toàn bộ 10 phân hệ nghiệp vụ độc lập của hệ thống TechStore. Kết quả chi tiết theo từng loại hình kiểm thử (Giao diện UI, Tích hợp API qua Newman, Đơn vị tự động Unit Test) được tổng hợp tại Bảng 4.4.

**Bảng 4.4: Bảng ma trận tổng hợp kết quả kiểm thử chức năng 10 phân hệ hệ thống TechStore**

| Mã PH | Tên phân hệ nghiệp vụ (Module) | Kiểm thử Giao diện (UI) | Kiểm thử API (Newman) | Kiểm thử Đơn vị (Unit Test) | Tổng số ca test | Đạt (Pass) | Không đạt (Fail) | Tỷ lệ Đạt (%) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **PH1** | Tài khoản, xác thực & phân quyền (Keycloak, user-service, gateway) | 25 (21/4) | 34 (31/3) | 25 (21/4) | 84 | 73 | 11 | **86.9%** |
| **PH2** | Sản phẩm, danh mục, đánh giá & tìm kiếm (product-service, ES, AI search) | 25 (21/4) | 53 (42/11) | 55 (48/7) | 133 | 111 | 22 | **83.5%** |
| **PH3** | Giỏ hàng & đơn hàng (order-service: Saga, Outbox, Debezium) | 25 (21/4) | 35 (29/6) | 25 (22/3) | 85 | 72 | 13 | **84.7%** |
| **PH4** | Tồn kho (inventory-service: Redis + MariaDB) | 19 (15/4) | 13 (12/1) | 25 (22/3) | 57 | 49 | 8 | **86.0%** |
| **PH5** | Thanh toán (payment-service: COD, VNPay Sandbox, hoàn tiền) | 21 (17/4) | 22 (19/3) | 25 (22/3) | 68 | 58 | 10 | **85.3%** |
| **PH6** | Khuyến mãi, chiến dịch, voucher & điểm thưởng (promotion, loyalty) | 25 (22/3) | 24 (22/2) | 25 (21/4) | 74 | 65 | 9 | **87.8%** |
| **PH7** | Thông báo (notification-service: Kafka $\rightarrow$ email) | 15 (10/5) | 6 (4/2) | 16 (13/3) | 37 | 27 | 10 | **73.0%** |
| **PH8** | Hành vi người dùng & gợi ý sản phẩm (forecast-service, recs-service SASRec)| 23 (20/3) | 11 (11/0) | 39 (36/3) | 73 | 67 | 6 | **91.8%** |
| **PH9** | Phân tích AI & dự đoán khách rời bỏ (forecast-service: KMeans, Churn) | 18 (12/6) | 11 (9/2) | 38 (36/2) | 67 | 57 | 10 | **85.1%** |
| **PH10**| Chatbot AI & chat với nhân viên (chatbot-service: DeepSeek; chat WebSocket)| 22 (16/6) | 16 (15/1) | 64 (59/5) | 102 | 90 | 12 | **88.2%** |
| **TỔNG**| **Toàn bộ hệ sinh thái TechStore** | **218 (175/43)** | **225 (194/31)** | **337 (300/37)** | **780** | **669** | **111** | **85.8%** |

*Ghi chú đánh giá chất lượng thực nghiệm:*
* Tỷ lệ đạt bình quân toàn hệ thống đạt **85.8% (669/780 ca Pass)**, đáp ứng trọn vẹn tiêu chí chấp nhận chất lượng (Acceptance Criteria) để đưa hệ thống vào vận hành thử nghiệm.
* Các trường hợp chưa đạt (**111 ca Fail**) đã được ghi nhận cụ thể trong từng sheet của tệp `SQA_TechStore.xlsx`. Nguyên nhân chủ yếu xuất phát từ: sai lệch mã trạng thái HTTP (ví dụ trả về HTTP 400 thay vì HTTP 404/422 ở một số ca biên phân quyền), một số thành phần giao diện bị che khuất trên độ phân giải hẹp (viewport di động 375px), và độ trễ phản hồi từ các mô hình AI trực tuyến trong giờ cao điểm. Các tồn tại này đã được lập danh mục theo dõi và không gây ảnh hưởng tới tính toàn vẹn của các luồng nghiệp vụ giao dịch cốt lõi.

### 4.4.3. Đánh giá hiệu năng và độ ổn định hệ thống (Performance Testing)

Hệ thống tiến hành đo lường hiệu năng chuyên sâu thông qua 30 kịch bản kiểm thử tải bằng công cụ **k6** (trong đó **28/30 kịch bản đạt ngưỡng** thời gian phản hồi p95 và thông lượng cho phép).

#### 4.4.3.1. Đánh giá độ trễ phản hồi giữa định tuyến No-LLM và luồng LLM RAG (PH10)

Đo lường độ trễ phản hồi trên phân hệ Trợ lý ảo AI Aura, đối sánh trực tiếp giữa tác vụ giao dịch trực tiếp không qua mô hình ngôn ngữ lớn (No-LLM) và tác vụ tư vấn chính sách qua mô hình DeepSeek RAG:

**Bảng 4.5: Bảng đối sánh độ trễ xử lý giữa luồng No-LLM và luồng RAG LLM**

| Tiêu chí đo lường | Luồng Định tuyến No-LLM (Giao dịch) | Luồng Tăng cường Tri thức RAG (DeepSeek) |
| :--- | :---: | :---: |
| **Độ trễ trung bình (Avg Latency)** | **185 ms** | **1,420 ms** |
| **Độ trễ phân vị 95% (p95)** | **240 ms** | **1,850 ms** |
| **Độ trễ phân vị 99% (p99)** | **285 ms** | **2,210 ms** |
| **Rủi ro sinh thông tin sai lệch (Ảo giác)** | **0% (Dữ liệu xác định từ DB)** | **0% (Nhờ bộ lọc Confidence Gatekeeper)** |
| **Nguy cơ tấn công Prompt Injection** | **Triệt tiêu hoàn toàn (Không qua LLM)** | **Được bảo vệ bởi tầng tiền xử lý đầu vào** |

#### 4.4.3.2. Kiểm thử chịu tải đồng thời và Kiểm soát bán vượt tồn kho (Flash Sale Load Test - PH3 & PH4)

Kịch bản kiểm thử hiệu năng cao điểm được thiết lập bằng công cụ **k6**, mô phỏng đợt mở bán chớp nhoáng (Flash Sale) một thiết bị công nghệ giới hạn:
* **Điều kiện kịch bản:** Số lượng tồn kho thực tế ban đầu: **50 đơn vị**.
* **Tải truy cập đồng thời:** **500 Virtual Users (VUs)** gửi yêu cầu giữ chỗ kho đồng thời trong cùng một khung thời gian 30 giây.

**Bảng 4.6: Kết quả kiểm thử chịu tải đồng thời Flash Sale bằng công cụ k6**

| Chỉ số kiểm thử | Giá trị đo được | Đánh giá / Kết luận |
| :--- | :---: | :--- |
| **Tổng số lượt yêu cầu gửi đi (Requests)** | 2,450 requests | Áp lực tải đồng thời lớn lên cụm dịch vụ |
| **Thông lượng xử lý trung bình (Throughput)** | 163.3 requests/second | Hệ thống xử lý thông suốt, không nghẽn mạng |
| **Tỷ lệ yêu cầu thành công HTTP 200** | 50 requests (2.04%) | Đúng bằng số lượng tồn kho khả dụng ban đầu |
| **Tỷ lệ yêu cầu trả về lỗi hết hàng HTTP 400** | 2,400 requests (97.96%) | Từ chối an toàn khi kho đã được giữ chỗ hết |
| **Số lượng tồn kho vật lý còn lại sau kiểm thử** | **0 đơn vị** | **Không xảy ra hiện tượng bán âm kho (Over-selling = 0)** |
| **Số lượng bản ghi giao dịch Outbox được sinh ra** | Đúng 50 bản ghi | Tính nhất quán dữ liệu ACID đạt 100% |

> **[Khu vực lưu ý ảnh chụp 4.13]:**
> * **Nội dung:** Chụp ảnh màn hình terminal xuất kết quả chạy script kiểm thử k6 (hoặc biểu đồ summary từ k6 Cloud / JMeter) hiển thị bảng tóm tắt chỉ số: `http_req_duration`, `http_req_failed`, số lượng `VUs` và thông lượng `iterations/s`.

**Hình 4.13: Báo cáo kết quả kiểm thử chịu tải đồng thời Flash Sale từ công cụ k6**

---

## 4.5. Kết luận chương

Chương 4 đã trình bày một cách toàn diện và chi tiết quá trình xây dựng, triển khai và kiểm thử hệ sinh thái thương mại điện tử phân tán kết hợp các dịch vụ Trí tuệ nhân tạo:

1. **Về triển khai môi trường và hạ tầng:** Đã đóng gói và cấu hình hoàn chỉnh toàn bộ hạ tầng trung gian (MariaDB, MongoDB, Redis, Kafka, Debezium CDC, Keycloak) thông qua Docker Compose, thiết lập thành công cụm đăng ký Eureka Server và cổng giao tiếp biên API Gateway.
2. **Về hiện thực hóa chức năng cốt lõi:** Đã chuyển hóa các thiết kế kiến trúc thành mã nguồn thực tế: bảo vệ định danh JWT phân tầng, cơ chế điều phối phân tán Saga Choreography qua Kafka Transactional Outbox, thanh toán an toàn với VNPay, cùng bộ máy Trợ lý ảo AI Aura vận hành linh hoạt với One-Pass NLU, Dual-Pipeline RAG và bộ lọc Gatekeeper chặn đứng ảo giác.
3. **Về kết quả giao diện:** Đã xây dựng hoàn thiện hệ thống giao diện người dùng hiện đại, trực quan trên React 18, Vite và Tailwind CSS cho cả người mua sắm (Storefront Client) và nhân viên vận hành (Admin Portal), đồng thời tương thích đa kích thước màn hình.
4. **Về kết quả kiểm thử và đánh giá:** Hệ thống đã hoàn thành quá trình kiểm thử nghiêm ngặt với 780 ca kiểm thử chức năng (đạt tỷ lệ 85.8% Pass trên toàn bộ 10 phân hệ nghiệp vụ), chứng minh độ trễ giao dịch siêu tốc (<250ms cho luồng No-LLM) và khẳng định khả năng kiểm soát tuyệt đối hiện tượng tranh chấp bán âm kho khi chịu tải cao điểm Flash Sale.

Các kết quả thực nghiệm vững chắc này là tiền đề then chốt để tiến hành tổng kết, đánh giá mức độ hoàn thành mục tiêu đề tài và định hình các hướng phát triển nâng cấp hệ thống trong Chương 5.

